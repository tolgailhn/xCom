"""
Publish API - Tweet/thread paylasma
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import get_settings
from backend.modules.style_manager import add_to_post_history

router = APIRouter()


class PublishRequest(BaseModel):
    text: str
    thread_parts: list[str] = []
    quote_tweet_id: str = ""
    reply_to_id: str = ""


class PublishResponse(BaseModel):
    success: bool
    tweet_id: str = ""
    url: str = ""
    error: str = ""


@router.post("/tweet", response_model=PublishResponse)
async def publish_tweet(request: PublishRequest):
    """Tweet veya thread paylas"""
    settings = get_settings()

    # Check required Twitter credentials
    if not (settings.twitter_bearer_token and settings.twitter_ct0 and settings.twitter_auth_token):
        raise HTTPException(
            status_code=400,
            detail="Twitter API credentials not configured. Set TWITTER_BEARER_TOKEN, TWITTER_CT0, TWITTER_AUTH_TOKEN.",
        )

    try:
        from backend.modules.tweet_publisher import TweetPublisher

        publisher = TweetPublisher(
            api_key=settings.twitter_ct0,
            api_secret=settings.twitter_auth_token,
            access_token=settings.twitter_ct0,
            access_secret=settings.twitter_auth_token,
            bearer_token=settings.twitter_bearer_token,
        )

        if request.thread_parts:
            # Thread mode
            results = publisher.post_thread(request.thread_parts)
            first = results[0] if results else {}
            if first.get("success"):
                # Save to history
                add_to_post_history({
                    "text": request.text,
                    "url": first.get("url", ""),
                    "type": "thread",
                    "parts": len(request.thread_parts),
                })
            return PublishResponse(
                success=first.get("success", False),
                tweet_id=first.get("tweet_id", ""),
                url=first.get("url", ""),
                error=first.get("error", ""),
            )
        elif request.quote_tweet_id:
            # Quote tweet
            result = publisher.post_quote_tweet(request.text, request.quote_tweet_id)
            if result.get("success"):
                add_to_post_history({
                    "text": request.text,
                    "url": result.get("url", ""),
                    "type": "quote_tweet",
                })
            return PublishResponse(**result)
        else:
            # Single tweet
            result = publisher.post_tweet(request.text)
            if result.get("success"):
                add_to_post_history({
                    "text": request.text,
                    "url": result.get("url", ""),
                    "type": "tweet",
                })
            return PublishResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
