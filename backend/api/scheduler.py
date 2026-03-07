"""
Scheduler API - Zamanlanmis tweet paylasimi
"""
import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from zoneinfo import ZoneInfo

from backend.modules.style_manager import (
    load_scheduled_posts,
    add_scheduled_post,
    delete_scheduled_post,
)

router = APIRouter()

TZ_TR = ZoneInfo("Europe/Istanbul")


class ScheduleRequest(BaseModel):
    text: str
    scheduled_time: str  # ISO format: "2026-03-07T14:00:00"
    thread_parts: list[str] = []
    quote_tweet_id: str = ""


class ScheduleResponse(BaseModel):
    success: bool
    post_id: str = ""
    scheduled_time: str = ""
    error: str = ""


@router.post("/add", response_model=ScheduleResponse)
async def schedule_post(request: ScheduleRequest):
    """Yeni zamanlanmis post ekle"""
    try:
        # Parse and validate scheduled time
        try:
            scheduled_dt = datetime.datetime.fromisoformat(request.scheduled_time)
            # If no timezone, assume Turkey
            if scheduled_dt.tzinfo is None:
                scheduled_dt = scheduled_dt.replace(tzinfo=TZ_TR)
        except ValueError:
            raise HTTPException(status_code=400, detail="Gecersiz tarih formati. ISO format kullanin: 2026-03-07T14:00:00")

        now = datetime.datetime.now(TZ_TR)
        if scheduled_dt <= now:
            raise HTTPException(status_code=400, detail="Zamanlama gelecekte olmali")

        post = add_scheduled_post({
            "text": request.text,
            "scheduled_time": scheduled_dt.isoformat(),
            "thread_parts": request.thread_parts,
            "quote_tweet_id": request.quote_tweet_id,
        })

        return ScheduleResponse(
            success=True,
            post_id=post["id"],
            scheduled_time=scheduled_dt.isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending")
async def get_pending_posts():
    """Bekleyen zamanlanmis postlari getir"""
    posts = load_scheduled_posts()
    pending = [p for p in posts if p.get("status") == "pending"]
    # Sort by scheduled_time ascending
    pending.sort(key=lambda p: p.get("scheduled_time", ""))
    return {"posts": pending, "total": len(pending)}


@router.get("/all")
async def get_all_scheduled():
    """Tum zamanlanmis postlari getir (pending + completed + failed)"""
    posts = load_scheduled_posts()
    return {"posts": posts[:50], "total": len(posts)}


@router.delete("/cancel/{post_id}")
async def cancel_scheduled_post(post_id: str):
    """Zamanlanmis postu iptal et"""
    deleted = delete_scheduled_post(post_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Post bulunamadi")
    return {"success": True}
