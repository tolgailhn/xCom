"""
Hesap Keşfi Sistemi — Benzer Hesap Bulma
İzlenen AI/tech hesaplarından yola çıkarak yeni, benzer hesaplar keşfeder.

Stratejiler:
1. follower_mining — İzlenen hesapların takipçilerinden AI bio filtresi ile aday bulma
2. semantic_search — Konu bazlı X kullanıcı araması
3. grok_similar — Grok AI ile benzer hesap önerisi (kişiselleştirilmiş)
"""
import datetime
import json
import logging
import random
import re
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Bio keyword filter for AI/tech accounts
AI_BIO_KEYWORDS = [
    "ai", "artificial intelligence", "machine learning", "deep learning",
    "ml", "llm", "gpt", "nlp", "neural", "transformer", "computer vision",
    "robotics", "data scien", "yapay zeka", "makine ogren",
    "reinforcement learning", "generative", "diffusion", "rag",
    "langchain", "autonomous", "foundational model", "fine-tun",
    "large language model", "multimodal", "ai safety", "alignment",
    "agent", "openai", "anthropic", "hugging face", "pytorch", "tensorflow",
]

# Semantic search queries for finding AI accounts
SEMANTIC_SEARCH_QUERIES = [
    "AI researcher LLM",
    "machine learning engineer",
    "artificial intelligence developer",
    "deep learning researcher",
    "AI startup founder",
    "computer vision researcher",
    "NLP researcher",
    "AI safety alignment",
    "robotics AI engineer",
    "data scientist AI",
    "yapay zeka geliştirici",
    "AI journalist tech",
]


def _bio_matches_ai(bio: str) -> bool:
    """Check if bio contains AI/tech related keywords."""
    bio_lower = (bio or "").lower()
    return any(kw in bio_lower for kw in AI_BIO_KEYWORDS)


# ── Helper: Get twikit client ─────────────────────────────

def _get_twikit_client():
    """Get authenticated twikit client."""
    try:
        from backend.config import get_settings
        from backend.modules.twikit_client import TwikitSearchClient

        settings = get_settings()
        client = TwikitSearchClient(
            username=settings.twikit_username or "",
            password=settings.twikit_password or "",
            email=getattr(settings, "twikit_email", "") or "",
        )
        client.authenticate()
        if client._authenticated:
            return client
    except Exception as e:
        logger.warning("Account discoverer: Twikit auth failed: %s", e)
    return None


def _get_monitored_and_dismissed():
    """İzlenen ve reddedilmiş hesapları getir."""
    try:
        from backend.modules.style_manager import (
            load_discovery_config,
            load_suggested_accounts,
        )
    except ImportError:
        return set(), set(), []

    config = load_discovery_config()
    monitored = set()
    for acc in config.get("priority_accounts", []):
        monitored.add(acc.lower())
    for acc in config.get("normal_accounts", []):
        monitored.add(acc.lower())

    existing = load_suggested_accounts()
    dismissed = {
        a.get("username", "").lower()
        for a in existing
        if a.get("dismissed")
    }
    return monitored, dismissed, existing


def _get_seed_accounts(count: int = 3) -> list[str]:
    """İzlenen hesaplardan rastgele seed hesap seç (priority ağırlıklı)."""
    try:
        from backend.modules.style_manager import load_discovery_config
        from backend.modules.twitter_scanner import DEFAULT_AI_ACCOUNTS
    except ImportError:
        return []

    config = load_discovery_config()
    priority = config.get("priority_accounts", [])
    normal = config.get("normal_accounts", [])
    defaults = list(DEFAULT_AI_ACCOUNTS)

    # Priority 2x ağırlık
    pool = list(set(priority * 2 + normal + defaults))
    if not pool:
        return []

    return random.sample(pool, min(count, len(pool)))


def _get_all_monitored_usernames() -> set[str]:
    """Tüm izlenen hesapları (lowercase) döndür."""
    try:
        from backend.modules.style_manager import load_discovery_config
        from backend.modules.twitter_scanner import DEFAULT_AI_ACCOUNTS
    except ImportError:
        return set()

    config = load_discovery_config()
    result = set()
    for acc in config.get("priority_accounts", []):
        result.add(acc.lower())
    for acc in config.get("normal_accounts", []):
        result.add(acc.lower())
    for acc in DEFAULT_AI_ACCOUNTS:
        result.add(acc.lower())
    return result


