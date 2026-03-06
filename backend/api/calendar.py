"""
Calendar API - Posting takvimi, log, checklist, haftalik ozet
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

WEEKDAY_SLOTS = [
    {"time": "09:00", "label": "Sabah", "icon": "sun", "type": "Deger / Egitim / Meme",
     "desc": "Ilk post'un reach'i tum gun en yuksek kalir. Grok ranking ilk 60dk'yi agir tartar."},
    {"time": "13:00", "label": "Ogle", "icon": "utensils", "type": "Soru / Poll",
     "desc": "Turk lunch + global overlap (13-17 arasi Turk kaynaklarinda zirve)."},
    {"time": "17:00", "label": "Is Cikisi", "icon": "walking", "type": "Opinion (kisa & punchy)",
     "desc": "Commute saati, telefon elde. Reply orani +%40."},
    {"time": "21:00", "label": "Aksam", "icon": "moon", "type": "Conversation Starter / Video",
     "desc": "En yuksek 'unregretted user-seconds'. Uzun scroll, bookmark, video izleme."},
]

WEEKEND_SLOTS = [
    {"time": "10:00", "label": "Sabah", "icon": "sun", "type": "Deger / Egitim / Meme",
     "desc": "Hafta sonu insanlar gec uyaniyor, 1 saat kaydirildi."},
    {"time": "13:30", "label": "Ogle", "icon": "utensils", "type": "Soru / Poll",
     "desc": "Brunch sonrasi scroll zamani."},
    {"time": "17:30", "label": "Aksamustu", "icon": "sunset", "type": "Opinion (kisa & punchy)",
     "desc": "Hafta sonu aksamustu daha rahat engagement."},
    {"time": "21:30", "label": "Aksam", "icon": "moon", "type": "Conversation Starter / Video",
     "desc": "Hafta sonu aksam en uzun scroll sureleri."},
]

ALGORITHM_CHECKLIST = [
    {"key": "native_media", "label": "Her posta native medya koy (foto/GIF/video/poll)", "impact": "+%50-90 reach"},
    {"key": "self_reply", "label": "Attiktan sonra kendi postuna soruyla reply at", "impact": "Phoenix ranking boost"},
    {"key": "early_engage", "label": "Ilk 5-10 yorumu 30dk icinde cevapla", "impact": "Erken engagement sinyali"},
    {"key": "no_external_link", "label": "External link varsa 1. reply'e koy, ana postta olmasin", "impact": "Link cezasi onleme"},
    {"key": "diversify", "label": "Post turlerini cesitlendir (ayni turden ceza gelir)", "impact": "Diversity bonus"},
    {"key": "check_analytics", "label": "X Analytics: Impressions & Profile visits kontrol", "impact": "Zamanlama optimizasyonu"},
]

POST_TYPES = [
    "Deger / Egitim", "Meme / Eglence", "Soru / Poll", "Opinion (kisa)",
    "Conversation Starter", "Video / Gorsel", "Thread", "Quote Tweet",
]

DAY_NAMES_TR = {
    "Monday": "Pazartesi", "Tuesday": "Sali", "Wednesday": "Carsamba",
    "Thursday": "Persembe", "Friday": "Cuma", "Saturday": "Cumartesi", "Sunday": "Pazar",
}


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


def _get_today_slots():
    now = datetime.datetime.now(TZ_TR)
    is_weekend = now.weekday() >= 5
    return (WEEKEND_SLOTS if is_weekend else WEEKDAY_SLOTS), is_weekend, now


def _get_next_slot(slots, now):
    for slot in slots:
        h, m = map(int, slot["time"].split(":"))
        slot_dt = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if slot_dt > now:
            td = slot_dt - now
            total_sec = int(td.total_seconds())
            hours = total_sec // 3600
            minutes = (total_sec % 3600) // 60
            countdown = f"{hours} saat {minutes} dk" if hours > 0 else f"{minutes} dk"
            return {"time": slot["time"], "label": slot["label"], "countdown": countdown}
    return None


@router.get("/today")
async def get_today_schedule():
    """Bugunun takvimi - slot durumlari, geri sayim, istatistikler"""
    slots, is_weekend, now = _get_today_slots()
    today_str = now.strftime("%Y-%m-%d")
    posting_log = load_posting_log()
    today_logs = [e for e in posting_log if e.get("date") == today_str]
    posted_slots = {e["slot_time"] for e in today_logs}

    day_name = DAY_NAMES_TR.get(now.strftime("%A"), now.strftime("%A"))
    next_slot = _get_next_slot(slots, now)

    enriched_slots = []
    for i, slot in enumerate(slots):
        h, m = map(int, slot["time"].split(":"))
        slot_dt = now.replace(hour=h, minute=m, second=0, microsecond=0)
        is_posted = slot["time"] in posted_slots

        if is_posted:
            status = "posted"
        elif slot_dt <= now and (i == len(slots) - 1 or
              now < now.replace(
                  hour=int(slots[i+1]["time"].split(":")[0]),
                  minute=int(slots[i+1]["time"].split(":")[1]),
                  second=0, microsecond=0)):
            status = "current"
        elif slot_dt > now:
            status = "upcoming"
        else:
            status = "passed"

        log_entry = next((e for e in today_logs if e.get("slot_time") == slot["time"]), None)

        enriched_slots.append({
            **slot,
            "status": status,
            "posted": is_posted,
            "log": log_entry,
        })

    return {
        "date": today_str,
        "day_name": day_name,
        "is_weekend": is_weekend,
        "slots": enriched_slots,
        "next_slot": next_slot,
        "today_posted": len(today_logs),
        "post_types": POST_TYPES,
    }


@router.post("/log")
async def log_post(entry: PostLogEntry):
    """Post kaydini ekle"""
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
    """Gunluk checklist - tanimlar + durum"""
    saved = load_daily_checklist(date)
    items = []
    for item in ALGORITHM_CHECKLIST:
        items.append({
            **item,
            "checked": saved.get(item["key"], False),
        })
    return {"date": date, "items": items}


@router.post("/checklist")
async def update_checklist(update: ChecklistUpdate):
    """Checklist guncelle"""
    save_daily_checklist(update.date, update.items)
    return {"status": "ok"}


@router.get("/weekly-summary")
async def get_weekly_summary():
    """Haftalik ozet - istatistikler, gun dagilimi"""
    now = datetime.datetime.now(TZ_TR)
    week_start = now - datetime.timedelta(days=now.weekday())
    week_start_str = week_start.strftime("%Y-%m-%d")

    posting_log = load_posting_log()
    week_logs = [e for e in posting_log if e.get("date", "") >= week_start_str]

    total_posts = len(week_logs)
    media_posts = sum(1 for e in week_logs if e.get("has_media"))
    reply_posts = sum(1 for e in week_logs if e.get("self_reply"))

    # Type distribution
    from collections import Counter
    type_counts = Counter(e.get("post_type", "Bilinmeyen") for e in week_logs)
    top_types = [{"type": t, "count": c} for t, c in type_counts.most_common(5)]

    # Day breakdown
    days_data = {}
    for entry in week_logs:
        day = entry.get("date", "")
        if day not in days_data:
            days_data[day] = {"count": 0, "media": 0, "reply": 0, "types": []}
        days_data[day]["count"] += 1
        if entry.get("has_media"):
            days_data[day]["media"] += 1
        if entry.get("self_reply"):
            days_data[day]["reply"] += 1
        if entry.get("post_type"):
            days_data[day]["types"].append(entry["post_type"])

    day_breakdown = []
    for day in sorted(days_data.keys(), reverse=True):
        d = days_data[day]
        try:
            day_dt = datetime.datetime.strptime(day, "%Y-%m-%d")
            day_name = DAY_NAMES_TR.get(day_dt.strftime("%A"), day_dt.strftime("%A"))
        except ValueError:
            day_name = day
        day_breakdown.append({
            "date": day,
            "day_name": day_name,
            "count": d["count"],
            "media": d["media"],
            "reply": d["reply"],
        })

    return {
        "total_posts": total_posts,
        "media_posts": media_posts,
        "media_pct": int(media_posts / total_posts * 100) if total_posts > 0 else 0,
        "reply_posts": reply_posts,
        "reply_pct": int(reply_posts / total_posts * 100) if total_posts > 0 else 0,
        "active_days": len(days_data),
        "top_types": top_types,
        "day_breakdown": day_breakdown,
    }


@router.get("/history")
async def get_post_history(limit: int = 30):
    """Son paylasim kayitlari"""
    posting_log = load_posting_log()
    return {"entries": posting_log[:limit], "total": len(posting_log)}
