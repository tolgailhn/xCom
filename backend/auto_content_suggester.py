"""
Faz 8: Otomatik İçerik Önerisi
Trend tespiti sonuçlarından otomatik draft oluşturur.
Trend analyzer tarafından tetiklenir (trend_analyzer.py'den çağrılır).
Oluşturulan draft'lar /taslaklarim sayfasında görünür.
"""
import datetime
import logging
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")


def suggest_content_from_trends():
    """Güçlü trendlerden otomatik tweet taslağı oluştur.

    Bu fonksiyon trend_analyzer tarafından güçlü trend tespit edildiğinde çağrılır.
    """
    now = datetime.datetime.now(TZ_TR)

    try:
        from backend.modules.style_manager import (
            load_trend_cache,
            load_draft_tweets,
            add_draft,
        )
    except ImportError as e:
        logger.warning("Content suggester import error: %s", e)
        return

    trend_cache = load_trend_cache()
    trends = trend_cache.get("trends", [])
    if not trends:
        return

    # Only process strong trends (3+ accounts)
    strong_trends = [t for t in trends if t.get("is_strong_trend")]
    if not strong_trends:
        return

    # Check existing drafts to avoid duplicates
    existing_drafts = load_draft_tweets()
    existing_topics = {d.get("topic", "").lower() for d in existing_drafts}

    new_suggestions = 0
    for trend in strong_trends[:3]:  # Max 3 suggestions per run
        keyword = trend.get("keyword", "")
        if keyword.lower() in existing_topics:
            continue

        # Build a rich topic description from trend data
        account_count = trend.get("account_count", 0)
        top_tweets = trend.get("top_tweets", [])

        # Create topic context from top tweets
        context_lines = []
        for tw in top_tweets[:3]:
            text = tw.get("text", "")
            account = tw.get("account", "")
            if text:
                context_lines.append(f"@{account}: {text}")

        topic_context = "\n".join(context_lines) if context_lines else keyword

        # Add as auto-draft with metadata
        add_draft(
            text=f"[OTOMATİK ÖNERİ] {keyword} hakkında tweet yaz\n\n"
                 f"📈 {account_count} hesap bu konuyu paylaşıyor\n\n"
                 f"Referans tweet'ler:\n{topic_context}",
            topic=keyword,
            style="auto_suggestion",
        )
        new_suggestions += 1
        logger.info("Content suggestion created for trend: %s (%d accounts)", keyword, account_count)

    if new_suggestions:
        # Telegram notification
        _notify_suggestions(strong_trends[:new_suggestions])


def _notify_suggestions(trends: list[dict]):
    """Telegram bildirim — otomatik içerik önerileri."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        lines = ["💡 Otomatik İçerik Önerileri:\n"]
        for t in trends[:3]:
            kw = t["keyword"]
            count = t["account_count"]
            lines.append(f"• \"{kw}\" — {count} hesapta trend")
        lines.append("\n/taslaklarim sayfasından kontrol et!")
        msg = "\n".join(lines)
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass
