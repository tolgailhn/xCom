"""
Faz 3: Otomatik Konu Taraması
Her 2 saatte çalışır, DISCOVER_QUERIES'den rastgele 3-4 sorgu seçip tarar.
Sonuçları auto_scan_cache.json'a kaydeder.
"""
import datetime
import logging
import random
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")


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

    # Pick 3-4 random queries (mix of discover + github)
    all_queries = list(DISCOVER_QUERIES) + list(GITHUB_QUERIES)
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
                }

                # Min engagement filter
                if topic_dict["engagement_score"] >= 50 or topic_dict["like_count"] >= 10:
                    new_topics.append(topic_dict)

        except Exception as e:
            logger.warning("Auto-scan query error (%s): %s", query[:40], e)
            continue

    if new_topics:
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
