"""
Generator API - Tweet/thread uretimi, arastirma, scoring, media, fact-check
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


# ── Models ──────────────────────────────────────────────

class GenerateRequest(BaseModel):
    topic: str
    style: str = "samimi"
    length: str = "orta"
    thread: bool = False
    research_context: str = ""
    media_urls: list[str] = []
    content_format: str = ""
    quote_url: str = ""


class GenerateResponse(BaseModel):
    text: str
    thread_parts: list[str] = []
    score: dict | None = None


class ResearchRequest(BaseModel):
    topic: str
    depth: str = "normal"
    engine: str = "default"
    agentic: bool = False


class ResearchResponse(BaseModel):
    summary: str
    key_points: list[str]
    sources: list[dict]
    media_urls: list[str] = []


class ScoreRequest(BaseModel):
    text: str


class MediaRequest(BaseModel):
    topic: str
    source: str = "x"


class FactCheckRequest(BaseModel):
    text: str
    topic: str = ""


class DiscoverRequest(BaseModel):
    focus_area: str = ""
    engine: str = "default"


# ── Style & Format Constants ───────────────────────────

STYLES = [
    {"id": "samimi", "name": "Samimi", "desc": "Dogal, gunluk konusma tonu"},
    {"id": "profesyonel", "name": "Profesyonel", "desc": "Resmi, is dunyasi tonu"},
    {"id": "analitik", "name": "Analitik", "desc": "Veri odakli, teknik analiz"},
    {"id": "esprili", "name": "Esprili", "desc": "Mizahi, espri iceren ton"},
    {"id": "egitici", "name": "Egitici", "desc": "Ogretici, aciklayici ton"},
    {"id": "heyecanli", "name": "Heyecanli", "desc": "Enerji dolu, motive edici"},
    {"id": "minimalist", "name": "Minimalist", "desc": "Az ve oz, vurucu"},
    {"id": "storyteller", "name": "Hikayeci", "desc": "Hikaye anlatici ton"},
]

FORMATS = [
    {"id": "micro", "name": "Micro", "desc": "Tek cumle, vurucu (< 100 kar)"},
    {"id": "punch", "name": "Punch", "desc": "Kisa ve etkili (100-180 kar)"},
    {"id": "spark", "name": "Spark", "desc": "Standart tweet (180-280 kar)"},
    {"id": "storm", "name": "Storm", "desc": "Uzun tweet/note (280-500 kar)"},
    {"id": "thunder", "name": "Thunder", "desc": "Cok uzun post (500-1000 kar)"},
    {"id": "mega", "name": "Mega", "desc": "Maksimum uzunluk (1000+ kar)"},
]

CONTENT_STYLES = [
    {"id": "deneyim", "name": "Kisisel Deneyim", "desc": "Kisisel tecrube paylasimi"},
    {"id": "egitici", "name": "Egitici / Tutorial", "desc": "Ogretici, adim adim anlatim"},
    {"id": "karsilastirma", "name": "Karsilastirma", "desc": "Iki veya daha fazla seyi karsilastirma"},
    {"id": "analiz", "name": "Analiz", "desc": "Derinlemesine teknik analiz"},
    {"id": "hikaye", "name": "Hikaye Anlatimi", "desc": "Hikaye formunda anlatim"},
]


# ── Score Helper ────────────────────────────────────────

def _score_text(text: str) -> dict:
    try:
        from backend.modules.content_generator import score_tweet
        return score_tweet(text)
    except Exception:
        length = len(text)
        has_hook = text[:2] in ("🚨", "⚡", "💡", "🔥", "🧵", "📢") if len(text) >= 2 else False
        has_cta = any(w in text.lower() for w in ["ne dusunuyorsunuz", "sizce", "?", "deneyin"])
        score = min(100, 40 + (10 if 180 <= length <= 280 else 0) +
                    (15 if has_hook else 0) + (15 if has_cta else 0) +
                    (10 if "\n" in text else 0) + (10 if length > 100 else 0))
        return {"score": score, "length": length, "has_hook": has_hook, "has_cta": has_cta}


# ── Generate ────────────────────────────────────────────

@router.post("/tweet", response_model=GenerateResponse)
async def generate_tweet(request: GenerateRequest):
    """Tweet veya thread uret"""
    from backend.api.helpers import create_generator

    try:
        generator = create_generator(topic=request.topic)

        if request.thread:
            parts = generator.generate_thread(
                topic_text=request.topic,
                style=request.style,
                additional_context=request.research_context,
            )
            full_text = "\n\n---\n\n".join(parts) if parts else ""
            return GenerateResponse(text=full_text, thread_parts=parts or [], score=_score_text(full_text))
        else:
            text = generator.generate_tweet(
                topic_text=request.topic,
                style=request.style,
                additional_context=request.research_context,
                content_format=request.content_format,
            )
            return GenerateResponse(text=text, score=_score_text(text))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/long-content", response_model=GenerateResponse)
async def generate_long_content(request: GenerateRequest):
    """Uzun icerik uret"""
    from backend.api.helpers import create_generator

    try:
        generator = create_generator(topic=request.topic)
        text = generator.generate_long_content(
            topic=request.topic,
            research_context=request.research_context,
            style=request.style,
            length=request.length,
        )
        return GenerateResponse(text=text, score=_score_text(text))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Research ────────────────────────────────────────────

@router.post("/research", response_model=ResearchResponse)
async def do_research_endpoint(request: ResearchRequest):
    """Konu hakkinda derin arastirma yap"""
    try:
        from backend.api.helpers import get_ai_provider

        provider, api_key, _ = get_ai_provider()

        # Grok agentic research
        if request.engine == "grok" or request.agentic:
            try:
                from backend.modules.grok_client import grok_research_topic
                from backend.config import get_settings
                s = get_settings()
                if s.xai_api_key:
                    result = grok_research_topic(request.topic)
                    if result:
                        return ResearchResponse(
                            summary=result.get("summary", ""),
                            key_points=result.get("key_points", []),
                            sources=result.get("sources", []),
                            media_urls=result.get("media_urls", []),
                        )
            except Exception:
                pass

        from backend.modules.deep_research import research_topic as do_research
        result = await do_research(topic=request.topic, api_key=api_key, provider=provider)

        if hasattr(result, "summary"):
            return ResearchResponse(
                summary=result.summary or "",
                key_points=result.key_points if hasattr(result, "key_points") else [],
                sources=result.sources if hasattr(result, "sources") else [],
                media_urls=result.media_urls if hasattr(result, "media_urls") else [],
            )
        elif isinstance(result, dict):
            return ResearchResponse(
                summary=result.get("summary", ""),
                key_points=result.get("key_points", []),
                sources=result.get("sources", []),
                media_urls=result.get("media_urls", []),
            )
        return ResearchResponse(summary=str(result), key_points=[], sources=[])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Score ───────────────────────────────────────────────

@router.post("/score")
async def score_tweet_endpoint(request: ScoreRequest):
    """Tweet'i puanla"""
    return _score_text(request.text)


