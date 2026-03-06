"""
Generator API - Tweet/thread uretimi, arastirma, scoring, media, fact-check
"""
import asyncio
import json
import logging
import queue
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
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
            parts = await asyncio.to_thread(
                generator.generate_thread,
                topic_text=request.topic,
                style=request.style,
                additional_context=request.research_context,
            )
            full_text = "\n\n---\n\n".join(parts) if parts else ""
            return GenerateResponse(text=full_text, thread_parts=parts or [], score=_score_text(full_text))
        else:
            text = await asyncio.to_thread(
                generator.generate_tweet,
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
        text = await asyncio.to_thread(
            generator.generate_long_content,
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
        # Build AI client (optional - needed for agentic mode)
        ai_client = None
        ai_model = None
        ai_provider = "minimax"
        try:
            from backend.api.helpers import get_ai_provider
            ai_provider, api_key, ai_model = get_ai_provider()
            if ai_provider == "anthropic":
                import anthropic
                ai_client = anthropic.Anthropic(api_key=api_key)
            elif ai_provider in ("openai", "minimax"):
                from openai import OpenAI
                base_url = "https://api.minimaxi.chat/v1" if ai_provider == "minimax" else None
                ai_client = OpenAI(api_key=api_key, base_url=base_url)
        except Exception:
            pass  # AI client is optional, research can work without it

        # Grok research (only when engine is explicitly grok)
        if request.engine == "grok":
            try:
                from backend.modules.grok_client import grok_agentic_research
                from backend.config import get_settings
                s = get_settings()
                if s.xai_api_key:
                    summary = await asyncio.to_thread(
                        grok_agentic_research,
                        tweet_text=request.topic,
                        api_key=s.xai_api_key,
                    )
                    if summary:
                        lines = [l.strip() for l in summary.split("\n") if l.strip()]
                        key_points = [l.lstrip("•-* ") for l in lines[1:]
                                      if l.startswith(("•", "-", "*", "1", "2", "3", "4", "5"))]
                        return ResearchResponse(
                            summary=summary,
                            key_points=key_points[:10],
                            sources=[],
                            media_urls=[],
                        )
            except Exception as e:
                logger.warning("Grok research failed: %s", e)
                # Fall through to DuckDuckGo

        # DuckDuckGo / standard research (run in thread to avoid blocking event loop)
        from backend.modules.deep_research import research_topic as do_research

        result = await asyncio.to_thread(
            do_research,
            tweet_text=request.topic,
            engine=request.engine if request.engine != "default" else "standard",
            use_agentic=request.agentic,
            ai_client=ai_client,
            ai_model=ai_model,
            ai_provider=ai_provider,
        )

        # ResearchResult dataclass -> ResearchResponse
        if hasattr(result, "summary"):
            summary = result.synthesized_brief or result.summary or ""

            # Build key_points from web_results
            key_points = []
            for wr in getattr(result, "web_results", [])[:5]:
                title = wr.get("title", "")
                body = wr.get("body", "")
                if title:
                    key_points.append(f"{title}: {body[:100]}" if body else title)

            # Build sources from deep_articles
            sources = []
            for art in getattr(result, "deep_articles", [])[:5]:
                sources.append({
                    "title": art.get("title", ""),
                    "url": art.get("url", ""),
                    "body": art.get("content", "")[:200] if art.get("content") else "",
                })

            return ResearchResponse(
                summary=summary,
                key_points=key_points,
                sources=sources,
                media_urls=getattr(result, "media_urls", []) or [],
            )

        return ResearchResponse(summary=str(result), key_points=[], sources=[])

    except Exception as e:
        logger.exception("Research endpoint error")
        raise HTTPException(status_code=500, detail=str(e))


# ── Research Stream (SSE) ──────────────────────────────

@router.post("/research-stream")
async def research_stream(request: ResearchRequest):
    """Arastirma yap ve asamalari canli olarak stream et (SSE)"""
    progress_queue: queue.Queue = queue.Queue()

    def progress_callback(msg: str):
        progress_queue.put(msg)

    def _run_research():
        """Run research in thread, returns ResearchResult or dict."""
        # Build AI client
        ai_client = None
        ai_model = None
        ai_provider = "minimax"
        try:
            from backend.api.helpers import get_ai_provider
            ai_provider, api_key, ai_model = get_ai_provider()
            if ai_provider == "anthropic":
                import anthropic
                ai_client = anthropic.Anthropic(api_key=api_key)
            elif ai_provider in ("openai", "minimax"):
                from openai import OpenAI
                base_url = "https://api.minimaxi.chat/v1" if ai_provider == "minimax" else None
                ai_client = OpenAI(api_key=api_key, base_url=base_url)
        except Exception:
            pass

        # Grok path
        if request.engine == "grok":
            try:
                from backend.modules.grok_client import grok_agentic_research
                from backend.config import get_settings
                s = get_settings()
                if s.xai_api_key:
                    progress_callback("Grok ile arastirma baslatiliyor...")
                    summary = grok_agentic_research(
                        tweet_text=request.topic,
                        api_key=s.xai_api_key,
                        progress_callback=progress_callback,
                    )
                    if summary:
                        return {"_type": "grok", "summary": summary}
            except Exception as e:
                progress_callback(f"Grok hatasi, DuckDuckGo'ya geciliyor: {e}")

        # DuckDuckGo / standard
        from backend.modules.deep_research import research_topic as do_research
        return do_research(
            tweet_text=request.topic,
            engine=request.engine if request.engine != "default" else "standard",
            use_agentic=request.agentic,
            ai_client=ai_client,
            ai_model=ai_model,
            ai_provider=ai_provider,
            progress_callback=progress_callback,
        )

    async def event_generator():
        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, _run_research)

        while not future.done():
            try:
                msg = progress_queue.get(timeout=0.3)
                yield f"data: {json.dumps({'type': 'progress', 'message': msg}, ensure_ascii=False)}\n\n"
            except queue.Empty:
                pass

        # Drain remaining progress messages
        while not progress_queue.empty():
            msg = progress_queue.get_nowait()
            yield f"data: {json.dumps({'type': 'progress', 'message': msg}, ensure_ascii=False)}\n\n"

        # Get result
        try:
            result = future.result()

            if isinstance(result, dict) and result.get("_type") == "grok":
                summary = result["summary"]
                lines = [l.strip() for l in summary.split("\n") if l.strip()]
                key_points = [l.lstrip("•-* ") for l in lines[1:]
                              if l.startswith(("•", "-", "*", "1", "2", "3", "4", "5"))]
                data = {
                    "summary": summary,
                    "key_points": key_points[:10],
                    "sources": [],
                    "media_urls": [],
                }
            elif hasattr(result, "summary"):
                summary = result.synthesized_brief or result.summary or ""
                key_points = []
                for wr in getattr(result, "web_results", [])[:5]:
                    title = wr.get("title", "")
                    body = wr.get("body", "")
                    if title:
                        key_points.append(f"{title}: {body[:100]}" if body else title)
                sources = []
                for art in getattr(result, "deep_articles", [])[:5]:
                    sources.append({
                        "title": art.get("title", ""),
                        "url": art.get("url", ""),
                        "body": art.get("content", "")[:200] if art.get("content") else "",
                    })
                data = {
                    "summary": summary,
                    "key_points": key_points,
                    "sources": sources,
                    "media_urls": getattr(result, "media_urls", []) or [],
                }
            else:
                data = {"summary": str(result), "key_points": [], "sources": [], "media_urls": []}

            yield f"data: {json.dumps({'type': 'result', 'data': data}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.exception("Research stream error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── Score ───────────────────────────────────────────────

@router.post("/score")
async def score_tweet_endpoint(request: ScoreRequest):
    """Tweet'i puanla"""
    return _score_text(request.text)


# ── Media Finder ────────────────────────────────────────

@router.post("/find-media")
async def find_media_endpoint(request: MediaRequest):
    """Konuyla ilgili gorsel/video bul"""
    try:
        from backend.modules.media_finder import find_media as do_find_media

        # Get twikit client for X search
        twikit_client = None
        if request.source in ("x", "both"):
            try:
                from backend.modules.twikit_client import TwikitSearchClient
                twikit_client = TwikitSearchClient()
                if not twikit_client.authenticate():
                    twikit_client = None
            except Exception:
                pass

        source_map = {"both": "all", "x": "x", "web": "web"}
        search_result = await asyncio.to_thread(
            do_find_media,
            topic_text=request.topic,
            source=source_map.get(request.source, request.source),
            twikit_client=twikit_client,
        )

        # Convert MediaItem dataclasses to dicts
        results = []
        for item in search_result.images + search_result.videos:
            results.append({
                "url": item.url,
                "thumbnail_url": item.thumbnail_url,
                "source": item.source,
                "media_type": item.media_type,
                "title": item.title,
                "source_url": item.source_url,
                "author": item.author,
            })

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

        claims = await asyncio.to_thread(
            ai_fact_check_draft,
            draft_tweet=request.text,
            original_tweet=request.topic,
            research_context="",
            ai_client=ai_client,
            ai_model=model,
            provider=provider,
        )
        if not claims:
            return {"verified": True, "claims": [], "context": "Dogrulanacak iddia bulunamadi."}

        verifications = await asyncio.to_thread(verify_claims, claims)
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

        topics = await asyncio.to_thread(
            discover_topics,
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
