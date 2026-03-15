"""
Performance API - Tweet metriklerini takip etme
"""
import datetime
import logging
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import get_settings
from backend.modules.style_manager import (
    load_tweet_metrics,
    add_tweet_metric,
    update_tweet_metric,
    load_post_history,
)

router = APIRouter()
logger = logging.getLogger(__name__)

TZ_TR = ZoneInfo("Europe/Istanbul")


class TrackRequest(BaseModel):
    tweet_id: str
    text: str = ""


def _fetch_tweet_metrics(tweet_id: str) -> dict | None:
    """Twitter API v2 ile tweet metriklerini cek."""
    settings = get_settings()
    bearer_token = settings.twitter_bearer_token

    if not bearer_token:
        return None

    try:
        import tweepy

        client = tweepy.Client(bearer_token=bearer_token)
        response = client.get_tweet(
            tweet_id,
            tweet_fields=["public_metrics", "created_at"],
        )
        if not response or not response.data:
            return None

        tweet = response.data
        pm = tweet.public_metrics or {}
        return {
            "likes": pm.get("like_count", 0),
            "retweets": pm.get("retweet_count", 0),
            "replies": pm.get("reply_count", 0),
            "impressions": pm.get("impression_count", 0),
            "bookmarks": pm.get("bookmark_count", 0),
            "quotes": pm.get("quote_count", 0),
        }
    except Exception as e:
        logger.warning("Failed to fetch metrics for %s: %s", tweet_id, e)
        return None


@router.get("/stats")
async def get_performance_stats():
    """Kaydedilmis tum tweet metriklerini getir."""
    metrics = load_tweet_metrics()

    # Ozet hesapla
    total_likes = sum(m.get("metrics", {}).get("likes", 0) for m in metrics)
    total_rt = sum(m.get("metrics", {}).get("retweets", 0) for m in metrics)
    total_replies = sum(m.get("metrics", {}).get("replies", 0) for m in metrics)
    total_impressions = sum(m.get("metrics", {}).get("impressions", 0) for m in metrics)
    tracked_count = len(metrics)

    # En iyi tweet
    best_tweet = None
    if metrics:
        best = max(
            metrics,
            key=lambda m: (
                m.get("metrics", {}).get("likes", 0) * 1
                + m.get("metrics", {}).get("retweets", 0) * 20
                + m.get("metrics", {}).get("replies", 0) * 13.5
                + m.get("metrics", {}).get("bookmarks", 0) * 10
            ),
        )
        best_tweet = {
            "tweet_id": best.get("tweet_id", ""),
            "text": best.get("text", "")[:120],
            "url": best.get("url", ""),
            "metrics": best.get("metrics", {}),
        }

    return {
        "summary": {
            "tracked_count": tracked_count,
            "total_likes": total_likes,
            "total_retweets": total_rt,
            "total_replies": total_replies,
            "total_impressions": total_impressions,
            "avg_likes": round(total_likes / tracked_count, 1) if tracked_count else 0,
            "avg_retweets": round(total_rt / tracked_count, 1) if tracked_count else 0,
        },
        "best_tweet": best_tweet,
        "tweets": metrics[:50],  # Son 50 tweet
    }


@router.post("/track")
async def track_tweet(request: TrackRequest):
    """Tek tweet'in metriklerini cek ve kaydet."""
    fetched = _fetch_tweet_metrics(request.tweet_id)
    if fetched is None:
        raise HTTPException(status_code=400, detail="Tweet metrikleri alinamadi. Bearer token kontrol edin.")

    now = datetime.datetime.now(TZ_TR).isoformat()
    add_tweet_metric({
        "tweet_id": request.tweet_id,
        "text": request.text,
        "url": f"https://x.com/i/status/{request.tweet_id}",
        "metrics": fetched,
        "last_checked": now,
        "first_tracked": now,
    })

    return {"success": True, "tweet_id": request.tweet_id, "metrics": fetched}


@router.post("/refresh-all")
async def refresh_all_metrics():
    """Takip edilen tum tweet'lerin metriklerini guncelle."""
    metrics = load_tweet_metrics()
    if not metrics:
        return {"success": True, "updated": 0, "message": "Takip edilen tweet yok"}

    now = datetime.datetime.now(TZ_TR)
    updated_count = 0
    errors = 0

    for entry in metrics:
        tweet_id = entry.get("tweet_id", "")
        if not tweet_id:
            continue

        # Sadece son 48 saatteki tweetleri guncelle (eski tweetler stabilize olmus)
        first_tracked = entry.get("first_tracked", "")
        if first_tracked:
            try:
                ft = datetime.datetime.fromisoformat(first_tracked)
                if ft.tzinfo is None:
                    ft = ft.replace(tzinfo=TZ_TR)
                if (now - ft).total_seconds() > 48 * 3600:
                    continue
            except ValueError:
                pass

        fetched = _fetch_tweet_metrics(tweet_id)
        if fetched:
            update_tweet_metric(tweet_id, {
                "metrics": fetched,
                "last_checked": now.isoformat(),
            })
            updated_count += 1
        else:
            errors += 1

    return {"success": True, "updated": updated_count, "errors": errors, "total": len(metrics)}


@router.post("/auto-register")
async def auto_register_from_history():
    """Post history'deki tweet_id'leri otomatik metrik takibine ekle."""
    history = load_post_history()
    existing = load_tweet_metrics()
    existing_ids = {m.get("tweet_id") for m in existing}

    now = datetime.datetime.now(TZ_TR).isoformat()
    added = 0

    for entry in history:
        # URL'den tweet_id cikart
        url = entry.get("url", "") or entry.get("tweet_url", "")
        if not url:
            continue
        # URL format: https://x.com/user/status/123456
        parts = url.rstrip("/").split("/")
        tweet_id = ""
        for i, p in enumerate(parts):
            if p == "status" and i + 1 < len(parts):
                tweet_id = parts[i + 1]
                break
        if not tweet_id or tweet_id in existing_ids:
            continue

        fetched = _fetch_tweet_metrics(tweet_id)
        metrics_data = fetched if fetched else {}

        add_tweet_metric({
            "tweet_id": tweet_id,
            "text": entry.get("text", "")[:200],
            "url": url,
            "metrics": metrics_data,
            "last_checked": now,
            "first_tracked": now,
            "source": "history",
        })
        existing_ids.add(tweet_id)
        added += 1

    return {"success": True, "added": added}


def check_and_update_metrics():
    """Scheduler tarafindan cagirilir: son 48 saatteki tweet'lerin metriklerini guncelle."""
    metrics = load_tweet_metrics()
    if not metrics:
        return

    now = datetime.datetime.now(TZ_TR)
    updated = 0

    for entry in metrics:
        tweet_id = entry.get("tweet_id", "")
        if not tweet_id:
            continue

        # Son 48 saat filtresi
        first_tracked = entry.get("first_tracked", "")
        if first_tracked:
            try:
                ft = datetime.datetime.fromisoformat(first_tracked)
                if ft.tzinfo is None:
                    ft = ft.replace(tzinfo=TZ_TR)
                if (now - ft).total_seconds() > 48 * 3600:
                    continue
            except ValueError:
                pass

        fetched = _fetch_tweet_metrics(tweet_id)
        if fetched:
            update_tweet_metric(tweet_id, {
                "metrics": fetched,
                "last_checked": now.isoformat(),
            })
            updated += 1

    if updated:
        logger.info("Auto-updated metrics for %d tweets", updated)
