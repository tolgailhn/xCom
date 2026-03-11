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
def get_tweets():
    """Son 24 saatteki keşfedilmiş tweetleri döndür (sıralı)."""
    from backend.modules.style_manager import load_discovery_cache
    cache = load_discovery_cache()
    return {"tweets": cache, "total": len(cache)}


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
        "scan_mode": "batch (30dk, 3 hesap/tur)",
    }


class SummarizeRequest(BaseModel):
    tweet_ids: list[str] = []  # Boş = özeti eksik tüm tweet'ler
    force: bool = False  # True = mevcut çevirileri yeniden üret


@router.post("/summarize")
def summarize_tweets(req: SummarizeRequest):
    """Tweet'ler için Türkçe çeviri üret."""
    from backend.modules.style_manager import load_discovery_cache, save_discovery_cache
    from backend.discovery_worker import _generate_turkish_summary, _make_preview

    cache = load_discovery_cache()
    if not cache:
        return {"success": True, "updated": 0}

    # Çevirisi eksik veya force=True olan tweet'leri bul
    needs_translation = []
    for t in cache:
        if req.tweet_ids and t["tweet_id"] not in req.tweet_ids:
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

    # Batch'ler halinde çevir (max 10 tweet per batch — tam çeviri daha uzun)
    BATCH = 10
    total_updated = 0
    for i in range(0, len(needs_translation), BATCH):
        batch = needs_translation[i:i + BATCH]
        summaries = _generate_turkish_summary(batch)
        if summaries:
            # Cache'deki tweet'leri güncelle
            cache_map = {t["tweet_id"]: t for t in cache}
            for tid, summary in summaries.items():
                if tid in cache_map:
                    cache_map[tid]["summary_tr"] = summary
                    total_updated += 1

    if total_updated > 0:
        save_discovery_cache(cache)

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


# ── Faz 7: Smart Suggestions ──────────────────────────

@router.get("/smart-suggestions")
def get_smart_suggestions():
    """Mevcut trend/haber verilerinden akıllı tweet önerileri döndür."""
    from backend.modules.style_manager import load_trend_cache, load_news_cache

    trend_cache = load_trend_cache()
    news_cache = load_news_cache()

    suggestions = []

    # Trend-based suggestions (strong trends first)
    for trend in (trend_cache.get("trends") or [])[:10]:
        if trend.get("is_strong_trend"):
            suggestions.append({
                "type": "trend",
                "topic": trend["keyword"],
                "reason": f"{trend['account_count']} hesapta trend, {trend['tweet_count']} tweet",
                "engagement_potential": min(10, max(1, int(trend.get("trend_score", 0) / 500) + 3)),
                "suggested_style": "informative",
                "suggested_format": "single",
                "suggested_hour": "14:07",
                "top_tweets": trend.get("top_tweets", [])[:3],
                "source_data": trend,
            })

    # News-based suggestions (latest first)
    for article in (news_cache or [])[:5]:
        suggestions.append({
            "type": "news",
            "topic": article.get("title", ""),
            "reason": f"Kaynak: {article.get('source', '')}",
            "engagement_potential": 6,
            "suggested_style": "informative",
            "suggested_format": "spark",
            "suggested_hour": "10:22",
            "url": article.get("url", ""),
            "source_data": article,
        })

    return {"suggestions": suggestions, "total": len(suggestions)}


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


@router.post("/search-accounts")
def search_accounts(req: SearchAccountsRequest):
    """X'te aktif hesap araması (Twikit ile)."""
    if not req.query.strip():
        raise HTTPException(400, "Arama sorgusu boş olamaz")

    try:
        from backend.modules.twikit_client import get_twikit_client
        import asyncio

        client = get_twikit_client()
        if not client:
            raise HTTPException(400, "Twikit cookie ayarlı değil")

        loop = asyncio.new_event_loop()
        try:
            users = loop.run_until_complete(
                client.search_user(req.query.strip(), count=min(req.max_results, 20))
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
