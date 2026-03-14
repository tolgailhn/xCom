"""
Faz 4: Trend Tespiti — Çapraz Hesap Keyword Analizi
Her 1 saatte çalışır. Discovery cache + auto-scan cache'deki tüm tweet'lerden
keyword frequency çıkarır. 3+ hesapta geçen keyword = TREND.
"""
import datetime
import logging
import re
from collections import Counter, defaultdict
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# AI/tech keywords to track — these are high-signal terms
TRACKED_KEYWORDS = {
    # Models
    "gpt-5", "gpt-4", "gpt-4o", "chatgpt", "claude", "claude 4", "gemini",
    "deepseek", "qwen", "llama", "mistral", "grok", "phi", "command-r",
    # Companies
    "openai", "anthropic", "google", "meta", "nvidia", "microsoft", "apple",
    "xai", "deepmind", "cohere", "stability", "midjourney",
    # Concepts
    "agent", "agents", "agentic", "mcp", "rag", "fine-tuning", "reasoning",
    "multimodal", "vision", "voice", "video", "coding", "benchmark",
    "open-source", "open source", "inference", "training",
    # Products
    "cursor", "windsurf", "copilot", "devin", "replit", "v0",
    "sora", "runway", "flux", "dall-e", "stable diffusion",
    # Hardware
    "h100", "h200", "b200", "tpu", "chip",
}

# Stop words to exclude from auto-detected keywords
STOP_WORDS = {
    "the", "is", "at", "in", "on", "to", "for", "of", "and", "or", "a", "an",
    "this", "that", "it", "with", "from", "by", "as", "are", "was", "be",
    "has", "have", "had", "but", "not", "you", "we", "they", "your", "our",
    "will", "can", "do", "does", "did", "just", "new", "more", "most",
    "bir", "ve", "ile", "de", "da", "bu", "şu", "o", "ne", "için",
    "çok", "var", "yok", "olan", "gibi", "daha", "en", "ama", "ki",
    "kadar", "sonra", "önce", "şimdi", "bence", "aslında", "zaten",
}


