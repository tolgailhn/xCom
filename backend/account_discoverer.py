"""
Faz 9: Dinamik Hesap Keşfi
Her 6 saatte çalışır. Auto-scan ve discovery sonuçlarından yüksek engagement'lı
ama izleme listesinde olmayan hesapları otomatik tespit eder.
"""
import datetime
import logging
from collections import Counter
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Minimum criteria for suggesting an account
MIN_APPEARANCES = 2       # Must appear in at least 2 scans
MIN_AVG_ENGAGEMENT = 100  # Average engagement score
MIN_FOLLOWERS = 5000      # Minimum follower count


def discover_accounts():
    """Yeni hesap keşfi — scheduler tarafından çağrılır."""
    now = datetime.datetime.now(TZ_TR)

    # Work hours check
    if now.hour < 8 or now.hour >= 23:
        return

    try:
        from backend.modules.style_manager import (
            load_discovery_cache,
            load_auto_scan_cache,
            load_discovery_config,
            load_suggested_accounts,
            save_suggested_accounts,
        )
    except ImportError as e:
        logger.warning("Account discoverer import error: %s", e)
        return

    # Get already-monitored accounts
    config = load_discovery_config()
    monitored = set()
    for acc in config.get("priority_accounts", []):
        monitored.add(acc.lower())
    for acc in config.get("normal_accounts", []):
        monitored.add(acc.lower())

    # Also exclude already-suggested accounts that user dismissed
    existing_suggestions = load_suggested_accounts()
    dismissed = {
        a.get("username", "").lower()
        for a in existing_suggestions
        if a.get("dismissed")
    }

    # Collect all authors from recent scans (last 48h)
    cutoff = (now - datetime.timedelta(hours=48)).isoformat()

    discovery_tweets = load_discovery_cache()
    auto_scan_tweets = load_auto_scan_cache()

    # Count appearances and engagement per author
    author_appearances = Counter()
    author_engagement = Counter()
    author_followers = {}
    author_sample_tweets = {}

    for tweets in [discovery_tweets, auto_scan_tweets]:
        for t in tweets:
            if t.get("scanned_at", "") < cutoff and t.get("created_at", "") < cutoff:
                continue

            author = (t.get("account", "") or t.get("author", "") or "").lower()
            if not author or author in monitored or author in dismissed:
                continue

            engagement = t.get("engagement_score", 0) or t.get("like_count", 0)
            followers = t.get("author_followers", 0)

            author_appearances[author] += 1
            author_engagement[author] += engagement
            if followers > author_followers.get(author, 0):
                author_followers[author] = followers

            # Keep a sample tweet for preview
            text = (t.get("text", "") or "")[:150]
            if text and author not in author_sample_tweets:
                author_sample_tweets[author] = text

    # Filter candidates
    candidates = []
    for author, count in author_appearances.items():
        if count < MIN_APPEARANCES:
            continue

        avg_engagement = author_engagement[author] / count
        followers = author_followers.get(author, 0)

        if avg_engagement < MIN_AVG_ENGAGEMENT:
            continue

        # Score: appearances * 50 + avg_engagement + followers/1000
        score = count * 50 + avg_engagement + (followers / 1000)

        candidates.append({
            "username": author,
            "appearances": count,
            "avg_engagement": round(avg_engagement, 1),
            "total_engagement": author_engagement[author],
            "followers": followers,
            "score": round(score, 1),
            "sample_tweet": author_sample_tweets.get(author, ""),
            "discovered_at": now.isoformat(),
            "dismissed": False,
        })

    if not candidates:
        logger.info("Account discoverer: no new accounts to suggest")
        return

    # Merge with existing suggestions (update scores, don't duplicate)
    existing_map = {a.get("username", "").lower(): a for a in existing_suggestions}
    for c in candidates:
        uname = c["username"].lower()
        if uname in existing_map:
            # Update score if higher
            existing = existing_map[uname]
            if c["score"] > existing.get("score", 0):
                existing.update({
                    "score": c["score"],
                    "appearances": c["appearances"],
                    "avg_engagement": c["avg_engagement"],
                    "total_engagement": c["total_engagement"],
                    "followers": c["followers"],
                    "sample_tweet": c["sample_tweet"],
                    "discovered_at": c["discovered_at"],
                })
        else:
            existing_suggestions.append(c)

    save_suggested_accounts(existing_suggestions)
    new_count = len([c for c in candidates if c["username"].lower() not in existing_map])
    logger.info("Account discoverer: %d new accounts suggested, %d total", new_count, len(existing_suggestions))

    # Notify about new high-score accounts
    high_score = [c for c in candidates if c["score"] >= 300 and c["username"].lower() not in existing_map]
    if high_score:
        _notify_new_accounts(high_score)


def _notify_new_accounts(accounts: list[dict]):
    """Telegram bildirim — yeni keşfedilen hesaplar."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        lines = ["👤 Yeni Hesap Önerileri:\n"]
        for a in accounts[:5]:
            username = a["username"]
            score = a["score"]
            appearances = a["appearances"]
            lines.append(f"• @{username} (skor: {score:.0f}, {appearances}x görüldü)")
        lines.append("\n/kesif sayfasından izleme listesine ekleyebilirsin!")
        msg = "\n".join(lines)
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass
