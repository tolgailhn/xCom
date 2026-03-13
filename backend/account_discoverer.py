"""
Kapsamlı Hesap Keşfi Sistemi
Çoklu strateji ile AI/teknoloji alanında kaliteli X hesapları bulur ve AI ile analiz eder.

Stratejiler:
1. cache_based — Mevcut tarama cache'inden yüksek engagement'lı yazarlar
2. grok_search — Grok xAI ile X'te aktif hesap araması
3. trend_based — Trend cache'deki konularda en aktif yazarlar
4. interaction_based — İzlenen hesapların etkileşimde olduğu kişiler
"""
import datetime
import json
import logging
import re
import time
from collections import Counter
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Minimum criteria for suggesting an account
MIN_APPEARANCES = 2
MIN_AVG_ENGAGEMENT = 50
MIN_FOLLOWERS = 1000

# Grok search queries for finding AI accounts
GROK_ACCOUNT_QUERIES = [
    "AI researcher sharing latest LLM findings",
    "machine learning engineer building open source",
    "artificial intelligence startup founder",
    "AI journalist covering tech news",
    "deep learning developer sharing tutorials",
    "computer vision researcher publishing papers",
    "AI safety researcher working on alignment",
    "robotics engineer building autonomous systems",
    "data scientist sharing insights about AI models",
    "tech founder building AI products",
]


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


# ═══════════════════════════════════════════════════════════
# STRATEGY 1: Cache-based (mevcut mantık)
# ═══════════════════════════════════════════════════════════

def _strategy_cache_based(monitored: set, dismissed: set) -> list[dict]:
    """Tarama cache'inden yüksek engagement'lı yazarları bul."""
    try:
        from backend.modules.style_manager import load_discovery_cache, load_auto_scan_cache
    except ImportError:
        return []

    now = datetime.datetime.now(TZ_TR)
    cutoff = (now - datetime.timedelta(hours=48)).isoformat()

    discovery_tweets = load_discovery_cache()
    auto_scan_tweets = load_auto_scan_cache()

    author_appearances: Counter = Counter()
    author_engagement: Counter = Counter()
    author_followers: dict[str, int] = {}
    author_sample_tweets: dict[str, list[str]] = {}

    for tweets in [discovery_tweets, auto_scan_tweets]:
        for t in tweets:
            if t.get("scanned_at", "") < cutoff and t.get("created_at", "") < cutoff:
                continue

            author = (t.get("account", "") or t.get("author", "") or "").lower()
            if not author or author in monitored or author in dismissed:
                continue

            engagement = t.get("engagement_score", 0) or t.get("like_count", 0)
            followers = t.get("author_followers", 0)

            author_appearances[author] += 1
            author_engagement[author] += engagement
            if followers > author_followers.get(author, 0):
                author_followers[author] = followers

            text = (t.get("text", "") or "")[:200]
            if text:
                author_sample_tweets.setdefault(author, [])
                if len(author_sample_tweets[author]) < 3:
                    author_sample_tweets[author].append(text)

    candidates = []
    for author, count in author_appearances.items():
        if count < MIN_APPEARANCES:
            continue
        avg_engagement = author_engagement[author] / count
        if avg_engagement < MIN_AVG_ENGAGEMENT:
            continue

        followers = author_followers.get(author, 0)
        score = count * 50 + avg_engagement + (followers / 1000)

        candidates.append({
            "username": author,
            "appearances": count,
            "avg_engagement": round(avg_engagement, 1),
            "total_engagement": author_engagement[author],
            "followers": followers,
            "score": round(score, 1),
            "sample_tweets": author_sample_tweets.get(author, []),
            "sample_tweet": (author_sample_tweets.get(author, [""]))[0],
            "discovery_strategy": "cache_based",
        })

    return candidates


# ═══════════════════════════════════════════════════════════
# STRATEGY 2: Grok X Search
# ═══════════════════════════════════════════════════════════

