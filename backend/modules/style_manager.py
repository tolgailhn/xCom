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
    "hrrcnes", "efecim1sn", "XCodeWraith", "merak_makinesi",
    "umutcanbostanci", "demirbulbuloglu", "runthistown5416", "parsluci",
    "ErenAILab", "mentalist_ai", "acerionsjournal", "emrullahai",
    "sarpstar", "AlicanKiraz0", "AIMevzulari", "alphanmanas",
    "AytuncYildizli", "erhanmeydan", "ismailgunaydinn", "GokBoraYlmz",
    "ariferol01", "UfukDegen", "0xemrey", "FlowRiderMM",
    "vibeeval", "onur_a61", "alarax", "yigitakinkaya",
    "Rucknettin", "turkiyeai", "canlandirdik", "pusholder",
    "futuristufuk", "AI4Turkey", "1muhammedavci", "mysancaktutan",
    "bedriozyurt", "devburaq",
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


# --- Scheduled Posts ---

def load_scheduled_posts() -> list[dict]:
    """Load scheduled posts (pending + completed)"""
    path = DATA_DIR / "scheduled_posts.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_scheduled_posts(posts: list[dict]):
    """Save scheduled posts"""
    path = DATA_DIR / "scheduled_posts.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)


def add_scheduled_post(post: dict) -> dict:
    """Add a new scheduled post, returns the post with generated id"""
    posts = load_scheduled_posts()
    post["id"] = datetime.datetime.now().strftime("%Y%m%d%H%M%S") + f"_{len(posts)}"
    post["status"] = "pending"
    post["created_at"] = datetime.datetime.now(TZ_TR).isoformat()
    posts.insert(0, post)
    save_scheduled_posts(posts)
    return post


def update_scheduled_post(post_id: str, updates: dict):
    """Update a scheduled post by id"""
    posts = load_scheduled_posts()
    for p in posts:
        if p.get("id") == post_id:
            p.update(updates)
            break
    save_scheduled_posts(posts)


def delete_scheduled_post(post_id: str) -> bool:
    """Delete a scheduled post by id"""
    posts = load_scheduled_posts()
    new_posts = [p for p in posts if p.get("id") != post_id]
    if len(new_posts) == len(posts):
        return False
    save_scheduled_posts(new_posts)
    return True


# ── Tweet Metrics (Performans Takibi) ────────────────────────

def load_tweet_metrics() -> list[dict]:
    """Load tracked tweet metrics"""
    path = DATA_DIR / "tweet_metrics.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_tweet_metrics(metrics: list[dict]):
    """Save tweet metrics"""
    path = DATA_DIR / "tweet_metrics.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)


def add_tweet_metric(entry: dict):
    """Add or update a tweet metric entry by tweet_id"""
    metrics = load_tweet_metrics()
    tweet_id = entry.get("tweet_id", "")
    if not tweet_id:
        return

    # Update existing or add new
    for i, m in enumerate(metrics):
        if m.get("tweet_id") == tweet_id:
            metrics[i] = {**m, **entry}
            save_tweet_metrics(metrics)
            return

    metrics.insert(0, entry)
    # Keep last 200
    metrics = metrics[:200]
    save_tweet_metrics(metrics)


def update_tweet_metric(tweet_id: str, updates: dict):
    """Update metrics for a specific tweet_id"""
    metrics = load_tweet_metrics()
    for i, m in enumerate(metrics):
        if m.get("tweet_id") == tweet_id:
            metrics[i] = {**m, **updates}
            save_tweet_metrics(metrics)
            return
    # Not found — create new entry
    metrics.insert(0, {"tweet_id": tweet_id, **updates})
    save_tweet_metrics(metrics)


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


# ── Auto Reply ────────────────────────────────────────────


