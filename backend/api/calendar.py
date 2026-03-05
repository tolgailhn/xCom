"""
Calendar API - Posting takvimi ve log
"""
from fastapi import APIRouter
from pydantic import BaseModel
import datetime
from zoneinfo import ZoneInfo

from backend.modules.style_manager import (
    load_posting_log,
    log_scheduled_post,
    load_daily_checklist,
    save_daily_checklist,
)

router = APIRouter()

TZ_TR = ZoneInfo("Europe/Istanbul")


class PostLogEntry(BaseModel):
    slot_time: str
    post_type: str = ""
    has_media: bool = False
    has_self_reply: bool = False
    url: str = ""
    content: str = ""


class ChecklistUpdate(BaseModel):
    date: str
    items: dict[str, bool]


@router.get("/today")
async def get_today_schedule():
    """Bugunun takvimi"""
    now = datetime.datetime.now(TZ_TR)
    today_str = now.strftime("%Y-%m-%d")
    posting_log = load_posting_log()
    today_logs = [e for e in posting_log if e.get("date") == today_str]

    is_weekend = now.weekday() >= 5
    slots = [
        {"time": "10:00" if is_weekend else "09:00", "label": "Sabah"},
        {"time": "13:30" if is_weekend else "13:00", "label": "Ogle"},
        {"time": "17:30" if is_weekend else "17:00", "label": "Aksam"},
        {"time": "21:30" if is_weekend else "21:00", "label": "Gece"},
    ]

    posted_slots = {e["slot_time"] for e in today_logs}
    for slot in slots:
        slot["posted"] = slot["time"] in posted_slots
        log_entry = next((e for e in today_logs if e.get("slot_time") == slot["time"]), None)
        if log_entry:
            slot["log"] = log_entry

    return {"date": today_str, "is_weekend": is_weekend, "slots": slots}


@router.post("/log")
async def log_post(entry: PostLogEntry):
    """Post kaydı ekle"""
    log_scheduled_post(
        slot_time=entry.slot_time,
        post_type=entry.post_type,
        has_media=entry.has_media,
        has_self_reply=entry.has_self_reply,
        url=entry.url,
        content=entry.content,
    )
    return {"status": "ok"}


@router.get("/checklist/{date}")
async def get_checklist(date: str):
    """Günlük checklist"""
    return load_daily_checklist(date)


@router.post("/checklist")
async def update_checklist(update: ChecklistUpdate):
    """Checklist guncelle"""
    save_daily_checklist(update.date, update.items)
    return {"status": "ok"}
