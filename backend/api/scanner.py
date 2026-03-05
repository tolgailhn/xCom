"""
Scanner API - AI konu tarama
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ScanRequest(BaseModel):
    time_range: str = "24h"  # 1h, 6h, 24h, 7d
    category: str = "all"


class TopicItem(BaseModel):
    text: str
    author_name: str
    author_username: str
    category: str
    engagement_score: float
    relevance_score: float
    like_count: int = 0
    retweet_count: int = 0
    reply_count: int = 0
    url: str = ""
    content_summary: str = ""
    media_urls: list[str] = []


class ScanResponse(BaseModel):
    topics: list[TopicItem]
    total_scanned: int


def _parse_hours(time_range: str) -> int:
    """Convert time_range string to hours int."""
    mapping = {"1h": 1, "6h": 6, "12h": 12, "24h": 24, "7d": 168}
    return mapping.get(time_range, 24)


@router.post("/scan", response_model=ScanResponse)
async def scan_topics(request: ScanRequest):
    """AI konularini tara"""
    from backend.modules.twitter_scanner import TwitterScanner
    from backend.config import get_settings

    settings = get_settings()

    try:
        scanner = TwitterScanner(bearer_token=settings.twitter_bearer_token)
        hours = _parse_hours(request.time_range)
        ai_topics = scanner.scan_ai_topics(time_range_hours=hours)

        # Filter by category if specified
        if request.category and request.category != "all":
            ai_topics = [t for t in ai_topics if t.category == request.category]

        topics = [
            TopicItem(
                text=t.text,
                author_name=t.author_name,
                author_username=t.author_username,
                category=t.category,
                engagement_score=t.engagement_score,
                relevance_score=t.relevance_score,
                like_count=t.like_count,
                retweet_count=t.retweet_count,
                reply_count=t.reply_count,
                url=t.url,
                content_summary=t.content_summary,
                media_urls=t.media_urls if t.media_urls else [],
            )
            for t in ai_topics
        ]

        return ScanResponse(topics=topics, total_scanned=len(ai_topics))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