# ═══════════════════════════════════════════════════════════
# STRATEGY 1: Follower Mining
# ═══════════════════════════════════════════════════════════

def _strategy_follower_mining(
    monitored: set, dismissed: set, max_results: int = 15
) -> list[dict]:
    """İzlenen hesapların takipçilerinden AI/tech hesapları bul."""
    twikit = _get_twikit_client()
    if not twikit:
        logger.info("follower_mining: Twikit not available")
        return []

    seeds = _get_seed_accounts(3)
    if not seeds:
        logger.info("follower_mining: No seed accounts")
        return []

    logger.info("follower_mining: Seeds: %s", ", ".join(f"@{s}" for s in seeds))

    all_candidates: dict[str, dict] = {}

    for seed in seeds:
        try:
            followers = twikit.get_user_followers(
                seed, limit=100, verified_only=False
            )

            matched = 0
            for f in followers:
                username = (f.get("username", "") or "").lower()
                if not username or username in monitored or username in dismissed:
                    continue
                if username in all_candidates:
                    continue

                bio = f.get("bio", "") or ""
                followers_count = f.get("followers_count", 0) or 0

                # Bio AI keyword filtresi + minimum takipçi
                if not _bio_matches_ai(bio) or followers_count < 500:
                    continue

                all_candidates[username] = {
                    "username": username,
                    "appearances": 1,
                    "avg_engagement": 0,
                    "total_engagement": 0,
                    "followers": followers_count,
                    "score": followers_count / 100,
                    "sample_tweets": [],
                    "sample_tweet": "",
                    "discovery_strategy": "follower_mining",
                    "seed_account": seed,
                    "profile": {
                        "display_name": f.get("name", ""),
                        "bio": bio,
                        "verified": f.get("is_blue_verified", False),
                        "profile_image_url": f.get("profile_image_url", ""),
                    },
                }
                matched += 1
                if matched >= 5:
                    break

            logger.info(
                "follower_mining: @%s → %d matched from %d followers",
                seed, matched, len(followers),
            )
            time.sleep(2)  # Rate limit

        except Exception as e:
            logger.warning("follower_mining error for @%s: %s", seed, e)

    candidates = list(all_candidates.values())[:max_results]
    return candidates


# ═══════════════════════════════════════════════════════════
# STRATEGY 2: Semantic Search
# ═══════════════════════════════════════════════════════════

def _strategy_semantic_search(
    monitored: set, dismissed: set, max_results: int = 15
) -> list[dict]:
    """Konu bazlı X'te hesap araması."""
    twikit = _get_twikit_client()
    if not twikit:
        logger.info("semantic_search: Twikit not available")
        return []

    # 3 rastgele sorgu seç
    queries = random.sample(SEMANTIC_SEARCH_QUERIES, min(3, len(SEMANTIC_SEARCH_QUERIES)))
    logger.info("semantic_search: Queries: %s", queries)

    all_candidates: dict[str, dict] = {}

    for query in queries:
        try:
            # search_user is on the underlying twikit client
            users = twikit._run(
                twikit._get_client_sync().search_user(query, count=10)
            )

            matched = 0
            for u in (users or []):
                username = (
                    getattr(u, "screen_name", "") or getattr(u, "username", "") or ""
                ).lower()
                if not username or username in monitored or username in dismissed:
                    continue
                if username in all_candidates:
                    continue

                bio = getattr(u, "description", "") or ""
                followers_count = getattr(u, "followers_count", 0) or 0

                if not _bio_matches_ai(bio) or followers_count < 500:
                    continue

                all_candidates[username] = {
                    "username": username,
                    "appearances": 1,
                    "avg_engagement": 0,
                    "total_engagement": 0,
                    "followers": followers_count,
                    "score": followers_count / 100,
                    "sample_tweets": [],
                    "sample_tweet": "",
                    "discovery_strategy": "semantic_search",
                    "search_query": query,
                    "profile": {
                        "display_name": getattr(u, "name", ""),
                        "bio": bio,
                        "verified": getattr(u, "is_blue_verified", False),
                        "profile_image_url": getattr(u, "profile_image_url_https", "") or "",
                    },
                }
                matched += 1
                if matched >= 5:
                    break

            logger.info("semantic_search: '%s' → %d matched", query, matched)
            time.sleep(2)

        except Exception as e:
            logger.warning("semantic_search error for '%s': %s", query, e)

    candidates = list(all_candidates.values())[:max_results]
    return candidates