def _strategy_grok_search(monitored: set, dismissed: set, max_results: int = 5) -> list[dict]:
    """Grok ile X'te AI hesaplarını ara."""
    try:
        from backend.config import get_settings
        from backend.modules.grok_client import _grok_responses_api, _parse_json_array, _track_cost
    except ImportError as e:
        logger.warning("Grok search import error: %s", e)
        return []

    settings = get_settings()
    api_key = getattr(settings, "grok_api_key", "") or ""
    if not api_key:
        logger.info("Grok API key not configured, skipping grok_search strategy")
        return []

    import random
    queries = random.sample(GROK_ACCOUNT_QUERIES, min(2, len(GROK_ACCOUNT_QUERIES)))

    all_accounts: dict[str, dict] = {}

    for query in queries:
        try:
            result = _grok_responses_api(
                messages=[
                    {"role": "system", "content": (
                        "You are a research assistant. Search X for accounts matching the query. "
                        "Return a JSON array of account objects. Return ONLY the JSON array."
                    )},
                    {"role": "user", "content": f"""Search X for: "{query}"

Find the top {max_results} most relevant X/Twitter accounts. For each account, provide:
- "username": the username (without @)
- "display_name": their display name
- "bio": their bio/description
- "followers": approximate follower count (number)
- "sample_tweet": one of their recent relevant tweets
- "relevance_reason": why this account is relevant (1 sentence)

Return ONLY the JSON array, no other text."""},
                ],
                tools=[{"type": "x_search"}],
                max_tokens=2000,
                temperature=0.1,
                api_key=api_key,
            )

            if not result or not result.get("text"):
                continue

            _track_cost(result.get("input_tokens", 0), result.get("output_tokens", 0))

            import re as _re
            raw = _re.sub(r'<think>.*?</think>', '', result["text"], flags=_re.DOTALL).strip()
            parsed = _parse_json_array(raw)

            for acc in (parsed or []):
                username = (acc.get("username", "") or "").lower().lstrip("@")
                if not username or username in monitored or username in dismissed:
                    continue
                if username in all_accounts:
                    continue

                all_accounts[username] = {
                    "username": username,
                    "appearances": 1,
                    "avg_engagement": 0,
                    "total_engagement": 0,
                    "followers": acc.get("followers", 0) or 0,
                    "score": 0,
                    "sample_tweets": [acc.get("sample_tweet", "")][:1],
                    "sample_tweet": acc.get("sample_tweet", ""),
                    "discovery_strategy": "grok_search",
                    "profile": {
                        "display_name": acc.get("display_name", ""),
                        "bio": acc.get("bio", ""),
                        "verified": False,
                    },
                    "grok_reason": acc.get("relevance_reason", ""),
                }

            time.sleep(1)  # Rate limit
        except Exception as e:
            logger.warning("Grok account search error for '%s': %s", query, e)

    candidates = list(all_accounts.values())[:max_results]
    return candidates


# ═══════════════════════════════════════════════════════════
# STRATEGY 3: Trend-based
# ═══════════════════════════════════════════════════════════

def _strategy_trend_based(monitored: set, dismissed: set, max_results: int = 5) -> list[dict]:
    """Trend cache'deki konularda en aktif yazarları bul."""
    try:
        from backend.modules.style_manager import load_trend_cache
    except ImportError:
        return []

    trend_data = load_trend_cache()
    trends = trend_data.get("trends", []) if isinstance(trend_data, dict) else trend_data
    if not trends:
        return []

    author_topics: dict[str, list[str]] = {}
    author_engagement: Counter = Counter()
    author_count: Counter = Counter()
    author_sample: dict[str, str] = {}

    for trend in trends:
        keyword = trend.get("keyword", "")
        for tw in trend.get("top_tweets", []):
            author = (tw.get("author", "") or tw.get("account", "") or "").lower()
            if not author or author in monitored or author in dismissed:
                continue

            author_topics.setdefault(author, [])
            if keyword and keyword not in author_topics[author]:
                author_topics[author].append(keyword)

            eng = tw.get("engagement_score", 0) or tw.get("like_count", 0)
            author_engagement[author] += eng
            author_count[author] += 1

            text = (tw.get("text", "") or "")[:200]
            if text and author not in author_sample:
                author_sample[author] = text

    candidates = []
    for author, topics in author_topics.items():
        if len(topics) < 1:
            continue
        count = author_count[author]
        avg_eng = author_engagement[author] / max(count, 1)

        candidates.append({
            "username": author,
            "appearances": count,
            "avg_engagement": round(avg_eng, 1),
            "total_engagement": author_engagement[author],
            "followers": 0,
            "score": len(topics) * 30 + avg_eng,
            "sample_tweets": [author_sample.get(author, "")],
            "sample_tweet": author_sample.get(author, ""),
            "discovery_strategy": "trend_based",
            "topics": topics[:5],
        })

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:max_results]


