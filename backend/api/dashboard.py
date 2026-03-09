"""
Dashboard API - Ana sayfa verileri
"""
from fastapi import APIRouter
from pydantic import BaseModel
import datetime
from zoneinfo import ZoneInfo

from backend.config import get_settings
from backend.modules.style_manager import load_post_history, load_draft_tweets, load_posting_log

router = APIRouter()

TZ_TR = ZoneInfo("Europe/Istanbul")


class SlotInfo(BaseModel):
    time: str
    icon: str
    posted: bool


class DashboardStats(BaseModel):
    today_posts: int
    total_drafts: int
    week_posts: int
    has_twitter: bool
    has_ai: bool
    slots: list[SlotInfo]
    next_slot: str | None
    recent_posts: list[dict]


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    """Ana sayfa istatistikleri"""
    settings = get_settings()

    has_twitter = bool(settings.twitter_bearer_token)
    has_ai = bool(settings.minimax_api_key or settings.anthropic_api_key or settings.openai_api_key)

    post_history = load_post_history()
    drafts = load_draft_tweets()
    posting_log = load_posting_log()

    now = datetime.datetime.now(TZ_TR)
    today_str = now.strftime("%Y-%m-%d")
    today_logs = [e for e in posting_log if e.get("date") == today_str]

    # Weekly
    week_start = (now - datetime.timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    week_logs = [e for e in posting_log if e.get("date", "") >= week_start]

    # Slots — gun bazli optimal saatler (Grok analizi)
    from backend.api.calendar import DAILY_SLOTS
    day_name = now.strftime("%A")
    day_slots = DAILY_SLOTS.get(day_name, DAILY_SLOTS["Monday"])

    icon_map = {"sun": "sunrise", "utensils": "lunch", "walking": "afternoon",
                "moon": "night", "sunset": "afternoon"}
    slot_times = [(s["time"], icon_map.get(s["icon"], "sunrise")) for s in day_slots]

    posted_slots = {e["slot_time"] for e in today_logs}
    slots = [SlotInfo(time=t, icon=icon, posted=t in posted_slots) for t, icon in slot_times]

    # Next slot
    next_slot = None
    for slot_time, _ in slot_times:
        h, m = map(int, slot_time.split(":"))
        slot_dt = now.replace(hour=h, minute=m, second=0)
        if slot_dt > now and slot_time not in posted_slots:
            diff = slot_dt - now
            hours = diff.seconds // 3600
            mins = (diff.seconds % 3600) // 60
            next_slot = f"{slot_time} ({hours}s {mins}dk)" if hours > 0 else f"{slot_time} ({mins}dk)"
            break

    # Recent posts
    recent = []
    for entry in post_history[:10]:
        recent.append({
            "text": entry.get("text", "")[:200],
            "url": entry.get("url", ""),
            "posted_at": entry.get("posted_at", ""),
            "style": entry.get("style", ""),
        })

    return DashboardStats(
        today_posts=len(today_logs),
        total_drafts=len(drafts),
        week_posts=len(week_logs),
        has_twitter=has_twitter,
        has_ai=has_ai,
        slots=slots,
        next_slot=next_slot,
        recent_posts=recent,
    )
