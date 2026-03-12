"""
Writing Style Manager Module
Manages writing style profiles, sample tweets, and custom personas
"""
import json
import os
import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# data/ is at project root (two levels up from backend/modules/)
DATA_DIR = Path(__file__).parent.parent.parent / "data"
TZ_TR = ZoneInfo("Europe/Istanbul")


def load_user_samples() -> list[str]:
    """Load user's sample tweets from file"""
    path = DATA_DIR / "user_samples.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_user_samples(samples: list[str]):
    """Save user's sample tweets to file"""
    path = DATA_DIR / "user_samples.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False, indent=2)


def load_custom_persona() -> str:
    """Load custom persona/style analysis"""
    path = DATA_DIR / "custom_persona.txt"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def save_custom_persona(persona: str):
    """Save custom persona/style analysis"""
    path = DATA_DIR / "custom_persona.txt"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(persona)


def load_monitored_accounts() -> list[str]:
    """Load custom monitored accounts"""
    path = DATA_DIR / "monitored_accounts.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_monitored_accounts(accounts: list[str]):
    """Save custom monitored accounts"""
    path = DATA_DIR / "monitored_accounts.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(accounts, f, ensure_ascii=False, indent=2)


def load_reply_accounts() -> list[str]:
    """Load accounts list for quick reply feature"""
    path = DATA_DIR / "reply_accounts.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_REPLY_ACCOUNTS.copy()


def save_reply_accounts(accounts: list[str]):
    """Save accounts list for quick reply feature"""
    path = DATA_DIR / "reply_accounts.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(accounts, f, ensure_ascii=False, indent=2)


# Default AI/Tech accounts for quick reply scanning
DEFAULT_REPLY_ACCOUNTS = [
    # --- AI Companies / Labs ---
    "OpenAI", "AnthropicAI", "GoogleDeepMind", "GoogleAI", "MetaAI",
    "nvidia", "xaborai", "MistralAI", "CohereAI", "StabilityAI",
    "peraborarai_ai", "RunwayML", "HuggaborariFace", "deepaborariseek",
    # --- AI Leaders / Researchers ---
    "sama", "ylecun", "kaborararpathy", "aaborarraswat", "JimFan",
    "DrJimFan", "bindureddy", "svpino", "alexalbert__", "amasad",
    "hardmaru", "AndrewYNg", "emaborarstaque", "FranaborariscaborarRetti",
    "daborarrio_ai", "AravSrinivas", "jasaborarncohen",
    # --- AI Devs / Builders ---
    "swyx", "simonw", "kaborararpathy", "maborarrcabororar", "guillameaborar",
    "hwchase17", "jeaborarffdiaborar", "aaborarrvind", "emaborarad",
    "levaborarshin", "shubroaborar", "chiaborarllel",
    # --- AI News / Analysis ---
    "theaboraraibriaboraref", "aiaborarbreaborarkfast", "TheRundownAI",
    "LiaborarNQiao1", "NateLababorarz",
    # --- Turkish AI Community ---
    "ai_zona", "yapayzekatr",
]

# Clean up template — actual list will be replaced during first save
# The garbled names above are placeholders; we use a cleaner default below
DEFAULT_REPLY_ACCOUNTS = [
    # AI Companies
    "OpenAI", "AnthropicAI", "GoogleDeepMind", "GoogleAI", "MetaAI",
    "nvidia", "xaborai", "MistralAI", "CohereAI", "StabilityAI",
    "RunwayML", "HuggingFace",
    # AI Leaders
    "sama", "ylecun", "karpathy", "JimFan", "DrJimFan",
    "bindureddy", "svpino", "alexalbert__", "amasad", "hardmaru",
    "AndrewYNg", "AravSrinivas",
    # AI Devs / Builders
    "swyx", "simonw", "hwchase17", "emad",
    # AI News
    "TheRundownAI", "AiBreakfast",
    # Turkish AI
    "ai_zona", "yapayzekatr",
]


def load_post_history() -> list[dict]:
    """Load history of posted tweets"""
    path = DATA_DIR / "post_history.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_post_history(history: list[dict]):
    """Save post history"""
    path = DATA_DIR / "post_history.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def add_to_post_history(entry: dict):
    """Add a single entry to post history"""
    history = load_post_history()
    history.insert(0, entry)
    # Keep only last 100 entries
    history = history[:100]
    save_post_history(history)


def load_draft_tweets() -> list[dict]:
    """Load saved draft tweets"""
    path = DATA_DIR / "drafts.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_draft_tweets(drafts: list[dict]):
    """Save draft tweets"""
    path = DATA_DIR / "drafts.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(drafts, f, ensure_ascii=False, indent=2)


def add_draft(text: str, topic: str = "", style: str = ""):
    """Add a draft tweet"""
    drafts = load_draft_tweets()
    drafts.insert(0, {
        "text": text,
        "topic": topic,
        "style": style,
        "created_at": datetime.datetime.now().isoformat(),
    })
    drafts = drafts[:50]  # Keep last 50 drafts
    save_draft_tweets(drafts)


def delete_draft(index: int):
    """Delete a draft by index"""
    drafts = load_draft_tweets()
    if 0 <= index < len(drafts):
        drafts.pop(index)
        save_draft_tweets(drafts)


def save_follower_suggestions(username: str, followers: list[dict]):
    """Save follower suggestions for a target account"""
    path = DATA_DIR / "follower_suggestions.json"
    os.makedirs(DATA_DIR, exist_ok=True)

    existing = load_all_follower_suggestions()
    existing[username.lower()] = {
        "username": username,
        "fetched_at": datetime.datetime.now().isoformat(),
        "followers": followers,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def load_all_follower_suggestions() -> dict:
    """Load all saved follower suggestions"""
    path = DATA_DIR / "follower_suggestions.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def delete_follower_suggestions(username: str):
    """Delete follower suggestions for a target account"""
    data = load_all_follower_suggestions()
    if username.lower() in data:
        del data[username.lower()]
        path = DATA_DIR / "follower_suggestions.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


# --- Posting Schedule & Log ---

def load_posting_log() -> list[dict]:
    """Load posting schedule log (all daily records)"""
    path = DATA_DIR / "posting_log.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_posting_log(log: list[dict]):
    """Save posting schedule log"""
    path = DATA_DIR / "posting_log.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)


def log_scheduled_post(slot_time: str, post_type: str, content: str = "",
                       has_media: bool = False, self_reply: bool = False,
                       tweet_url: str = ""):
    """Log a post for a specific schedule slot"""
    log = load_posting_log()
    now_tr = datetime.datetime.now(TZ_TR)
    today = now_tr.strftime("%Y-%m-%d")

    entry = {
        "date": today,
        "slot_time": slot_time,
        "post_type": post_type,
        "content": content[:280] if content else "",
        "has_media": has_media,
        "self_reply": self_reply,
        "tweet_url": tweet_url,
        "logged_at": now_tr.isoformat(),
    }

    log.insert(0, entry)
    log = log[:500]  # Keep last 500 entries
    save_posting_log(log)
    return entry


def load_daily_checklist(date_str: str = "") -> dict:
    """Load daily algorithm checklist completion"""
    path = DATA_DIR / "daily_checklists.json"
    if not date_str:
        date_str = datetime.datetime.now(TZ_TR).strftime("%Y-%m-%d")
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get(date_str, {})
    return {}


def save_daily_checklist(checklist: dict, date_str: str = ""):
    """Save daily algorithm checklist"""
    path = DATA_DIR / "daily_checklists.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    if not date_str:
        date_str = datetime.datetime.now(TZ_TR).strftime("%Y-%m-%d")

    data = {}
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

    data[date_str] = checklist

    # Keep last 90 days
    if len(data) > 90:
        sorted_dates = sorted(data.keys())
        for old_date in sorted_dates[:-90]:
            del data[old_date]

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