def load_auto_reply_config() -> dict:
    """Load auto-reply configuration"""
    path = DATA_DIR / "auto_reply_config.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "enabled": False,
        "accounts": [
            "hrrcnes",
            "efecim1sn",
            "XCodeWraith",
            "merak_makinesi",
            "umutcanbostanci",
            "demirbulbuloglu",
            "runthistown5416",
            "parsluci",
            "ErenAILab",
            "mentalist_ai",
            "acerionsjournal",
            "emrullahai",
            "sarpstar",
            "AlicanKiraz0",
            "AIMevzulari",
            "alphanmanas",
            "AytuncYildizli",
            "erhanmeydan",
            "ismailgunaydinn",
            "GokBoraYlmz",
            "ariferol01",
            "UfukDegen",
            "0xemrey",
            "FlowRiderMM",
            "vibeeval",
            "onur_a61",
            "alarax",
            "yigitakinkaya",
            "Rucknettin",
            "turkiyeai",
            "canlandirdik",
            "pusholder",
            "futuristufuk",
            "AI4Turkey",
            "1muhammedavci",
            "mysancaktutan",
            "bedriozyurt",
            "devburaq",
        ],
        "check_interval_minutes": 5,
        "reply_delay_seconds": 60,
        "style": "reply",
        "additional_context": "Her zaman deger katan, bilgilendirici yanitlar yaz. AI konularinda kendi deneyimlerinden bahset. Kisa ve oz tut.",
        "max_replies_per_hour": 3,
        "min_likes_to_reply": 0,
        "only_original_tweets": True,
        "language": "tr",
    }


def save_auto_reply_config(config: dict):
    """Save auto-reply configuration"""
    path = DATA_DIR / "auto_reply_config.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def load_auto_reply_logs() -> list[dict]:
    """Load auto-reply logs (newest first)"""
    path = DATA_DIR / "auto_reply_logs.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_auto_reply_logs(logs: list[dict]):
    """Save auto-reply logs"""
    path = DATA_DIR / "auto_reply_logs.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=2)


def add_auto_reply_log(entry: dict):
    """Add a new auto-reply log entry"""
    logs = load_auto_reply_logs()
    entry["id"] = datetime.datetime.now().strftime("%Y%m%d%H%M%S") + f"_{len(logs)}"
    entry["created_at"] = datetime.datetime.now(TZ_TR).isoformat()
    logs.insert(0, entry)
    # Keep last 500
    logs = logs[:500]
    save_auto_reply_logs(logs)
    return entry


def update_auto_reply_log(log_id: str, updates: dict) -> dict | None:
    """Update a specific auto-reply log entry by ID. Returns updated entry or None."""
    logs = load_auto_reply_logs()
    for log in logs:
        if log.get("id") == log_id:
            log.update(updates)
            save_auto_reply_logs(logs)
            return log
    return None


def load_auto_reply_seen() -> set:
    """Load set of already-replied tweet IDs"""
    path = DATA_DIR / "auto_reply_seen.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_auto_reply_seen(seen: set):
    """Save set of already-replied tweet IDs (keep last 1000 — oldest pruned)"""
    path = DATA_DIR / "auto_reply_seen.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    # Keep last 1000 (newest IDs are largest numerically)
    seen_list = sorted(seen, key=lambda x: int(x) if str(x).isdigit() else 0)[-1000:]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(seen_list, f)


# ── Prompt Templates ───────────────────────────────────
def load_prompt_templates() -> list[dict]:
    """Load saved prompt templates"""
    path = DATA_DIR / "prompt_templates.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_prompt_templates(templates: list[dict]):
    """Save prompt templates"""
    path = DATA_DIR / "prompt_templates.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(templates, f, ensure_ascii=False, indent=2)


def add_prompt_template(template: dict) -> list[dict]:
    """Add a new prompt template. Returns updated list."""
    templates = load_prompt_templates()
    template["id"] = datetime.datetime.now(TZ_TR).strftime("%Y%m%d%H%M%S") + f"_{len(templates)}"
    template["created_at"] = datetime.datetime.now(TZ_TR).isoformat()
    templates.append(template)
    save_prompt_templates(templates)
    return templates


def delete_prompt_template(template_id: str) -> list[dict]:
    """Delete a prompt template by id. Returns updated list."""
    templates = load_prompt_templates()
    templates = [t for t in templates if t.get("id") != template_id]
    save_prompt_templates(templates)
    return templates


# ── Self-Reply Automation ───────────────────────────────


def load_self_reply_config() -> dict:
    """Load self-reply automation configuration"""
    path = DATA_DIR / "self_reply_config.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "enabled": False,
        "username": "",
        "max_daily_tweets": 4,
        "replies_per_tweet": 3,
        "reply_interval_minutes": 15,
        "min_tweet_age_minutes": 30,
        "max_tweet_age_days": 5,
        "style": "samimi",
        "draft_only": False,
        "work_hour_start": 9,
        "work_hour_end": 23,
    }


