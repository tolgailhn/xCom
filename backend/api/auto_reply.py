"""
Auto Self-Reply API — settings, log, manual trigger
"""
import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.modules.style_manager import (
    load_auto_reply_settings,
    save_auto_reply_settings,
    load_auto_reply_log,
)

router = APIRouter()


class AutoReplySettingsRequest(BaseModel):
    enabled: bool = False
    check_interval_minutes: int = 30
    lookback_hours: int = 6
    reply_style: str = "samimi"


@router.get("/settings")
async def get_auto_reply_settings():
    """Return current auto self-reply settings."""
    return load_auto_reply_settings()


@router.post("/settings")
async def update_auto_reply_settings(req: AutoReplySettingsRequest):
    """Save auto self-reply settings."""
    settings = {
        "enabled": req.enabled,
        "check_interval_minutes": max(15, min(120, req.check_interval_minutes)),
        "lookback_hours": max(1, min(48, req.lookback_hours)),
        "reply_style": req.reply_style,
    }
    save_auto_reply_settings(settings)
    return {"success": True, "settings": settings}


@router.get("/log")
async def get_auto_reply_log():
    """Return recent auto self-reply log entries (last 50)."""
    log = load_auto_reply_log()
    return {"entries": log[:50]}


@router.post("/run-now")
async def run_auto_reply_now():
    """Manually trigger one auto self-reply cycle."""
    try:
        from backend.modules.auto_reply import run_auto_reply_cycle
        result = await asyncio.to_thread(run_auto_reply_cycle)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
