"""
Application configuration - single source of truth for all settings.
Reads from environment variables or .env file.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_name: str = "X AI Otomasyon"
    app_password: str = ""
    debug: bool = False

    # AI Providers (priority: MiniMax > Anthropic > OpenAI)
    minimax_api_key: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Grok / xAI
    xai_api_key: str = ""

    # Twitter/X API
    twitter_bearer_token: str = ""
    twitter_ct0: str = ""
    twitter_auth_token: str = ""

    # Telegram notifications
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Timezone
    timezone: str = "Europe/Istanbul"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
