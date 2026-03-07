"""
Scanner API - AI konu tarama ve kesfet
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


# ── Models ──────────────────────────────────────────────

class ScanRequest(BaseModel):
    time_range: str = "24h"  # 1h, 6h, 12h, 24h, 7d
    category: str = "all"
    max_results: int = 20
    custom_query: str = ""
    min_likes: int = 0
    min_retweets: int = 0
    min_followers: int = 0
    engine: str = "default"  # default or grok


class DiscoverRequest(BaseModel):
    time_range: str = "12h"
    max_results: int = 30
    engine: str = "default"  # default or grok


class TopicItem(BaseModel):
    id: str = ""
    text: str
    author_name: str
    author_username: str
    author_followers_count: int = 0
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
    errors: list[str] = []


class DiscoverResponse(BaseModel):
    ai_topics: list[TopicItem] = []
    github_topics: list[TopicItem] = []
    tracked_topics: list[TopicItem] = []
    grok_topics: list[dict] = []
    total: int = 0
    errors: list[str] = []


# ── Helpers ─────────────────────────────────────────────

CATEGORY_OPTIONS = [
    "Tumu", "Yeni Model", "Model Guncelleme", "Arastirma",
    "Benchmark", "Acik Kaynak", "API/Platform", "AI Ajanlar",
    "Goruntu/Video", "Endustri"
]

DISCOVER_QUERIES = [
    '("new AI model" OR "new LLM" OR "just released" OR "just launched") (AI OR model OR LLM) -is:retweet lang:en min_faves:50',
    '(ChatGPT OR "GPT-4" OR "GPT-5" OR "Claude 4" OR "Claude Opus" OR "Claude Sonnet" OR "Gemini Pro" OR "Gemini Ultra" OR "Gemini 2") -is:retweet lang:en min_faves:30',
    '(DeepSeek OR Qwen OR "Llama 4" OR "Llama 3" OR Mixtral OR Mistral OR Grok) (model OR release OR update OR benchmark) -is:retweet lang:en min_faves:30',
    '(Cursor OR Windsurf OR "GitHub Copilot" OR Devin OR "v0.dev" OR "bolt.new" OR Replit) (AI OR update OR release OR new) -is:retweet lang:en min_faves:20',
    '("AI agent" OR "AI agents" OR agentic OR "function calling" OR MCP OR "tool use") -is:retweet lang:en min_faves:30',
    '("open source" OR "open-source") (model OR AI OR LLM) (release OR new OR weights) -is:retweet lang:en min_faves:30',
    '(benchmark OR MMLU OR HumanEval OR leaderboard OR SOTA) (AI OR model OR LLM) -is:retweet lang:en min_faves:30',
    '(OpenAI OR Anthropic OR "Google DeepMind" OR "Meta AI" OR xAI) (announce OR release OR launch OR update) -is:retweet lang:en min_faves:50',
    '("Stable Diffusion" OR Midjourney OR "DALL-E" OR Sora OR Runway OR Flux) (new OR update OR release) -is:retweet lang:en min_faves:30',
    '(NVIDIA OR H100 OR H200 OR B200 OR "AI chip" OR TPU) (AI OR training OR inference) -is:retweet lang:en min_faves:40',
]

GITHUB_QUERIES = [
    '(github.com) (AI OR LLM OR "machine learning" OR "deep learning" OR GPT OR agent) -is:retweet lang:en min_faves:20',
    '("open source" OR "open-source") (github.com OR huggingface.co) (AI OR model OR tool) -is:retweet lang:en min_faves:15',
    '(github.com) ("star" OR "stars" OR "just released" OR "check out" OR "built" OR repo) (AI OR LLM OR ML) -is:retweet lang:en min_faves:10',
    '(huggingface.co OR "Hugging Face") (model OR dataset OR space) (new OR release OR open) -is:retweet lang:en min_faves:15',
    '(arxiv.org) (AI OR LLM OR "machine learning" OR transformer OR diffusion) -is:retweet lang:en min_faves:20',
]


def _parse_hours(time_range: str) -> int:
    mapping = {"1h": 1, "6h": 6, "12h": 12, "24h": 24, "7d": 168}
    return mapping.get(time_range, 24)


def _create_scanner():
    """Create a TwitterScanner with current config."""
    from backend.modules.twitter_scanner import TwitterScanner
    from backend.config import get_settings

    s = get_settings()
    return TwitterScanner(
        bearer_token=s.twitter_bearer_token,
        api_key=s.twitter_api_key,
        api_secret=s.twitter_api_secret,
        access_token=s.twitter_access_token,
        access_secret=s.twitter_access_secret,
        twikit_username=s.twikit_username,
        twikit_password=s.twikit_password,
        twikit_email=s.twikit_email,
    )


def _topic_to_item(t) -> TopicItem:
    return TopicItem(
        id=t.id,
        text=t.text,
        author_name=t.author_name,
        author_username=t.author_username,
        author_followers_count=getattr(t, "author_followers_count", 0),
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


# ── Scan Endpoint ───────────────────────────────────────

@router.post("/scan", response_model=ScanResponse)
async def scan_topics(request: ScanRequest):
    """AI konularini tara (gelismis filtreler dahil)"""
    import datetime as _dt
    from backend.modules.style_manager import load_monitored_accounts
    from backend.modules.twitter_scanner import AITopic

    try:
        hours = _parse_hours(request.time_range)
        custom_accounts = load_monitored_accounts()
        errors: list[str] = []

        if request.engine == "grok":
            # ── Grok engine: use xAI API directly (no Twikit) ──
            ai_topics = await _grok_scan(
                custom_query=request.custom_query,
                max_results=request.max_results,
            )
        else:
            # ── Default engine: use Twikit/Bearer Token ──
            scanner = _create_scanner()

            custom_queries = []
            if request.custom_query:
                custom_queries.append(f"{request.custom_query} -is:retweet")

            ai_topics = scanner.scan_ai_topics(
                time_range_hours=hours,
                max_results_per_query=request.max_results,
                custom_accounts=custom_accounts,
                custom_queries=custom_queries,
            )
            errors = getattr(scanner, "search_errors", [])

        # Apply filters
        if request.category and request.category not in ("all", "Tumu"):
            ai_topics = [t for t in ai_topics if t.category == request.category]

        if request.min_likes > 0:
            ai_topics = [t for t in ai_topics if t.like_count >= request.min_likes]

        if request.min_retweets > 0:
            ai_topics = [t for t in ai_topics if t.retweet_count >= request.min_retweets]

        if request.min_followers > 0:
            ai_topics = [t for t in ai_topics
                         if t.author_followers_count == 0 or t.author_followers_count >= request.min_followers]

        topics = [_topic_to_item(t) for t in ai_topics]
        return ScanResponse(topics=topics, total_scanned=len(ai_topics), errors=errors[:5])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Default AI queries for Grok scanning (when no custom_query is provided)
_GROK_DEFAULT_QUERIES = [
    "latest AI model releases and updates today",
    "trending AI news and breakthroughs",
    "new open source AI tools and models",
    "AI agents and LLM developments",
]


async def _grok_scan(custom_query: str = "", max_results: int = 20) -> list:
    """Scan using Grok xAI API — either custom query or default AI queries."""
    import datetime as _dt
    from backend.modules.twitter_scanner import AITopic

    try:
        from backend.modules.grok_client import grok_scan_topics
    except ImportError:
        return []

    queries = [custom_query] if custom_query else _GROK_DEFAULT_QUERIES
    ai_topics: list = []
    seen_texts: set[str] = set()

    for q in queries:
        try:
            grok_results = grok_scan_topics(q)
        except Exception:
            continue

        for gr in grok_results:
            text = gr.get("text", "")
            text_key = text[:80].lower()
            if text_key in seen_texts:
                continue
            seen_texts.add(text_key)

            ai_topics.append(AITopic(
                id=f"grok_{hash(text[:50])}",
                text=text,
                author_name=gr.get("author_name", ""),
                author_username=gr.get("author_username", ""),
                author_profile_image="",
                created_at=_dt.datetime.now(_dt.timezone.utc),
                like_count=gr.get("like_count", 0),
                retweet_count=gr.get("retweet_count", 0),
                reply_count=gr.get("reply_count", 0),
                url=gr.get("url", ""),
                category=gr.get("category", "Grok Arama"),
            ))

    return ai_topics


# ── Discover Endpoint ───────────────────────────────────

@router.post("/discover", response_model=DiscoverResponse)
async def discover_topics(request: DiscoverRequest):
    """AI Kesfet - trending konular, GitHub repos, yeni hesaplar"""
    import datetime
    from backend.modules.style_manager import load_monitored_accounts
    from backend.modules.twitter_scanner import (
        DEFAULT_AI_ACCOUNTS, is_spam, categorize_topic,
        calculate_relevance, is_turkish_account, generate_content_summary,
        MIN_FOLLOWER_COUNT_DISCOVER, is_ai_relevant,
    )

    hours = _parse_hours(request.time_range)

    # Grok discover shortcut
    if request.engine == "grok":
        try:
            from backend.modules.grok_client import grok_discover_ai_trends, has_grok_key
            from backend.config import get_settings
            s = get_settings()
            if s.xai_api_key:
                grok_topics = grok_discover_ai_trends()
                return DiscoverResponse(
                    grok_topics=grok_topics if grok_topics else [],
                    total=len(grok_topics) if grok_topics else 0,
                )
        except Exception as e:
            return DiscoverResponse(errors=[f"Grok kesfet hatasi: {e}"])

    try:
        scanner = _create_scanner()
        start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)

        all_discover = []
        github_discover = []
        seen_ids = set()
        errors = []

        def _process_tweet(t, target_list):
            if t.id in seen_ids or is_spam(t.text):
                return
            if is_turkish_account(t.text, t.author_name):
                return
            if t.author_followers_count > 0 and t.author_followers_count < MIN_FOLLOWER_COUNT_DISCOVER:
                return
            if not is_ai_relevant(t.text):
                return
            seen_ids.add(t.id)
            t.category = categorize_topic(t.text)
            t.relevance_score = calculate_relevance(t, hours)
            t.content_summary = generate_content_summary(t.text, t.category)
            target_list.append(t)

        # AI discovery queries
        for query in DISCOVER_QUERIES:
            try:
                results = scanner._search_tweets(query, start_time, request.max_results)
                for t in results:
                    _process_tweet(t, all_discover)
            except Exception as e:
                errors.append(str(e))

        # GitHub queries
        for query in GITHUB_QUERIES:
            try:
                results = scanner._search_tweets(query, start_time, request.max_results)
                for t in results:
                    _process_tweet(t, github_discover)
            except Exception as e:
                errors.append(str(e))

        # Separate tracked vs new
        custom_accs = load_monitored_accounts()
        tracked_lower = {a.lower() for a in list(DEFAULT_AI_ACCOUNTS) + custom_accs}

        new_discoveries = [t for t in all_discover if t.author_username.lower() not in tracked_lower]
        tracked_discoveries = [t for t in all_discover if t.author_username.lower() in tracked_lower]

        new_discoveries.sort(key=lambda t: t.relevance_score, reverse=True)
        tracked_discoveries.sort(key=lambda t: t.relevance_score, reverse=True)
        github_discover.sort(key=lambda t: t.relevance_score, reverse=True)

        return DiscoverResponse(
            ai_topics=[_topic_to_item(t) for t in new_discoveries],
            github_topics=[_topic_to_item(t) for t in github_discover],
            tracked_topics=[_topic_to_item(t) for t in tracked_discoveries],
            total=len(new_discoveries) + len(github_discover) + len(tracked_discoveries),
            errors=errors[:5],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Categories Endpoint ─────────────────────────────────

@router.get("/categories")
async def get_categories():
    """Mevcut kategori listesini don"""
    return {"categories": CATEGORY_OPTIONS}
