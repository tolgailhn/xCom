"""
Generator API - Tweet/thread uretimi ve arastirma
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class GenerateRequest(BaseModel):
    topic: str
    style: str = "samimi"
    length: str = "orta"  # kisa, orta, uzun
    thread: bool = False
    research_context: str = ""
    media_urls: list[str] = []
    content_format: str = ""  # micro/punch/spark/storm/thunder


class GenerateResponse(BaseModel):
    text: str
    thread_parts: list[str] = []


class ResearchRequest(BaseModel):
    topic: str
    depth: str = "normal"  # quick, normal, deep


class ResearchResponse(BaseModel):
    summary: str
    key_points: list[str]
    sources: list[dict]
    media_urls: list[str] = []


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
            return GenerateResponse(
                text="\n\n---\n\n".join(parts) if parts else "",
                thread_parts=parts or [],
            )
        else:
            text = generator.generate_tweet(
                topic_text=request.topic,
                style=request.style,
                additional_context=request.research_context,
                content_format=request.content_format,
            )
            return GenerateResponse(text=text)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/long-content", response_model=GenerateResponse)
async def generate_long_content(request: GenerateRequest):
    """Uzun icerik uret (coklu paragraf X postu)"""
    from backend.api.helpers import create_generator

    try:
        generator = create_generator(topic=request.topic)
        text = generator.generate_long_content(
            topic=request.topic,
            research_context=request.research_context,
            style=request.style,
            length=request.length,
        )
        return GenerateResponse(text=text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/research", response_model=ResearchResponse)
async def research_topic(request: ResearchRequest):
    """Konu hakkinda derin arastirma yap (DuckDuckGo + makale cekme)"""
    try:
        from backend.modules.deep_research import research_topic as do_research
        from backend.api.helpers import get_ai_provider

        provider, api_key, _ = get_ai_provider()

        result = await do_research(
            topic=request.topic,
            api_key=api_key,
            provider=provider,
        )

        # Extract from TopicResearchResult or dict
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
        else:
            return ResearchResponse(
                summary=str(result),
                key_points=[],
                sources=[],
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
