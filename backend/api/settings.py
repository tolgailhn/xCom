"""
Settings API - API anahtarlari ve yapilandirma
"""
from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import get_settings

router = APIRouter()


class APIStatus(BaseModel):
    minimax: bool
    anthropic: bool
    openai: bool
    xai: bool
    twitter: bool
    telegram: bool


class UpdateKeyRequest(BaseModel):
    key: str
    value: str


@router.get("/status", response_model=APIStatus)
async def get_api_status():
    """API anahtarlarinin durumunu kontrol et"""
    s = get_settings()
    return APIStatus(
        minimax=bool(s.minimax_api_key),
        anthropic=bool(s.anthropic_api_key),
        openai=bool(s.openai_api_key),
        xai=bool(s.xai_api_key),
        twitter=bool(s.twitter_bearer_token),
        telegram=bool(s.telegram_bot_token and s.telegram_chat_id),
    )


@router.post("/update-key")
async def update_api_key(request: UpdateKeyRequest):
    """API anahtarini guncelle (.env dosyasina yazar)"""
    from pathlib import Path

    env_path = Path(__file__).parent.parent.parent / ".env"

    # Read existing .env
    lines = []
    key_found = False
    if env_path.exists():
        with open(env_path, "r") as f:
            for line in f:
                if line.strip().startswith(f"{request.key}="):
                    lines.append(f"{request.key}={request.value}\n")
                    key_found = True
                else:
                    lines.append(line)

    if not key_found:
        lines.append(f"{request.key}={request.value}\n")

    with open(env_path, "w") as f:
        f.writelines(lines)

    # Clear settings cache
    get_settings.cache_clear()

    return {"status": "ok", "key": request.key}
