"""
Self-Reply Worker — Kendi tweetlerine otomatik self-reply atan sistem.

MANTIK:
- Her 15 dakikada bir kontrol eder
- Twikit ile kendi hesabinin son tweetlerini ceker
- Son 5 gun icindeki orijinal tweetlere 3'er self-reply uretir
- Gunde max 4 tweet'e self-reply atar (4 post = 4 self-reply seti)
- Her self-reply 15 dk arayla zamanlanir
- Zaten reply atilmis tweetlere tekrar atmaz

TRACKING:
- self_reply_seen.json: hangi tweet'e kac reply atildi
- self_reply_logs.json: tum uretim/paylasim loglari
"""
import datetime
import logging
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Son kontrol zamani (ayni 15dk periyodunda tekrar calismasin)
_last_check_key: str | None = None


def check_self_replies():
    """
    Ana worker fonksiyonu — scheduler tarafindan her 15 dakikada bir cagirilir.
    Son 5 gundeki kendi tweetlerini kontrol eder, uygun olanlara self-reply uretir.
    """
    global _last_check_key

    from backend.modules.style_manager import (
        load_self_reply_config,
        load_self_reply_seen,
        save_self_reply_seen,
        add_self_reply_log,
    )

    config = load_self_reply_config()

    if not config.get("enabled"):
        return

    username = config.get("username", "").strip().lstrip("@")
    if not username:
        logger.warning("Self-reply: username bos, atlaniyor")
        return

    now = datetime.datetime.now(TZ_TR)
    hour = now.hour

    # Calisma saatleri kontrolu
    work_start = config.get("work_hour_start", 9)
    work_end = config.get("work_hour_end", 23)
    if hour < work_start or hour >= work_end:
        return

    # 15 dk periyodunda tekrar calismasin
    check_key = now.strftime("%Y-%m-%d-%H") + f"-{now.minute // 15}"
    if _last_check_key == check_key:
        return
    _last_check_key = check_key

    logger.info("Self-reply: kontrol basliyor (@%s)", username)

    # Bugun kac tweet'e self-reply atildi?
    seen = load_self_reply_seen()
    today_str = now.strftime("%Y-%m-%d")
    max_daily = config.get("max_daily_tweets", 4)
    replies_per_tweet = config.get("replies_per_tweet", 3)
    reply_interval = config.get("reply_interval_minutes", 15)
    min_age_minutes = config.get("min_tweet_age_minutes", 30)
    max_age_days = config.get("max_tweet_age_days", 5)
    style = config.get("style", "samimi")
    draft_only = config.get("draft_only", False)

    # Bugun kac tweet'e reply attik?
    today_replied_count = 0
    for tid, info in seen.items():
        first_reply_date = info.get("first_reply_date", "")
        if first_reply_date == today_str:
            today_replied_count += 1

    if today_replied_count >= max_daily:
        logger.info(
            "Self-reply: gunluk limit doldu (%d/%d)", today_replied_count, max_daily
        )
        return

    remaining = max_daily - today_replied_count

    # Twikit ile kendi tweetlerini cek
    twikit = _get_twikit_client()
    if not twikit:
        logger.warning("Self-reply: Twikit client not available")
        return

    try:
        tweets = twikit.get_user_tweets(username, count=30)
    except Exception as e:
        logger.warning("Self-reply: tweet cekme hatasi: %s", e)
        return

    if not tweets:
        logger.info("Self-reply: tweet bulunamadi")
        return

    # Filtreleme
    cutoff_time = now - datetime.timedelta(days=max_age_days)
    min_age_cutoff = now - datetime.timedelta(minutes=min_age_minutes)

    # Bilinen reply ID'lerini topla — kendi reply'larimiza tekrar reply atmamak icin
    known_reply_ids = set()
    for tid, info in seen.items():
        for rid in info.get("reply_ids", []):
            if rid:
                known_reply_ids.add(str(rid))

    candidates = []
    for tweet in tweets:
        tweet_id = tweet.get("id", "")
        tweet_text = tweet.get("text", "")

        if not tweet_id or not tweet_text:
            continue

        # RT'leri atla
        if tweet_text.strip().startswith("RT @"):
            continue

        # Baskasina veya kendine reply olanlari atla (sadece orijinal tweetler)
        in_reply_to = tweet.get("in_reply_to_tweet_id")
        if in_reply_to:
            continue

        # Bu tweet zaten bizim attigimiz bir self-reply mi?
        if str(tweet_id) in known_reply_ids:
            continue

        # Tweet yasi kontrol
        created_at_raw = tweet.get("created_at", "")
        if created_at_raw:
            try:
                # datetime objesi veya ISO string olabilir
                if isinstance(created_at_raw, datetime.datetime):
                    tweet_time = created_at_raw
                else:
                    tweet_time = datetime.datetime.fromisoformat(str(created_at_raw))

                if tweet_time.tzinfo is None:
                    tweet_time = tweet_time.replace(tzinfo=TZ_TR)

                # Cok eski mi?
                if tweet_time < cutoff_time:
                    continue

                # Cok yeni mi? (min_age_minutes'den kisa suredir atilmis)
                if tweet_time > min_age_cutoff:
                    continue
            except (ValueError, TypeError):
                pass

        # Zaten max reply atilmis mi?
        seen_info = seen.get(tweet_id, {})
        if seen_info.get("replies_sent", 0) >= replies_per_tweet:
            continue

        candidates.append(tweet)

    if not candidates:
        logger.info("Self-reply: uygun tweet bulunamadi")
        return

    logger.info(
        "Self-reply: %d uygun tweet bulundu, %d'ine reply atilacak",
        len(candidates),
        min(remaining, len(candidates)),
    )

    # En yeniden en eskiye sirala (yeni tweetlere oncelik)
    candidates_to_process = candidates[:remaining]

    replies_made = 0
    for tweet in candidates_to_process:
        tweet_id = tweet["id"]
        tweet_text = tweet.get("text", "")
        seen_info = seen.get(tweet_id, {})
        already_sent = seen_info.get("replies_sent", 0)
        previous_reply_texts = seen_info.get("reply_texts", [])

        # Kac reply daha atilacak?
        to_generate = replies_per_tweet - already_sent

        if to_generate <= 0:
            continue

        logger.info(
            "Self-reply: @%s tweet %s icin %d reply uretiliyor...",
            username,
            tweet_id,
            to_generate,
        )

        generated_replies = []

        for i in range(to_generate):
            reply_number = already_sent + i + 1

            try:
                reply_text = _generate_self_reply(
                    my_tweet=tweet_text,
                    reply_number=reply_number,
                    total_replies=replies_per_tweet,
                    style=style,
                    previous_replies=previous_reply_texts + [r["text"] for r in generated_replies],
                )
            except Exception as e:
                logger.warning(
                    "Self-reply: uretim hatasi (tweet %s, reply #%d): %s",
                    tweet_id, reply_number, e,
                )
                add_self_reply_log({
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_number": reply_number,
                    "reply_text": "",
                    "status": "generation_failed",
                    "error": str(e),
                })
                continue

            if not reply_text:
                continue

            generated_replies.append({
                "text": reply_text,
                "reply_number": reply_number,
            })

        if not generated_replies:
            continue

        # Simdi paylas veya draft olarak kaydet
        # reply_to_id: ilk reply -> orijinal tweet, sonrakiler -> onceki reply
        current_reply_to_id = tweet_id
        reply_ids = list(seen_info.get("reply_ids", []))

        # Eger daha once reply atildiysa, son reply'in id'sine reply at
        if reply_ids:
            current_reply_to_id = reply_ids[-1]

        for idx, reply_data in enumerate(generated_replies):
            reply_text = reply_data["text"]
            reply_number = reply_data["reply_number"]

            if draft_only:
                add_self_reply_log({
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_number": reply_number,
                    "reply_text": reply_text,
                    "status": "ready",
                })
                previous_reply_texts.append(reply_text)
                _send_telegram_self_reply(
                    tweet_text, reply_text, reply_number, "", "ready",
                )
                continue

            # Araya bekleme koy (ilk reply haric)
            if idx > 0 and reply_interval > 0:
                wait_seconds = reply_interval * 60
                logger.info(
                    "Self-reply: %d dk bekleniyor (reply #%d)...",
                    reply_interval, reply_number,
                )
                time.sleep(wait_seconds)

            # Paylas
            result = _publish_self_reply(reply_text, current_reply_to_id)

            if result.get("success"):
                new_reply_id = result.get("tweet_id", "")
                reply_ids.append(new_reply_id)
                previous_reply_texts.append(reply_text)

                add_self_reply_log({
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_number": reply_number,
                    "reply_text": reply_text,
                    "reply_tweet_id": new_reply_id,
                    "reply_url": result.get("url", ""),
                    "status": "published",
                })

                _send_telegram_self_reply(
                    tweet_text, reply_text, reply_number,
                    result.get("url", ""), "published",
                )

                # Sonraki reply bu reply'a gelecek
                if new_reply_id:
                    current_reply_to_id = new_reply_id
            else:
                add_self_reply_log({
                    "tweet_id": tweet_id,
                    "tweet_text": tweet_text[:200],
                    "reply_number": reply_number,
                    "reply_text": reply_text,
                    "status": "publish_failed",
                    "error": result.get("error", ""),
                })

        # Seen guncelle
        new_sent = already_sent + len(generated_replies)
        seen[tweet_id] = {
            "replies_sent": new_sent,
            "reply_ids": reply_ids,
            "reply_texts": previous_reply_texts,
            "tweet_text": tweet_text[:200],
            "last_reply_at": now.isoformat(),
            "first_reply_date": seen_info.get("first_reply_date", today_str),
        }
        replies_made += 1

    save_self_reply_seen(seen)

    if replies_made > 0:
        logger.info("Self-reply: %d tweet'e self-reply atildi", replies_made)
    else:
        logger.info("Self-reply: bu kontrolde reply atilacak tweet bulunamadi")


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
        logger.warning("Self-reply: Twikit auth failed: %s", e)
    return None


def _generate_self_reply(
    my_tweet: str,
    reply_number: int,
    total_replies: int,
    style: str = "samimi",
    previous_replies: list[str] | None = None,
) -> str:
    """Generate a self-reply using ContentGenerator."""
    from backend.api.helpers import create_generator

    generator = create_generator(topic=my_tweet)
    reply = generator.generate_self_reply(
        my_tweet=my_tweet,
        reply_number=reply_number,
        total_replies=total_replies,
        style=style,
        previous_replies=previous_replies or [],
    )
    return reply.strip() if reply else ""


def _publish_self_reply(text: str, reply_to_id: str) -> dict:
    """Publish a self-reply using TweetPublisher."""
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

    result = publisher.post_reply(text, reply_to_id)

    if result.get("success"):
        add_to_post_history({
            "text": text,
            "url": result.get("url", ""),
            "type": "auto_self_reply",
            "reply_to_id": reply_to_id,
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
                "source": "auto_self_reply",
            })

    return result


def _send_telegram_self_reply(tweet_text: str, reply_text: str,
                               reply_number: int, reply_url: str,
                               status: str):
    """Telegram'a self-reply bildirimi gonder."""
    try:
        from backend.config import get_settings
        from backend.modules.telegram_notifier import TelegramNotifier

        settings = get_settings()
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return
        notifier = TelegramNotifier(settings.telegram_bot_token, settings.telegram_chat_id)
        notifier.send_self_reply_notification(
            tweet_text=tweet_text,
            reply_text=reply_text,
            reply_number=reply_number,
            reply_url=reply_url,
            status=status,
        )
    except Exception as e:
        logger.warning("Self-reply telegram notification failed: %s", e)
