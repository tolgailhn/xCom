"""
Writing Style Manager Module
Manages writing style profiles, sample tweets, and custom personas
"""
import json
import os
import datetime
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

# data/ is at project root (two levels up from backend/modules/)
DATA_DIR = Path(__file__).parent.parent.parent / "data"
TZ_TR = ZoneInfo("Europe/Istanbul")


def _atomic_write(path: Path, data, *, is_text: bool = False, default=None):
    """Atomik dosya yazma — geçici dosyaya yaz, sonra os.replace ile rename.

    Race condition'ları önler: iki eşzamanlı yazma birbirini bozmaz.
    """
    os.makedirs(path.parent, exist_ok=True)
    if is_text:
        content = data
    else:
        content = json.dumps(data, ensure_ascii=False, indent=2, default=default)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def load_user_samples() -> list[str]:
    """Load user's sample tweets from file"""
    path = DATA_DIR / "user_samples.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_user_samples(samples: list[str]):
    """Save user's sample tweets to file"""
    _atomic_write(DATA_DIR / "user_samples.json", samples)


def load_custom_persona() -> str:
    """Load custom persona/style analysis"""
    path = DATA_DIR / "custom_persona.txt"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def save_custom_persona(persona: str):
    """Save custom persona/style analysis"""
    _atomic_write(DATA_DIR / "custom_persona.txt", persona, is_text=True)


def load_monitored_accounts() -> list[str]:
    """Load custom monitored accounts"""
    path = DATA_DIR / "monitored_accounts.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_monitored_accounts(accounts: list[str]):
    """Save custom monitored accounts"""
    _atomic_write(DATA_DIR / "monitored_accounts.json", accounts)


def load_reply_accounts() -> list[str]:
    """Load accounts list for quick reply feature"""
    path = DATA_DIR / "reply_accounts.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return DEFAULT_REPLY_ACCOUNTS.copy()


def save_reply_accounts(accounts: list[str]):
    """Save accounts list for quick reply feature"""
    _atomic_write(DATA_DIR / "reply_accounts.json", accounts)


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
    _atomic_write(DATA_DIR / "post_history.json", history)


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
    _atomic_write(DATA_DIR / "drafts.json", drafts)


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
    _atomic_write(path, existing)


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
        _atomic_write(DATA_DIR / "follower_suggestions.json", data)


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
    _atomic_write(DATA_DIR / "posting_log.json", log)


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
    _atomic_write(DATA_DIR / "scheduled_posts.json", posts)


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
    _atomic_write(DATA_DIR / "tweet_metrics.json", metrics)


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

    _atomic_write(path, data)


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
        "max_replies_per_hour": 10,
        "min_likes_to_reply": 0,
        "only_original_tweets": True,
        "language": "tr",
        "draft_only": True,
        "publish_mode": "draft",
        "daily_max_replies": 50,
        "work_hour_start": 9,
        "work_hour_end": 23,
    }


def save_auto_reply_config(config: dict):
    """Save auto-reply configuration"""
    _atomic_write(DATA_DIR / "auto_reply_config.json", config)


def load_auto_reply_logs() -> list[dict]:
    """Load auto-reply logs (newest first)"""
    path = DATA_DIR / "auto_reply_logs.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_auto_reply_logs(logs: list[dict]):
    """Save auto-reply logs"""
    _atomic_write(DATA_DIR / "auto_reply_logs.json", logs)


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
    seen_list = sorted(seen, key=lambda x: int(x) if str(x).isdigit() else 0)[-1000:]
    _atomic_write(DATA_DIR / "auto_reply_seen.json", seen_list)


# ── Auto-Reply Queue (pipeline: scan → queue → generate) ──
def load_auto_reply_queue() -> list[dict]:
    """Load auto-reply tweet queue"""
    path = DATA_DIR / "auto_reply_queue.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_auto_reply_queue(queue: list[dict]):
    """Save auto-reply tweet queue"""
    _atomic_write(DATA_DIR / "auto_reply_queue.json", queue)


def add_to_auto_reply_queue(entry: dict) -> dict:
    """Add a tweet candidate to the reply queue. Returns entry with queued_at."""
    queue = load_auto_reply_queue()
    # Duplicate check
    existing_ids = {item.get("tweet_id") for item in queue}
    if entry.get("tweet_id") in existing_ids:
        return entry
    entry["queued_at"] = datetime.datetime.now(TZ_TR).isoformat()
    entry.setdefault("status", "pending")
    entry.setdefault("reply_text", None)
    entry.setdefault("processed_at", None)
    queue.insert(0, entry)
    # Cap at 100 pending items
    pending = [q for q in queue if q.get("status") == "pending"]
    if len(pending) > 100:
        # Drop lowest engagement_score pending items
        pending.sort(key=lambda x: x.get("engagement_score", 0))
        drop_ids = {p["tweet_id"] for p in pending[:-100]}
        queue = [q for q in queue if q.get("tweet_id") not in drop_ids]
    save_auto_reply_queue(queue)
    return entry


def update_auto_reply_queue_entry(tweet_id: str, updates: dict):
    """Update a queue entry by tweet_id."""
    queue = load_auto_reply_queue()
    for item in queue:
        if item.get("tweet_id") == tweet_id:
            item.update(updates)
            break
    save_auto_reply_queue(queue)


def cleanup_auto_reply_queue():
    """Remove expired (6h+) and processed (24h+) entries."""
    queue = load_auto_reply_queue()
    if not queue:
        return
    now = datetime.datetime.now(TZ_TR)
    cleaned = []
    for item in queue:
        try:
            queued = datetime.datetime.fromisoformat(item.get("queued_at", ""))
            if queued.tzinfo is None:
                queued = queued.replace(tzinfo=TZ_TR)
            age_hours = (now - queued).total_seconds() / 3600
        except (ValueError, TypeError):
            age_hours = 999
        status = item.get("status", "pending")
        # Expire old pending items (6h)
        if status == "pending" and age_hours > 6:
            continue
        # Remove old done/failed items (24h)
        if status in ("done", "failed") and age_hours > 24:
            continue
        cleaned.append(item)
    if len(cleaned) != len(queue):
        save_auto_reply_queue(cleaned)


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
    _atomic_write(DATA_DIR / "prompt_templates.json", templates)


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
        "replies_per_tweet": 1,
        "reply_interval_minutes": 0,
        "min_tweet_age_minutes": 2,
        "max_tweet_age_days": 1,
        "style": "samimi",
        "draft_only": False,
        "work_hour_start": 9,
        "work_hour_end": 23,
    }


def save_self_reply_config(config: dict):
    """Save self-reply automation configuration"""
    _atomic_write(DATA_DIR / "self_reply_config.json", config)


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
    # Prune entries older than 2 days (sadece bugunun tweetlerine reply atiyoruz)
    cutoff = (datetime.datetime.now(TZ_TR) - datetime.timedelta(days=2)).isoformat()
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
    _atomic_write(path, pruned)


def load_self_reply_logs() -> list[dict]:
    """Load self-reply logs (newest first)"""
    path = DATA_DIR / "self_reply_logs.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_self_reply_logs(logs: list[dict]):
    """Save self-reply logs"""
    _atomic_write(DATA_DIR / "self_reply_logs.json", logs)


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
        "excluded_accounts": [],
        "check_interval_hours": 2,
        "work_hour_start": 8,
        "work_hour_end": 23,
    }


def save_discovery_config(config: dict):
    """Save discovery configuration"""
    _atomic_write(DATA_DIR / "discovery_config.json", config)


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
    _atomic_write(DATA_DIR / "discovery_cache.json", cache, default=str)


def load_discovery_seen() -> set:
    """Load set of already-seen discovery tweet IDs"""
    path = DATA_DIR / "discovery_seen.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_discovery_seen(seen: set):
    """Save set of already-seen discovery tweet IDs (keep last 5000)"""
    seen_list = list(seen)[-5000:]
    _atomic_write(DATA_DIR / "discovery_seen.json", seen_list)


def load_discovery_rotation() -> dict:
    """Load discovery rotation state (hangi hesap en son ne zaman tarandı)"""
    path = DATA_DIR / "discovery_rotation.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"last_scanned": {}, "batch_index": 0}


def save_discovery_rotation(rotation: dict):
    """Save discovery rotation state"""
    _atomic_write(DATA_DIR / "discovery_rotation.json", rotation)


# --- Auto-Scan Cache (Faz 3: Otomatik konu taraması) ---

def load_auto_scan_cache() -> list[dict]:
    """Load auto-scan topic cache (otomatik konu taraması sonuçları)"""
    path = DATA_DIR / "auto_scan_cache.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_auto_scan_cache(cache: list[dict]):
    """Save auto-scan topic cache (max 200 items, 48h retention)"""
    now = datetime.datetime.now(TZ_TR)
    cutoff = now - datetime.timedelta(hours=48)
    # Purge old entries
    fresh = [
        t for t in cache
        if t.get("scanned_at", "") > cutoff.isoformat()
    ]
    # Keep max 200
    fresh = sorted(fresh, key=lambda x: x.get("engagement_score", 0), reverse=True)[:200]
    _atomic_write(DATA_DIR / "auto_scan_cache.json", fresh, default=str)


# --- Trend Cache (Faz 4: Trend tespiti) ---

def load_trend_cache() -> dict:
    """Load trend analysis cache (keyword frequency, trending topics)"""
    path = DATA_DIR / "trend_cache.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"trends": [], "last_updated": "", "keyword_counts": {}}


def save_trend_cache(cache: dict):
    """Save trend analysis cache"""
    _atomic_write(DATA_DIR / "trend_cache.json", cache, default=str)


# --- News Cache (Faz 7: Haber kaynağı taraması) ---

def load_news_cache() -> list[dict]:
    """Load web news scan cache"""
    path = DATA_DIR / "news_cache.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_news_cache(cache: list[dict]):
    """Save web news scan cache (max 100 items, 72h retention)"""
    now = datetime.datetime.now(TZ_TR)
    cutoff = now - datetime.timedelta(hours=72)
    fresh = [n for n in cache if n.get("found_at", "") > cutoff.isoformat()]
    fresh = sorted(fresh, key=lambda x: x.get("found_at", ""), reverse=True)[:100]
    _atomic_write(DATA_DIR / "news_cache.json", fresh, default=str)


# --- Suggested Accounts (Faz 9: Dinamik hesap keşfi) ---

def load_suggested_accounts() -> list[dict]:
    """Load auto-suggested accounts (high-engagement but not in discovery list)"""
    path = DATA_DIR / "suggested_accounts.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_suggested_accounts(accounts: list[dict]):
    """Save suggested accounts (max 50)"""
    # Keep top 50 by score
    accounts = sorted(accounts, key=lambda x: x.get("score", 0), reverse=True)[:50]
    _atomic_write(DATA_DIR / "suggested_accounts.json", accounts, default=str)


# --- Clustered Suggestions (Konu bazlı kümelenmiş öneriler) ---

def load_clustered_suggestions() -> dict:
    """Load AI-clustered smart suggestions cache"""
    path = DATA_DIR / "clustered_suggestions.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_clustered_suggestions(data: dict):
    """Save clustered suggestions cache"""
    _atomic_write(DATA_DIR / "clustered_suggestions.json", data, default=str)


# --- Trend History (Gün bazlı trend geçmişi) ---

def load_trend_history() -> list[dict]:
    """Load trend analysis history (son 7 gün)"""
    path = DATA_DIR / "trend_history.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_trend_history(history: list[dict]):
    """Save trend history (max 7 days)"""
    now = datetime.datetime.now(TZ_TR)
    cutoff = (now - datetime.timedelta(days=7)).isoformat()
    # Keep only last 7 days
    fresh = [h for h in history if h.get("analysis_date", "") > cutoff]
    # Max 50 entries
    fresh = fresh[:50]
    _atomic_write(DATA_DIR / "trend_history.json", fresh, default=str)


# ── Shared Discovery Tweets ────────────────────────────

def load_shared_discovery_tweets() -> list:
    """Load list of shared discovery tweet IDs."""
    path = DATA_DIR / "shared_discovery_tweets.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return []


def save_shared_discovery_tweets(data: list):
    """Save shared discovery tweets"""
    _atomic_write(DATA_DIR / "shared_discovery_tweets.json", data)


def mark_discovery_tweet_shared(tweet_id: str) -> list:
    """Mark a discovery tweet as shared. Returns updated list."""
    data = load_shared_discovery_tweets()
    # Check if already shared
    if any(d.get("tweet_id") == tweet_id for d in data):
        return data
    data.append({
        "tweet_id": tweet_id,
        "shared_at": datetime.datetime.now().isoformat(),
    })
    save_shared_discovery_tweets(data)
    return data


def unmark_discovery_tweet_shared(tweet_id: str) -> list:
    """Unmark a discovery tweet as shared. Returns updated list."""
    data = load_shared_discovery_tweets()
    data = [d for d in data if d.get("tweet_id") != tweet_id]
    save_shared_discovery_tweets(data)
    return data


# ── Daily Snapshots (Günlük Arşiv) ────────────────────────

SNAPSHOT_DIR = DATA_DIR / "daily_snapshots"


def save_daily_snapshot(date_str: str, suggestions: list, trends: list, tweets: list):
    """Belirli bir günün verilerini arşivle (aynı gün için günceller)."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "date": date_str,
        "updated_at": datetime.datetime.now(TZ_TR).isoformat(),
        "suggestions": suggestions,
        "trends": trends,
        "tweets": tweets,
    }
    _atomic_write(SNAPSHOT_DIR / f"{date_str}.json", snapshot, default=str)


def load_daily_snapshot(date_str: str) -> dict | None:
    """Belirli bir günün arşivini oku. Yoksa None."""
    path = SNAPSHOT_DIR / f"{date_str}.json"
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def list_snapshot_dates() -> list[str]:
    """Mevcut arşiv tarihlerini döndür (yeniden eskiye)."""
    if not SNAPSHOT_DIR.exists():
        return []
    dates = [f.stem for f in SNAPSHOT_DIR.glob("*.json") if len(f.stem) == 10]
    return sorted(dates, reverse=True)


def cleanup_old_snapshots(max_days: int = 7):
    """max_days'den eski arşivleri sil."""
    if not SNAPSHOT_DIR.exists():
        return
    cutoff = (datetime.datetime.now(TZ_TR) - datetime.timedelta(days=max_days)).strftime("%Y-%m-%d")
    for f in SNAPSHOT_DIR.glob("*.json"):
        if len(f.stem) == 10 and f.stem < cutoff:
            f.unlink(missing_ok=True)