# ═══════════════════════════════════════════════════════════
# STRATEGY 3: Grok Similar Accounts
# ═══════════════════════════════════════════════════════════

def _strategy_grok_similar(
    monitored: set, dismissed: set, max_results: int = 10
) -> list[dict]:
    """Grok AI ile izlenen hesaplara benzer hesap bul (kişiselleştirilmiş)."""
    try:
        from backend.config import get_settings
        from backend.modules.grok_client import _grok_responses_api, _parse_json_array, _track_cost
    except ImportError as e:
        logger.warning("grok_similar import error: %s", e)
        return []

    settings = get_settings()
    api_key = getattr(settings, "grok_api_key", "") or ""
    if not api_key:
        logger.info("grok_similar: Grok API key not configured")
        return []

    # 5 referans hesap seç
    reference_accounts = _get_seed_accounts(5)
    if not reference_accounts:
        logger.info("grok_similar: No reference accounts")
        return []

    refs_str = ", ".join(f"@{a}" for a in reference_accounts)
    logger.info("grok_similar: Reference accounts: %s", refs_str)

    try:
        result = _grok_responses_api(
            messages=[
                {"role": "system", "content": (
                    "You are a research assistant. Search X for accounts similar to "
                    "the given reference accounts. These accounts post about AI, machine learning, "
                    "deep learning, LLMs, and related tech topics. "
                    "Find accounts that are NOT in the reference list but share similar content. "
                    "Return ONLY a JSON array."
                )},
                {"role": "user", "content": f"""Find X/Twitter accounts similar to these AI/tech accounts: {refs_str}

I want accounts that:
- Post about AI, ML, LLM, deep learning, computer vision, robotics, or related tech
- Share original insights, research, or analysis (not just news retweets)
- Have at least 500 followers
- Are NOT any of these accounts: {refs_str}

Find {max_results} accounts. For each, return:
- "username": the username (without @)
- "display_name": their display name
- "bio": their bio/description
- "followers": approximate follower count (number)
- "sample_tweet": one of their recent relevant tweets
- "relevance_reason": why this account is similar to the references (1 sentence)

Return ONLY the JSON array, no other text."""},
            ],
            tools=[{"type": "x_search"}],
            max_tokens=2000,
            temperature=0.1,
            api_key=api_key,
        )

        if not result or not result.get("text"):
            return []

        _track_cost(result.get("input_tokens", 0), result.get("output_tokens", 0))

        raw = re.sub(r'<think>.*?</think>', '', result["text"], flags=re.DOTALL).strip()
        parsed = _parse_json_array(raw)

        candidates = []
        for acc in (parsed or []):
            username = (acc.get("username", "") or "").lower().lstrip("@")
            if not username or username in monitored or username in dismissed:
                continue

            candidates.append({
                "username": username,
                "appearances": 1,
                "avg_engagement": 0,
                "total_engagement": 0,
                "followers": acc.get("followers", 0) or 0,
                "score": (acc.get("followers", 0) or 0) / 100,
                "sample_tweets": [acc.get("sample_tweet", "")][:1],
                "sample_tweet": acc.get("sample_tweet", ""),
                "discovery_strategy": "grok_similar",
                "reference_accounts": reference_accounts,
                "profile": {
                    "display_name": acc.get("display_name", ""),
                    "bio": acc.get("bio", ""),
                    "verified": False,
                },
                "grok_reason": acc.get("relevance_reason", ""),
            })

        logger.info("grok_similar: found %d candidates", len(candidates))
        return candidates[:max_results]

    except Exception as e:
        logger.warning("grok_similar error: %s", e)
        return []


