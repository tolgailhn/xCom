"""
Auto Reply API — Otomatik yanit sistemi yonetimi
"""
import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.modules.style_manager import (
    load_auto_reply_config,
    save_auto_reply_config,
    load_auto_reply_logs,
    save_auto_reply_logs,
    update_auto_reply_log,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ──────────────────────────────────────────────

class AutoReplyConfigRequest(BaseModel):
    enabled: bool = False
    accounts: list[str] = []
    check_interval_minutes: int = 5
    reply_delay_seconds: int = 60
    style: str = "reply"
    additional_context: str = ""
    max_replies_per_hour: int = 5
    min_likes_to_reply: int = 0
    only_original_tweets: bool = True
    language: str = "tr"
    draft_only: bool = True


class LogStatusUpdate(BaseModel):
    status: str  # "manually_posted" or other


# ── Endpoints ───────────────────────────────────────────

@router.get("/config")
async def get_config():
    """Get current auto-reply configuration"""
    config = load_auto_reply_config()
    return {"config": config}


@router.post("/config")
async def update_config(request: AutoReplyConfigRequest):
    """Update auto-reply configuration"""
    config = request.model_dump()
    # Clean account names
    config["accounts"] = [
        a.strip().lstrip("@") for a in config["accounts"] if a.strip()
    ]
    save_auto_reply_config(config)
    return {"success": True, "config": config}


@router.get("/logs")
async def get_logs(limit: int = 50):
    """Get auto-reply logs"""
    logs = load_auto_reply_logs()
    return {"logs": logs[:limit], "total": len(logs)}


@router.delete("/logs")
async def clear_logs():
    """Clear all auto-reply logs"""
    save_auto_reply_logs([])
    return {"success": True}


@router.delete("/log/{log_id}")
async def delete_log(log_id: str):
    """Delete a specific log entry"""
    logs = load_auto_reply_logs()
    new_logs = [l for l in logs if l.get("id") != log_id]
    if len(new_logs) == len(logs):
        raise HTTPException(status_code=404, detail="Log bulunamadi")
    save_auto_reply_logs(new_logs)
    return {"success": True}


@router.patch("/log/{log_id}/status")
async def update_log_status(log_id: str, request: LogStatusUpdate):
    """Update a log entry's status (e.g. mark as manually posted)"""
    import datetime
    from zoneinfo import ZoneInfo
    TZ_TR = ZoneInfo("Europe/Istanbul")

    updates = {"status": request.status}
    if request.status == "manually_posted":
        updates["manually_posted_at"] = datetime.datetime.now(TZ_TR).isoformat()

    result = update_auto_reply_log(log_id, updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Log bulunamadi")
    return {"success": True, "log": result}


@router.post("/trigger")
async def trigger_check():
    """Manually trigger an auto-reply check cycle"""
    try:
        from backend.auto_reply_worker import check_and_reply
        await asyncio.to_thread(check_and_reply)
        return {"success": True, "message": "Kontrol tamamlandi"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_status():
    """Get auto-reply system status"""
    config = load_auto_reply_config()
    logs = load_auto_reply_logs()

    import datetime
    from zoneinfo import ZoneInfo
    TZ_TR = ZoneInfo("Europe/Istanbul")
    now = datetime.datetime.now(TZ_TR)
    one_hour_ago = now - datetime.timedelta(hours=1)

    recent_replies = 0
    last_reply_time = None
    for log in logs:
        try:
            log_time = datetime.datetime.fromisoformat(log.get("created_at", ""))
            if log_time.tzinfo is None:
                log_time = log_time.replace(tzinfo=TZ_TR)
            if log.get("status") == "published":
                if last_reply_time is None:
                    last_reply_time = log_time.isoformat()
                if log_time >= one_hour_ago:
                    recent_replies += 1
        except (ValueError, TypeError):
            continue

    # Rotation schedule: which accounts at which hour
    accounts = config.get("accounts", [])
    from backend.auto_reply_worker import _get_accounts_for_hour
    current_hour_accounts = _get_accounts_for_hour(accounts, now.hour)
    next_hour = (now.hour + 1) % 24
    next_hour_accounts = _get_accounts_for_hour(accounts, next_hour)

    # Full 24-hour schedule
    schedule = {}
    for h in range(24):
        h_accounts = _get_accounts_for_hour(accounts, h)
        if h_accounts:
            schedule[f"{h:02d}:00"] = [f"@{a}" for a in h_accounts]

    return {
        "enabled": config.get("enabled", False),
        "draft_only": config.get("draft_only", True),
        "accounts_count": len(accounts),
        "replies_last_hour": recent_replies,
        "max_per_hour": config.get("max_replies_per_hour", 5),
        "last_reply_time": last_reply_time,
        "total_replies": sum(1 for l in logs if l.get("status") == "published"),
        "total_ready": sum(1 for l in logs if l.get("status") == "ready"),
        "total_manually_posted": sum(1 for l in logs if l.get("status") == "manually_posted"),
        "total_failures": sum(1 for l in logs if "failed" in l.get("status", "")),
        "current_hour": f"{now.hour:02d}:00",
        "current_hour_accounts": [f"@{a}" for a in current_hour_accounts],
        "next_hour": f"{next_hour:02d}:00",
        "next_hour_accounts": [f"@{a}" for a in next_hour_accounts],
        "schedule": schedule,
    }
