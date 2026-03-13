"""
Discovery API — Hesap keşif sistemi endpoint'leri.
Son 24 saatte takip edilen hesapların en iyi tweetlerini listeler,
araştırma ve quote tweet üretimi sağlar.
"""
import logging
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ──────────────────────────────────────────────

class DiscoveryConfigUpdate(BaseModel):
    enabled: bool = False
    priority_accounts: list[str] = []
    normal_accounts: list[str] = []
    check_interval_hours: int = 2
    work_hour_start: int = 8
    work_hour_end: int = 23


class AddAccountRequest(BaseModel):
    username: str
    is_priority: bool = False


class RemoveAccountRequest(BaseModel):
    username: str


class TriggerScanRequest(BaseModel):
    accounts: list[str] = []  # Boş = tümünü tara


# ── Endpoints ───────────────────────────────────────────

@router.get("/config")
def get_config():
    from backend.modules.style_manager import load_discovery_config
    return {"config": load_discovery_config()}


@router.post("/config")
def update_config(req: DiscoveryConfigUpdate):
    from backend.modules.style_manager import save_discovery_config
    config = req.model_dump()
    # Hesap isimlerini temizle
    config["priority_accounts"] = [
        a.strip().lstrip("@") for a in config["priority_accounts"] if a.strip()
    ]
    config["normal_accounts"] = [
        a.strip().lstrip("@") for a in config["normal_accounts"] if a.strip()
    ]
    save_discovery_config(config)
    return {"success": True, "config": config}


@router.post("/add-account")
def add_account(req: AddAccountRequest):
    from backend.modules.style_manager import load_discovery_config, save_discovery_config
    config = load_discovery_config()
    username = req.username.strip().lstrip("@")
    if not username:
        raise HTTPException(400, "Kullanıcı adı boş olamaz")

    if req.is_priority:
        if username not in config["priority_accounts"]:
            config["priority_accounts"].append(username)
    else:
        if username not in config["normal_accounts"]:
            config["normal_accounts"].append(username)

    save_discovery_config(config)
    return {"success": True, "config": config}


@router.post("/remove-account")
def remove_account(req: RemoveAccountRequest):
    from backend.modules.style_manager import load_discovery_config, save_discovery_config
    config = load_discovery_config()
    username = req.username.strip().lstrip("@")

    config["priority_accounts"] = [a for a in config["priority_accounts"] if a != username]
    config["normal_accounts"] = [a for a in config["normal_accounts"] if a != username]

    save_discovery_config(config)
    return {"success": True, "config": config}


@router.get("/tweets")
def get_tweets(hours: int = 24):
    """Keşfedilmiş tweetleri döndür. hours ile zaman aralığı belirlenebilir (varsayılan 24 saat).
    all_accounts: tüm yapılandırılmış hesap listesi (frontend dropdown için)."""
    import datetime
    from backend.modules.style_manager import load_discovery_cache, load_discovery_config
    cache = load_discovery_cache()
    if hours and hours < 168:
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
        filtered = []
        for t in cache:
            created = t.get("created_at", "")
            if created:
                try:
                    dt = datetime.datetime.fromisoformat(created)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=datetime.timezone.utc)
                    if dt >= cutoff:
                        filtered.append(t)
                except (ValueError, TypeError):
                    filtered.append(t)
            else:
                filtered.append(t)
        cache = filtered

    # Tüm yapılandırılmış hesapları birleştir (discovery config + DEFAULT_AI_ACCOUNTS)
    config = load_discovery_config()
    all_accounts_set: set[str] = set()
    for a in config.get("priority_accounts", []):
        all_accounts_set.add(a.lower().lstrip("@"))
    for a in config.get("normal_accounts", []):
        all_accounts_set.add(a.lower().lstrip("@"))
    try:
        from backend.modules.twitter_scanner import DEFAULT_AI_ACCOUNTS
        for a in DEFAULT_AI_ACCOUNTS:
            all_accounts_set.add(a.lower().lstrip("@"))
    except ImportError:
        pass
    # Cache'deki hesapları da ekle (dinamik keşif sonuçları)
    for t in cache:
        acc = t.get("account", "")
        if acc:
            all_accounts_set.add(acc.lower())

    return {
        "tweets": cache,
        "total": len(cache),
        "all_accounts": sorted(all_accounts_set),
    }


@router.post("/trigger")
def trigger_scan(req: TriggerScanRequest | None = None):
    """Manuel tarama tetikle. accounts listesi verilirse sadece onları tarar."""
    try:
        from backend.discovery_worker import scan_accounts
        accounts = None
        if req and req.accounts:
            accounts = [a.strip().lstrip("@") for a in req.accounts if a.strip()]
        scan_accounts(force=True, only_accounts=accounts)
        from backend.modules.style_manager import load_discovery_cache
        cache = load_discovery_cache()
        scanned = ", ".join(f"@{a}" for a in accounts) if accounts else "tümü"
        return {
            "success": True,
            "message": f"Tarama tamamlandı ({scanned}) — {len(cache)} tweet",
            "total": len(cache),
        }
    except Exception as e:
        logger.exception("Discovery trigger error")
        raise HTTPException(500, f"Tarama hatası: {str(e)}")


@router.get("/status")
def get_status():
    """Discovery sistemi durumunu döndür (rotasyon bilgisi dahil)."""
    from backend.modules.style_manager import (
        load_discovery_config, load_discovery_cache, load_discovery_rotation,
    )
    import datetime
    from zoneinfo import ZoneInfo

    config = load_discovery_config()
    cache = load_discovery_cache()
    rotation = load_discovery_rotation()
    TZ_TR = ZoneInfo("Europe/Istanbul")

    last_scan = cache[0]["scanned_at"] if cache else None
    now = datetime.datetime.now(TZ_TR)

    # Sonraki taramaya kalan süre (saniye)
    next_scan_seconds = None
    if last_scan and config.get("enabled"):
        try:
            last_dt = datetime.datetime.fromisoformat(last_scan)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=TZ_TR)
            elapsed = (now - last_dt).total_seconds()
            remaining = max(0, 1800 - elapsed)  # 30 dk = 1800 sn
            next_scan_seconds = int(remaining)
        except (ValueError, TypeError):
            pass

    # Hesap başına tweet sayısı
    account_counts: dict[str, int] = {}
    for t in cache:
        acc = t.get("account", "")
        account_counts[acc] = account_counts.get(acc, 0) + 1

    # Hesap başına son tarama zamanı
    last_scanned_per_account = rotation.get("last_scanned", {})

    return {
        "enabled": config.get("enabled", False),
        "total_tweets": len(cache),
        "priority_count": len(config.get("priority_accounts", [])),
        "normal_count": len(config.get("normal_accounts", [])),
        "last_scan": last_scan,
        "next_scan_seconds": next_scan_seconds,
        "current_time": now.isoformat(),
        "account_counts": account_counts,
        "last_scanned_per_account": last_scanned_per_account,
        "scan_mode": "batch (30dk, 5 hesap/tur)",
    }


