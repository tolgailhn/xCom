"""
Shared helpers for API endpoints.
Provides AI client initialization from config.
AI Provider: Sadece MiniMax kullanılır. Araştırma için Grok ayrıca mevcut.
"""
from backend.config import get_settings
from backend.modules.content_generator import ContentGenerator
from backend.modules.style_manager import load_custom_persona
from backend.modules.tweet_analyzer import load_all_analyses, build_training_context


def get_ai_provider(preferred: str = "") -> tuple[str, str, str | None]:
    """
    Get MiniMax AI provider from config.
    preferred parametresi artık yok sayılır — her zaman MiniMax döner.

    Returns: (provider_name, api_key, model_override_or_None)
    """
    s = get_settings()

    if not s.minimax_api_key:
        raise ValueError("MiniMax API key yapılandırılmamış. Ayarlar sayfasından MINIMAX_API_KEY girin.")

    return "minimax", s.minimax_api_key, None


def get_ai_client(preferred: str = "") -> tuple:
    """
    Get an OpenAI-compatible MiniMax client + model name.

    Returns: (client, model_name)
    """
    from openai import OpenAI

    provider, api_key, model_override = get_ai_provider(preferred)

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.minimax.io/v1",
    )

    return client, model_override or "MiniMax-M2.5"


def get_available_providers() -> list[dict]:
    """Return list of available AI providers — sadece MiniMax."""
    s = get_settings()
    providers = []
    if s.minimax_api_key:
        providers.append({"id": "minimax", "name": "MiniMax M2.5", "available": True})
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
    """Create a ContentGenerator with config-based MiniMax provider and training context."""
    provider, api_key, model = get_ai_provider()

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
