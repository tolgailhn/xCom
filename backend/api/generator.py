"""
Generator API - Tweet/thread uretimi, arastirma, scoring, media, fact-check
"""
import asyncio
import json
import logging
import queue
import uuid
import time
import re
from fastapi import APIRouter, HTTPException, Query
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
    provider: str = ""  # "", "minimax", "gemini", "openai", "groq", "anthropic" — empty = auto
    additional_instructions: str = ""  # Extra user instructions for generation


class QuoteTweetRequest(BaseModel):
    original_tweet: str
    original_author: str = ""
    style: str = "quote_tweet"
    research_summary: str = ""
    additional_context: str = ""
    length_preference: str = "spark"
    deep_verify: bool = False
    provider: str = ""


class GenerateResponse(BaseModel):
    text: str
    thread_parts: list[str] = []
    score: dict | None = None


class ResearchRequest(BaseModel):
    topic: str
    depth: str = "normal"
    engine: str = "default"
    agentic: bool = True  # AI browses autonomously for best results
    research_sources: list[str] = []  # ["web", "reddit", "news", "x"]
    tweet_id: str = ""  # For thread fetching
    tweet_author: str = ""


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


class ReplyRequest(BaseModel):
    original_tweet: str
    original_author: str = ""
    style: str = "reply"
    additional_context: str = ""
    provider: str = ""
    is_thread: bool = False
    thread_count: int = 1


class SelfReplyRequest(BaseModel):
    my_tweet: str
    reply_number: int = 1
    total_replies: int = 3
    style: str = "samimi"
    additional_context: str = ""
    research_context: str = ""
    provider: str = ""
    previous_replies: list[str] = []


class ImageAnalysisRequest(BaseModel):
    url: str
    context: str = ""


class DiscoverRequest(BaseModel):
    focus_area: str = ""
    engine: str = "default"


class InfographicRequest(BaseModel):
    topic: str
    research_summary: str = ""
    key_points: list[str] = []
    provider: str = ""


# ── Style & Format Constants ───────────────────────────

STYLES = [
    {"id": "auto", "name": "Otomatik", "desc": "Rastgele stil sec"},
    {"id": "samimi", "name": "Samimi / Kisisel", "desc": "Kisisel deneyim odakli, dogal ve samimi"},
    {"id": "profesyonel", "name": "Profesyonel / Bilgilendirici", "desc": "Bilgi odakli, profesyonel ama sicak"},
    {"id": "hook", "name": "Hook / Viral Tarz", "desc": "Guclu acilis, cesur fikirler, viral potansiyeli yuksek"},
    {"id": "analitik", "name": "Analitik / Derinlemesine", "desc": "Derinlemesine analiz, karsilastirma ve tahminler"},
    {"id": "haber", "name": "Haber / Bilgi Paylasimi", "desc": "Detayli AI haber paylasimi — bilgi + kisisel yorum"},
    {"id": "agresif", "name": "Agresif / Enerjik", "desc": "Direkt, enerjik, firsat odakli — guclu ton"},
    {"id": "quote_tweet", "name": "Quote Tweet / Yorum", "desc": "Tweet'e kendi yorumunu ekle, dogal ve samimi"},
    {"id": "tolga", "name": "Tolga Style", "desc": "Gelismeyi detaylariyla aktaran, bilgi yogun, pratik deger sunan format"},
    {"id": "tolga_news", "name": "Tolga News / Haber Analizi", "desc": "Derinlemesine haber analizi — 'asil mesele su' formuluyle etki odakli yazim"},
    {"id": "hurricane", "name": "Hurricane Style", "desc": "Provokasyon, kontrast, kisa-vurucu, konusma dili — viral odakli"},
    {"id": "mentalist", "name": "Mentalist / Dusundurcu", "desc": "Psikolojik derinlik, insan davranisi analizi, dusundurcu bakis"},
    {"id": "sigma", "name": "Sigma / Keskin Gorus", "desc": "Net, filtresiz, bagimsiz dusunce — kalabaligin tersine giden keskin bakis"},
    {"id": "doomer", "name": "Doomer / Elestirmen", "desc": "Realist bakis, abartiyi sonduran, risklere odaklanan elestirel analiz"},
]

FORMATS = [
    {"id": "micro", "name": "Micro — Tek Satir", "desc": "Tek cumle, vurucu fikir (0-140 kar)"},
    {"id": "punch", "name": "Punch — Standart Tweet", "desc": "Standart tweet uzunlugu (140-280 kar)"},
    {"id": "classic", "name": "Classic — Orta Tweet", "desc": "Punch ile Spark arasi, biraz daha detayli (200-400 kar)"},
    {"id": "spark", "name": "Spark — Kisa Hikaye", "desc": "Kisa hikaye, aciklama (400-600 kar)"},
    {"id": "storm", "name": "Storm — Derin Analiz", "desc": "Derin analiz, uzun hikaye (700-1000 kar)"},
    {"id": "thread", "name": "Thread — Seri Anlatim", "desc": "3-5 tweet serisi (her biri max 280 kar)"},
    {"id": "thunder", "name": "Thunder — En Derin", "desc": "En uzun ve detayli format (1200-1500 kar)"},
    {"id": "mega", "name": "Mega — Ultra Detayli", "desc": "En uzun single-post, makale tarzi tweet (1500-2000 kar)"},
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
        result = score_tweet(text)
        # Add legacy keys for frontend compatibility
        result["score"] = result.get("overall", 0)
        result["length"] = result.get("char_count", len(text))
        result["has_hook"] = result.get("hook_score", 0) >= 12
        result["has_cta"] = False
        return result
    except Exception:
        length = len(text)
        has_hook = text[:2] in ("🚨", "⚡", "💡", "🔥", "🧵", "📢") if len(text) >= 2 else False
        has_cta = any(w in text.lower() for w in ["ne dusunuyorsunuz", "sizce", "?", "deneyin"])
        score = min(100, 40 + (10 if 180 <= length <= 280 else 0) +
                    (15 if has_hook else 0) + (15 if has_cta else 0) +
                    (10 if "\n" in text else 0) + (10 if length > 100 else 0))
        return {"score": score, "overall": score, "length": length, "char_count": length, "has_hook": has_hook, "has_cta": has_cta}


# ── Generate ────────────────────────────────────────────

@router.post("/tweet", response_model=GenerateResponse)
async def generate_tweet(request: GenerateRequest):
    """Tweet veya thread uret"""
    from backend.api.helpers import create_generator

    try:
        generator = await asyncio.to_thread(create_generator, request.topic, request.provider)
        logger.info(f"Generating tweet: style={request.style}, provider={generator.provider}, topic={request.topic[:80]}")

        if request.thread:
            parts = await asyncio.wait_for(asyncio.to_thread(
                generator.generate_thread,
                topic_text=request.topic,
                style=request.style,
                additional_context=request.research_context,
            ), timeout=90)
            full_text = "\n\n---\n\n".join(parts) if parts else ""
            if not full_text.strip():
                logger.warning(f"Thread generation returned empty: style={request.style}, provider={generator.provider}")
            return GenerateResponse(text=full_text, thread_parts=parts or [], score=_score_text(full_text))
        else:
            text = await asyncio.wait_for(asyncio.to_thread(
                generator.generate_tweet,
                topic_text=request.topic,
                style=request.style,
                additional_context=request.research_context,
                content_format=request.content_format,
            ), timeout=90)
            if not text or not text.strip():
                logger.warning(f"Tweet generation returned empty: style={request.style}, provider={generator.provider}")
            return GenerateResponse(text=text or "", score=_score_text(text or ""))

    except asyncio.TimeoutError:
        logger.error(f"Tweet generation timeout: style={request.style}")
        raise HTTPException(status_code=504, detail="Tweet uretimi zaman asimina ugradi (90s). Daha kisa format deneyin.")
    except Exception as e:
        logger.error(f"Tweet generation error: style={request.style}, error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quote-tweet", response_model=GenerateResponse)
async def generate_quote_tweet_endpoint(request: QuoteTweetRequest):
    """Quote tweet uret — orijinal tweet + arastirma ile"""
    from backend.api.helpers import create_generator

    try:
        generator = await asyncio.to_thread(create_generator, request.original_tweet, request.provider)

        text = await asyncio.wait_for(asyncio.to_thread(
            generator.generate_quote_tweet,
            original_tweet=request.original_tweet,
            original_author=request.original_author,
            style=request.style,
            additional_context=request.additional_context,
            research_summary=request.research_summary,
            length_preference=request.length_preference,
        ), timeout=90)

        score = _score_text(text)

        # Auto deep verify
        if request.deep_verify and text:
            try:
                from backend.modules.deep_research import (
                    ai_fact_check_draft, verify_claims,
                    compile_verification_context,
                )
                # Use cheapest provider for fact-checking (MiniMax preferred)
                from backend.config import get_settings as _gs
                _s = _gs()
                ai_client = None
                provider = "minimax"
                model = "MiniMax-M2.5"
                if _s.minimax_api_key:
                    from openai import OpenAI
                    ai_client = OpenAI(api_key=_s.minimax_api_key, base_url="https://api.minimaxi.chat/v1")
                elif _s.groq_api_key:
                    from openai import OpenAI
                    ai_client = OpenAI(api_key=_s.groq_api_key, base_url="https://api.groq.com/openai/v1")
                    provider = "groq"
                    model = "llama-3.3-70b-versatile"
                elif _s.openai_api_key:
                    from openai import OpenAI
                    ai_client = OpenAI(api_key=_s.openai_api_key)
                    provider = "openai"
                    model = "gpt-4o"
                elif _s.anthropic_api_key:
                    import anthropic
                    ai_client = anthropic.Anthropic(api_key=_s.anthropic_api_key)
                    provider = "anthropic"
                    model = "claude-haiku-4-5-20251001"

                claims = await asyncio.to_thread(
                    ai_fact_check_draft,
                    draft_tweet=text,
                    original_tweet=request.original_tweet,
                    research_context=request.research_summary,
                    ai_client=ai_client,
                    ai_model=model,
                    provider=provider,
                )
                if claims and not all(c.get("is_clean") for c in ([claims] if isinstance(claims, dict) else claims)):
                    issues = claims if isinstance(claims, list) else claims.get("issues", [])
                    if issues:
                        verified = await asyncio.to_thread(verify_claims, issues)
                        verification_ctx = compile_verification_context(verified)

                        text = await asyncio.to_thread(
                            generator.refine_tweet_with_verification,
                            draft_tweet=text,
                            original_tweet=request.original_tweet,
                            original_author=request.original_author,
                            research_summary=request.research_summary,
                            verification_context=verification_ctx,
                            style=request.style,
                            length_preference=request.length_preference,
                        )
                        score = _score_text(text)
            except Exception as e:
                logger.warning("Deep verify failed: %s", e)

        return GenerateResponse(text=text, score=score)

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Quote tweet uretimi zaman asimina ugradi (90s).")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reply", response_model=GenerateResponse)
async def generate_reply_endpoint(request: ReplyRequest):
    """Reply tweet uret — orijinal tweet'e yanit"""
    from backend.api.helpers import create_generator

    try:
        generator = await asyncio.to_thread(create_generator, request.original_tweet, request.provider)

        text = await asyncio.wait_for(asyncio.to_thread(
            generator.generate_reply,
            original_tweet=request.original_tweet,
            original_author=request.original_author,
            style=request.style,
            additional_context=request.additional_context,
            is_thread=request.is_thread,
            thread_count=request.thread_count,
        ), timeout=90)
        return GenerateResponse(text=text, score=_score_text(text))

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Reply uretimi zaman asimina ugradi (90s).")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/self-reply", response_model=GenerateResponse)
async def generate_self_reply_endpoint(request: SelfReplyRequest):
    """Self-reply uret — kendi tweet'ine devam nitelginde yanit"""
    from backend.api.helpers import create_generator

    try:
        generator = await asyncio.to_thread(create_generator, request.my_tweet, request.provider)

        text = await asyncio.wait_for(asyncio.to_thread(
            generator.generate_self_reply,
            my_tweet=request.my_tweet,
            reply_number=request.reply_number,
            total_replies=request.total_replies,
            style=request.style,
            additional_context=request.additional_context,
            research_context=request.research_context,
            previous_replies=request.previous_replies,
        ), timeout=90)
        return GenerateResponse(text=text, score=_score_text(text))

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Self-reply uretimi zaman asimina ugradi (90s).")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-image")
async def analyze_image_endpoint(request: ImageAnalysisRequest):
    """Gorsel analiz et — AI ile gorsel aciklama uret"""
    from backend.api.helpers import create_generator

    try:
        generator = await asyncio.to_thread(create_generator)

        caption = await asyncio.wait_for(asyncio.to_thread(
            generator.analyze_image,
            image_url=request.url,
            context=request.context,
        ), timeout=30)
        return {"caption": caption, "success": True}

    except asyncio.TimeoutError:
        return {"caption": "", "success": False, "error": "Gorsel analizi zaman asimina ugradi (30s)"}
    except Exception as e:
        return {"caption": "", "success": False, "error": str(e)}


@router.post("/long-content", response_model=GenerateResponse)
async def generate_long_content(request: GenerateRequest):
    """Uzun icerik uret"""
    from backend.api.helpers import create_generator

    try:
        generator = await asyncio.to_thread(create_generator, request.topic, request.provider)

        # Use content_format if provided, otherwise fall back to length
        effective_length = request.content_format or request.length

        # "thread" format → delegate to generate_thread
        if effective_length == "thread":
            parts = await asyncio.wait_for(asyncio.to_thread(
                generator.generate_thread,
                topic_text=request.topic,
                style=request.style,
                additional_context=request.research_context,
            ), timeout=120)
            full_text = "\n\n---\n\n".join(parts) if parts else ""
            return GenerateResponse(text=full_text, thread_parts=parts or [], score=_score_text(full_text))

        text = await asyncio.wait_for(asyncio.to_thread(
            generator.generate_long_content,
            topic=request.topic,
            research_context=request.research_context,
            style=request.style,
            length=effective_length,
            additional_instructions=request.additional_instructions,
        ), timeout=120)
        return GenerateResponse(text=text, score=_score_text(text))
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Icerik uretimi zaman asimina ugradi (120s). Daha kisa format deneyin.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Research ────────────────────────────────────────────

@router.post("/research", response_model=ResearchResponse)
async def do_research_endpoint(request: ResearchRequest):
    """Konu hakkinda derin arastirma yap"""
    try:
        # Build AI client for research (always cheapest: MiniMax > Groq > OpenAI > Anthropic)
        # This is SEPARATE from tweet generation provider — research needs fast & cheap AI.
        ai_client = None
        ai_model = None
        ai_provider = "minimax"
        try:
            from backend.config import get_settings as _gs2
            _s2 = _gs2()
            if _s2.minimax_api_key:
                from openai import OpenAI
                ai_client = OpenAI(api_key=_s2.minimax_api_key, base_url="https://api.minimaxi.chat/v1")
                ai_model = "MiniMax-M2.5"
            elif _s2.groq_api_key:
                from openai import OpenAI
                ai_client = OpenAI(api_key=_s2.groq_api_key, base_url="https://api.groq.com/openai/v1")
                ai_provider = "groq"
                ai_model = "llama-3.3-70b-versatile"
            elif _s2.openai_api_key:
                from openai import OpenAI
                ai_client = OpenAI(api_key=_s2.openai_api_key)
                ai_provider = "openai"
                ai_model = "gpt-4o"
            elif _s2.anthropic_api_key:
                import anthropic
                ai_client = anthropic.Anthropic(api_key=_s2.anthropic_api_key)
                ai_provider = "anthropic"
                ai_model = "claude-haiku-4-5-20251001"
        except Exception:
            pass  # AI client is optional, research can work without it

        # Claude Code research
        if request.engine == "claude_code":
            try:
                from backend.modules.claude_code_client import claude_code_research, is_available
                if is_available():
                    result = await asyncio.to_thread(
                        claude_code_research,
                        topic=request.topic,
                        research_sources=request.research_sources,
                    )
                    if result and result.get("summary"):
                        return ResearchResponse(
                            summary=result["summary"],
                            key_points=result.get("key_points", []),
                            sources=result.get("sources", []),
                            media_urls=result.get("media_urls", []),
                        )
            except Exception as e:
                logger.warning("Claude Code research failed: %s", e)
                # Fall through to DuckDuckGo

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

        # Build scanner only when "x" is explicitly in research_sources
        scanner = None
        sources = request.research_sources or []
        if "x" in sources:
            try:
                from backend.modules.twitter_scanner import TwitterScanner
                from backend.config import get_settings
                s = get_settings()
                if s.twitter_bearer_token or s.twikit_ct0 or s.twikit_auth_token or s.twikit_username:
                    scanner = TwitterScanner(
                        bearer_token=s.twitter_bearer_token or "",
                        twikit_username=s.twikit_username or "",
                        twikit_password=s.twikit_password or "",
                        twikit_email=s.twikit_email or "",
                    )
            except Exception:
                pass

        result = await asyncio.to_thread(
            do_research,
            tweet_text=request.topic,
            tweet_author=request.tweet_author,
            tweet_id=request.tweet_id if scanner else "",
            scanner=scanner,
            engine=request.engine if request.engine != "default" else "standard",
            use_agentic=request.agentic,
            ai_client=ai_client,
            ai_model=ai_model,
            ai_provider=ai_provider,
            research_sources=request.research_sources if request.research_sources else None,
        )

        # ResearchResult dataclass -> ResearchResponse
        if hasattr(result, "summary"):
            summary = result.synthesized_brief or result.summary or ""
            # Strip <think> tags from reasoning model outputs
            summary = re.sub(r'<think>.*?</think>', '', summary, flags=re.DOTALL).strip()

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
        """Run research in thread, returns ResearchResult or dict.
        All exceptions are caught to prevent backend crash."""
        try:
            return _do_research_inner()
        except Exception as e:
            logger.exception("Research inner error")
            progress_callback(f"Arastirma hatasi: {e}")
            # Return a minimal result so the SSE stream can still send something
            return {"_type": "error", "summary": f"Arastirma sirasinda hata olustu: {e}"}

    def _do_research_inner():
        # Build AI client for research analysis/synthesis.
        # Research always uses MiniMax (fast & cheap) for sentezleme — NOT the user's
        # tweet generation provider. Tweet provider (Gemini, Groq, etc.) is separate.
        # Fallback: MiniMax > Groq > OpenAI > Anthropic (cheapest first)
        ai_client = None
        ai_model = None
        ai_provider = "minimax"
        try:
            from backend.config import get_settings
            s = get_settings()
            if s.minimax_api_key:
                from openai import OpenAI
                ai_client = OpenAI(api_key=s.minimax_api_key, base_url="https://api.minimaxi.chat/v1")
                ai_provider = "minimax"
                ai_model = "MiniMax-M2.5"
            elif s.groq_api_key:
                from openai import OpenAI
                ai_client = OpenAI(api_key=s.groq_api_key, base_url="https://api.groq.com/openai/v1")
                ai_provider = "groq"
                ai_model = "llama-3.3-70b-versatile"
            elif s.openai_api_key:
                from openai import OpenAI
                ai_client = OpenAI(api_key=s.openai_api_key)
                ai_provider = "openai"
                ai_model = "gpt-4o"
            elif s.anthropic_api_key:
                import anthropic
                ai_client = anthropic.Anthropic(api_key=s.anthropic_api_key)
                ai_provider = "anthropic"
                ai_model = "claude-haiku-4-5-20251001"
        except Exception:
            pass

        # Claude Code path
        if request.engine == "claude_code":
            try:
                from backend.modules.claude_code_client import claude_code_research, is_available
                if is_available():
                    result = claude_code_research(
                        topic=request.topic,
                        research_sources=request.research_sources,
                        progress_callback=progress_callback,
                    )
                    if result and result.get("summary"):
                        return {"_type": "claude_code", **result}
                else:
                    progress_callback("Claude Code CLI bulunamadi, DuckDuckGo'ya geciliyor...")
            except Exception as e:
                progress_callback(f"Claude Code hatasi, DuckDuckGo'ya geciliyor: {e}")

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

        # Build scanner only when "x" is explicitly in research_sources
        scanner = None
        sources = request.research_sources or []
        if "x" in sources:
            try:
                from backend.modules.twitter_scanner import TwitterScanner
                from backend.config import get_settings
                s = get_settings()
                if s.twitter_bearer_token or s.twikit_ct0 or s.twikit_auth_token or s.twikit_username:
                    scanner = TwitterScanner(
                        bearer_token=s.twitter_bearer_token or "",
                        twikit_username=s.twikit_username or "",
                        twikit_password=s.twikit_password or "",
                        twikit_email=s.twikit_email or "",
                    )
            except Exception as e:
                logger.warning("Scanner creation failed: %s", e)

        return do_research(
            tweet_text=request.topic,
            tweet_author=request.tweet_author,
            tweet_id=request.tweet_id if scanner else "",  # Only pass tweet_id when scanner exists
            scanner=scanner,
            engine=request.engine if request.engine != "default" else "standard",
            use_agentic=request.agentic,
            ai_client=ai_client,
            ai_model=ai_model,
            ai_provider=ai_provider,
            progress_callback=progress_callback,
            research_sources=request.research_sources if request.research_sources else None,
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

        # Get result (with timeout to prevent indefinite hangs)
        try:
            result = future.result(timeout=120)

            if isinstance(result, dict) and result.get("_type") == "error":
                # Research failed but didn't crash — return error as result
                data = {
                    "summary": result.get("summary", "Arastirma hatasi"),
                    "key_points": [],
                    "sources": [],
                    "media_urls": [],
                }
            elif isinstance(result, dict) and result.get("_type") == "claude_code":
                data = {
                    "summary": result.get("summary", ""),
                    "key_points": result.get("key_points", []),
                    "sources": result.get("sources", []),
                    "media_urls": result.get("media_urls", []),
                }
            elif isinstance(result, dict) and result.get("_type") == "grok":
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
                for art in getattr(result, "deep_articles", [])[:8]:
                    sources.append({
                        "title": art.get("title", ""),
                        "url": art.get("url", ""),
                        "body": art.get("content", "")[:500] if art.get("content") else "",
                    })
                # Add web results as sources if no deep articles
                if not sources:
                    for wr in getattr(result, "web_results", [])[:5]:
                        if wr.get("href"):
                            sources.append({
                                "title": wr.get("title", ""),
                                "url": wr.get("href", ""),
                                "body": wr.get("body", "")[:300] if wr.get("body") else "",
                            })
                # Add thread tweets if available
                thread_tweets = getattr(result, "thread_tweets", [])
                thread_context = ""
                if thread_tweets:
                    thread_context = "\n\nThread:\n" + "\n".join(
                        [f"@{t.get('author', '?')}: {t.get('text', '')[:200]}" for t in thread_tweets[:5]]
                    )
                data = {
                    "summary": summary + thread_context,
                    "key_points": key_points,
                    "sources": sources,
                    "media_urls": getattr(result, "media_urls", []) or [],
                }
            else:
                data = {"summary": str(result), "key_points": [], "sources": [], "media_urls": []}

            # Strip <think> tags from reasoning model outputs
            import re
            if isinstance(data.get("summary"), str):
                data["summary"] = re.sub(r'<think>.*?</think>', '', data["summary"], flags=re.DOTALL).strip()
            if isinstance(data.get("key_points"), list):
                data["key_points"] = [
                    re.sub(r'<think>.*?</think>', '', kp, flags=re.DOTALL).strip()
                    for kp in data["key_points"] if isinstance(kp, str)
                ]

            yield f"data: {json.dumps({'type': 'result', 'data': data}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.exception("Research stream error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── Extract Tweet ──────────────────────────────────────

class ExtractTweetRequest(BaseModel):
    url: str


@router.post("/extract-tweet")
async def extract_tweet_endpoint(request: ExtractTweetRequest):
    """Tweet URL'sinden ID cikar, tweet bilgilerini ve thread varsa tum thread'i getir"""
    try:
        from backend.modules.deep_research import extract_tweet_id
        tweet_id = extract_tweet_id(request.url)
        if not tweet_id:
            return {"success": False, "error": "Gecersiz tweet URL'si"}

        tweet_data = None
        thread_tweets = []  # Full thread texts if this is a thread
        from backend.config import get_settings
        s = get_settings()

        # Method 1: Twitter API v2 (bearer token) — includes thread fetching
        if s.twitter_bearer_token:
            try:
                from backend.modules.twitter_scanner import TwitterScanner
                scanner = TwitterScanner(
                    bearer_token=s.twitter_bearer_token,
                    twikit_username=s.twikit_username or "",
                    twikit_password=s.twikit_password or "",
                    twikit_email=s.twikit_email or "",
                )
                result = await asyncio.to_thread(scanner.get_tweet_by_id, tweet_id)
                if result:
                    tweet_data = {
                        "text": getattr(result, "text", ""),
                        "author_username": getattr(result, "author_username", ""),
                        "author_name": getattr(result, "author_name", ""),
                        "like_count": getattr(result, "like_count", 0),
                        "retweet_count": getattr(result, "retweet_count", 0),
                        "reply_count": getattr(result, "reply_count", 0),
                    }
                # Also fetch thread
                thread_texts = await asyncio.to_thread(scanner.get_thread, tweet_id)
                if thread_texts and len(thread_texts) > 1:
                    thread_tweets = thread_texts
            except Exception as e:
                logger.warning(f"Bearer token tweet fetch failed: {e}")

        # Method 2: Twikit (cookie-based, free) — includes thread fetching
        if not tweet_data and (s.twikit_ct0 or s.twikit_auth_token or s.twikit_username):
            try:
                from backend.modules.twikit_client import TwikitSearchClient
                twikit = TwikitSearchClient(
                    username=s.twikit_username or "",
                    password=s.twikit_password or "",
                    email=s.twikit_email or "",
                )
                if twikit.authenticate():
                    # Fetch thread (returns list of tweet dicts)
                    thread_data = await asyncio.to_thread(twikit.get_thread, tweet_id)
                    if thread_data and len(thread_data) > 0:
                        # Use first tweet as main tweet data if we don't have it
                        # Find the original tweet in thread
                        main = None
                        for t in thread_data:
                            if t.get("id") == tweet_id or str(t.get("id")) == str(tweet_id):
                                main = t
                                break
                        if not main:
                            main = thread_data[0]

                        tweet_data = {
                            "text": main.get("text", ""),
                            "author_username": main.get("author_username", ""),
                            "author_name": main.get("author_name", ""),
                            "like_count": main.get("like_count", 0),
                            "retweet_count": main.get("retweet_count", 0),
                            "reply_count": main.get("reply_count", 0),
                            "media_items": main.get("media_items", []),
                        }
                        if len(thread_data) > 1:
                            thread_tweets = [t.get("text", "") for t in thread_data if t.get("text")]
                    else:
                        # Fallback to single tweet
                        result = await asyncio.to_thread(twikit.get_tweet_by_id, tweet_id)
                        if result:
                            tweet_data = {
                                "text": result.get("text", ""),
                                "author_username": result.get("author_username", ""),
                                "author_name": result.get("author_name", ""),
                                "like_count": result.get("like_count", 0),
                                "retweet_count": result.get("retweet_count", 0),
                                "reply_count": result.get("reply_count", 0),
                                "media_items": result.get("media_items", []),
                            }
            except Exception as e:
                logger.warning(f"Twikit tweet fetch failed: {e}")

        if tweet_data:
            response = {
                "success": True,
                "tweet_id": tweet_id,
                "text": tweet_data.get("text", ""),
                "author": tweet_data.get("author_username", ""),
                "author_name": tweet_data.get("author_name", ""),
                "like_count": tweet_data.get("like_count", 0),
                "retweet_count": tweet_data.get("retweet_count", 0),
                "reply_count": tweet_data.get("reply_count", 0),
                "media_items": tweet_data.get("media_items", []),
            }
            # Include thread data if available
            if thread_tweets and len(thread_tweets) > 1:
                response["is_thread"] = True
                response["thread_tweets"] = thread_tweets
                response["thread_count"] = len(thread_tweets)
                # Combine all thread texts for display
                response["full_thread_text"] = "\n\n".join(thread_tweets)
            else:
                response["is_thread"] = False
                response["thread_tweets"] = []
                response["thread_count"] = 1
            return response
        else:
            return {
                "success": True,
                "tweet_id": tweet_id,
                "text": "",
                "author": "",
                "author_name": "",
                "is_thread": False,
                "thread_tweets": [],
                "thread_count": 0,
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


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

        # Get twikit client for X search (with credentials from config)
        twikit_client = None
        if request.source in ("x", "both"):
            try:
                from backend.modules.twikit_client import TwikitSearchClient
                from backend.config import get_settings
                s = get_settings()
                twikit_client = TwikitSearchClient(
                    username=s.twikit_username or "",
                    password=s.twikit_password or "",
                    email=s.twikit_email or "",
                )
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


# ── Media Download (proxy) ─────────────────────────────

@router.get("/download-media")
async def download_media_endpoint(url: str = Query(..., description="Media URL to download")):
    """Video/gorsel URL'sini proxy olarak indir, rastgele dosya adiyla serve et.
    Tarayici/telefon otomatik indirir (Content-Disposition: attachment)."""
    import httpx

    # Validate URL — only allow twitter/x CDN domains
    allowed_domains = [
        "video.twimg.com",
        "pbs.twimg.com",
        "abs.twimg.com",
        "ton.twitter.com",
        "ton.x.com",
    ]
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if not any(parsed.hostname and parsed.hostname.endswith(d) for d in allowed_domains):
            raise HTTPException(status_code=400, detail="Sadece Twitter/X CDN URL'leri desteklenir")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Gecersiz URL")

    # Determine file extension from URL
    ext = "mp4"
    if ".mp4" in url:
        ext = "mp4"
    elif ".jpg" in url or ".jpeg" in url:
        ext = "jpg"
    elif ".png" in url:
        ext = "png"
    elif ".gif" in url:
        ext = "gif"

    # Generate random filename
    random_name = f"xc_{int(time.time())}_{uuid.uuid4().hex[:6]}.{ext}"

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://x.com/",
            })
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "application/octet-stream")

            return StreamingResponse(
                iter([resp.content]),
                media_type=content_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{random_name}"',
                    "Content-Length": str(len(resp.content)),
                },
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"CDN download failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download error: {str(e)}")


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
        elif provider in ("openai", "minimax", "groq"):
            from openai import OpenAI
            base_url = (
                "https://api.minimaxi.chat/v1" if provider == "minimax"
                else "https://api.groq.com/openai/v1" if provider == "groq"
                else None
            )
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


@router.get("/providers")
async def get_providers():
    """Mevcut AI provider listesini don"""
    from backend.api.helpers import get_available_providers
    return {"providers": get_available_providers()}


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
        elif provider in ("openai", "minimax", "groq"):
            from openai import OpenAI
            base_url = (
                "https://api.minimaxi.chat/v1" if provider == "minimax"
                else "https://api.groq.com/openai/v1" if provider == "groq"
                else None
            )
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


# ── Infographic Generation (Gemini) ──────────────────────

@router.post("/generate-infographic")
async def generate_infographic_endpoint(request: InfographicRequest):
    """Arastirma sonuclarindan Gemini ile 16:9 infografik gorsel uret.
    2 asamali: AI ile brief olustur, Gemini ile gorsel uret."""
    from backend.config import get_settings

    s = get_settings()
    if not s.gemini_api_key:
        raise HTTPException(status_code=400, detail="Gemini API key ayarlanmamis. Ayarlar sayfasindan ekleyin.")

    if not request.topic:
        raise HTTPException(status_code=400, detail="Konu belirtilmedi")

    try:
        from backend.modules.image_generator import generate_infographic
        from backend.api.helpers import get_ai_provider

        # Get AI client for brief generation
        ai_client = None
        ai_model = ""
        ai_provider = ""
        try:
            provider, api_key, model = get_ai_provider(preferred=request.provider)
            ai_provider = provider
            ai_model = model or ""
            if provider == "anthropic":
                import anthropic
                ai_client = anthropic.Anthropic(api_key=api_key)
            elif provider in ("openai", "minimax", "groq"):
                from openai import OpenAI
                base_url = None
                if provider == "minimax":
                    base_url = "https://api.minimaxi.chat/v1"
                elif provider == "groq":
                    base_url = "https://api.groq.com/openai/v1"
                ai_client = OpenAI(api_key=api_key, base_url=base_url)
        except Exception:
            pass  # Brief olmadan da devam edebilir

        result = await asyncio.to_thread(
            generate_infographic,
            topic=request.topic,
            research_summary=request.research_summary,
            key_points=request.key_points,
            gemini_api_key=s.gemini_api_key,
            ai_client=ai_client,
            ai_model=ai_model,
            ai_provider=ai_provider,
        )

        return result.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Infographic generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
