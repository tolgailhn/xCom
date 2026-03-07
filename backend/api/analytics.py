"""
Analytics API - Tweet analizi, takipci kesfi, tweet havuzu
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class AnalyzeRequest(BaseModel):
    username: str
    tweet_count: int = 50
    ai_report: bool = True


class AnalyzeMultiRequest(BaseModel):
    usernames: list[str]
    tweet_count: int = 200
    ai_report: bool = True


class FollowerFetchRequest(BaseModel):
    username: str
    limit: int = 200
    verified_only: bool = True


class PoolAccountsRequest(BaseModel):
    accounts: list[str]


class PoolFetchRequest(BaseModel):
    min_engagement: int = 100
    tweet_count: int = 500


class PoolImportRequest(BaseModel):
    min_engagement: int = 100


# ── Helpers ──────────────────────────────────────────────


def _get_twikit():
    from backend.modules.twikit_client import TwikitSearchClient
    twikit = TwikitSearchClient()
    if not twikit.authenticate():
        raise HTTPException(status_code=503, detail="Twitter auth failed. Check ct0/auth_token.")
    return twikit


def _get_ai_client():
    """Return (client, model, provider) or (None, None, None)."""
    from backend.api.helpers import get_ai_provider
    try:
        provider, api_key, model = get_ai_provider()
        if provider == "anthropic":
            import anthropic
            return anthropic.Anthropic(api_key=api_key), model, provider
        elif provider in ("openai", "minimax"):
            from openai import OpenAI
            base_url = "https://api.minimaxi.chat/v1" if provider == "minimax" else None
            return OpenAI(api_key=api_key, base_url=base_url), model, provider
    except Exception:
        pass
    return None, None, None


def _format_analysis_result(username: str, analysis: dict, ai_report: str = ""):
    return {
        "username": username,
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
        "question_analysis": analysis.get("question_analysis", {}),
        "best_hours": analysis.get("best_hours", []),
        "top_hashtags": analysis.get("top_hashtags", []),
        "style_dna": analysis.get("style_dna", {}),
        "ai_report": ai_report,
    }


# ══════════════════════════════════════════════════════════
# ANALYZE
# ══════════════════════════════════════════════════════════


@router.post("/analyze")
async def analyze_account(request: AnalyzeRequest):
    """Hesap tweet'lerini analiz et, stil DNA cikar"""
    from backend.modules.tweet_analyzer import (
        pull_user_tweets, analyze_tweets, save_tweet_analysis,
        generate_ai_analysis,
    )

    twikit = _get_twikit()

    try:
        tweets = pull_user_tweets(twikit, request.username, count=request.tweet_count)
        if not tweets:
            raise HTTPException(status_code=404, detail=f"@{request.username} icin tweet bulunamadi")

        analysis = analyze_tweets(tweets)

        ai_report = ""
        if request.ai_report:
            client, model, provider = _get_ai_client()
            if client and model:
                try:
                    ai_report = generate_ai_analysis(analysis, client, model, provider, request.username)
                except Exception:
                    pass

        save_tweet_analysis(request.username, analysis, ai_report)

        return _format_analysis_result(request.username, analysis, ai_report)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-multi")
async def analyze_multi(request: AnalyzeMultiRequest):
    """Birden fazla hesabi analiz et"""
    from backend.modules.tweet_analyzer import (
        pull_user_tweets, analyze_tweets, save_tweet_analysis,
        generate_ai_analysis,
    )

    twikit = _get_twikit()
    client, model, provider = (None, None, None)
    if request.ai_report:
        client, model, provider = _get_ai_client()

    results = []
    for username in request.usernames:
        username = username.strip().lstrip("@")
        if not username:
            continue
        try:
            tweets = pull_user_tweets(twikit, username, count=request.tweet_count)
            if not tweets:
                results.append({"username": username, "error": "Tweet bulunamadi"})
                continue

            analysis = analyze_tweets(tweets)

            ai_report = ""
            if client and model:
                try:
                    ai_report = generate_ai_analysis(analysis, client, model, provider, username)
                except Exception:
                    pass

            save_tweet_analysis(username, analysis, ai_report)
            results.append(_format_analysis_result(username, analysis, ai_report))
        except Exception as e:
            results.append({"username": username, "error": str(e)})

    return {"results": results}


# ══════════════════════════════════════════════════════════
# SAVED ANALYSES
# ══════════════════════════════════════════════════════════


@router.get("/saved")
async def get_saved_analyses():
    """Kayitli analizleri listele"""
    from backend.modules.tweet_analyzer import load_all_analyses
    analyses = load_all_analyses()
    items = []
    for saved in analyses:
        username = saved.get("username", "?")
        analyzed_at = saved.get("analyzed_at", "")
        analysis = saved.get("analysis", {})
        ai_report = saved.get("ai_report", "")
        items.append({
            **_format_analysis_result(username, analysis, ai_report),
            "analyzed_at": analyzed_at,
        })
    return {"analyses": items}


@router.delete("/delete/{username}")
async def delete_analysis(username: str):
    """Analiz sil"""
    from backend.modules.tweet_analyzer import delete_tweet_analysis
    delete_tweet_analysis(username)
    return {"success": True, "message": f"@{username} analizi silindi"}


@router.get("/training-context")
async def get_training_context(topic: str = ""):
    """AI egitim verisi onizleme"""
    from backend.modules.tweet_analyzer import load_all_analyses, build_training_context
    analyses = load_all_analyses()
    ctx = build_training_context(analyses, topic=topic) if analyses else ""
    return {"context": ctx[:5000], "total_length": len(ctx)}


# ══════════════════════════════════════════════════════════
# EXPORT / IMPORT
# ══════════════════════════════════════════════════════════


@router.get("/export")
async def export_analyses():
    """Tum analizleri JSON olarak export et"""
    from backend.modules.tweet_analyzer import export_all_analyses
    json_str = export_all_analyses()
    return {"data": json_str}


@router.post("/import")
async def import_analyses(payload: dict):
    """JSON'dan analiz import et"""
    from backend.modules.tweet_analyzer import import_analyses_from_json
    json_str = payload.get("data", "")
    if not json_str:
        raise HTTPException(status_code=400, detail="data alani gerekli")
    count = import_analyses_from_json(json_str)
    return {"imported": count}


# ══════════════════════════════════════════════════════════
# FOLLOWER DISCOVERY
# ══════════════════════════════════════════════════════════


@router.post("/followers/fetch")
async def fetch_followers(request: FollowerFetchRequest):
    """Hedef hesabin takipcilerini cek"""
    twikit = _get_twikit()
    username = request.username.strip().lstrip("@")

    user_info = twikit.get_user_info(username)
    if not user_info:
        raise HTTPException(status_code=404, detail=f"@{username} bulunamadi")

    followers = twikit.get_user_followers(
        username, limit=request.limit, verified_only=request.verified_only
    )

    # Save
    try:
        from backend.modules.style_manager import save_follower_suggestions
        save_follower_suggestions(username, followers)
    except Exception:
        pass

    return {
        "user_info": user_info,
        "followers": followers,
        "count": len(followers),
    }


@router.get("/followers/list")
async def list_followers():
    """Kayitli takipci listelerini getir"""
    try:
        from backend.modules.style_manager import load_all_follower_suggestions
        data = load_all_follower_suggestions()
    except Exception:
        data = {}

    items = []
    for key, value in data.items():
        items.append({
            "username": value.get("username", key),
            "fetched_at": value.get("fetched_at", ""),
            "count": len(value.get("followers", [])),
            "followers": value.get("followers", []),
        })
    return {"items": items}


@router.delete("/followers/{username}")
async def delete_followers(username: str):
    """Takipci listesi sil"""
    try:
        from backend.modules.style_manager import delete_follower_suggestions
        delete_follower_suggestions(username)
    except Exception:
        pass
    return {"success": True}


# ══════════════════════════════════════════════════════════
# TWEET POOL
# ══════════════════════════════════════════════════════════