# ═══════════════════════════════════════════════════════════
# AI ANALYSIS — Hesap içerik analizi
# ═══════════════════════════════════════════════════════════

ACCOUNT_ANALYSIS_PROMPT = """Bu X hesabının son tweetlerini analiz et. Hesap: @{username}

Profil:
- Bio: {bio}
- Takipçi: {followers}
- Takip: {following}
- Toplam tweet: {tweet_count}

Son {count} tweet:
{tweets_text}

Aşağıdaki kriterlere göre JSON formatında değerlendir (SADECE JSON döndür, başka metin yazma):
{{
  "content_relevance": <1-10>,
  "content_quality": <1-10>,
  "bot_probability": <0-100>,
  "posting_frequency": "<günde ~X tweet>",
  "category": "<Arastirmaci|Gelistirici|Gazeteci|Kurucu|Sirket|Icerik Uretici|Bot|Diger>",
  "topics": ["<konu1>", "<konu2>"],
  "recommended": <true|false>,
  "reasoning_tr": "<Kısa Türkçe açıklama, max 2 cümle>",
  "best_tweet_indices": [<indeks1>, <indeks2>]
}}

Değerlendirme kriterleri:
- İçerik ilgililiği (content_relevance): AI, ML, LLM, robotics, computer vision, veri bilimi, yazılım, teknoloji
- Kalite (content_quality): Kişisel görüş/analiz = yüksek. Sadece RT/link paylaşım = düşük
- Bot sinyalleri: Çok sık paylaşım, template içerik, jenerik bio, düşük engagement/takipçi oranı
- Önerme eşiği: content_relevance >= 6 VE content_quality >= 5 VE bot_probability <= 30
- topics: Ana konuları, max 5 (İngilizce teknik terimler kullanılabilir)
- best_tweet_indices: En kaliteli tweet'lerin 0-bazlı indeksleri (max 3)"""


def analyze_account_with_ai(username: str, tweets: list[dict], user_info: dict | None = None) -> dict | None:
    """AI ile hesap değerlendirmesi. MiniMax/Claude/OpenAI fallback."""
    try:
        from backend.api.helpers import get_ai_client
    except ImportError as e:
        logger.warning("AI client import error: %s", e)
        return None

    bio = ""
    followers = 0
    following = 0
    tweet_count = 0

    if user_info:
        bio = user_info.get("bio", "") or ""
        followers = user_info.get("followers_count", 0) or user_info.get("followers", 0) or 0
        following = user_info.get("following_count", 0) or user_info.get("following", 0) or 0
        tweet_count = user_info.get("statuses_count", 0) or user_info.get("tweet_count", 0) or 0

    if not tweets:
        return None

    tweets_text = ""
    for i, tw in enumerate(tweets[:20]):
        text = tw.get("text", "") or tw.get("full_text", "") or ""
        likes = tw.get("favorite_count", 0) or tw.get("likes", 0) or 0
        rts = tw.get("retweet_count", 0) or tw.get("retweets", 0) or 0
        tweets_text += f"[{i}] ({likes} like, {rts} RT) {text[:300]}\n\n"

    prompt = ACCOUNT_ANALYSIS_PROMPT.format(
        username=username,
        bio=bio,
        followers=followers,
        following=following,
        tweet_count=tweet_count,
        count=len(tweets),
        tweets_text=tweets_text.strip(),
    )

    try:
        client, model = get_ai_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Sen bir X/Twitter hesap analiz asistanısın. SADECE geçerli JSON döndür."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=800,
        )

        raw = response.choices[0].message.content or ""
        # Clean thinking/tool_call tags
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL)
        raw = re.sub(r'<minimax:tool_call>.*?</minimax:tool_call>', '', raw, flags=re.DOTALL)
        raw = raw.strip()

        # Extract JSON
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            analysis = json.loads(json_match.group())

            # Extract best tweets
            best_indices = analysis.get("best_tweet_indices", [])
            best_tweets = []
            for idx in best_indices[:3]:
                if isinstance(idx, int) and 0 <= idx < len(tweets):
                    text = tweets[idx].get("text", "") or tweets[idx].get("full_text", "")
                    best_tweets.append(text[:300])
            analysis["best_tweets"] = best_tweets

            # Compute overall score
            relevance = analysis.get("content_relevance", 5)
            quality = analysis.get("content_quality", 5)
            bot_prob = analysis.get("bot_probability", 50)
            analysis["overall_score"] = round(
                (relevance * 4 + quality * 3 + (100 - bot_prob) * 0.3) / 7.3 * 10, 1
            )

            analysis["analyzed_at"] = datetime.datetime.now(TZ_TR).isoformat()
            return analysis

    except json.JSONDecodeError as e:
        logger.warning("Account analysis JSON parse error for @%s: %s", username, e)
    except Exception as e:
        logger.warning("Account analysis error for @%s: %s", username, e)

    return None


