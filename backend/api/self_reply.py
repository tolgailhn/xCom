"""
Self-Reply API — Kendi tweetlerine otomatik self-reply sistemi yonetimi
"""
import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.modules.style_manager import (
    load_self_reply_config,
    save_self_reply_config,
    load_self_reply_logs,
    save_self_reply_logs,
    load_self_reply_seen,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ──────────────────────────────────────────────

class SelfReplyConfigRequest(BaseModel):
    enabled: bool = False
    username: str = ""
    max_daily_tweets: int = 4
    min_tweet_age_minutes: int = 2
    max_tweet_age_days: int = 1
    style: str = "samimi"
    draft_only: bool = False
    work_hour_start: int = 9
    work_hour_end: int = 23


# ── Endpoints ───────────────────────────────────────────

@router.get("/config")
async def get_config():
    """Get self-reply configuration"""
    config = load_self_reply_config()
    return {"config": config}


@router.post("/config")
async def update_config(request: SelfReplyConfigRequest):
    """Update self-reply configuration"""
    config = request.model_dump()
    config["username"] = config["username"].strip().lstrip("@")
    save_self_reply_config(config)
    return {"success": True, "config": config}


@router.get("/logs")
async def get_logs(limit: int = 100):
    """Get self-reply logs"""
    logs = load_self_reply_logs()
    return {"logs": logs[:limit], "total": len(logs)}


@router.delete("/logs")
async def clear_logs():
    """Clear all self-reply logs"""
    save_self_reply_logs([])
    return {"success": True}


@router.delete("/log/{log_id}")
async def delete_log(log_id: str):
    """Delete a specific log entry"""
    logs = load_self_reply_logs()
    new_logs = [l for l in logs if l.get("id") != log_id]
    if len(new_logs) == len(logs):
        raise HTTPException(status_code=404, detail="Log bulunamadi")
    save_self_reply_logs(new_logs)
    return {"success": True}


@router.post("/trigger")
async def trigger_check():
    """Manually trigger a self-reply check"""
    try:
        from backend.self_reply_worker import check_self_replies, _save_last_check_key
        # Reset check key so it runs immediately
        _save_last_check_key("")
        await asyncio.to_thread(check_self_replies)
        return {"success": True, "message": "Self-reply kontrol tamamlandi"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_status():
    """Get self-reply system status"""
    config = load_self_reply_config()
    logs = load_self_reply_logs()
    seen = load_self_reply_seen()

    import datetime
    from zoneinfo import ZoneInfo
    TZ_TR = ZoneInfo("Europe/Istanbul")
    now = datetime.datetime.now(TZ_TR)
    today_str = now.strftime("%Y-%m-%d")

    # Bugun kac tweet'e reply atildi
    today_replied = 0
    for tid, info in seen.items():
        if info.get("first_reply_date") == today_str:
            today_replied += 1

    # Toplam istatistikler
    total_published = sum(1 for l in logs if l.get("status") == "published")
    total_ready = sum(1 for l in logs if l.get("status") == "ready")
    total_failed = sum(1 for l in logs if "failed" in l.get("status", ""))
    total_tweets_with_replies = len(seen)

    # Son reply zamani
    last_reply_time = None
    for log in logs:
        if log.get("status") == "published":
            last_reply_time = log.get("created_at")
            break

    return {
        "enabled": config.get("enabled", False),
        "draft_only": config.get("draft_only", False),
        "username": config.get("username", ""),
        "today_replied": today_replied,
        "max_daily": config.get("max_daily_tweets", 4),
        "total_published": total_published,
        "total_ready": total_ready,
        "total_failed": total_failed,
        "total_tweets_with_replies": total_tweets_with_replies,
        "last_reply_time": last_reply_time,
    }


@router.get("/seen")
async def get_seen():
    """Get seen tweets data"""
    seen = load_self_reply_seen()
    # En son reply atilanlar once gelsin
    sorted_items = sorted(
        seen.items(),
        key=lambda x: x[1].get("last_reply_at", ""),
        reverse=True,
    )
    return {"seen": dict(sorted_items[:50]), "total": len(seen)}