class SummarizeRequest(BaseModel):
    tweet_ids: list[str] = []  # Boş = özeti eksik tüm tweet'ler
    force: bool = False  # True = mevcut çevirileri yeniden üret


@router.post("/summarize")
def summarize_tweets(req: SummarizeRequest):
    """Tweet'ler için Türkçe çeviri üret (discovery + auto_scan cache)."""
    from backend.modules.style_manager import (
        load_discovery_cache, save_discovery_cache,
        load_auto_scan_cache, save_auto_scan_cache,
    )
    from backend.discovery_worker import _translate_batch, _make_preview

    discovery_cache = load_discovery_cache()
    auto_cache = load_auto_scan_cache()

    all_tweets = discovery_cache + auto_cache
    if not all_tweets:
        return {"success": True, "updated": 0}

    # Çevirisi eksik veya force=True olan tweet'leri bul
    needs_translation = []
    for t in all_tweets:
        tid = t.get("tweet_id", "")
        if req.tweet_ids and tid not in req.tweet_ids:
            continue
        if req.force:
            needs_translation.append(t)
        else:
            summary = t.get("summary_tr", "")
            preview = _make_preview(t.get("text", ""))
            if not summary or summary == preview or summary == t.get("text", "")[:200]:
                needs_translation.append(t)

    if not needs_translation:
        return {"success": True, "updated": 0}

    # Batch'ler halinde çevir (max 5 tweet per batch — inline yaklaşım)
    BATCH = 5
    total_updated = 0
    discovery_map = {t.get("tweet_id", ""): t for t in discovery_cache}
    auto_map = {t.get("tweet_id", ""): t for t in auto_cache}
    discovery_changed = False
    auto_changed = False

    for i in range(0, len(needs_translation), BATCH):
        batch = needs_translation[i:i + BATCH]
        summaries = _translate_batch(batch)
        if summaries:
            for tid, summary in summaries.items():
                if tid in discovery_map:
                    discovery_map[tid]["summary_tr"] = summary
                    discovery_changed = True
                    total_updated += 1
                elif tid in auto_map:
                    auto_map[tid]["summary_tr"] = summary
                    auto_changed = True
                    total_updated += 1

    if discovery_changed:
        save_discovery_cache(discovery_cache)
    if auto_changed:
        save_auto_scan_cache(auto_cache)

    return {"success": True, "updated": total_updated}


@router.delete("/clear")
def clear_cache():
    """Discovery cache'ini temizle."""
    from backend.modules.style_manager import save_discovery_cache, save_discovery_seen
    save_discovery_cache([])
    save_discovery_seen(set())
    return {"success": True, "message": "Cache temizlendi"}


# ── Faz 1: Scheduler Status ──────────────────────────────

@router.get("/scheduler-status")
def get_scheduler_status():
    """Tüm scheduler job'larının durumunu döndür (son/sonraki çalışma zamanı)."""
    try:
        from backend.scheduler_worker import get_scheduler_status as _get_status
        return _get_status()
    except Exception as e:
        logger.exception("Scheduler status error")
        raise HTTPException(500, f"Scheduler durumu alınamadı: {str(e)}")


# ── Faz 3: Auto-Scan Endpoints ──────────────────────────

@router.get("/auto-scan")
def get_auto_scan():
    """Otomatik konu taraması sonuçlarını getir."""
    from backend.modules.style_manager import load_auto_scan_cache
    cache = load_auto_scan_cache()
    return {"topics": cache, "total": len(cache)}