# ═══════════════════════════════════════════════════════════
# STRATEGY 4: Interaction-based
# ═══════════════════════════════════════════════════════════

def _strategy_interaction_based(monitored: set, dismissed: set, max_results: int = 5) -> list[dict]:
    """İzlenen hesapların etkileşimde olduğu (reply/quote) kişileri bul."""
    try:
        from backend.modules.style_manager import load_discovery_cache
    except ImportError:
        return []

    discovery_tweets = load_discovery_cache()
    mention_count: Counter = Counter()
    mention_context: dict[str, str] = {}

    for t in discovery_tweets:
        text = t.get("text", "") or ""

        # Extract mentions from tweet text
        mentions = re.findall(r'@(\w+)', text)
        for m in mentions:
            m_lower = m.lower()
            if m_lower in monitored or m_lower in dismissed:
                continue
            mention_count[m_lower] += 1
            if m_lower not in mention_context:
                mention_context[m_lower] = text[:200]

        # Check reply_to / quote_of fields
        for field in ["reply_to_user", "quoted_user"]:
            user = (t.get(field, "") or "").lower()
            if user and user not in monitored and user not in dismissed:
                mention_count[user] += 1
                if user not in mention_context:
                    mention_context[user] = f"Etkileşim: {text[:150]}"

    candidates = []
    for author, count in mention_count.most_common(max_results * 2):
        if count < 2:
            break
        candidates.append({
            "username": author,
            "appearances": count,
            "avg_engagement": 0,
            "total_engagement": 0,
            "followers": 0,
            "score": count * 40,
            "sample_tweets": [mention_context.get(author, "")],
            "sample_tweet": mention_context.get(author, ""),
            "discovery_strategy": "interaction_based",
        })

    return candidates[:max_results]


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

    monitored, dismissed, existing = _get_monitored_and_dismissed()
    candidates = _strategy_cache_based(monitored, dismissed)

    if not candidates:
        logger.info("Account discoverer: no new accounts to suggest")
        return

    _merge_and_save(candidates, existing)


def discover_accounts_smart(
    strategies: list[str] | None = None,
    max_per_strategy: int = 5,
) -> dict:
    """Çoklu strateji ile akıllı hesap keşfi."""
    if strategies is None:
        strategies = ["cache_based", "grok_search", "trend_based", "interaction_based"]

    monitored, dismissed, existing = _get_monitored_and_dismissed()

    strategy_results: dict[str, list] = {}
    all_candidates: list[dict] = []

    for strategy in strategies:
        try:
            if strategy == "cache_based":
                found = _strategy_cache_based(monitored, dismissed)
            elif strategy == "grok_search":
                found = _strategy_grok_search(monitored, dismissed, max_per_strategy)
            elif strategy == "trend_based":
                found = _strategy_trend_based(monitored, dismissed, max_per_strategy)
            elif strategy == "interaction_based":
                found = _strategy_interaction_based(monitored, dismissed, max_per_strategy)
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
                # Mevcut kayda analiz ekle
                accounts = load_suggested_accounts()
                for acc in accounts:
                    if acc.get("username", "").lower() == username:
                        acc["analysis"] = result["analysis"]
                        if result.get("profile"):
                            acc["profile"] = result["profile"]
                        break
                save_suggested_accounts(accounts)
                analyzed += 1
                logger.info("Auto-analyze: @%s analiz edildi (skor: %s)",
                            username, result["analysis"].get("overall_score", "?"))
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

    # Telegram notification for high-score accounts
    high_score = [c for c in candidates if c.get("score", 0) >= 300 and c["username"].lower() not in existing_map]
    if high_score:
        _notify_new_accounts(high_score)

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
            score = a.get("score", 0)
            strategy = a.get("discovery_strategy", "?")
            lines.append(f"• @{username} (skor: {score:.0f}, strateji: {strategy})")
        lines.append("\n/kesif sayfasından izleme listesine ekleyebilirsin!")
        send_telegram_message("\n".join(lines), settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass
