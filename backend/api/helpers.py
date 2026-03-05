"""
Shared helpers for API endpoints.
Provides AI client initialization from config.
"""
from backend.config import get_settings
from backend.modules.content_generator import ContentGenerator
from backend.modules.style_manager import load_custom_persona
from backend.modules.tweet_analyzer import load_all_analyses, build_training_context


def get_ai_provider() -> tuple[str, str, str | None]:
    """
    Get the best available AI provider from config.
    Priority: MiniMax > Anthropic > OpenAI

    Returns: (provider_name, api_key, model_override_or_None)
    """
    s = get_settings()

    if s.minimax_api_key:
        return "minimax", s.minimax_api_key, None
    if s.anthropic_api_key:
        return "anthropic", s.anthropic_api_key, None
    if s.openai_api_key:
        return "openai", s.openai_api_key, None

    raise ValueError("No AI API key configured. Set MINIMAX_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.")


def create_generator(topic: str = "") -> ContentGenerator:
    """Create a ContentGenerator with config-based provider and training context."""
    provider, api_key, model = get_ai_provider()

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
