"""
Auto Reply Worker — Takip edilen hesaplarin yeni tweetlerini kontrol edip
AI ile yanit uretip otomatik paylas.

ROTASYON SİSTEMİ:
- 38 hesap 24 saate dağıtılır (saat başı 1-2 hesap)
- Her saat sadece o saate ait hesaplar kontrol edilir
- Twikit rate limit'e takılmayı önler
- scheduler_worker.py tarafindan her 5 dakikada bir cagirilir
  ama sadece saatin ilk çağrısında çalışır (aynı saat tekrar çalışmaz)
"""
import datetime
import hashlib
import logging
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Track which hour we last processed to avoid duplicate runs within same hour
_last_processed_hour: str | None = None


def _get_accounts_for_hour(accounts: list[str], hour: int) -> list[str]:
    """
    38 hesabı 24 saate dağıt.
    38 / 24 = 1.58 → bazı saatlerde 1, bazılarında 2 hesap.

    Dağılım deterministik: hesap listesi değişmedikçe aynı saat aynı hesapları alır.
    """
    if not accounts:
        return []

    n = len(accounts)
    selected = []
    for i, account in enumerate(accounts):
        # Her hesabı bir saate ata: index'e göre round-robin
        assigned_hour = i % 24
        if assigned_hour == hour:
            selected.append(account)

    return selected


def check_and_reply():
    """
    Ana worker fonksiyonu — scheduler tarafindan her 5 dakikada bir cagirilir.

    ROTASYON: Her saat sadece 1-2 hesap kontrol edilir (38 hesap / 24 saat).
    Aynı saat içinde tekrar çağrılırsa çalışmaz (duplicate koruması).
    """
    global _last_processed_hour

    from backend.modules.style_manager import (
        load_auto_reply_config,
        load_auto_reply_logs,
        load_auto_reply_seen,
        save_auto_reply_seen,
        add_auto_reply_log,
    )

    config = load_auto_reply_config()

    if not config.get("enabled"):
        return

    accounts = config.get("accounts", [])
    if not accounts:
        return

    now = datetime.datetime.now(TZ_TR)
    current_hour_key = now.strftime("%Y-%m-%d-%H")

    # Aynı saat içinde tekrar çalışma
    if _last_processed_hour == current_hour_key:
        return
    _last_processed_hour = current_hour_key

    # Bu saate ait hesapları al
    hour = now.hour
    hourly_accounts = _get_accounts_for_hour(accounts, hour)

    if not hourly_accounts:
        logger.info(
            "Auto-reply: Saat %02d — bu saatte kontrol edilecek hesap yok", hour
        )
        return

    logger.info(
        "Auto-reply: Saat %02d — %d hesap kontrol ediliyor: %s",
        hour,
        len(hourly_accounts),
        ", ".join(f"@{a}" for a in hourly_accounts),
    )

    # Rate limit: max replies per hour
    max_per_hour = config.get("max_replies_per_hour", 5)
    logs = load_auto_reply_logs()
    one_hour_ago = now - datetime.timedelta(hours=1)

    recent_replies = 0
    for log in logs:
        try:
            log_time = datetime.datetime.fromisoformat(log.get("created_at", ""))
            if log_time.tzinfo is None:
                log_time = log_time.replace(tzinfo=TZ_TR)
            if log_time >= one_hour_ago and log.get("status") == "published":
                recent_replies += 1
        except (ValueError, TypeError):
            continue

    if recent_replies >= max_per_hour:
        logger.info("Auto-reply rate limit: %d/%d replies in last hour", recent_replies, max_per_hour)
        return

    # Load seen tweet IDs
    seen = load_auto_reply_seen()

    # Get twikit client for fetching tweets
    twikit = _get_twikit_client()
    if not twikit:
        logger.warning("Auto-reply: Twikit client not available")
        return

    reply_delay = config.get("reply_delay_seconds", 60)
    style = config.get("style", "reply")
    additional_context = config.get("additional_context", "")
    min_likes = config.get("min_likes_to_reply", 0)
    only_original = config.get("only_original_tweets", True)
    language = config.get("language", "tr")

    replies_made = 0
    remaining = max_per_hour - recent_replies

    for account in hourly_accounts:
        if replies_made >= remaining:
            break

        account = account.strip().lstrip("@")
        if not account:
            continue

        try:
            tweets = twikit.get_user_tweets(account, count=5)
        except Exception as e:
            logger.warning("Auto-reply: Failed to fetch tweets for @%s: %s", account, e)
            continue

        for tweet in tweets:
            if replies_made >= remaining:
                break

            tweet_id = tweet.get("id", "")
            if not tweet_id or tweet_id in seen:
                continue

            # Skip replies if only_original is set
            tweet_text = tweet.get("text", "")
            if only_original and tweet_text.startswith("@"):
                seen.add(tweet_id)
                continue

            # Skip if not enough likes
            if min_likes > 0 and tweet.get("like_count", 0) < min_likes:
                seen.add(tweet_id)
                continue

            # Mark as seen immediately to avoid duplicate processing
            seen.add(tweet_id)

            # Optional delay between replies
            if reply_delay > 0 and replies_made > 0:
                time.sleep(min(reply_delay, 120))  # Cap at 2 minutes

            # Generate reply
            try:
                reply_text = _generate_reply(
                    original_tweet=tweet_text,
                    original_author=account,
                    style=style,
                    additional_context=additional_context,
                    language=language,
                )
            except Exception as e:
                logger.warning("Auto-reply: Failed to generate reply for @%s tweet %s: %s", account, tweet_id, e)
                add_auto_reply_log({
                    "account": account,
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_text": "",
                    "status": "generation_failed",
                    "error": str(e),
                })
                continue

            if not reply_text:
                continue

            # Publish reply
            try:
                result = _publish_reply(reply_text, tweet_id)
            except Exception as e:
                logger.warning("Auto-reply: Failed to publish reply for @%s tweet %s: %s", account, tweet_id, e)
                add_auto_reply_log({
                    "account": account,
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_text": reply_text,
                    "status": "publish_failed",
                    "error": str(e),
                })
                continue

            if result.get("success"):
                add_auto_reply_log({
                    "account": account,
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_text": reply_text,
                    "reply_tweet_id": result.get("tweet_id", ""),
                    "reply_url": result.get("url", ""),
                    "status": "published",
                })
                replies_made += 1
                logger.info("Auto-reply: Replied to @%s tweet %s — %s", account, tweet_id, result.get("url", ""))
            else:
                add_auto_reply_log({
                    "account": account,
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_text": reply_text,
                    "status": "publish_failed",
                    "error": result.get("error", "Unknown error"),
                })

    # Save seen IDs
    save_auto_reply_seen(seen)

    if replies_made > 0:
        logger.info("Auto-reply: Saat %02d — %d reply atildi", hour, replies_made)
    else:
        logger.info("Auto-reply: Saat %02d — yeni tweet bulunamadi", hour)


def _get_twikit_client():
    """Get authenticated twikit client."""
    try:
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
    except Exception as e:
        logger.warning("Auto-reply: Twikit auth failed: %s", e)
    return None


def _generate_reply(original_tweet: str, original_author: str,
                    style: str = "reply", additional_context: str = "",
                    language: str = "tr") -> str:
    """Generate a reply using AI."""
    from backend.api.helpers import create_generator

    # Add language context
    lang_context = ""
    if language == "tr":
        lang_context = "MUTLAKA Turkce yaz. Dogal, samimi bir dille yanit ver."
    elif language == "en":
        lang_context = "Write in English. Natural, conversational tone."

    full_context = f"{lang_context} {additional_context}".strip()

    generator = create_generator(topic=original_tweet)
    reply = generator.generate_reply(
        original_tweet=original_tweet,
        original_author=original_author,
        style=style,
        additional_context=full_context,
    )
    return reply.strip() if reply else ""


def _publish_reply(text: str, reply_to_tweet_id: str) -> dict:
    """Publish a reply tweet via Twitter API."""
    from backend.config import get_settings
    from backend.modules.tweet_publisher import TweetPublisher
    from backend.modules.style_manager import add_to_post_history, add_tweet_metric

    settings = get_settings()

    if not (settings.twitter_api_key and settings.twitter_api_secret
            and settings.twitter_access_token and settings.twitter_access_secret):
        return {"success": False, "error": "Twitter API credentials eksik"}

    publisher = TweetPublisher(
        api_key=settings.twitter_api_key,
        api_secret=settings.twitter_api_secret,
        access_token=settings.twitter_access_token,
        access_secret=settings.twitter_access_secret,
        bearer_token=settings.twitter_bearer_token,
    )

    result = publisher.post_reply(text, reply_to_tweet_id)

    if result.get("success"):
        add_to_post_history({
            "text": text,
            "url": result.get("url", ""),
            "type": "auto_reply",
            "reply_to_id": reply_to_tweet_id,
        })

        now_str = datetime.datetime.now(TZ_TR).isoformat()
        if result.get("tweet_id"):
            add_tweet_metric({
                "tweet_id": result["tweet_id"],
                "text": text[:200],
                "url": result.get("url", ""),
                "metrics": {},
                "last_checked": now_str,
                "first_tracked": now_str,
                "source": "auto_reply",
            })

    return result
