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
    thread_results: list[dict] = []

    @classmethod
    def from_result(cls, result: dict) -> "PublishResponse":
        """TweetPublisher sonucunu PublishResponse'a cevir (None -> '')"""
        return cls(
            success=result.get("success", False),
            tweet_id=result.get("tweet_id") or "",
            url=result.get("url") or "",
            error=result.get("error") or "",
        )


def _create_publisher():
    """Twitter API publisher olustur — dogru credential'lari kullanir."""
    settings = get_settings()

    # Twitter API v2 credentials (OAuth 1.0a)
    api_key = settings.twitter_api_key
    api_secret = settings.twitter_api_secret
    access_token = settings.twitter_access_token
    access_secret = settings.twitter_access_secret
    bearer_token = settings.twitter_bearer_token

    if not (api_key and api_secret and access_token and access_secret):
        raise HTTPException(
            status_code=400,
            detail="Twitter API credentials eksik. Ayarlar sayfasindan API Key, API Secret, Access Token ve Access Secret girin.",
        )

    from backend.modules.tweet_publisher import TweetPublisher

    return TweetPublisher(
        api_key=api_key,
        api_secret=api_secret,
        access_token=access_token,
        access_secret=access_secret,
        bearer_token=bearer_token,
    )


@router.post("/tweet", response_model=PublishResponse)
async def publish_tweet(request: PublishRequest):
    """Tweet veya thread paylas"""
    try:
        publisher = _create_publisher()

        if request.thread_parts:
            # Thread mode — tum sonuclari don
            results = publisher.post_thread(request.thread_parts)
            first = results[0] if results else {}
            success_count = sum(1 for r in results if r.get("success"))
            all_success = success_count == len(results)

            if first.get("success"):
                urls = [r.get("url", "") for r in results if r.get("success")]
                add_to_post_history({
                    "text": request.text,
                    "url": first.get("url", ""),
                    "type": "thread",
                    "parts": len(request.thread_parts),
                    "thread_urls": urls,
                })

            return PublishResponse(
                success=first.get("success", False),
                tweet_id=first.get("tweet_id") or "",
                url=first.get("url") or "",
                error=first.get("error") or (
                    f"{success_count}/{len(results)} tweet paylasild." if not all_success and success_count > 0 else ""
                ),
                thread_results=[
                    {
                        "index": r.get("index", i + 1),
                        "success": r.get("success", False),
                        "tweet_id": r.get("tweet_id") or "",
                        "url": r.get("url") or "",
                        "error": r.get("error") or "",
                    }
                    for i, r in enumerate(results)
                ],
            )
        elif request.reply_to_id:
            # Reply to tweet
            result = publisher.post_reply(request.text, request.reply_to_id)
            if result.get("success"):
                add_to_post_history({
                    "text": request.text,
                    "url": result.get("url", ""),
                    "type": "reply",
                    "reply_to_id": request.reply_to_id,
                })
            return PublishResponse.from_result(result)
        elif request.quote_tweet_id:
            # Quote tweet
            result = publisher.post_quote_tweet(request.text, request.quote_tweet_id)
            if result.get("success"):
                add_to_post_history({
                    "text": request.text,
                    "url": result.get("url", ""),
                    "type": "quote_tweet",
                })
            return PublishResponse.from_result(result)
        else:
            # Single tweet
            result = publisher.post_tweet(request.text)
            if result.get("success"):
                add_to_post_history({
                    "text": request.text,
                    "url": result.get("url", ""),
                    "type": "tweet",
                })
            return PublishResponse.from_result(result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
