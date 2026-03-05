"""
Analytics API - Tweet analizi ve stil ogrenme
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class AnalyzeRequest(BaseModel):
    username: str
    tweet_count: int = 50


@router.post("/analyze")
async def analyze_account(request: AnalyzeRequest):
    """Hesap tweet'lerini analiz et, stil DNA cikar"""
    from backend.modules.twikit_client import TwikitSearchClient
    from backend.modules.tweet_analyzer import (
        pull_user_tweets, analyze_tweets, save_tweet_analysis,
        generate_ai_analysis,
    )
    from backend.api.helpers import get_ai_provider, create_generator
    from backend.config import get_settings

    settings = get_settings()

    # Initialize twikit client
    twikit = TwikitSearchClient()
    if not twikit.authenticate():
        raise HTTPException(
            status_code=503,
            detail="Twitter authentication failed. Check ct0/auth_token in settings.",
        )

    try:
        # Pull tweets
        tweets = pull_user_tweets(twikit, request.username, count=request.tweet_count)
        if not tweets:
            raise HTTPException(status_code=404, detail=f"@{request.username} icin tweet bulunamadi")

        # Analyze
        analysis = analyze_tweets(tweets)

        # Generate AI report
        ai_report = ""
        try:
            provider, api_key, model = get_ai_provider()
            if provider == "anthropic":
                import anthropic
                client = anthropic.Anthropic(api_key=api_key)
            elif provider == "openai":
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
            elif provider == "minimax":
                from openai import OpenAI
                client = OpenAI(api_key=api_key, base_url="https://api.minimaxi.chat/v1")
            else:
                client = None

            if client and model:
                ai_report = generate_ai_analysis(
                    analysis, client, model, provider, request.username
                )
        except Exception:
            pass  # AI report is optional

        # Save analysis
        save_tweet_analysis(request.username, analysis, ai_report)

        return {
            "username": request.username,
            "tweets_analyzed": analysis.get("total_tweets", 0),
            "original_count": analysis.get("original_count", 0),
            "retweet_count": analysis.get("retweet_count", 0),
            "avg_engagement": analysis.get("avg_engagement_score", 0),
            "total_likes": analysis.get("total_likes", 0),
            "total_retweets": analysis.get("total_retweets", 0),
            "total_replies": analysis.get("total_replies", 0),
            "top_tweets": analysis.get("top_tweets", [])[:10],
            "top_keywords": analysis.get("top_keywords", [])[:10],
            "length_analysis": analysis.get("length_analysis", {}),
            "best_hours": analysis.get("best_hours", []),
            "top_hashtags": analysis.get("top_hashtags", []),
            "style_dna": analysis.get("style_dna", {}),
            "ai_report": ai_report,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