def analyze_trends(force: bool = False):
    """Trend analizi — scheduler tarafından çağrılır. force=True ile saat kontrolü atlanır."""
    now = datetime.datetime.now(TZ_TR)

    # Work hours check — skip for manual triggers
    if not force and (now.hour < 8 or now.hour >= 23):
        return

    try:
        from backend.modules.style_manager import (
            load_discovery_cache,
            load_auto_scan_cache,
            load_trend_cache,
            save_trend_cache,
        )
    except ImportError as e:
        logger.warning("Trend analyzer import error: %s", e)
        return

    # Collect all recent tweets (last 24 hours — matches discovery_worker MAX_TWEET_AGE_HOURS)
    cutoff = (now - datetime.timedelta(hours=24)).isoformat()

    discovery_tweets = load_discovery_cache()
    auto_scan_tweets = load_auto_scan_cache()

    all_tweets = []
    for t in discovery_tweets:
        if t.get("scanned_at", "") > cutoff or t.get("created_at", "") > cutoff:
            all_tweets.append(t)
    for t in auto_scan_tweets:
        if t.get("scanned_at", "") > cutoff:
            all_tweets.append(t)

    if not all_tweets:
        logger.info("Trend analyzer: no recent tweets to analyze")
        return

    # Filter out low-quality tweets before trend analysis
    try:
        from backend.modules.twitter_scanner import is_spam
        pre_count = len(all_tweets)
        all_tweets = [t for t in all_tweets if not is_spam(t.get("text", "") or "")]
        filtered = pre_count - len(all_tweets)
        if filtered > 0:
            logger.info("Trend analyzer: filtered %d/%d low-quality tweets", filtered, pre_count)
    except ImportError:
        pass

    if not all_tweets:
        logger.info("Trend analyzer: no tweets left after quality filter")
        return

    # Eksik Türkçe özetleri toplu üret
    try:
        from backend.discovery_worker import _translate_batch, _make_preview
        # Boş veya preview-only (İngilizce kalmış) özetleri yakala
        missing_summary = [t for t in all_tweets
                           if not t.get("summary_tr")
                           or t["summary_tr"] == _make_preview(t.get("text", ""))
                           or t["summary_tr"] == t.get("text", "")[:200]]
        if missing_summary:
            summaries = _translate_batch(missing_summary[:5])
            if summaries:
                for t in missing_summary:
                    tid = t.get("tweet_id", "")
                    if tid in summaries:
                        t["summary_tr"] = summaries[tid]
                logger.info("Trend analyzer: %d/%d eksik Turkce ozet uretildi",
                            len(summaries), len(missing_summary))
                # Auto-scan cache'i de güncelle (kalıcılık)
                try:
                    auto_map = {t.get("tweet_id", ""): t for t in auto_scan_tweets}
                    updated_auto = False
                    for tid, s in summaries.items():
                        if tid in auto_map:
                            auto_map[tid]["summary_tr"] = s
                            updated_auto = True
                    if updated_auto:
                        from backend.modules.style_manager import save_auto_scan_cache
                        save_auto_scan_cache(auto_scan_tweets)
                except Exception:
                    pass
            # AI başarısız olan tweet'lere İngilizce preview fallback
            for t in missing_summary:
                if not t.get("summary_tr"):
                    t["summary_tr"] = _make_preview(t.get("text", ""))
    except Exception as e:
        logger.warning("Trend analyzer Turkish summary backfill error: %s", e)

    # Extract keywords and count per account
    keyword_accounts = defaultdict(set)  # keyword -> set of accounts
    keyword_tweets = defaultdict(list)   # keyword -> list of tweet dicts
    keyword_total_engagement = Counter()  # keyword -> total engagement

    for tweet in all_tweets:
        text = (tweet.get("text", "") or "").lower()
        account = tweet.get("account", "") or tweet.get("author", "") or "unknown"
        engagement = tweet.get("engagement_score", 0) or tweet.get("like_count", 0)

        # Check tracked keywords
        found_keywords = set()
        for kw in TRACKED_KEYWORDS:
            if kw in text:
                found_keywords.add(kw)

        # Auto-detect capitalized terms (potential new keywords)
        # E.g., "GPT-5o", "Llama4", etc.
        raw_text = tweet.get("text", "") or ""
        caps_words = re.findall(r'\b[A-Z][A-Za-z0-9\-\.]+\b', raw_text)
        for w in caps_words:
            wl = w.lower()
            if len(wl) >= 3 and wl not in STOP_WORDS:
                found_keywords.add(wl)

        for kw in found_keywords:
            keyword_accounts[kw].add(account)
            tweet_id = tweet.get("tweet_id", "")
            keyword_tweets[kw].append({
                "tweet_id": tweet_id,
                "text": (tweet.get("text", "") or "")[:300],
                "account": account,
                "engagement": engagement,
                "tweet_url": f"https://x.com/{account}/status/{tweet_id}" if tweet_id else "",
                "summary_tr": tweet.get("summary_tr", ""),
                "created_at": tweet.get("created_at", ""),
            })
            keyword_total_engagement[kw] += engagement

    # Detect trends: keyword appears in 3+ different accounts
    trends = []
    for kw, accounts in keyword_accounts.items():
        if len(accounts) >= 2:  # 2+ accounts = potential trend
            account_count = len(accounts)
            total_engagement = keyword_total_engagement[kw]
            # Score: account_count * 100 + total_engagement
            trend_score = account_count * 100 + total_engagement

            # Get top tweets for this keyword
            top_tweets = sorted(
                keyword_tweets[kw],
                key=lambda x: x.get("engagement", 0),
                reverse=True
            )[:5]

            # Breaking news detection: 3+ accounts tweeting about same topic in last 2 hours
            is_breaking = False
            recent_cutoff = (now - datetime.timedelta(hours=2)).isoformat()
            recent_tweets = [
                t for t in keyword_tweets[kw]
                if t.get("created_at", "") > recent_cutoff
            ]
            recent_accounts = {t.get("account", "") for t in recent_tweets}
            if len(recent_accounts) >= 3:
                is_breaking = True

            trends.append({
                "keyword": kw,
                "account_count": account_count,
                "accounts": list(accounts)[:10],
                "total_engagement": total_engagement,
                "trend_score": trend_score,
                "tweet_count": len(keyword_tweets[kw]),
                "top_tweets": top_tweets,
                "is_strong_trend": account_count >= 3,
                "is_breaking": is_breaking,
                "detected_at": now.isoformat(),
            })

    # Sort by trend score
    trends.sort(key=lambda x: x["trend_score"], reverse=True)

    # Build keyword frequency for overall stats
    keyword_counts = {
        kw: len(accounts)
        for kw, accounts in keyword_accounts.items()
        if len(accounts) >= 2
    }

    trend_cache = {
        "trends": trends[:30],  # Top 30 trends
        "last_updated": now.isoformat(),
        "keyword_counts": dict(sorted(
            keyword_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:50]),
        "total_tweets_analyzed": len(all_tweets),
    }

    save_trend_cache(trend_cache)
    strong_trends = [t for t in trends if t["is_strong_trend"]]
    logger.info(
        "Trend analyzer: %d trends detected (%d strong), %d tweets analyzed",
        len(trends), len(strong_trends), len(all_tweets)
    )

    # Save to trend history (gün bazlı arşiv)
    try:
        from backend.modules.style_manager import load_trend_history, save_trend_history
        history = load_trend_history()
        date_str = now.strftime("%Y-%m-%d")
        # Update or add today's entry
        today_entry = None
        for h in history:
            if h.get("date") == date_str:
                today_entry = h
                break
        if today_entry:
            today_entry["trends"] = trends[:30]
            today_entry["analysis_date"] = now.isoformat()
            today_entry["total_tweets_analyzed"] = len(all_tweets)
        else:
            history.insert(0, {
                "date": date_str,
                "analysis_date": now.isoformat(),
                "trends": trends[:30],
                "total_tweets_analyzed": len(all_tweets),
            })
        save_trend_history(history)
    except Exception:
        logger.exception("Trend history save error")

    # Auto-cluster suggestions (konu bazlı kümeleme)
    try:
        _cluster_smart_suggestions(trends, now)
    except Exception:
        logger.exception("Auto clustering error")

    # Notify about breaking trends (high urgency)
    breaking_trends = [t for t in trends if t.get("is_breaking")]
    if breaking_trends:
        _notify_breaking(breaking_trends)

    # Notify about strong trends + auto-suggest content (Faz 8)
    if strong_trends:
        _notify_trends(strong_trends)
        try:
            from backend.auto_content_suggester import suggest_content_from_trends
            suggest_content_from_trends()
        except Exception:
            logger.exception("Auto content suggestion error")


def _cluster_smart_suggestions(trends: list[dict], now: datetime.datetime, force: bool = False):
    """Trend tweet'lerini + tüm cache tweet'lerini AI ile konu bazlı kümele."""
    import json as _json

    from backend.modules.style_manager import (
        load_clustered_suggestions,
        save_clustered_suggestions,
        load_news_cache,
        load_discovery_cache,
        load_auto_scan_cache,
    )

    # Spam filter for clustering input
    try:
        from backend.modules.twitter_scanner import is_spam as _is_spam_check
    except ImportError:
        _is_spam_check = None

    # Also import low-quality checker for broader filtering
    try:
        from backend.modules.twitter_scanner import is_low_quality_discovery as _is_lq_check
    except ImportError:
        _is_lq_check = None

    MAX_CLUSTERING_TWEETS = 100  # AI prompt boyutu için üst limit

    def _is_clean(text: str) -> bool:
        """Spam/low-quality kontrolü."""
        if _is_lq_check and _is_lq_check(text):
            return False
        if _is_spam_check and _is_spam_check(text):
            return False
        return True

    # ── STEP 1: Trend tweet'lerini topla (öncelikli) ──
    all_tweets = []
    tweet_meta = []
    seen_ids = set()
    seen_texts = set()
    skipped_spam = 0

    for trend in trends[:25]:
        for tw in trend.get("top_tweets", [])[:7]:
            text = (tw.get("text") or "")[:500].strip()
            tid = tw.get("tweet_id", "")
            if not text:
                continue
            if tid and tid in seen_ids:
                continue
            if text in seen_texts:
                continue
            if not _is_clean(text):
                skipped_spam += 1
                continue
            all_tweets.append(text)
            seen_texts.add(text)
            if tid:
                seen_ids.add(tid)
            tweet_meta.append({
                "text": text,
                "account": tw.get("account", ""),
                "engagement": tw.get("engagement", 0),
                "keyword": trend.get("keyword", ""),
                "tweet_id": tid,
                "tweet_url": tw.get("tweet_url", ""),
                "created_at": tw.get("created_at", ""),
            })

    trend_count = len(all_tweets)

    # ── STEP 2: Tüm cache tweet'lerini ekle (trend'de olmayanlar) ──
    cutoff = (now - datetime.timedelta(hours=24)).isoformat()
    cache_candidates = []

    for source_loader in (load_discovery_cache, load_auto_scan_cache):
        try:
            cache = source_loader()
        except Exception:
            continue
        for t in cache:
            # Son 24 saat filtresi
            created = t.get("created_at", "") or t.get("scanned_at", "")
            if created and created < cutoff:
                continue
            tid = t.get("tweet_id", "")
            text = (t.get("text") or "")[:500].strip()
            if not text:
                continue
            if tid and tid in seen_ids:
                continue
            if text in seen_texts:
                continue
            if not _is_clean(text):
                skipped_spam += 1
                continue
            engagement = t.get("engagement_score", 0) or t.get("like_count", 0)
            cache_candidates.append({
                "text": text,
                "account": t.get("account", "") or t.get("author", "") or "unknown",
                "engagement": engagement,
                "keyword": "",
                "tweet_id": tid,
                "tweet_url": t.get("tweet_url", "") or (f"https://x.com/{t.get('account', '')}/status/{tid}" if tid else ""),
                "created_at": t.get("created_at", ""),
            })
            seen_texts.add(text)
            if tid:
                seen_ids.add(tid)

    # Engagement'a göre sırala, en değerli tweetleri öncele
    cache_candidates.sort(key=lambda x: x.get("engagement", 0), reverse=True)

    # Kalan kapasiteyi cache tweet'leriyle doldur
    remaining = MAX_CLUSTERING_TWEETS - len(all_tweets)
    for c in cache_candidates[:remaining]:
        all_tweets.append(c["text"])
        tweet_meta.append(c)

    if skipped_spam:
        logger.info("Clustering: skipped %d spam tweets from input", skipped_spam)
    logger.info(
        "Clustering: %d tweets total (%d from trends, %d from cache)",
        len(all_tweets), trend_count, len(all_tweets) - trend_count,
    )

    # Aynı veriyle gereksiz AI çağrısı yapma — hash kontrolü (force ile bypass)
    new_hash = str(hash("|".join(sorted(all_tweets)[:50])))
    existing = load_clustered_suggestions()
    if not force and isinstance(existing, dict) and existing.get("source_hash") == new_hash:
        # Veriler değişmemiş — clustered_at'ı güncelle ama AI çağrısı yapma
        existing["clustered_at"] = now.isoformat()
        save_clustered_suggestions(existing)
        logger.info("Clustering: same data hash, skipping AI call (updated timestamp)")
        return

    if len(all_tweets) < 3:
        logger.warning("Clustering: too few tweets (%d), skipping — trends may be stale", len(all_tweets))
        return

    # Build prompt for AI clustering — include engagement data for context
    tweets_text = "\n".join(
        f"[{i}] @{tweet_meta[i]['account']} (❤️{tweet_meta[i].get('engagement', 0)}): {tweet_meta[i]['text']}"
        for i in range(len(all_tweets))
    )

    prompt = (
        "Bu tweet'leri SEMANTIK BENZERLIGE göre grupla.\n"
        "Her grup TEK BİR olay/duyuru/ürün/tartışma hakkında olmalı.\n"
        "AYNI KONU hakkında farklı kişilerin yazdığı tweetleri AYNI GRUBA koy.\n\n"
        "HEDEF: Mümkün olduğunca FAZLA farklı konu bul. Küme sayısını SINIRLANDIRMA.\n"
        "Tek tweet'lik konuları bile dahil et — her konu değerli.\n\n"
        "KURALLAR:\n"
        "1. SEMANTIK ANALIZ YAP — sadece keyword eşleşmesine bakma, anlam benzerliğine bak\n"
        "2. Aynı ürün/olay/duyuru hakkındaki tweetleri MUTLAKA birleştir (ör: 'GPT-5 launched', 'OpenAI releases GPT-5', 'New GPT model' → HEPSİ AYNI GRUP)\n"
        "3. Her konu başlığı EN AZ 3 kelime olmalı ve spesifik bir olay/ürün/duyuru içermeli\n"
        "4. GENELLEMELERDEN KAÇIN — 'AI gelişmeleri' değil, 'Google Gemini 2.5 Flash Çıkışı' gibi spesifik ol\n"
        "5. Birbirine BENZEMEYEN tweet'leri aynı gruba KOYMA\n"
        "6. topic_title_tr ZORUNLU — Türkçe başlık MUTLAKA yaz\n"
        "7. description_tr ZORUNLU — 'Bu konu neden önemli?' 1-2 cümle Türkçe açıklama yaz\n"
        "8. Engagement yüksek olan grupları (toplam ❤️) daha yüksek engagement_potential ver\n"
        "9. Küme sayısını SINIRLANDIRMA — kaç farklı konu varsa hepsini ayrı küme yap\n\n"
        f"Tweet'ler:\n{tweets_text}\n\n"
        "SADECE JSON array döndür, başka bir şey yazma:\n"
        '[{"topic_title": "specific English topic title (min 3 words)", '
        '"topic_title_tr": "Türkçe başlık (ZORUNLU)", '
        '"description_tr": "Bu konu neden önemli? Türkçe açıklama (ZORUNLU)", '
        '"tweet_indices": [0, 3, 5], "engagement_potential": 8, '
        '"suggested_style": "informative", "suggested_hour": "14:07", '
        '"reasoning": "neden ilginç kısa açıklama"}]'
    )

    # Call AI
    try:
        from backend.api.helpers import get_ai_provider
        provider, api_key, _ = get_ai_provider()
        if not api_key:
            logger.warning("Clustering: no AI key available")
            return
    except Exception:
        logger.warning("Clustering: AI provider unavailable")
        return

    response_text = ""
    try:
        if provider in ("minimax", "groq", "openai"):
            import ssl
            import urllib.request
            base_urls = {
                "minimax": "https://api.minimax.io/v1",
                "groq": "https://api.groq.com/openai/v1",
                "openai": "https://api.openai.com/v1",
            }
            models = {
                "minimax": "MiniMax-M2.5",
                "groq": "llama-3.3-70b-versatile",
                "openai": "gpt-4o-mini",
            }
            url = f"{base_urls[provider]}/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            payload = {
                "model": models[provider],
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 3500,
                "temperature": 0.3,
            }
            data = _json.dumps(payload).encode("utf-8")
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
                result = _json.loads(resp.read().decode("utf-8"))
                response_text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        elif provider == "anthropic":
            import ssl
            import urllib.request
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            }
            payload = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 3500,
                "messages": [{"role": "user", "content": prompt}],
            }
            data = _json.dumps(payload).encode("utf-8")
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
                result = _json.loads(resp.read().decode("utf-8"))
                response_text = result.get("content", [{}])[0].get("text", "")
        else:
            logger.warning("Clustering: unsupported provider %s", provider)
            return
    except Exception as e:
        logger.warning("Clustering AI call failed: %s", e)
        return

    # Strip MiniMax tags if present
    if provider == "minimax" and response_text:
        response_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL).strip()
        response_text = re.sub(r'<minimax:tool_call>.*?</minimax:tool_call>', '', response_text, flags=re.DOTALL).strip()
        response_text = re.sub(r'<minimax:tool_call>.*', '', response_text, flags=re.DOTALL).strip()

    # Parse clusters — robust 3-layer JSON extraction
    clusters = None

    # Layer 1: Direct parse
    try:
        parsed = _json.loads(response_text)
        if isinstance(parsed, list):
            clusters = parsed
    except Exception:
        pass

    # Layer 2: Balanced bracket extraction (greedy → non-greedy fallback)
    if not clusters:
        for pattern in [r'\[.*\]', r'\[.*?\]']:
            try:
                match = re.search(pattern, response_text, re.DOTALL)
                if match:
                    clusters = _json.loads(match.group())
                    if isinstance(clusters, list):
                        break
                    clusters = None
            except Exception:
                clusters = None

    # Layer 3: JSON repair (trailing commas, control chars, etc.)
    if not clusters:
        try:
            match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if match:
                cleaned = match.group()
                cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)  # trailing commas
                cleaned = re.sub(r'[\x00-\x1f\x7f]', ' ', cleaned)  # control chars
                cleaned = cleaned.replace('\n', ' ').replace('\r', '')
                clusters = _json.loads(cleaned)
                if not isinstance(clusters, list):
                    clusters = None
        except Exception:
            clusters = None

    if not clusters:
        logger.warning("Clustering: could not parse JSON from AI response (len=%d)", len(response_text))
        return

    # Validate: filter out non-dict items (AI sometimes returns [1,2,3] instead of [{...}])
    valid_clusters = [c for c in clusters if isinstance(c, dict)]
    if not valid_clusters:
        logger.warning("Clustering: parsed JSON but no valid dict items (sample: %s)", str(clusters[:3])[:200])
        return
    clusters = valid_clusters

    # Build clustered suggestions
    suggestions = []
    for cluster in clusters:
        indices = cluster.get("tweet_indices", [])
        if not indices:
            continue

        # Gather tweets for this cluster
        cluster_tweets = []
        source_keywords = set()
        for idx in indices:
            if 0 <= idx < len(tweet_meta):
                meta = tweet_meta[idx]
                tweet_id = meta.get("tweet_id", "")
                tweet_url = meta.get("tweet_url", "") or (f"https://x.com/{meta['account']}/status/{tweet_id}" if tweet_id else "")
                cluster_tweets.append({
                    "text": meta["text"],
                    "account": meta["account"],
                    "engagement": meta["engagement"],
                    "tweet_id": tweet_id,
                    "created_at": meta.get("created_at", ""),
                    "tweet_url": tweet_url,
                })
                source_keywords.add(meta["keyword"])

        if not cluster_tweets:
            continue

        # Calculate combined engagement
        total_engagement = sum(t.get("engagement", 0) for t in cluster_tweets)

        suggestions.append({
            "type": "trend",
            "topic": cluster.get("topic_title", ""),
            "topic_tr": cluster.get("topic_title_tr", ""),
            "description_tr": cluster.get("description_tr", ""),
            "reason": f"{len(cluster_tweets)} tweet, {len(set(t['account'] for t in cluster_tweets))} hesap",
            "tweets": cluster_tweets,
            "engagement_potential": min(10, max(1, cluster.get("engagement_potential", 5))),
            "suggested_style": cluster.get("suggested_style", "informative"),
            "suggested_hour": cluster.get("suggested_hour", "14:07"),
            "reasoning": cluster.get("reasoning", ""),
            "source_keywords": list(source_keywords),
            "total_engagement": total_engagement,
        })

    # Save clustered results
    save_clustered_suggestions({
        "suggestions": suggestions,
        "clustered_at": now.isoformat(),
        "total": len(suggestions),
        "tweet_count": len(all_tweets),
        "source_hash": str(hash(tweets_text[:500])),  # For cache invalidation
    })

    logger.info(
        "Clustering: %d clusters created from %d tweets, %d news added",
        len([s for s in suggestions if s["type"] == "trend"]),
        len(all_tweets),
        len([s for s in suggestions if s["type"] == "news"]),
    )

    # Günlük snapshot arşivle
    try:
        from backend.modules.style_manager import (
            save_daily_snapshot,
            load_discovery_cache,
            load_trend_cache as _load_tc,
        )
        today_str = now.strftime("%Y-%m-%d")
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        # Bugünün tweet'lerini filtrele
        all_disc = load_discovery_cache()
        today_tweets = [t for t in all_disc if (t.get("created_at") or t.get("scanned_at", "")) >= today_start]
        current_trends = _load_tc()
        save_daily_snapshot(today_str, suggestions, current_trends.get("trends", []) if isinstance(current_trends, dict) else current_trends, today_tweets)
        logger.info("Daily snapshot saved for %s (%d suggestions, %d tweets)", today_str, len(suggestions), len(today_tweets))
    except Exception:
        logger.exception("Daily snapshot save error")

    # Telegram bildirim — AI kümeleri oluştu
    if suggestions:
        _notify_clustered_suggestions(suggestions)


def _notify_clustered_suggestions(suggestions: list[dict]):
    """Telegram bildirim — AI önerileri (kümelenmiş konular)."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message

        lines = ["🤖 AI Önerileri — Yeni Konular:\n"]

        for s in suggestions[:5]:
            topic_tr = s.get("topic_tr") or s.get("topic", "?")
            description = s.get("description_tr", "")
            potential = s.get("engagement_potential", 0)
            tweet_count = len(s.get("tweets", []))
            accounts = set(t.get("account", "") for t in s.get("tweets", []))
            style = s.get("suggested_style", "")
            hour = s.get("suggested_hour", "")

            # Engagement potential emoji
            if potential >= 8:
                pot_emoji = "🔥"
            elif potential >= 5:
                pot_emoji = "📈"
            else:
                pot_emoji = "📊"

            lines.append(
                f"{pot_emoji} <b>{topic_tr}</b> ({potential}/10)"
            )
            if description:
                lines.append(f"   {description}")
            lines.append(
                f"   └ {tweet_count} tweet, {len(accounts)} hesap"
                + (f" • Stil: {style}" if style else "")
                + (f" • Saat: {hour}" if hour else "")
            )
            lines.append("")

        lines.append("🔗 /kesif sayfasından AI Önerileri tabına bak!")

        msg = "\n".join(lines)
        # Telegram max 4096 chars
        if len(msg) > 4000:
            msg = msg[:3990] + "\n..."
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass


def _notify_breaking(trends: list[dict]):
    """Telegram bildirim — BREAKING: son 2 saatte 3+ hesaptan aynı konu."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        lines = ["🚨 BREAKING — Son 2 saatte patlayan konular:\n"]
        for t in trends[:3]:
            kw = t["keyword"]
            count = t["account_count"]
            eng = t["total_engagement"]
            lines.append(f"🔥 \"{kw}\" — {count} hesapta, {eng:.0f} engagement")
            # Show top tweet
            if t.get("top_tweets"):
                top = t["top_tweets"][0]
                lines.append(f"  └ @{top.get('account', '?')}: {top.get('text', '')[:80]}...")
        msg = "\n".join(lines)
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass


def _notify_trends(trends: list[dict]):
    """Telegram bildirim — güçlü trendler."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        lines = ["📈 Trend Tespiti — Sıcak Konular:\n"]
        for t in trends[:5]:
            kw = t["keyword"]
            count = t["account_count"]
            eng = t["total_engagement"]
            lines.append(f"• \"{kw}\" — {count} hesapta, toplam {eng:.0f} engagement")
        msg = "\n".join(lines)
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass
