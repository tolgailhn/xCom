"""
Auto Self-Reply Module
Checks user's recent tweets and posts AI-generated self-replies
for tweets that don't already have one.
"""
import logging
import datetime
from zoneinfo import ZoneInfo

from backend.config import get_settings
from backend.modules.style_manager import (
    load_auto_reply_settings,
    load_auto_reply_log,
    save_auto_reply_log,
)

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")


def _build_publisher():
    """Build a TweetPublisher from config (same pattern as publish.py)."""
    from backend.modules.tweet_publisher import TweetPublisher

    s = get_settings()
    if not (s.twitter_bearer_token and s.twitter_ct0 and s.twitter_auth_token):
        raise ValueError("Twitter API credentials not configured.")
    return TweetPublisher(
        api_key=s.twitter_ct0,
        api_secret=s.twitter_auth_token,
        access_token=s.twitter_ct0,
        access_secret=s.twitter_auth_token,
        bearer_token=s.twitter_bearer_token,
    )


def get_my_recent_tweets(publisher, hours_back: int = 6) -> list[dict]:
    """Fetch authenticated user's recent original tweets (no RTs, no replies)."""
    me = publisher.client.get_me()
    if not me.data:
        raise ValueError("Could not get authenticated user info.")
    user_id = me.data.id

    start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours_back)

    resp = publisher.client.get_users_tweets(
        id=user_id,
        start_time=start_time,
        max_results=20,
        exclude=["retweets", "replies"],
        tweet_fields=["created_at", "public_metrics", "conversation_id"],
    )
    if not resp.data:
        return []

    tweets = []
    for t in resp.data:
        metrics = t.public_metrics or {}
        tweets.append({
            "id": str(t.id),
            "text": t.text,
            "created_at": str(t.created_at) if t.created_at else "",
            "like_count": metrics.get("like_count", 0),
            "reply_count": metrics.get("reply_count", 0),
            "impression_count": metrics.get("impression_count", 0),
            "conversation_id": str(t.conversation_id) if t.conversation_id else str(t.id),
        })
    return tweets


def has_self_reply(publisher, tweet_id: str, user_id: str, log: list[dict]) -> bool:
    """Check if we already replied to this tweet (local log + Twitter API)."""
    # Fast path: check local log
    replied_ids = {entry["tweet_id"] for entry in log if entry.get("status") == "success"}
    if tweet_id in replied_ids:
        return True

    # Twitter API: search for our replies in this conversation
    try:
        query = f"conversation_id:{tweet_id} from:{user_id} is:reply"
        resp = publisher.client.search_recent_tweets(query=query, max_results=10)
        if resp.data and len(resp.data) > 0:
            return True
    except Exception as e:
        logger.warning(f"Twitter search failed for tweet {tweet_id}: {e}")
        # If API check fails, fall back to local log only (already checked above)

    return False


def generate_self_reply(tweet_text: str, style: str = "samimi") -> str:
    """Generate an AI self-reply for our own tweet."""
    from backend.api.helpers import create_generator

    generator = create_generator(topic=tweet_text[:100])
    reply = generator.generate_reply(
        original_tweet=tweet_text,
        original_author="self",
        style=style,
        additional_context=(
            "Bu senin kendi tweetin. Ekstra bilgi, ilginc bir soru, "
            "veya konuyu derinlestiren bir yorum ekle. "
            "Kisa ve dogal ol, 1-2 cumle yeterli."
        ),
    )
    return reply


def run_auto_reply_cycle() -> dict:
    """
    Run one cycle of auto self-reply.
    Returns summary dict: {checked, replied, skipped, errors}
    """
    settings = load_auto_reply_settings()
    if not settings.get("enabled"):
        return {"checked": 0, "replied": 0, "skipped": 0, "errors": [], "message": "Disabled"}

    result = {"checked": 0, "replied": 0, "skipped": 0, "errors": []}

    try:
        publisher = _build_publisher()
    except Exception as e:
        result["errors"].append(f"Publisher init failed: {e}")
        return result

    # Get user ID
    try:
        me = publisher.client.get_me()
        if not me.data:
            result["errors"].append("Could not get user info")
            return result
        user_id = str(me.data.id)
    except Exception as e:
        result["errors"].append(f"get_me failed: {e}")
        return result

    # Fetch recent tweets
    hours_back = settings.get("lookback_hours", 6)
    try:
        tweets = get_my_recent_tweets(publisher, hours_back=hours_back)
    except Exception as e:
        result["errors"].append(f"Fetch tweets failed: {e}")
        return result

    result["checked"] = len(tweets)
    log = load_auto_reply_log()
    style = settings.get("reply_style", "samimi")

    for tweet in tweets:
        tweet_id = tweet["id"]

        # Check if already replied
        if has_self_reply(publisher, tweet_id, user_id, log):
            result["skipped"] += 1
            continue

        # Generate AI self-reply
        try:
            reply_text = generate_self_reply(tweet["text"], style=style)
        except Exception as e:
            result["errors"].append(f"Generate failed for {tweet_id}: {e}")
            continue

        # Post the reply
        try:
            post_result = publisher.post_reply(reply_text, tweet_id)
        except Exception as e:
            result["errors"].append(f"Post failed for {tweet_id}: {e}")
            continue

        now_str = datetime.datetime.now(TZ_TR).isoformat()

        if post_result.get("success"):
            log.insert(0, {
                "tweet_id": tweet_id,
                "tweet_text": tweet["text"][:200],
                "reply_tweet_id": post_result.get("tweet_id", ""),
                "reply_text": reply_text,
                "reply_url": post_result.get("url", ""),
                "replied_at": now_str,
                "status": "success",
            })
            result["replied"] += 1
        else:
            error_msg = post_result.get("error", "Unknown error")
            log.insert(0, {
                "tweet_id": tweet_id,
                "tweet_text": tweet["text"][:200],
                "reply_tweet_id": "",
                "reply_text": reply_text,
                "reply_url": "",
                "replied_at": now_str,
                "status": "failed",
                "error": error_msg,
            })
            result["errors"].append(f"Post error for {tweet_id}: {error_msg}")

    save_auto_reply_log(log)
    return result
