"""
Faz 7: Haber Kaynağı Taraması
Her 4 saatte çalışır. DuckDuckGo news aramasıyla AI haber kaynaklarını tarar.
Sonuçları news_cache.json'a kaydeder.
"""
import datetime
import logging
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# AI news search queries
NEWS_QUERIES = [
    "AI model release 2026",
    "artificial intelligence breakthrough",
    "OpenAI announcement",
    "Anthropic Claude update",
    "Google DeepMind new",
    "Meta AI open source",
    "NVIDIA AI chip",
    "AI agent framework",
    "LLM benchmark results",
    "AI startup funding",
]


def scan_news():
    """Haber kaynağı taraması — scheduler tarafından çağrılır."""
    now = datetime.datetime.now(TZ_TR)

    # Work hours check
    if now.hour < 8 or now.hour >= 23:
        return

    try:
        from duckduckgo_search import DDGS
        from backend.modules.style_manager import load_news_cache, save_news_cache
    except ImportError as e:
        logger.warning("News scanner import error: %s", e)
        return

    cache = load_news_cache()
    existing_urls = {n.get("url", "") for n in cache}

    new_articles = []
    # Pick 3-4 random queries per run
    import random
    selected = random.sample(NEWS_QUERIES, min(4, len(NEWS_QUERIES)))

    for query in selected:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.news(query, max_results=5, timelimit="d"))

            for r in results:
                url = r.get("url", "")
                if url in existing_urls:
                    continue
                existing_urls.add(url)

                article = {
                    "title": r.get("title", ""),
                    "url": url,
                    "source": r.get("source", ""),
                    "body": (r.get("body", "") or "")[:300],
                    "date": r.get("date", ""),
                    "query": query,
                    "found_at": now.isoformat(),
                    "type": "news",
                }
                new_articles.append(article)

            time.sleep(0.5)  # Rate limit protection

        except Exception as e:
            logger.warning("News query error (%s): %s", query, e)
            continue

    if new_articles:
        cache.extend(new_articles)
        save_news_cache(cache)
        logger.info("News scanner: %d new articles found", len(new_articles))

        # Notify about significant news
        if len(new_articles) >= 3:
            _notify_news(new_articles)
    else:
        logger.info("News scanner: no new articles this round")


def _notify_news(articles: list[dict]):
    """Telegram bildirim — yeni haber makaleleri."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        lines = ["📰 Yeni AI Haberleri:\n"]
        for a in articles[:5]:
            title = a.get("title", "?")
            source = a.get("source", "?")
            lines.append(f"• {title}\n  ({source})")
        msg = "\n\n".join(lines)
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass
