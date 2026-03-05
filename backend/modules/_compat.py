"""
Compatibility layer — replaces Streamlit-specific helpers (get_secret, etc.)
with config-based equivalents for FastAPI.
"""
import os
from backend.config import get_settings


def get_secret(key: str, default: str = "") -> str:
    """Get a secret value from environment or .env config."""
    # First check env vars directly
    env_val = os.environ.get(key, "")
    if env_val:
        return env_val
    # Then check settings
    settings = get_settings()
    return getattr(settings, key, default)
