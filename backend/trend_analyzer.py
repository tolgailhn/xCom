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


def analyze_trends():
    """Trend analizi — scheduler tarafından çağrılır."""
    now = datetime.datetime.now(TZ_TR)

    # Work hours check
    if now.hour < 8 or now.hour >= 23:
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

    # Collect all recent tweets (last 12 hours)
    cutoff = (now - datetime.timedelta(hours=12)).isoformat()

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
            keyword_tweets[kw].append({
                "tweet_id": tweet.get("tweet_id", ""),
                "text": (tweet.get("text", "") or "")[:150],
                "account": account,
                "engagement": engagement,
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

            trends.append({
                "keyword": kw,
                "account_count": account_count,
                "accounts": list(accounts)[:10],
                "total_engagement": total_engagement,
                "trend_score": trend_score,
                "tweet_count": len(keyword_tweets[kw]),
                "top_tweets": top_tweets,
                "is_strong_trend": account_count >= 3,
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

    # Notify about strong trends + auto-suggest content (Faz 8)
    if strong_trends:
        _notify_trends(strong_trends)
        try:
            from backend.auto_content_suggester import suggest_content_from_trends
            suggest_content_from_trends()
        except Exception:
            logger.exception("Auto content suggestion error")


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
