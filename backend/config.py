"""
Application configuration - single source of truth for all settings.
Reads from environment variables or .env file.
"""
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# .env dosyasini once backend/ sonra proje koku (Xcom/) icinde ara
_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_FILE = _BACKEND_DIR / ".env"
if not _ENV_FILE.exists():
    _ENV_FILE = _BACKEND_DIR.parent / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_name: str = "X AI Otomasyon"
    app_password: str = ""
    debug: bool = False

    # AI Providers (priority: MiniMax > Groq > Anthropic > OpenAI)
    minimax_api_key: str = ""
    groq_api_key: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Grok / xAI
    xai_api_key: str = ""

    # Google Gemini (image generation)
    gemini_api_key: str = ""

    # Twitter/X API
    twitter_bearer_token: str = ""
    twitter_api_key: str = ""
    twitter_api_secret: str = ""
    twitter_access_token: str = ""
    twitter_access_secret: str = ""

    # Twitter/X Cookies (twikit)
    twitter_ct0: str = ""
    twitter_auth_token: str = ""
    twikit_auth_token: str = ""
    twikit_ct0: str = ""
    twikit_username: str = ""
    twikit_password: str = ""
    twikit_email: str = ""

    # Telegram notifications
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Timezone
    timezone: str = "Europe/Istanbul"

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
