"""
Shared helpers for API endpoints.
Provides AI client initialization from config.
"""
from backend.config import get_settings
from backend.modules.content_generator import ContentGenerator
from backend.modules.style_manager import load_custom_persona
from backend.modules.tweet_analyzer import load_all_analyses, build_training_context


def get_ai_provider(preferred: str = "") -> tuple[str, str, str | None]:
    """
    Get the best available AI provider from config.
    If preferred is given and that key exists, use it.
    Otherwise: MiniMax > Groq > OpenAI > Anthropic > Gemini

    Returns: (provider_name, api_key, model_override_or_None)
    """
    s = get_settings()

    providers = {
        "minimax": s.minimax_api_key,
        "gemini": s.gemini_api_key,
        "openai": s.openai_api_key,
        "groq": s.groq_api_key,
        "anthropic": s.anthropic_api_key,
    }

    # Claude Code CLI — no API key needed, uses Max subscription
    if preferred == "claude_code":
        from backend.modules.claude_code_client import is_available
        if is_available():
            return "claude_code", "", None
        # Fall through to auto if CLI not available

    # If user selected a specific provider and key exists
    if preferred and preferred in providers and providers[preferred]:
        return preferred, providers[preferred], None

    # Auto: priority order (MiniMax > Groq > OpenAI > Anthropic > Gemini)
    if s.minimax_api_key:
        return "minimax", s.minimax_api_key, None
    if s.groq_api_key:
        return "groq", s.groq_api_key, None
    if s.openai_api_key:
        return "openai", s.openai_api_key, None
    if s.anthropic_api_key:
        return "anthropic", s.anthropic_api_key, None
    if s.gemini_api_key:
        return "gemini", s.gemini_api_key, None

    raise ValueError("No AI API key configured. Set MINIMAX_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.")


def get_available_providers() -> list[dict]:
    """Return list of available AI providers with their status."""
    s = get_settings()
    providers = []
    if s.minimax_api_key:
        providers.append({"id": "minimax", "name": "MiniMax M2.5", "available": True})
    if s.gemini_api_key:
        providers.append({"id": "gemini", "name": "Gemini 3.1 Flash Lite", "available": True})
    if s.openai_api_key:
        providers.append({"id": "openai", "name": "OpenAI GPT-4o", "available": True})
    if s.groq_api_key:
        providers.append({"id": "groq", "name": "Groq (Llama 3.3 70B)", "available": True})
    if s.anthropic_api_key:
        providers.append({"id": "anthropic", "name": "Anthropic Claude", "available": True})
    # Claude Code CLI — check if available
    try:
        from backend.modules.claude_code_client import is_available
        if is_available():
            providers.append({"id": "claude_code", "name": "Claude Code (Max)", "available": True})
    except Exception:
        pass
    return providers


def _ensure_pool_populated():
    """Pool boşsa analiz dosyalarından otomatik doldur (bir kere)."""
    try:
        from backend.modules.tweet_pool import load_pool, import_from_analyses
        pool = load_pool()
        if not pool.get("pool"):
            # Pool boş — analiz dosyalarından aktar
            results = import_from_analyses(min_engagement=50)
            if results:
                total = sum(r.get("added", 0) for r in results)
                if total > 0:
                    print(f"[Pool] Analiz dosyalarından {total} tweet havuza aktarıldı")
    except Exception:
        pass


def create_generator(topic: str = "", preferred_provider: str = "") -> ContentGenerator:
    """Create a ContentGenerator with config-based provider and training context."""
    provider, api_key, model = get_ai_provider(preferred=preferred_provider)

    # Pool boşsa analiz dosyalarından otomatik doldur
    _ensure_pool_populated()

    # Load persona and training context
    custom_persona = load_custom_persona() or None
    training_context = None
    try:
        analyses = load_all_analyses()
        if analyses:
            training_context = build_training_context(analyses, topic=topic) or None
    except Exception:
        pass

    return ContentGenerator(
        provider=provider,
        api_key=api_key,
        model=model,
        custom_persona=custom_persona,
        training_context=training_context,
    )