@router.post("/auto-scan/trigger")
def trigger_auto_scan():
    """Manuel otomatik tarama tetikle."""
    try:
        from backend.auto_topic_scanner import run_auto_scan
        run_auto_scan()
        from backend.modules.style_manager import load_auto_scan_cache
        cache = load_auto_scan_cache()
        return {"success": True, "total": len(cache)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Faz 4: Trend Endpoints ──────────────────────────────

@router.get("/trends")
def get_trends():
    """Trend analizi sonuçlarını getir."""
    from backend.modules.style_manager import load_trend_cache
    cache = load_trend_cache()
    return cache


@router.post("/trends/analyze")
def trigger_trend_analysis():
    """Manuel trend analizi tetikle."""
    try:
        from backend.trend_analyzer import analyze_trends
        analyze_trends()
        from backend.modules.style_manager import load_trend_cache
        cache = load_trend_cache()
        return {"success": True, "trends": cache.get("trends", [])[:10]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Faz 7: News Endpoints ───────────────────────────────

@router.get("/news")
def get_news():
    """Haber taraması sonuçlarını getir."""
    from backend.modules.style_manager import load_news_cache
    cache = load_news_cache()
    return {"articles": cache, "total": len(cache)}


@router.post("/news/scan")
def trigger_news_scan():
    """Manuel haber taraması tetikle."""
    try:
        from backend.news_scanner import scan_news
        scan_news()
        from backend.modules.style_manager import load_news_cache
        cache = load_news_cache()
        return {"success": True, "total": len(cache)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Faz 9: Suggested Accounts Endpoints ─────────────────

@router.get("/suggested-accounts")
def get_suggested_accounts():
    """Otomatik keşfedilen hesap önerilerini getir."""
    from backend.modules.style_manager import load_suggested_accounts
    accounts = load_suggested_accounts()
    active = [a for a in accounts if not a.get("dismissed")]
    return {"accounts": active, "total": len(active)}


@router.post("/suggested-accounts/dismiss")
def dismiss_suggested_account(request: RemoveAccountRequest):
    """Önerilen hesabı reddet (bir daha önerme)."""
    from backend.modules.style_manager import load_suggested_accounts, save_suggested_accounts
    accounts = load_suggested_accounts()
    for a in accounts:
        if a.get("username", "").lower() == request.username.lower():
            a["dismissed"] = True
            break
    save_suggested_accounts(accounts)
    return {"success": True}


@router.post("/suggested-accounts/accept")
def accept_suggested_account(request: AddAccountRequest):
    """Önerilen hesabı izleme listesine ekle."""
    from backend.modules.style_manager import (
        load_discovery_config, save_discovery_config,
        load_suggested_accounts, save_suggested_accounts,
    )
    # Add to discovery config
    config = load_discovery_config()
    username = request.username.strip().lstrip("@")
    if request.is_priority:
        if username not in config.get("priority_accounts", []):
            config.setdefault("priority_accounts", []).append(username)
    else:
        if username not in config.get("normal_accounts", []):
            config.setdefault("normal_accounts", []).append(username)
    save_discovery_config(config)

    # Remove from suggestions
    accounts = load_suggested_accounts()
    accounts = [a for a in accounts if a.get("username", "").lower() != username.lower()]
    save_suggested_accounts(accounts)

    return {"success": True, "message": f"@{username} izleme listesine eklendi"}


@router.post("/suggested-accounts/discover")
def trigger_account_discovery():
    """Manuel hesap keşfi tetikle."""
    try:
        from backend.account_discoverer import discover_accounts
        discover_accounts()
        from backend.modules.style_manager import load_suggested_accounts
        accounts = load_suggested_accounts()
        active = [a for a in accounts if not a.get("dismissed")]
        return {"success": True, "total": len(active)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Faz 6: AI News Value Scoring ──────────────────────

class ScoreNewsValueRequest(BaseModel):
    texts: list[str]  # List of texts to score


@router.post("/score-newsvalue")
def score_news_value(req: ScoreNewsValueRequest):
    """AI ile metin(ler)e haber değeri skoru at (1-10)."""
    if not req.texts:
        return {"scores": []}

    try:
        from backend.api.helpers import get_ai_provider

        provider, api_key, _ = get_ai_provider()
        if not api_key:
            raise HTTPException(400, "AI API anahtarı bulunamadı")

        # Build prompt for batch scoring
        texts_block = "\n---\n".join(
            f"[{i+1}] {t[:500]}" for i, t in enumerate(req.texts[:20])
        )

        prompt = (
            "Her metin icin AI/teknoloji haberi degeri skoru ver (1-10).\n"
            "1-3 = kisisel tweet, reklam, spam, genel sohbet\n"
            "4-6 = orta onem, genel AI haberi\n"
            "7-10 = buyuk duyuru, yeni model, onemli arastirma, kesif\n\n"
            f"Metinler:\n{texts_block}\n\n"
            "SADECE JSON array olarak yanit ver, baska bir sey yazma:\n"
            f'[{{"index": 1, "score": 7, "reason": "kisa aciklama"}}]'
        )

        scores = _call_ai_for_scores(provider, api_key, prompt)
        return {"scores": scores}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("News value scoring error")
        raise HTTPException(500, f"Skorlama hatası: {str(e)}")


def _call_ai_for_scores(provider: str, api_key: str, prompt: str) -> list[dict]:
    """Call AI provider and parse score results."""
    response_text = ""

    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = resp.content[0].text
    elif provider == "minimax":
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url="https://api.minimaxi.chat/v1")
        resp = client.chat.completions.create(
            model="MiniMax-Text-01",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = resp.choices[0].message.content or ""
    else:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = resp.choices[0].message.content or ""

    # Parse JSON from response
    try:
        # Extract JSON array
        match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if match:
            import json
            return json.loads(match.group())
    except Exception:
        pass

    return []


# ── Faz 7: Smart Suggestions (Kümelenmiş) ──────────────────────────

@router.get("/smart-suggestions")
def get_smart_suggestions():
    """Konu bazlı kümelenmiş akıllı tweet önerileri döndür.
    Worker tarafından otomatik kümelenen sonuçları cache'ten okur.
    Cache boşsa fallback olarak eski yöntemle döndürür.
    """
    from backend.modules.style_manager import load_clustered_suggestions

    cached = load_clustered_suggestions()

    # Kümelenmiş cache varsa direkt döndür
    if cached and cached.get("suggestions"):
        return {
            "suggestions": cached["suggestions"],
            "total": cached.get("total", len(cached["suggestions"])),
            "clustered_at": cached.get("clustered_at", ""),
            "tweet_count": cached.get("tweet_count", 0),
        }

    # Fallback: cache yoksa eski yöntemle döndür (kümeleme henüz çalışmamış)
    from backend.modules.style_manager import load_trend_cache, load_news_cache

    trend_cache = load_trend_cache()
    news_cache = load_news_cache()

    suggestions = []

    for trend in (trend_cache.get("trends") or [])[:10]:
        if trend.get("is_strong_trend"):
            top_tweets = trend.get("top_tweets", [])[:5]
            suggestions.append({
                "type": "trend",
                "topic": trend["keyword"],
                "topic_tr": trend["keyword"],
                "description_tr": f"{trend['account_count']} hesap bu konuda tweet atti. Toplam {trend['tweet_count']} tweet.",
                "reason": f"{trend['account_count']} hesap, {trend['tweet_count']} tweet",
                "tweets": top_tweets,
                "engagement_potential": min(10, max(1, int(trend.get("trend_score", 0) / 500) + 3)),
                "suggested_style": "informative",
                "suggested_hour": "14:07",
                "reasoning": "",
                "source_keywords": [trend["keyword"]],
                "total_engagement": trend.get("total_engagement", 0),
            })

    for article in (news_cache or [])[:5]:
        suggestions.append({
            "type": "news",
            "topic": article.get("title", ""),
            "topic_tr": article.get("title", ""),
            "description_tr": (article.get("body") or "")[:150] or "Haber kaynagindan alinan konu.",
            "reason": f"Kaynak: {article.get('source', '')}",
            "tweets": [],
            "engagement_potential": 6,
            "suggested_style": "informative",
            "suggested_hour": "10:22",
            "reasoning": "",
            "url": article.get("url", ""),
            "source_keywords": [],
            "total_engagement": 0,
            "news_body": (article.get("body") or "")[:300],
            "news_source": article.get("source", ""),
            "news_date": article.get("date", ""),
        })

    return {"suggestions": suggestions, "total": len(suggestions), "clustered_at": "", "tweet_count": 0}


@router.post("/cluster-suggestions")
def trigger_clustering():
    """Manuel kümeleme tetikle — önce trendleri yenile, sonra kümele."""
    try:
        import datetime as _dt
        from zoneinfo import ZoneInfo
        now = _dt.datetime.now(ZoneInfo("Europe/Istanbul"))

        # Step 1: Re-analyze trends from fresh scan data
        try:
            from backend.trend_analyzer import analyze_trends
            analyze_trends(force=True)
            logger.info("Manual clustering: trends re-analyzed")
        except Exception as e:
            logger.warning("Manual clustering: trend re-analysis failed: %s", e)

        # Step 2: Cluster with fresh trends
        from backend.trend_analyzer import _cluster_smart_suggestions
        from backend.modules.style_manager import load_trend_cache, load_clustered_suggestions

        trend_cache = load_trend_cache()
        trends = trend_cache.get("trends", [])
        _cluster_smart_suggestions(trends, now)

        cached = load_clustered_suggestions()
        return {
            "success": True,
            "total": cached.get("total", 0),
            "clustered_at": cached.get("clustered_at", ""),
        }
    except Exception as e:
        logger.exception("Manual clustering error")
        raise HTTPException(500, f"Kümeleme hatası: {str(e)}")


# ── Trends with History ──────────────────────────────

@router.get("/trend-history")
def get_trend_history():
    """Gün bazlı trend geçmişini döndür (son 7 gün)."""
    from backend.modules.style_manager import load_trend_history
    history = load_trend_history()
    return {"history": history, "total": len(history)}


class GenerateSmartSuggestionRequest(BaseModel):
    topic: str
    style: str = "informative"
    content_format: str = "spark"
    provider: str = ""
    context: str = ""  # Optional additional context


@router.post("/smart-suggestions/generate")
def generate_smart_suggestion(req: GenerateSmartSuggestionRequest):
    """Akıllı öneri için tweet üret + engagement tahmini."""
    try:
        from backend.api.helpers import get_ai_provider

        # Build provider fallback chain
        providers_to_try: list[tuple[str, str]] = []
        seen = set()

        # Primary: user-selected or auto
        try:
            p, k, _ = get_ai_provider(req.provider or "")
            if k and p not in seen:
                providers_to_try.append((p, k))
                seen.add(p)
        except Exception:
            pass

        # Fallbacks: try all available providers
        for fb in ["anthropic", "openai", "gemini", "groq"]:
            try:
                p, k, _ = get_ai_provider(fb)
                if k and p not in seen:
                    providers_to_try.append((p, k))
                    seen.add(p)
            except Exception:
                pass

        if not providers_to_try:
            raise HTTPException(400, "AI API anahtarı bulunamadı")

        prompt = (
            f"Konu: {req.topic}\n"
            f"Stil: {req.style}\n"
            f"Format: {req.content_format}\n"
        )
        if req.context:
            prompt += f"\nBaglam:\n{req.context}\n"

        prompt += (
            "\nBu konu hakkinda tweet yaz. Ayrica 1-10 arasi engagement potansiyeli "
            "tahmini ver ve en iyi paylasim saatini oner.\n\n"
            "JSON olarak yanit ver:\n"
            '{"tweet": "tweet metni", "engagement_potential": 8, "best_time": "14:07", "reasoning": "neden bu saat"}'
        )

        # Try providers with fallback
        response_text = ""
        last_error: Exception | None = None
        for provider_name, api_key in providers_to_try:
            try:
                response_text = _call_ai_simple(provider_name, api_key, prompt)
                logger.info("Smart suggestion generated with %s", provider_name)
                break
            except Exception as e:
                last_error = e
                logger.warning("Provider %s failed: %s — trying next", provider_name, e)
                continue
        else:
            raise HTTPException(500, f"Tüm AI providerlar başarısız: {last_error}")

        # Parse JSON
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if match:
            import json
            data = json.loads(match.group())
            return {
                "success": True,
                "tweet": data.get("tweet", ""),
                "engagement_potential": data.get("engagement_potential", 5),
                "best_time": data.get("best_time", ""),
                "reasoning": data.get("reasoning", ""),
            }

        # Fallback: return raw text as tweet
        return {
            "success": True,
            "tweet": response_text.strip(),
            "engagement_potential": 5,
            "best_time": "",
            "reasoning": "",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Smart suggestion generate error")
        raise HTTPException(500, str(e))


def _call_ai_simple(provider: str, api_key: str, prompt: str) -> str:
    """Simple AI call returning text response."""
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text
    elif provider == "minimax":
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url="https://api.minimaxi.chat/v1")
        resp = client.chat.completions.create(
            model="MiniMax-Text-01",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or ""
    else:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or ""


# ── Faz 9: Active Account Search ──────────────────────

class SearchAccountsRequest(BaseModel):
    query: str
    max_results: int = 10


def _get_twikit_client():
    """Get authenticated twikit client for API endpoints."""
    from backend.config import get_settings
    from backend.modules.twikit_client import TwikitSearchClient

    settings = get_settings()
    client = TwikitSearchClient(
        username=settings.twikit_username or "",
        password=settings.twikit_password or "",
        email=getattr(settings, "twikit_email", "") or "",
    )
    client.authenticate()
    if client._authenticated:
        return client
    return None


@router.post("/search-accounts")
def search_accounts(req: SearchAccountsRequest):
    """X'te aktif hesap araması (Twikit ile)."""
    if not req.query.strip():
        raise HTTPException(400, "Arama sorgusu boş olamaz")

    try:
        import asyncio

        client = _get_twikit_client()
        if not client:
            raise HTTPException(400, "Twikit cookie ayarlı değil")

        loop = asyncio.new_event_loop()
        try:
            users = loop.run_until_complete(
                client._get_client_sync().search_user(req.query.strip(), count=min(req.max_results, 20))
            )
        finally:
            loop.close()

        results = []
        for u in users:
            results.append({
                "username": getattr(u, "screen_name", "") or getattr(u, "username", ""),
                "display_name": getattr(u, "name", ""),
                "followers": getattr(u, "followers_count", 0),
                "following": getattr(u, "following_count", 0),
                "bio": getattr(u, "description", "") or "",
                "verified": getattr(u, "verified", False) or getattr(u, "is_blue_verified", False),
                "profile_image": getattr(u, "profile_image_url_https", ""),
            })

        return {"accounts": results, "total": len(results)}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Account search error")
        raise HTTPException(500, f"Hesap arama hatası: {str(e)}")


# ── Shared Discovery Tweets ──────────────────────────

@router.post("/mark-shared")
def mark_tweet_shared(body: dict):
    """Mark a discovery tweet as shared."""
    from backend.modules.style_manager import mark_discovery_tweet_shared
    tweet_id = body.get("tweet_id", "")
    if not tweet_id:
        raise HTTPException(400, "tweet_id gerekli")
    data = mark_discovery_tweet_shared(tweet_id)
    return {"success": True, "shared_tweets": [d["tweet_id"] for d in data]}


@router.post("/unmark-shared")
def unmark_tweet_shared(body: dict):
    """Unmark a discovery tweet as shared."""
    from backend.modules.style_manager import unmark_discovery_tweet_shared
    tweet_id = body.get("tweet_id", "")
    if not tweet_id:
        raise HTTPException(400, "tweet_id gerekli")
    data = unmark_discovery_tweet_shared(tweet_id)
    return {"success": True, "shared_tweets": [d["tweet_id"] for d in data]}


@router.get("/shared-tweets")
def get_shared_tweets():
    """Get list of shared discovery tweet IDs."""
    from backend.modules.style_manager import load_shared_discovery_tweets
    data = load_shared_discovery_tweets()
    return {"tweet_ids": [d["tweet_id"] for d in data]}


# ── My Tweets (Kullanıcının kendi tweetleri) ────────────

@router.get("/my-tweets")
def get_my_tweets():
    """Kullanıcının kendi tweetlerini cache'den döndür."""
    from pathlib import Path
    import json
    cache_path = Path(__file__).parent.parent.parent / "data" / "my_tweets_cache.json"
    if cache_path.exists():
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"tweets": data.get("tweets", []), "last_fetch": data.get("last_fetch", ""), "username": data.get("username", "")}
    return {"tweets": [], "last_fetch": "", "username": ""}


@router.post("/my-tweets/fetch")
async def fetch_my_tweets(body: dict = None):
    """Twikit ile kullanıcının tweetlerini çek ve cache'e kaydet."""
    import asyncio
    import json
    from pathlib import Path
    from datetime import datetime

    body = body or {}
    username = body.get("username", "")

    # Username yoksa self-reply config'den al
    if not username:
        from backend.modules.style_manager import load_self_reply_config
        sr_config = load_self_reply_config()
        username = sr_config.get("username", "")

    if not username:
        raise HTTPException(400, "Username gerekli. Ayarlardan veya self-reply config'den alınamadı.")

    try:
        from backend.modules.twikit_client import TwikitSearchClient
        from backend.config import get_settings
        s = get_settings()
        client = TwikitSearchClient(
            username=s.twikit_username or "",
            password=s.twikit_password or "",
            email=s.twikit_email or "",
        )
        auth_ok = await asyncio.to_thread(client.authenticate)
        if not auth_ok:
            raise HTTPException(500, "Twikit auth başarısız")

        from backend.modules.tweet_analyzer import pull_user_tweets
        raw_tweets = await asyncio.to_thread(pull_user_tweets, client, username, count=100)

        tweets = []
        for tw in raw_tweets:
            tweets.append({
                "tweet_id": tw.get("id", ""),
                "text": tw.get("text", ""),
                "created_at": tw.get("created_at", ""),
                "like_count": tw.get("like_count", 0),
                "retweet_count": tw.get("retweet_count", 0),
                "reply_count": tw.get("reply_count", 0),
                "bookmark_count": tw.get("bookmark_count", 0),
                "view_count": tw.get("view_count", 0),
                "media_items": tw.get("media", []),
                "urls": tw.get("urls", []),
                "is_retweet": tw.get("is_retweet", False),
            })

        # Engagement score hesapla
        for tw in tweets:
            tw["engagement_score"] = (
                tw["like_count"] * 1
                + tw["retweet_count"] * 20
                + tw["reply_count"] * 13.5
                + tw["bookmark_count"] * 10
            )

        # Sırala (en yüksek engagement üstte)
        tweets.sort(key=lambda x: x["engagement_score"], reverse=True)

        cache_path = Path(__file__).parent.parent.parent / "data" / "my_tweets_cache.json"
        import os
        os.makedirs(cache_path.parent, exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({
                "username": username,
                "tweets": tweets,
                "last_fetch": datetime.now().isoformat(),
                "total": len(tweets),
            }, f, ensure_ascii=False, indent=2)

        return {"success": True, "total": len(tweets), "username": username}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("My tweets fetch error")
        raise HTTPException(500, f"Tweet çekme hatası: {str(e)}")


@router.get("/my-tweets/analysis")
def get_my_tweets_analysis():
    """MiniMax analiz sonuçlarını döndür."""
    from pathlib import Path
    import json
    path = Path(__file__).parent.parent.parent / "data" / "my_tweets_analysis.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"analysis": None, "last_analyzed": ""}


@router.post("/my-tweets/analyze")
async def analyze_my_tweets():
    """MiniMax ile kullanıcının tweetlerini analiz et."""
    import asyncio
    import json
    from pathlib import Path
    from datetime import datetime

    cache_path = Path(__file__).parent.parent.parent / "data" / "my_tweets_cache.json"
    if not cache_path.exists():
        raise HTTPException(400, "Önce tweetleri çekin (fetch)")

    with open(cache_path, "r", encoding="utf-8") as f:
        cache = json.load(f)

    tweets = cache.get("tweets", [])
    if not tweets:
        raise HTTPException(400, "Analiz edilecek tweet yok")

    # Top 50 tweet'i al
    top_tweets = tweets[:50]
    tweet_texts = "\n---\n".join([
        f"[{tw.get('like_count', 0)} like, {tw.get('retweet_count', 0)} RT] {tw['text'][:300]}"
        for tw in top_tweets
    ])

    try:
        from backend.api.helpers import get_ai_client
        client, model = get_ai_client()

        prompt = f"""Aşağıda bir X (Twitter) kullanıcısının son 50 tweet'i var. Bunları analiz et ve şu bilgileri JSON olarak döndür:

1. "topics": Kullanıcının en çok paylaşım yaptığı konular (liste, max 10)
2. "style": Yazım tarzı özeti (2-3 cümle)
3. "engagement_patterns": Hangi tür içerikler daha çok etkileşim alıyor (2-3 cümle)
4. "best_performing_topics": En yüksek etkileşim alan konu başlıkları (liste, max 5)
5. "avoid_topics": Kullanıcının paylaşmadığı/ilgilenmediği konular (liste, max 5)
6. "posting_frequency": Günde ortalama kaç tweet
7. "content_type_distribution": {{"haber_analizi": %, "kisisel_yorum": %, "teknik": %, "diger": %}}
8. "recommended_topics": Bu kullanıcıya önerilecek konu önerileri (liste, max 5)

Tweetler:
{tweet_texts}

Sadece JSON döndür, başka bir şey yazma."""

        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
        )

        text = response.choices[0].message.content.strip()
        # JSON parse
        import re as re_mod
        json_match = re_mod.search(r'\{[\s\S]*\}', text)
        if json_match:
            analysis = json.loads(json_match.group())
        else:
            analysis = {"raw_response": text}

        result = {
            "analysis": analysis,
            "last_analyzed": datetime.now().isoformat(),
            "tweet_count": len(top_tweets),
            "username": cache.get("username", ""),
        }

        analysis_path = Path(__file__).parent.parent.parent / "data" / "my_tweets_analysis.json"
        with open(analysis_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("My tweets analysis error")
        raise HTTPException(500, f"Analiz hatası: {str(e)}")


# ── AI Relevance Scoring ────────────────────────────

@router.post("/ai-score-tweets")
async def ai_score_tweets():
    """Discovery cache'teki tweetleri kullanıcı profiline göre AI ile skorla."""
    import asyncio
    import json
    from pathlib import Path
    from datetime import datetime

    data_dir = Path(__file__).parent.parent.parent / "data"
    analysis_path = data_dir / "my_tweets_analysis.json"
    cache_path = data_dir / "discovery_cache.json"

    if not analysis_path.exists():
        raise HTTPException(400, "Önce kendi tweetlerinizi analiz edin")

    with open(analysis_path, "r", encoding="utf-8") as f:
        analysis_data = json.load(f)

    analysis = analysis_data.get("analysis", {})
    if not analysis:
        raise HTTPException(400, "Analiz verisi boş")

    if not cache_path.exists():
        return {"scored": 0}

    with open(cache_path, "r", encoding="utf-8") as f:
        cache = json.load(f)

    tweets = cache if isinstance(cache, list) else cache.get("tweets", cache)
    if not tweets:
        return {"scored": 0}

    # Skorlanmamış veya 1 saatten eski skorlu tweetleri seç
    now = datetime.now()
    to_score = []
    for tw in tweets[:100]:  # Max 100 tweet skorla
        last_scored = tw.get("ai_scored_at", "")
        if last_scored:
            try:
                scored_time = datetime.fromisoformat(last_scored)
                if (now - scored_time).total_seconds() < 3600:
                    continue  # 1 saatten yeni, atla
            except Exception:
                pass
        to_score.append(tw)

    if not to_score:
        return {"scored": 0, "message": "Tüm tweetler zaten skorlanmış"}

    # Batch olarak AI'ya gönder (max 20 tweet)
    batch = to_score[:20]
    topics = analysis.get("topics", [])
    avoid = analysis.get("avoid_topics", [])
    best = analysis.get("best_performing_topics", [])

    tweet_list = "\n".join([
        f"{i+1}. [{tw.get('account', '')}] {(tw.get('summary_tr') or tw.get('text', ''))[:200]}"
        for i, tw in enumerate(batch)
    ])

    try:
        from backend.api.helpers import get_ai_client
        client, model = get_ai_client()

        prompt = f"""Kullanıcı profili:
- İlgilendiği konular: {', '.join(topics)}
- En iyi performans: {', '.join(best)}
- İlgilenmediği konular: {', '.join(avoid)}

Aşağıdaki {len(batch)} tweet'i bu kullanıcıya uygunluk açısından 1-10 arası skorla.
10 = çok uygun (kesinlikle paylaşmalı), 1 = hiç uygun değil.

Tweetler:
{tweet_list}

Yanıtı sadece JSON array olarak döndür: [{{"idx": 1, "score": 8, "reason": "kısa neden"}}, ...]"""

        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
        )

        text = response.choices[0].message.content.strip()
        # MiniMax tag temizliği
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
        text = re.sub(r'<minimax:tool_call>.*?</minimax:tool_call>', '', text, flags=re.DOTALL).strip()
        text = re.sub(r'<minimax:tool_call>.*', '', text, flags=re.DOTALL).strip()
        json_match = re.search(r'\[[\s\S]*\]', text)
        if json_match:
            scores = json.loads(json_match.group())
        else:
            return {"scored": 0, "error": "AI yanıt parse edilemedi"}

        # Skorları tweet'lere uygula
        score_map = {s["idx"]: s for s in scores if "idx" in s}
        for i, tw in enumerate(batch):
            score_data = score_map.get(i + 1, {})
            tw["ai_relevance_score"] = score_data.get("score", 5)
            tw["ai_relevance_reason"] = score_data.get("reason", "")
            tw["ai_scored_at"] = now.isoformat()

        # Cache'i güncelle
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)

        return {"scored": len(batch), "message": f"{len(batch)} tweet skorlandı"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI scoring error")
        raise HTTPException(500, f"AI skorlama hatası: {str(e)}")


@router.post("/ai-score-trends")
async def ai_score_trends():
    """Trend konularını kullanıcı profiline göre MiniMax ile skorla."""
    import asyncio
    import json
    from pathlib import Path
    from datetime import datetime

    data_dir = Path(__file__).parent.parent.parent / "data"
    analysis_path = data_dir / "my_tweets_analysis.json"
    trend_path = data_dir / "trend_cache.json"

    if not analysis_path.exists():
        raise HTTPException(400, "Önce kendi tweetlerinizi analiz edin")

    with open(analysis_path, "r", encoding="utf-8") as f:
        analysis_data = json.load(f)
    analysis = analysis_data.get("analysis", {})
    if not analysis:
        raise HTTPException(400, "Analiz verisi boş")

    if not trend_path.exists():
        return {"scored": 0}

    with open(trend_path, "r", encoding="utf-8") as f:
        trend_cache = json.load(f)

    trends = trend_cache.get("trends", [])
    if not trends:
        return {"scored": 0}

    # Skorlanmamış veya 1 saatten eski skorlu trendleri seç
    now = datetime.now()
    to_score = []
    for tr in trends[:50]:
        last_scored = tr.get("ai_scored_at", "")
        if last_scored:
            try:
                scored_time = datetime.fromisoformat(last_scored)
                if (now - scored_time).total_seconds() < 3600:
                    continue
            except Exception:
                pass
        to_score.append(tr)

    if not to_score:
        return {"scored": 0, "message": "Tüm trendler zaten skorlanmış"}

    batch = to_score[:20]
    topics = analysis.get("topics", [])
    avoid = analysis.get("avoid_topics", [])
    best = analysis.get("best_performing_topics", [])
    style = analysis.get("style", "")

    trend_list = "\n".join([
        f"{i+1}. [{tr.get('keyword', '')}] (skor: {tr.get('trend_score', 0)}, {tr.get('tweet_count', 0)} tweet) "
        f"Öne çıkan: {' | '.join([(t.get('text', '')[:150]) for t in (tr.get('top_tweets', []) or [])[:2]])}"
        for i, tr in enumerate(batch)
    ])

    try:
        from backend.api.helpers import get_ai_client
        client, model = get_ai_client()

        prompt = f"""Kullanıcı profili:
- İlgilendiği konular: {', '.join(topics)}
- En iyi performans alan konular: {', '.join(best)}
- Yazım tarzı: {style}
- İlgilenmediği konular: {', '.join(avoid)}

Aşağıdaki {len(batch)} trend konusunu bu kullanıcıya uygunluk açısından 1-10 arası skorla.
10 = kullanıcının tarzına çok uygun, kesinlikle bu konuda paylaşım yapmalı
1 = hiç ilgisi yok veya kaçınması gereken konu

Trendler:
{trend_list}

Yanıtı sadece JSON array olarak döndür: [{{"idx": 1, "score": 8, "reason": "kısa neden"}}, ...]"""

        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
        )

        text = response.choices[0].message.content.strip()
        # MiniMax tag temizliği
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
        text = re.sub(r'<minimax:tool_call>.*?</minimax:tool_call>', '', text, flags=re.DOTALL).strip()
        text = re.sub(r'<minimax:tool_call>.*', '', text, flags=re.DOTALL).strip()
        json_match = re.search(r'\[[\s\S]*\]', text)
        if json_match:
            scores = json.loads(json_match.group())
        else:
            return {"scored": 0, "error": "AI yanıt parse edilemedi"}

        score_map = {s["idx"]: s for s in scores if "idx" in s}
        for i, tr in enumerate(batch):
            score_data = score_map.get(i + 1, {})
            tr["ai_relevance_score"] = score_data.get("score", 5)
            tr["ai_relevance_reason"] = score_data.get("reason", "")
            tr["ai_scored_at"] = now.isoformat()

        with open(trend_path, "w", encoding="utf-8") as f:
            json.dump(trend_cache, f, ensure_ascii=False, indent=2)

        return {"scored": len(batch), "message": f"{len(batch)} trend skorlandı"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI trend scoring error")
        raise HTTPException(500, f"Trend skorlama hatası: {str(e)}")


@router.post("/ai-score-suggestions")
async def ai_score_suggestions():
    """Akıllı önerileri kullanıcı profiline göre MiniMax ile skorla."""
    import asyncio
    import json
    from pathlib import Path
    from datetime import datetime

    data_dir = Path(__file__).parent.parent.parent / "data"
    analysis_path = data_dir / "my_tweets_analysis.json"
    suggestions_path = data_dir / "clustered_suggestions.json"

    if not analysis_path.exists():
        raise HTTPException(400, "Önce kendi tweetlerinizi analiz edin")

    with open(analysis_path, "r", encoding="utf-8") as f:
        analysis_data = json.load(f)
    analysis = analysis_data.get("analysis", {})
    if not analysis:
        raise HTTPException(400, "Analiz verisi boş")

    if not suggestions_path.exists():
        return {"scored": 0}

    with open(suggestions_path, "r", encoding="utf-8") as f:
        suggestions_cache = json.load(f)

    suggestions = suggestions_cache.get("suggestions", [])
    if not suggestions:
        return {"scored": 0}

    now = datetime.now()
    to_score = []
    for sg in suggestions[:50]:
        last_scored = sg.get("ai_scored_at", "")
        if last_scored:
            try:
                scored_time = datetime.fromisoformat(last_scored)
                if (now - scored_time).total_seconds() < 3600:
                    continue
            except Exception:
                pass
        to_score.append(sg)

    if not to_score:
        return {"scored": 0, "message": "Tüm öneriler zaten skorlanmış"}

    batch = to_score[:20]
    topics = analysis.get("topics", [])
    avoid = analysis.get("avoid_topics", [])
    best = analysis.get("best_performing_topics", [])
    style = analysis.get("style", "")

    suggestion_list = "\n".join([
        f"{i+1}. [{sg.get('type', 'trend')}] {sg.get('topic_tr', sg.get('topic', ''))} "
        f"(engagement: {sg.get('engagement_potential', 0)}) "
        f"Neden: {sg.get('reasoning', sg.get('reason', ''))[:150]}"
        for i, sg in enumerate(batch)
    ])

    try:
        from backend.api.helpers import get_ai_client
        client, model = get_ai_client()

        prompt = f"""Kullanıcı profili:
- İlgilendiği konular: {', '.join(topics)}
- En iyi performans alan konular: {', '.join(best)}
- Yazım tarzı: {style}
- İlgilenmediği konular: {', '.join(avoid)}

Aşağıdaki {len(batch)} içerik önerisini bu kullanıcıya uygunluk açısından 1-10 arası skorla.
10 = kullanıcının tarzına çok uygun, kesinlikle paylaşmalı
1 = hiç ilgisi yok

Öneriler:
{suggestion_list}

Yanıtı sadece JSON array olarak döndür: [{{"idx": 1, "score": 8, "reason": "kısa neden"}}, ...]"""

        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
        )

        text = response.choices[0].message.content.strip()
        # MiniMax tag temizliği
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
        text = re.sub(r'<minimax:tool_call>.*?</minimax:tool_call>', '', text, flags=re.DOTALL).strip()
        text = re.sub(r'<minimax:tool_call>.*', '', text, flags=re.DOTALL).strip()
        json_match = re.search(r'\[[\s\S]*\]', text)
        if json_match:
            scores = json.loads(json_match.group())
        else:
            return {"scored": 0, "error": "AI yanıt parse edilemedi"}

        score_map = {s["idx"]: s for s in scores if "idx" in s}
        for i, sg in enumerate(batch):
            score_data = score_map.get(i + 1, {})
            sg["ai_relevance_score"] = score_data.get("score", 5)
            sg["ai_relevance_reason"] = score_data.get("reason", "")
            sg["ai_scored_at"] = now.isoformat()

        with open(suggestions_path, "w", encoding="utf-8") as f:
            json.dump(suggestions_cache, f, ensure_ascii=False, indent=2)

        return {"scored": len(batch), "message": f"{len(batch)} öneri skorlandı"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI suggestion scoring error")
        raise HTTPException(500, f"Öneri skorlama hatası: {str(e)}")


# ── Kapsamlı Hesap Keşfi — Analiz + Akıllı Keşif ─────────

class AnalyzeAccountRequest(BaseModel):
    username: str
    tweet_count: int = 20


class SmartDiscoverRequest(BaseModel):
    strategies: list[str] = ["cache_based", "grok_search", "trend_based", "interaction_based"]
    max_per_strategy: int = 5


class BatchAnalyzeRequest(BaseModel):
    usernames: list[str]


@router.post("/analyze-account")
def analyze_account(req: AnalyzeAccountRequest):
    """Bir hesabın son tweetlerini çekip AI ile değerlendir."""
    username = req.username.strip().lstrip("@")
    if not username:
        raise HTTPException(400, "Kullanıcı adı boş olamaz")

    try:
        from backend.account_discoverer import analyze_single_account

        result = analyze_single_account(username, req.tweet_count)
        if not result:
            raise HTTPException(404, f"@{username} için veri bulunamadı. Twikit cookie kontrol edin.")

        # Save analysis to suggested accounts
        if result.get("analysis"):
            from backend.modules.style_manager import load_suggested_accounts, save_suggested_accounts
            import datetime as _dt
            from zoneinfo import ZoneInfo as _ZI

            accounts = load_suggested_accounts()
            existing = None
            for a in accounts:
                if a.get("username", "").lower() == username.lower():
                    existing = a
                    break

            analysis_data = result["analysis"]
            profile = result.get("profile") or {}

            if existing:
                existing["analysis"] = analysis_data
                existing["profile"] = profile
                if analysis_data.get("overall_score"):
                    existing["score"] = analysis_data["overall_score"]
            else:
                accounts.append({
                    "username": username.lower(),
                    "appearances": 0,
                    "avg_engagement": 0,
                    "total_engagement": 0,
                    "followers": profile.get("followers_count", 0) or 0,
                    "score": analysis_data.get("overall_score", 0),
                    "sample_tweet": "",
                    "sample_tweets": [],
                    "discovered_at": _dt.datetime.now(_ZI("Europe/Istanbul")).isoformat(),
                    "dismissed": False,
                    "discovery_strategy": "manual_analysis",
                    "analysis": analysis_data,
                    "profile": profile,
                })

            save_suggested_accounts(accounts)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Account analysis error for @%s", username)
        raise HTTPException(500, f"Hesap analiz hatası: {str(e)}")


@router.post("/smart-discover")
def smart_discover(req: SmartDiscoverRequest):
    """Çoklu strateji ile akıllı hesap keşfi."""
    try:
        from backend.account_discoverer import discover_accounts_smart

        result = discover_accounts_smart(
            strategies=req.strategies,
            max_per_strategy=req.max_per_strategy,
        )

        # Reload suggested accounts for response
        from backend.modules.style_manager import load_suggested_accounts
        accounts = load_suggested_accounts()
        active = [a for a in accounts if not a.get("dismissed")]

        return {
            "success": True,
            "accounts": active,
            "total": len(active),
            "discovery_stats": result,
        }

    except Exception as e:
        logger.exception("Smart discover error")
        raise HTTPException(500, f"Akıllı keşif hatası: {str(e)}")


@router.post("/batch-analyze")
def batch_analyze_accounts(req: BatchAnalyzeRequest):
    """Birden fazla hesabı toplu analiz et (max 5)."""
    usernames = [u.strip().lstrip("@") for u in req.usernames if u.strip()]
    if not usernames:
        raise HTTPException(400, "En az bir kullanıcı adı gerekli")
    if len(usernames) > 5:
        raise HTTPException(400, "Toplu analizde max 5 hesap")

    results = []
    for username in usernames:
        try:
            from backend.account_discoverer import analyze_single_account
            result = analyze_single_account(username, tweet_count=15)
            if result:
                # Save analysis
                if result.get("analysis"):
                    from backend.modules.style_manager import load_suggested_accounts, save_suggested_accounts
                    import datetime as _dt
                    from zoneinfo import ZoneInfo as _ZI

                    accounts = load_suggested_accounts()
                    existing = None
                    for a in accounts:
                        if a.get("username", "").lower() == username.lower():
                            existing = a
                            break

                    if existing:
                        existing["analysis"] = result["analysis"]
                        existing["profile"] = result.get("profile") or {}
                        if result["analysis"].get("overall_score"):
                            existing["score"] = result["analysis"]["overall_score"]
                    else:
                        profile = result.get("profile") or {}
                        accounts.append({
                            "username": username.lower(),
                            "appearances": 0,
                            "avg_engagement": 0,
                            "total_engagement": 0,
                            "followers": (profile.get("followers_count") or 0),
                            "score": result["analysis"].get("overall_score", 0),
                            "sample_tweet": "",
                            "sample_tweets": [],
                            "discovered_at": _dt.datetime.now(_ZI("Europe/Istanbul")).isoformat(),
                            "dismissed": False,
                            "discovery_strategy": "batch_analysis",
                            "analysis": result["analysis"],
                            "profile": profile,
                        })

                    save_suggested_accounts(accounts)

                results.append({"username": username, "success": True, "data": result})
            else:
                results.append({"username": username, "success": False, "error": "Veri bulunamadı"})
        except Exception as e:
            results.append({"username": username, "success": False, "error": str(e)})

    return {"results": results, "analyzed": len([r for r in results if r["success"]])}