# ═══════════════════════════════════════════════════════════
# MAIN FUNCTIONS
# ═══════════════════════════════════════════════════════════

def discover_accounts():
    """Basit hesap keşfi — scheduler tarafından çağrılır (geriye uyumluluk)."""
    now = datetime.datetime.now(TZ_TR)
    if now.hour < 8 or now.hour >= 23:
        return

    result = discover_accounts_smart(max_per_strategy=5)
    logger.info("Scheduled discover_accounts: %s", result)


def discover_accounts_smart(
    strategies: list[str] | None = None,
    max_per_strategy: int = 5,
) -> dict:
    """Çoklu strateji ile akıllı hesap keşfi."""
    if strategies is None:
        strategies = ["follower_mining", "semantic_search", "grok_similar"]

    monitored, dismissed, existing = _get_monitored_and_dismissed()

    strategy_results: dict[str, list] = {}
    all_candidates: list[dict] = []

    for strategy in strategies:
        try:
            if strategy == "follower_mining":
                found = _strategy_follower_mining(monitored, dismissed, max_per_strategy)
            elif strategy == "semantic_search":
                found = _strategy_semantic_search(monitored, dismissed, max_per_strategy)
            elif strategy == "grok_similar":
                found = _strategy_grok_similar(monitored, dismissed, max_per_strategy)
            else:
                found = []

            strategy_results[strategy] = found
            all_candidates.extend(found)
            logger.info("Strategy '%s': found %d candidates", strategy, len(found))
        except Exception as e:
            logger.warning("Strategy '%s' error: %s", strategy, e)
            strategy_results[strategy] = []

    saved = _merge_and_save(all_candidates, existing)

    # ── Otomatik AI analiz: yeni bulunan hesapları hemen analiz et ──
    analyzed_count = 0
    if saved > 0:
        analyzed_count = _auto_analyze_new_accounts(all_candidates, existing)

    return {
        "total_found": len(all_candidates),
        "total_saved": saved,
        "total_analyzed": analyzed_count,
        "strategy_results": {k: len(v) for k, v in strategy_results.items()},
    }


def analyze_single_account(username: str, tweet_count: int = 20) -> dict | None:
    """Tek bir hesabı analiz et — Twikit ile tweet çek + AI ile değerlendir."""
    twikit = _get_twikit_client()
    if not twikit:
        logger.warning("Twikit client not available for account analysis")
        return None

    # Get user info
    user_info = twikit.get_user_info(username)
    time.sleep(0.5)

    # Get recent tweets
    tweets = twikit.get_user_tweets(username, count=tweet_count)
    time.sleep(0.5)

    if not tweets:
        logger.info("No tweets found for @%s", username)
        return None

    # AI analysis
    analysis = analyze_account_with_ai(username, tweets, user_info)

    return {
        "username": username,
        "profile": user_info,
        "recent_tweets": tweets[:10],
        "analysis": analysis,
        "tweet_count_fetched": len(tweets),
    }


def _auto_analyze_new_accounts(candidates: list[dict], existing: list[dict]) -> int:
    """Yeni keşfedilen hesapları otomatik AI ile analiz et.
    Maliyet önemli değil — her zaman en iyi sonuç için çalış.
    Auto-dismiss: content_relevance < 5 veya bot_probability > 40 → otomatik reddet.
    """
    try:
        from backend.modules.style_manager import load_suggested_accounts, save_suggested_accounts
    except ImportError:
        return 0

    existing_map = {a.get("username", "").lower(): a for a in existing}
    analyzed = 0

    # Sadece henüz analiz edilmemiş hesapları analiz et
    to_analyze = []
    for c in candidates:
        uname = c["username"].lower()
        record = existing_map.get(uname)
        if record and record.get("analysis"):
            continue  # Zaten analiz edilmiş
        to_analyze.append(uname)

    # Duplicate'leri kaldır
    to_analyze = list(dict.fromkeys(to_analyze))

    if not to_analyze:
        logger.info("Auto-analyze: tüm hesaplar zaten analiz edilmiş")
        return 0

    logger.info("Auto-analyze: %d yeni hesap analiz edilecek: %s",
                len(to_analyze), ", ".join(f"@{a}" for a in to_analyze[:10]))

    for username in to_analyze:
        try:
            result = analyze_single_account(username, tweet_count=20)
            if result and result.get("analysis"):
                analysis = result["analysis"]

                # Mevcut kayda analiz ekle
                accounts = load_suggested_accounts()
                for acc in accounts:
                    if acc.get("username", "").lower() == username:
                        acc["analysis"] = analysis
                        if result.get("profile"):
                            acc["profile"] = result["profile"]

                        # Auto-dismiss: düşük kalite veya bot riski
                        relevance = analysis.get("content_relevance", 0)
                        bot_prob = analysis.get("bot_probability", 100)
                        if relevance < 5 or bot_prob > 40:
                            acc["dismissed"] = True
                            acc["auto_dismissed"] = True
                            logger.info(
                                "Auto-dismiss: @%s (relevance=%s, bot=%s%%)",
                                username, relevance, bot_prob,
                            )
                        break
                save_suggested_accounts(accounts)
                analyzed += 1
                logger.info("Auto-analyze: @%s analiz edildi (skor: %s)",
                            username, analysis.get("overall_score", "?"))
            time.sleep(1)  # Rate limit koruması
        except Exception as e:
            logger.warning("Auto-analyze error for @%s: %s", username, e)

    logger.info("Auto-analyze: %d/%d hesap başarıyla analiz edildi", analyzed, len(to_analyze))
    return analyzed


def _merge_and_save(candidates: list[dict], existing: list[dict] | None = None) -> int:
    """Adayları mevcut önerilerle birleştir ve kaydet."""
    try:
        from backend.modules.style_manager import load_suggested_accounts, save_suggested_accounts
    except ImportError:
        return 0

    if existing is None:
        existing = load_suggested_accounts()

    now = datetime.datetime.now(TZ_TR)
    existing_map = {a.get("username", "").lower(): a for a in existing}
    new_count = 0

    for c in candidates:
        uname = c["username"].lower()
        c.setdefault("discovered_at", now.isoformat())
        c.setdefault("dismissed", False)

        if uname in existing_map:
            old = existing_map[uname]
            if c.get("score", 0) > old.get("score", 0):
                old.update({k: v for k, v in c.items() if v})
        else:
            existing.append(c)
            existing_map[uname] = c
            new_count += 1

    save_suggested_accounts(existing)
    logger.info("Account discoverer: %d new, %d total", new_count, len(existing))

    # Telegram notification for new accounts
    new_accounts = [c for c in candidates if c["username"].lower() not in {
        a.get("username", "").lower() for a in existing if a.get("discovered_at", "") < now.isoformat()
    }]
    if new_accounts and new_count > 0:
        _notify_new_accounts(new_accounts[:5])

    return new_count


def _notify_new_accounts(accounts: list[dict]):
    """Telegram bildirim — yeni keşfedilen hesaplar."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        lines = ["👤 Yeni Hesap Önerileri:\n"]
        for a in accounts[:5]:
            username = a["username"]
            strategy = a.get("discovery_strategy", "?")
            followers = a.get("followers", 0)
            lines.append(f"• @{username} ({followers:,} takipçi, {strategy})")
        lines.append("\n/kesif sayfasından izleme listesine ekleyebilirsin!")
        send_telegram_message("\n".join(lines), settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass
