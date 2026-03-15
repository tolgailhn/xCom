"""
Faz 3: Otomatik Konu Taraması
Her 2 saatte çalışır, DISCOVER_QUERIES + dinamik sorgulardan rastgele 3-4 sorgu seçip tarar.
Sonuçları auto_scan_cache.json'a kaydeder.

Faz 11: Dinamik Sorgu Üretimi
Haftada 1 kez çalışır, mevcut trendlerden AI ile yeni arama sorguları üretir.
data/dynamic_queries.json'a kaydeder.
"""
import datetime
import json
import logging
import os
import random
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

DYNAMIC_QUERIES_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "dynamic_queries.json"
)


def run_auto_scan():
    """Otomatik konu taraması — scheduler tarafından çağrılır."""
    now = datetime.datetime.now(TZ_TR)

    # Work hours check (08:00 - 23:00)
    if now.hour < 8 or now.hour >= 23:
        return

    try:
        from backend.modules.twikit_client import get_twikit_client
        from backend.api.scanner import DISCOVER_QUERIES, GITHUB_QUERIES
        from backend.modules.style_manager import (
            load_auto_scan_cache,
            save_auto_scan_cache,
        )
        from backend.modules.twitter_scanner import TwitterScanner
    except ImportError as e:
        logger.warning("Auto-scan import error: %s", e)
        return

    # Pick 3-4 random queries (mix of discover + github + dynamic)
    all_queries = list(DISCOVER_QUERIES) + list(GITHUB_QUERIES)

    # Load dynamic queries if available
    dynamic = _load_dynamic_queries()
    if dynamic:
        all_queries.extend(dynamic)

    query_count = random.randint(3, 4)
    selected_queries = random.sample(all_queries, min(query_count, len(all_queries)))

    # Load existing cache to check duplicates
    cache = load_auto_scan_cache()
    existing_ids = {t.get("tweet_id", "") for t in cache}

    scanner = TwitterScanner()
    new_topics = []
    start_time = now - datetime.timedelta(hours=6)  # Last 6 hours

    for query in selected_queries:
        try:
            results = scanner._search_tweets(query, start_time, max_results=15)
            if not results:
                continue

            query_tweets: list[dict] = []  # Bu sorgunun tweet'leri (inline çeviri için)

            for topic in results:
                tid = getattr(topic, "id", "") or getattr(topic, "tweet_id", "") or ""
                if tid in existing_ids:
                    continue
                existing_ids.add(tid)

                # Convert AITopic created_at to ISO string
                raw_created = getattr(topic, "created_at", None)
                created_at_str = ""
                if raw_created:
                    try:
                        created_at_str = raw_created.isoformat() if hasattr(raw_created, "isoformat") else str(raw_created)
                    except Exception:
                        pass

                author_username = getattr(topic, "author_username", "") or getattr(topic, "author", "") or ""

                # Convert AITopic to dict
                topic_dict = {
                    "tweet_id": tid,
                    "text": getattr(topic, "text", ""),
                    "author": author_username,
                    "account": author_username,
                    "author_followers": getattr(topic, "author_followers_count", 0) or getattr(topic, "author_followers", 0),
                    "like_count": getattr(topic, "like_count", 0),
                    "retweet_count": getattr(topic, "retweet_count", 0),
                    "reply_count": getattr(topic, "reply_count", 0),
                    "bookmark_count": getattr(topic, "bookmark_count", 0),
                    "engagement_score": getattr(topic, "engagement_score", 0),
                    "category": getattr(topic, "category", ""),
                    "source_query": query[:60],
                    "scanned_at": now.isoformat(),
                    "created_at": created_at_str,
                    "source": "auto_scan",
                    "summary_tr": "",
                }

                # Min engagement filter
                if topic_dict["engagement_score"] >= 50 or topic_dict["like_count"] >= 10:
                    query_tweets.append(topic_dict)

            # Bu sorgunun tweet'lerini ANINDA çevir (küçük batch — kümeleme yaklaşımı)
            if query_tweets:
                try:
                    from backend.discovery_worker import _translate_batch, _make_preview
                    summaries = _translate_batch(query_tweets)
                    translated = 0
                    for t in query_tweets:
                        tid = t["tweet_id"]
                        if tid in summaries and summaries[tid]:
                            t["summary_tr"] = summaries[tid]
                            translated += 1
                        else:
                            t["summary_tr"] = _make_preview(t["text"])
                    if translated:
                        logger.info("Auto-scan: '%s' — %d/%d tweet Turkce cevirildi",
                                    query[:30], translated, len(query_tweets))
                except Exception as e:
                    logger.warning("Auto-scan ceviri hatasi (%s): %s", query[:30], e)
                    from backend.discovery_worker import _make_preview
                    for t in query_tweets:
                        if not t["summary_tr"]:
                            t["summary_tr"] = _make_preview(t["text"])
                new_topics.extend(query_tweets)

        except Exception as e:
            logger.warning("Auto-scan query error (%s): %s", query[:40], e)
            continue

    if new_topics:
        # Mevcut cache'deki eksik/preview-only özetleri yeniden dene (küçük batch)
        try:
            from backend.discovery_worker import _translate_batch, _make_preview
            needs_retry = [t for t in cache
                           if not t.get("summary_tr")
                           or t["summary_tr"] == _make_preview(t.get("text", ""))
                           or t["summary_tr"] == t.get("text", "")[:200]]
            if needs_retry:
                logger.info("Auto-scan: %d eski tweet icin Turkce ozet yeniden deneniyor", len(needs_retry))
                retry_summaries = _translate_batch(needs_retry[:5])
                if retry_summaries:
                    for t in cache:
                        tid = t.get("tweet_id", "")
                        if tid in retry_summaries:
                            t["summary_tr"] = retry_summaries[tid]
                    logger.info("Auto-scan: %d eski tweet icin Turkce ozet guncellendi", len(retry_summaries))
        except Exception as e:
            logger.warning("Auto-scan retry Turkish summary error: %s", e)

        cache.extend(new_topics)
        save_auto_scan_cache(cache)
        logger.info("Auto-scan: %d new topics found and cached", len(new_topics))

        # Send telegram notification if significant topics found
        high_engagement = [t for t in new_topics if t.get("engagement_score", 0) >= 200]
        if high_engagement:
            _notify_auto_scan(high_engagement)
    else:
        logger.info("Auto-scan: no new topics this round")


def _notify_auto_scan(topics: list[dict]):
    """Telegram bildirim gönder — önemli otomatik tarama sonuçları."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        lines = ["🔍 Otomatik Tarama — Önemli Gelişmeler:\n"]
        for t in topics[:5]:
            author = t.get("author", "?")
            text = t.get("text", "")[:100]
            score = t.get("engagement_score", 0)
            lines.append(f"• @{author} (skor: {score:.0f})\n{text}...")
        msg = "\n\n".join(lines)
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass


# ============================================================================
# DYNAMIC QUERY GENERATION — AI-powered adaptive search queries
# ============================================================================

def _load_dynamic_queries() -> list[str]:
    """Load dynamic queries from JSON file."""
    try:
        if os.path.exists(DYNAMIC_QUERIES_PATH):
            with open(DYNAMIC_QUERIES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("queries", [])
    except Exception:
        pass
    return []


def _save_dynamic_queries(queries: list[str]):
    """Save dynamic queries to JSON file."""
    os.makedirs(os.path.dirname(DYNAMIC_QUERIES_PATH), exist_ok=True)
    data = {
        "queries": queries,
        "generated_at": datetime.datetime.now(TZ_TR).isoformat(),
        "count": len(queries),
    }
    with open(DYNAMIC_QUERIES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def generate_dynamic_queries():
    """AI ile mevcut trendlerden yeni arama sorguları üret.

    Haftada 1 kez scheduler tarafından çağrılır.
    Mevcut trend cache'ini okur, AI'dan yeni sorgular ister,
    sonuçları data/dynamic_queries.json'a kaydeder.
    """
    try:
        from backend.modules.style_manager import load_trend_cache
        from backend.modules.content_generator import ContentGenerator
        from backend.config import get_settings
    except ImportError as e:
        logger.warning("Dynamic query generation import error: %s", e)
        return

    settings = get_settings()

    # Collect current trends
    trends = load_trend_cache()
    if not trends:
        logger.info("Dynamic queries: no trend data available, skipping")
        return

    # Extract top keywords from trends
    top_keywords = []
    for trend in trends[:20]:
        kw = trend.get("keyword", "")
        if kw:
            top_keywords.append(kw)
        # Also get trending topics from tweets
        for tweet in trend.get("tweets", [])[:2]:
            text = tweet.get("text", "")[:100]
            if text:
                top_keywords.append(text)

    if not top_keywords:
        logger.info("Dynamic queries: no keywords found in trends")
        return

    # Build AI prompt
    keywords_text = "\n".join([f"- {kw}" for kw in top_keywords[:15]])

    prompt = f"""Aşağıdaki son trendlere ve konulara bakarak, X (Twitter)'da AI ve teknoloji gelişmelerini takip etmek için 5-8 yeni arama sorgusu üret.

Mevcut trendler:
{keywords_text}

KURALLAR:
1. Her sorgu X arama formatında olmalı (OR, AND, -is:retweet lang:en)
2. Mevcut statik sorgularda OLMAYAN yeni konuları hedefle
3. Son 1 haftanın en güncel AI/teknoloji gelişmelerini yakalayacak sorgular yaz
4. Her sorgu spesifik olmalı — çok genel sorgular YAZMA
5. Hem İngilizce hem Türkçe sorgu olabilir

MEVCUT SORGULAR (bunları TEKRARLAMA):
- "new AI model" OR "new LLM"
- ChatGPT OR GPT-4 OR Claude
- DeepSeek OR Qwen OR Llama
- Cursor OR Windsurf OR Copilot
- "AI agent" OR agentic
- benchmark OR MMLU
- OpenAI OR Anthropic OR Google

Sadece sorgu listesini ver, her satırda bir sorgu. Başka açıklama yazma.
JSON formatında döndür: {{"queries": ["sorgu1", "sorgu2", ...]}}"""

    try:
        # Use the cheapest available provider
        gen = ContentGenerator(
            provider=settings.default_ai_provider or "minimax",
            api_key=settings.minimax_api_key or settings.anthropic_api_key or settings.openai_api_key,
        )

        result = gen._dispatch(
            "Sen bir X (Twitter) arama sorgusu uzmanısın. Sadece JSON formatında cevap ver.",
            prompt,
        )

        if not result:
            logger.warning("Dynamic queries: empty AI response")
            return

        # Parse JSON response
        import re
        json_match = re.search(r'\{[\s\S]*"queries"[\s\S]*\}', result)
        if json_match:
            parsed = json.loads(json_match.group())
            queries = parsed.get("queries", [])
        else:
            # Try line-by-line parsing
            queries = [
                line.strip().strip('"').strip("'")
                for line in result.strip().split("\n")
                if line.strip() and not line.strip().startswith("{") and not line.strip().startswith("}")
            ]

        # Validate queries
        valid_queries = []
        for q in queries:
            q = q.strip()
            if len(q) > 20 and ("OR" in q or "AND" in q or '"' in q):
                # Ensure -is:retweet lang:en suffix
                if "-is:retweet" not in q:
                    q += " -is:retweet lang:en"
                valid_queries.append(q)

        if valid_queries:
            _save_dynamic_queries(valid_queries)
            logger.info("Dynamic queries: generated %d new queries", len(valid_queries))
        else:
            logger.warning("Dynamic queries: no valid queries generated from AI response")

    except Exception as e:
        logger.warning("Dynamic queries generation error: %s", e)