@router.get("/pool/accounts")
async def get_pool_accounts():
    """Havuz hesap listesini getir"""
    from backend.modules.tweet_pool import load_pool_accounts
    return {"accounts": load_pool_accounts()}


@router.post("/pool/accounts")
async def save_pool_accounts_api(request: PoolAccountsRequest):
    """Havuz hesap listesini kaydet"""
    from backend.modules.tweet_pool import save_pool_accounts
    cleaned = [a.strip().lstrip("@").lower() for a in request.accounts if a.strip()]
    save_pool_accounts(cleaned)
    return {"success": True, "count": len(cleaned)}


@router.get("/pool/stats")
async def get_pool_stats_api():
    """Havuz istatistikleri"""
    from backend.modules.tweet_pool import load_pool, get_pool_stats
    pool_data = load_pool()
    stats = get_pool_stats(pool_data)
    return {
        **stats,
        "last_updated": pool_data.get("last_updated", ""),
    }


@router.post("/pool/fetch")
async def fetch_pool_tweets(request: PoolFetchRequest):
    """Havuz hesaplarindan tweet cek"""
    from backend.modules.tweet_pool import load_pool_accounts, bulk_fetch_accounts
    from backend.modules.twikit_client import TwikitSearchClient

    accounts = load_pool_accounts()
    if not accounts:
        raise HTTPException(status_code=400, detail="Hesap listesi bos. Once 'Hesap Listesini Kaydet' butonuyla hesap ekleyin.")

    twikit = TwikitSearchClient()
    if not twikit.authenticate():
        raise HTTPException(status_code=503, detail="Twitter auth failed")

    results = bulk_fetch_accounts(
        twikit_client=twikit,
        accounts=accounts,
        min_engagement=request.min_engagement,
        tweet_count=request.tweet_count,
    )
    total_added = sum(r.get("added", 0) for r in results if not r.get("error"))

    # Auto-regenerate DNA after adding tweets
    dna_result = {}
    if total_added > 0:
        from backend.modules.tweet_pool import regenerate_pool_dna
        dna_result = regenerate_pool_dna()

    return {"results": results, "total_added": total_added, "dna_regenerated": bool(dna_result.get("dna"))}


@router.post("/pool/import-analyses")
async def import_from_analyses_api(request: PoolImportRequest):
    """Mevcut analizlerden havuza aktar"""
    from backend.modules.tweet_pool import import_from_analyses
    results = import_from_analyses(min_engagement=request.min_engagement)
    total_added = sum(r.get("added", 0) for r in results if not r.get("error"))

    # Auto-regenerate DNA after importing
    dna_result = {}
    if total_added > 0:
        from backend.modules.tweet_pool import regenerate_pool_dna
        dna_result = regenerate_pool_dna()

    return {"results": results, "total_added": total_added, "dna_regenerated": bool(dna_result.get("dna"))}


@router.get("/pool/dna")
async def get_pool_dna_api():
    """Havuz DNA bilgisi"""
    from backend.modules.tweet_pool import get_pool_dna, load_pool
    dna = get_pool_dna()
    pool_data = load_pool()
    return {
        "dna": dna,
        "dna_updated": pool_data.get("pool_dna_updated", ""),
    }


@router.post("/pool/regenerate-dna")
async def regenerate_dna_api():
    """Havuz DNA'sini yeniden hesapla"""
    from backend.modules.tweet_pool import regenerate_pool_dna
    result = regenerate_pool_dna()
    return {
        "success": bool(result.get("dna")),
        "tweet_count": result.get("tweet_count", 0),
        "account_count": result.get("account_count", 0),
        "dna": result.get("dna"),
    }


@router.get("/pool/preview")
async def get_pool_preview(limit: int = 10):
    """Havuz onizleme (ilk N tweet)"""
    from backend.modules.tweet_pool import load_pool
    pool_data = load_pool()
    tweets = pool_data.get("pool", [])[:limit]
    return {"tweets": tweets}