# ── Media Finder ────────────────────────────────────────

@router.post("/find-media")
async def find_media(request: MediaRequest):
    """Konuyla ilgili gorsel/video bul"""
    try:
        from backend.modules.media_finder import MediaFinder
        from backend.config import get_settings

        s = get_settings()
        finder = MediaFinder(
            twikit_username=s.twikit_username,
            twikit_password=s.twikit_password,
            twikit_email=s.twikit_email,
        )

        results = []
        if request.source in ("x", "both"):
            x_results = finder.search_x_media(request.topic)
            results.extend(x_results)

        if request.source in ("web", "both"):
            web_results = finder.search_web_images(request.topic)
            results.extend(web_results)

        return {"media": results[:12], "total": len(results)}

    except Exception as e:
        return {"media": [], "total": 0, "error": str(e)}


# ── Fact Check ──────────────────────────────────────────

@router.post("/fact-check")
async def fact_check(request: FactCheckRequest):
    """Tweet icerigindeki iddialari dogrula"""
    try:
        from backend.modules.deep_research import ai_fact_check_draft, verify_claims, compile_verification_context
        from backend.api.helpers import get_ai_provider

        provider, api_key, _ = get_ai_provider()
        claims = ai_fact_check_draft(request.text, api_key, provider)
        if not claims:
            return {"verified": True, "claims": [], "context": "Dogrulanacak iddia bulunamadi."}

        verifications = verify_claims(claims)
        context = compile_verification_context(verifications)

        return {
            "verified": all(v.get("verified", False) for v in verifications),
            "claims": verifications,
            "context": context,
        }

    except Exception as e:
        return {"verified": False, "claims": [], "context": "", "error": str(e)}


# ── Styles & Formats ───────────────────────────────────

@router.get("/styles")
async def get_styles():
    """Mevcut yazim tarzlari ve format seceneklerini don"""
    return {"styles": STYLES, "formats": FORMATS, "content_styles": CONTENT_STYLES}


# ── Topic Discovery ───────────────────────────────────

@router.post("/discover-topics")
async def discover_topics_endpoint(request: DiscoverRequest):
    """AI ile konu kesfet (trend konular ve icerik onerileri)"""
    try:
        from backend.modules.deep_research import discover_topics
        from backend.api.helpers import get_ai_provider

        provider, api_key, model = get_ai_provider()

        # Build AI client
        ai_client = None
        if provider == "anthropic":
            import anthropic
            ai_client = anthropic.Anthropic(api_key=api_key)
        elif provider in ("openai", "minimax"):
            from openai import OpenAI
            base_url = "https://api.minimaxi.chat/v1" if provider == "minimax" else None
            ai_client = OpenAI(api_key=api_key, base_url=base_url)

        if not ai_client:
            raise HTTPException(status_code=400, detail="AI API anahtari bulunamadi")

        # Try to get scanner for X search
        scanner = None
        try:
            from backend.modules.twitter_scanner import TwitterScanner
            from backend.config import get_settings
            s = get_settings()
            if s.twitter_bearer_token or s.twikit_username or s.twikit_ct0:
                scanner = TwitterScanner(
                    bearer_token=s.twitter_bearer_token,
                    twikit_username=s.twikit_username,
                    twikit_password=s.twikit_password,
                    twikit_email=s.twikit_email,
                )
        except Exception:
            pass

        topics = discover_topics(
            ai_client=ai_client,
            ai_model=model,
            ai_provider=provider,
            scanner=scanner,
            focus_area=request.focus_area,
            engine=request.engine,
        )

        return {"topics": topics or []}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