def save_self_reply_config(config: dict):
    """Save self-reply automation configuration"""
    path = DATA_DIR / "self_reply_config.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def load_self_reply_seen() -> dict:
    """Load self-reply seen data: {tweet_id: {replies_sent, reply_ids, ...}}"""
    path = DATA_DIR / "self_reply_seen.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_self_reply_seen(seen: dict):
    """Save self-reply seen data (keep last 200 entries, prune old ones)"""
    path = DATA_DIR / "self_reply_seen.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    # Prune entries older than 7 days (no longer relevant for self-reply)
    cutoff = (datetime.datetime.now(TZ_TR) - datetime.timedelta(days=7)).isoformat()
    pruned = {
        tid: info for tid, info in seen.items()
        if info.get("last_reply_at", "9999") >= cutoff
    }
    # Also trim by count if still too many
    if len(pruned) > 200:
        sorted_items = sorted(
            pruned.items(),
            key=lambda x: x[1].get("last_reply_at", ""),
            reverse=True,
        )
        pruned = dict(sorted_items[:200])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(pruned, f, ensure_ascii=False, indent=2)


def load_self_reply_logs() -> list[dict]:
    """Load self-reply logs (newest first)"""
    path = DATA_DIR / "self_reply_logs.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_self_reply_logs(logs: list[dict]):
    """Save self-reply logs"""
    path = DATA_DIR / "self_reply_logs.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=2)


def add_self_reply_log(entry: dict):
    """Add a new self-reply log entry"""
    logs = load_self_reply_logs()
    entry["id"] = datetime.datetime.now().strftime("%Y%m%d%H%M%S") + f"_{len(logs)}"
    entry["created_at"] = datetime.datetime.now(TZ_TR).isoformat()
    logs.insert(0, entry)
    logs = logs[:500]
    save_self_reply_logs(logs)
    return entry


# ── Discovery (Hesap Keşif Sistemi) ───────────────────────

DEFAULT_DISCOVERY_ACCOUNTS_PRIORITY = [
    "testingcatalog", "rowancheung", "karpathy", "chrysb",
]

DEFAULT_DISCOVERY_ACCOUNTS_NORMAL = [
    "jeremyphoward", "swyx", "DataChaz", "OfficialLoganK",
    "huggingface", "GoogleDeepMind", "OpenAI", "amasad", "JulienBek",
]


def load_discovery_config() -> dict:
    """Load discovery configuration"""
    path = DATA_DIR / "discovery_config.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "enabled": False,
        "priority_accounts": DEFAULT_DISCOVERY_ACCOUNTS_PRIORITY.copy(),
        "normal_accounts": DEFAULT_DISCOVERY_ACCOUNTS_NORMAL.copy(),
        "check_interval_hours": 2,
        "work_hour_start": 8,
        "work_hour_end": 23,
    }


def save_discovery_config(config: dict):
    """Save discovery configuration"""
    path = DATA_DIR / "discovery_config.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def load_discovery_cache() -> list[dict]:
    """Load cached discovery tweets (sorted by score)"""
    path = DATA_DIR / "discovery_cache.json"
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except (json.JSONDecodeError, ValueError):
            # Bozuk dosya — sifirla
            path.unlink(missing_ok=True)
    return []


def save_discovery_cache(cache: list[dict]):
    """Save discovery cache"""
    path = DATA_DIR / "discovery_cache.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2, default=str)


def load_discovery_seen() -> set:
    """Load set of already-seen discovery tweet IDs"""
    path = DATA_DIR / "discovery_seen.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_discovery_seen(seen: set):
    """Save set of already-seen discovery tweet IDs (keep last 5000)"""
    path = DATA_DIR / "discovery_seen.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    seen_list = list(seen)[-5000:]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(seen_list, f)


def load_discovery_rotation() -> dict:
    """Load discovery rotation state (hangi hesap en son ne zaman tarandı)"""
    path = DATA_DIR / "discovery_rotation.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"last_scanned": {}, "batch_index": 0}


def save_discovery_rotation(rotation: dict):
    """Save discovery rotation state"""
    path = DATA_DIR / "discovery_rotation.json"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rotation, f, ensure_ascii=False, indent=2)
