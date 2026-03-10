"""
Scheduler Worker - APScheduler ile zamanlanmis tweetleri otomatik paylas.
FastAPI startup event'inde baslatilir.
"""
import datetime
import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler

from backend.modules.style_manager import (
    load_scheduled_posts,
    update_scheduled_post,
    add_to_post_history,
)

logger = logging.getLogger(__name__)

TZ_TR = ZoneInfo("Europe/Istanbul")

scheduler = BackgroundScheduler(timezone=TZ_TR)


def _publish_scheduled_post(post: dict) -> dict:
    """Tek bir zamanlanmis postu paylas. Sonuc dict doner."""
    from backend.config import get_settings

    settings = get_settings()

    api_key = settings.twitter_api_key
    api_secret = settings.twitter_api_secret
    access_token = settings.twitter_access_token
    access_secret = settings.twitter_access_secret
    bearer_token = settings.twitter_bearer_token

    if not (api_key and api_secret and access_token and access_secret):
        return {"success": False, "error": "Twitter API credentials eksik"}

    from backend.modules.tweet_publisher import TweetPublisher

    publisher = TweetPublisher(
        api_key=api_key,
        api_secret=api_secret,
        access_token=access_token,
        access_secret=access_secret,
        bearer_token=bearer_token,
    )

    thread_parts = post.get("thread_parts", [])
    quote_tweet_id = post.get("quote_tweet_id", "")
    reply_to_id = post.get("reply_to_id", "")

    if thread_parts:
        results = publisher.post_thread(thread_parts)
        first = results[0] if results else {}
        if first.get("success"):
            urls = [r.get("url", "") for r in results if r.get("success")]
            add_to_post_history({
                "text": post.get("text", ""),
                "url": first.get("url", ""),
                "type": "scheduled_thread",
                "parts": len(thread_parts),
                "thread_urls": urls,
            })
        return first
    elif reply_to_id:
        # Self-reply or reply to specific tweet
        result = publisher.post_reply(post.get("text", ""), reply_to_id)
        if result.get("success"):
            add_to_post_history({
                "text": post.get("text", ""),
                "url": result.get("url", ""),
                "type": "scheduled_self_reply",
                "reply_to_id": reply_to_id,
            })
        return result
    elif quote_tweet_id:
        result = publisher.post_quote_tweet(post.get("text", ""), quote_tweet_id)
        if result.get("success"):
            add_to_post_history({
                "text": post.get("text", ""),
                "url": result.get("url", ""),
                "type": "scheduled_quote",
            })
        return result
    else:
        result = publisher.post_tweet(post.get("text", ""))
        if result.get("success"):
            add_to_post_history({
                "text": post.get("text", ""),
                "url": result.get("url", ""),
                "type": "scheduled_tweet",
            })
        return result


def check_and_publish():
    """Her dakika calisir: zamani gelen postlari paylas."""
    now = datetime.datetime.now(TZ_TR)
    posts = load_scheduled_posts()

    for post in posts:
        if post.get("status") != "pending":
            continue

        scheduled_time_str = post.get("scheduled_time", "")
        if not scheduled_time_str:
            continue

        try:
            scheduled_dt = datetime.datetime.fromisoformat(scheduled_time_str)
            if scheduled_dt.tzinfo is None:
                scheduled_dt = scheduled_dt.replace(tzinfo=TZ_TR)
        except ValueError:
            logger.warning("Invalid scheduled_time: %s", scheduled_time_str)
            continue

        # Zamani geldi mi? (1 dakika tolerans)
        if scheduled_dt <= now:
            post_id = post.get("id", "")
            logger.info("Publishing scheduled post %s (scheduled: %s)", post_id, scheduled_time_str)

            try:
                result = _publish_scheduled_post(post)
                if result.get("success"):
                    update_scheduled_post(post_id, {
                        "status": "published",
                        "published_at": now.isoformat(),
                        "tweet_id": result.get("tweet_id", ""),
                        "tweet_url": result.get("url", ""),
                    })
                    logger.info("Scheduled post %s published successfully: %s", post_id, result.get("url", ""))

                    # Self-reply chain: update next reply's reply_to_id
                    chain_id = post.get("self_reply_chain_id")
                    chain_index = post.get("self_reply_chain_index", -1)
                    new_tweet_id = result.get("tweet_id", "")
                    if chain_id and new_tweet_id and chain_index >= 0:
                        _update_chain_next_reply(chain_id, chain_index, new_tweet_id)

                    # Telegram bildirimi (opsiyonel)
                    _send_telegram_notification(post, result)
                else:
                    error_msg = result.get("error", "Bilinmeyen hata")
                    update_scheduled_post(post_id, {
                        "status": "failed",
                        "failed_at": now.isoformat(),
                        "error": error_msg,
                    })
                    logger.error("Scheduled post %s failed: %s", post_id, error_msg)

                    # Chain failure: kalan reply'lari da iptal et
                    chain_id = post.get("self_reply_chain_id")
                    if chain_id:
                        _cancel_remaining_chain(chain_id, post.get("self_reply_chain_index", -1))

            except Exception as e:
                update_scheduled_post(post_id, {
                    "status": "failed",
                    "failed_at": now.isoformat(),
                    "error": str(e),
                })
                logger.exception("Scheduled post %s error", post_id)

                # Chain failure: kalan reply'lari da iptal et
                chain_id = post.get("self_reply_chain_id")
                if chain_id:
                    _cancel_remaining_chain(chain_id, post.get("self_reply_chain_index", -1))


def _update_chain_next_reply(chain_id: str, current_index: int, new_tweet_id: str):
    """Self-reply chain: update the next reply's reply_to_id to point to the just-published tweet."""
    posts = load_scheduled_posts()
    next_index = current_index + 1
    for p in posts:
        if (
            p.get("self_reply_chain_id") == chain_id
            and p.get("self_reply_chain_index") == next_index
            and p.get("status") == "pending"
        ):
            # Idempotency: zaten dogru set edildiyse tekrar yazma
            existing_reply_to = p.get("reply_to_id", "")
            if existing_reply_to == new_tweet_id:
                logger.info(
                    "Chain %s: reply #%d already has correct reply_to_id=%s, skipping",
                    chain_id, next_index, new_tweet_id,
                )
                break
            update_scheduled_post(p["id"], {"reply_to_id": new_tweet_id})
            logger.info(
                "Chain %s: updated reply #%d reply_to_id → %s",
                chain_id, next_index, new_tweet_id,
            )
            break


def _cancel_remaining_chain(chain_id: str, failed_index: int):
    """Chain'de bir reply basarisiz olunca kalan reply'lari iptal et."""
    posts = load_scheduled_posts()
    now = datetime.datetime.now(TZ_TR)
    cancelled = 0
    for p in posts:
        if (
            p.get("self_reply_chain_id") == chain_id
            and p.get("self_reply_chain_index", -1) > failed_index
            and p.get("status") == "pending"
        ):
            update_scheduled_post(p["id"], {
                "status": "cancelled",
                "cancelled_at": now.isoformat(),
                "cancel_reason": f"Chain reply #{failed_index} failed",
            })
            cancelled += 1
    if cancelled:
        logger.warning(
            "Chain %s: %d remaining reply(s) cancelled after index %d failed",
            chain_id, cancelled, failed_index,
        )


def _send_telegram_notification(post: dict, result: dict):
    """Basarili zamanlanmis paylasim icin Telegram bildirimi gonder."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        text = post.get("text", "")[:100]
        url = result.get("url", "")
        msg = f"Zamanlanmis tweet paylasild!\n\n{text}...\n\n{url}"
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass  # Telegram hatasi kritik degil


def _check_metrics():
    """Her 30 dakikada bir tweet metriklerini guncelle."""
    try:
        from backend.api.performance import check_and_update_metrics
        check_and_update_metrics()
    except Exception:
        logger.exception("Metrics auto-check error")


def _check_auto_replies():
    """Auto-reply worker — config'deki interval'e gore calisir."""
    try:
        from backend.auto_reply_worker import check_and_reply
        check_and_reply()
    except Exception:
        logger.exception("Auto-reply check error")


def _check_self_replies():
    """Self-reply worker — her 15 dakikada kendi tweetlerine self-reply atar."""
    try:
        from backend.self_reply_worker import check_self_replies
        check_self_replies()
    except Exception:
        logger.exception("Self-reply check error")


def _check_discovery():
    """Discovery worker — her 30 dakikada 3-4 hesap rotasyonla tara."""
    try:
        from backend.discovery_worker import scan_accounts
        scan_accounts()
    except Exception:
        logger.exception("Discovery check error")


def _check_telegram():
    """Telegram bot — mesajlari kontrol et ve cevapla."""
    try:
        from backend.telegram_bot import check_telegram_messages
        check_telegram_messages()
    except Exception:
        logger.exception("Telegram bot check error")


def start_scheduler():
    """Scheduler'i baslat — FastAPI startup'ta cagirilir."""
    if not scheduler.running:
        scheduler.add_job(
            check_and_publish,
            "interval",
            minutes=1,
            id="scheduled_publisher",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_metrics,
            "interval",
            minutes=30,
            id="metrics_checker",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_auto_replies,
            "interval",
            minutes=5,
            id="auto_reply_checker",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_self_replies,
            "interval",
            minutes=3,
            id="self_reply_checker",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_discovery,
            "interval",
            minutes=30,
            id="discovery_checker",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_telegram,
            "interval",
            seconds=5,
            id="telegram_bot",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("Scheduler started — publish 1m, metrics 30m, auto-reply 5m, self-reply 3m, discovery 30m, telegram 5s")


def stop_scheduler():
    """Scheduler'i durdur — FastAPI shutdown'da cagirilir."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
