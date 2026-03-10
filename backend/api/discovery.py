"""
Discovery API — Hesap keşif sistemi endpoint'leri.
Son 24 saatte takip edilen hesapların en iyi tweetlerini listeler,
araştırma ve quote tweet üretimi sağlar.
"""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ──────────────────────────────────────────────

class DiscoveryConfigUpdate(BaseModel):
    enabled: bool = False
    priority_accounts: list[str] = []
    normal_accounts: list[str] = []
    check_interval_hours: int = 2
    work_hour_start: int = 8
    work_hour_end: int = 23


class AddAccountRequest(BaseModel):
    username: str
    is_priority: bool = False


class RemoveAccountRequest(BaseModel):
    username: str


class TriggerScanRequest(BaseModel):
    accounts: list[str] = []  # Boş = tümünü tara


# ── Endpoints ───────────────────────────────────────────

@router.get("/config")
def get_config():
    from backend.modules.style_manager import load_discovery_config
    return {"config": load_discovery_config()}


@router.post("/config")
def update_config(req: DiscoveryConfigUpdate):
    from backend.modules.style_manager import save_discovery_config
    config = req.model_dump()
    # Hesap isimlerini temizle
    config["priority_accounts"] = [
        a.strip().lstrip("@") for a in config["priority_accounts"] if a.strip()
    ]
    config["normal_accounts"] = [
        a.strip().lstrip("@") for a in config["normal_accounts"] if a.strip()
    ]
    save_discovery_config(config)
    return {"success": True, "config": config}


@router.post("/add-account")
def add_account(req: AddAccountRequest):
    from backend.modules.style_manager import load_discovery_config, save_discovery_config
    config = load_discovery_config()
    username = req.username.strip().lstrip("@")
    if not username:
        raise HTTPException(400, "Kullanıcı adı boş olamaz")

    if req.is_priority:
        if username not in config["priority_accounts"]:
            config["priority_accounts"].append(username)
    else:
        if username not in config["normal_accounts"]:
            config["normal_accounts"].append(username)

    save_discovery_config(config)
    return {"success": True, "config": config}


@router.post("/remove-account")
def remove_account(req: RemoveAccountRequest):
    from backend.modules.style_manager import load_discovery_config, save_discovery_config
    config = load_discovery_config()
    username = req.username.strip().lstrip("@")

    config["priority_accounts"] = [a for a in config["priority_accounts"] if a != username]
    config["normal_accounts"] = [a for a in config["normal_accounts"] if a != username]

    save_discovery_config(config)
    return {"success": True, "config": config}


@router.get("/tweets")
def get_tweets():
    """Son 24 saatteki keşfedilmiş tweetleri döndür (sıralı)."""
    from backend.modules.style_manager import load_discovery_cache
    cache = load_discovery_cache()
    return {"tweets": cache, "total": len(cache)}


@router.post("/trigger")
def trigger_scan(req: TriggerScanRequest | None = None):
    """Manuel tarama tetikle. accounts listesi verilirse sadece onları tarar."""
    try:
        from backend.discovery_worker import scan_accounts
        accounts = None
        if req and req.accounts:
            accounts = [a.strip().lstrip("@") for a in req.accounts if a.strip()]
        scan_accounts(force=True, only_accounts=accounts)
        from backend.modules.style_manager import load_discovery_cache
        cache = load_discovery_cache()
        scanned = ", ".join(f"@{a}" for a in accounts) if accounts else "tümü"
        return {
            "success": True,
            "message": f"Tarama tamamlandı ({scanned}) — {len(cache)} tweet",
            "total": len(cache),
        }
    except Exception as e:
        logger.exception("Discovery trigger error")
        raise HTTPException(500, f"Tarama hatası: {str(e)}")


@router.get("/status")
def get_status():
    """Discovery sistemi durumunu döndür (rotasyon bilgisi dahil)."""
    from backend.modules.style_manager import (
        load_discovery_config, load_discovery_cache, load_discovery_rotation,
    )
    import datetime
    from zoneinfo import ZoneInfo

    config = load_discovery_config()
    cache = load_discovery_cache()
    rotation = load_discovery_rotation()
    TZ_TR = ZoneInfo("Europe/Istanbul")

    last_scan = cache[0]["scanned_at"] if cache else None
    now = datetime.datetime.now(TZ_TR)

    # Hesap başına tweet sayısı
    account_counts: dict[str, int] = {}
    for t in cache:
        acc = t.get("account", "")
        account_counts[acc] = account_counts.get(acc, 0) + 1

    # Hesap başına son tarama zamanı
    last_scanned_per_account = rotation.get("last_scanned", {})

    return {
        "enabled": config.get("enabled", False),
        "total_tweets": len(cache),
        "priority_count": len(config.get("priority_accounts", [])),
        "normal_count": len(config.get("normal_accounts", [])),
        "last_scan": last_scan,
        "current_time": now.isoformat(),
        "account_counts": account_counts,
        "last_scanned_per_account": last_scanned_per_account,
        "scan_mode": "batch (30dk, 3 hesap/tur)",
    }


@router.delete("/clear")
def clear_cache():
    """Discovery cache'ini temizle."""
    from backend.modules.style_manager import save_discovery_cache, save_discovery_seen
    save_discovery_cache([])
    save_discovery_seen(set())
    return {"success": True, "message": "Cache temizlendi"}
