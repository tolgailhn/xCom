"""
Tweet Analyzer Module
Pulls tweets from any account via Twikit and analyzes engagement patterns.
Used to "train" AI (in-context learning) with real high-performing tweet data.
"""
import json
import datetime
import re
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
ANALYSES_DIR = DATA_DIR / "tweet_analyses"


def _safe_int(val) -> int:
    """Safely convert a value to int (twikit sometimes returns strings)."""
    if val is None:
        return 0
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0


def pull_user_tweets(twikit_client, username: str, count: int = 500,
                     progress_callback=None) -> list[dict]:
    """
    Pull last N tweets from a user via Twikit with full pagination.
    Returns list of tweet dicts with engagement data.
    """
    if not twikit_client or not twikit_client.is_authenticated:
        raise ValueError("Twikit client not authenticated")

    tweets = twikit_client.get_user_tweets(
        username, count=count, progress_callback=progress_callback
    )

    if progress_callback:
        progress_callback(f"@{username}: {len(tweets)} tweet çekildi. Analiz yapılıyor...")

    return tweets


def calculate_engagement_score(tweet: dict) -> float:
    """
    Calculate weighted engagement score based on X algorithm weights.
    RT = 20x, Reply = 13.5x, Like = 1x, Bookmark ≈ 10x
    """
    rt = _safe_int(tweet.get("retweet_count", 0))
    reply = _safe_int(tweet.get("reply_count", 0))
    like = _safe_int(tweet.get("like_count", 0))
    impressions = _safe_int(tweet.get("impression_count", 0))

    score = (rt * 20) + (reply * 13.5) + (like * 1)

    # Engagement rate bonus (if impressions available)
    if impressions > 0:
        engagement_rate = (rt + reply + like) / impressions
        score *= (1 + engagement_rate)

    return round(score, 2)


def extract_keywords(text: str) -> list[str]:
    """Extract meaningful keywords from tweet text."""
    # Remove URLs, mentions, hashtags for keyword extraction
    clean = re.sub(r'https?://\S+', '', text)
    clean = re.sub(r'@\w+', '', clean)
    clean = re.sub(r'#(\w+)', r'\1', clean)  # Keep hashtag words
    clean = re.sub(r'[^\w\s]', ' ', clean)

    # Turkish + English stop words
    stop_words = {
        'bir', 'bu', 'da', 'de', 've', 'ile', 'için', 'var', 'yok', 'ama',
        'çok', 'daha', 'en', 'gibi', 'ben', 'sen', 'biz', 'siz', 'onlar',
        'ne', 'nasıl', 'neden', 'kadar', 'olan', 'olan', 'olarak', 'sonra',
        'the', 'is', 'at', 'in', 'on', 'and', 'or', 'to', 'a', 'an', 'of',
        'for', 'it', 'this', 'that', 'with', 'are', 'was', 'be', 'has',
        'have', 'from', 'by', 'not', 'but', 'its', 'they', 'their', 'you',
        'we', 'can', 'all', 'will', 'just', 'been', 'than', 'more', 'so',
        'şu', 'her', 'hem', 'mi', 'mı', 'mu', 'mü', 'ki', 'ya',
        'diyor', 'olan', 'oldu', 'olur', 'olmuş', 'olan', 'ise', 'bunu',
    }

    words = clean.lower().split()
    keywords = [w for w in words if len(w) > 2 and w not in stop_words]
    return keywords


def _extract_style_dna(original_tweets: list[dict]) -> dict:
    """
    Deep writing style analysis from ALL original tweets.
    Extracts signature words, phrases, patterns, hooks, tone characteristics.
    This data is used by build_training_context for human-like AI writing.
    """
    if not original_tweets:
        return {}

    all_texts = [t.get("text", "") for t in original_tweets]

    # 1. Lowercase/uppercase start analysis
    lowercase_count = sum(1 for text in all_texts if text.strip() and text.strip()[0].islower())
    lowercase_pct = round(lowercase_count * 100 / len(all_texts)) if all_texts else 0

    # 2. Length analysis
    lengths = [len(t) for t in all_texts if t]
    avg_len = sum(lengths) // len(lengths) if lengths else 0

    # 3. Signature words (daily/casual language markers)
    all_words = []
    for text in all_texts:
        all_words.extend(text.lower().split())
    word_count = Counter(all_words)

    casual_markers = [
        "olm", "yani", "artık", "bile", "şey", "sadece", "şimdi", "adam", "zaten",
        "ya", "bak", "böyle", "öyle", "güzel", "mesela", "aslında", "abi",
        "gerçekten", "neyse", "valla", "sonuçta", "kısacası", "ulan", "tamam",
        "hadi", "lan", "höcaam", "cidden", "harbiden", "arkadaşım", "kardeşim",
        "bence", "resmen", "net", "açık", "bedava", "millet", "aga", "beyler",
        "üstelik", "henüz", "çıktı", "geldi", "tarafı", "sessiz", "sedasız",
    ]
    signature_words = {}
    for w in casual_markers:
        if word_count[w] > 0:
            signature_words[w] = word_count[w]
    signature_words = dict(sorted(signature_words.items(), key=lambda x: x[1], reverse=True))

    # 4. Signature phrases
    phrase_candidates = [
        "olm", "ok.", "güzel kardeşim", "o yüzden", "aslında", "biliyor musun",
        "diyor ki", "bayanlar baylar", "bak şimdi", "şu an", "bu adam",
        "az önce", "anladın mı", "test ettim", "sevgiler", "algoritma tanrıları",
        "bi baktım", "sessiz sedasız", "bence", "gördüğüm kadarıyla",
        "asıl mesele", "artık", "cidden", "harbiden", "açık kaynak",
        "bu gidişle", "benim gördüğüm", "güzel gelişme", "denemek lazım",
    ]
    signature_phrases = {}
    for phrase in phrase_candidates:
        count = sum(1 for t in all_texts if phrase in t.lower())
        if count > 0:
            signature_phrases[phrase] = count
    signature_phrases = dict(sorted(signature_phrases.items(), key=lambda x: x[1], reverse=True))

    # 5. Hook examples from top performing tweets
    sorted_by_score = sorted(original_tweets, key=lambda x: x.get("engagement_score", 0), reverse=True)
    hook_examples = []
    for t in sorted_by_score[:15]:
        first_line = t["text"].split("\n")[0][:200]
        if first_line.strip():
            hook_examples.append(first_line.strip())

    # 6. Ending style
    endings = {"nokta": 0, "noktasiz": 0, "soru": 0, "sevgiler": 0, "link": 0}
    for text in all_texts:
        text = text.strip()
        if "sevgiler" in text.lower()[-30:]:
            endings["sevgiler"] += 1
        elif text.endswith("?"):
            endings["soru"] += 1
        elif "https://t.co" in text[-50:]:
            endings["link"] += 1
        elif text.endswith("."):
            endings["nokta"] += 1
        else:
            endings["noktasiz"] += 1

    # 7. Emoji usage
    emoji_count = sum(1 for t in all_texts if re.search(r"[\U0001f600-\U0001f9ff]", t))
    emoji_pct = round(emoji_count * 100 / len(all_texts)) if all_texts else 0

    return {
        "kucuk_harf_yuzde": lowercase_pct,
        "ortalama_uzunluk": avg_len,
        "imza_kelimeleri": signature_words,
        "imza_kaliplari": signature_phrases,
        "hook_ornekleri": hook_examples,
        "kapanis_tercihi": endings,
        "emoji_yuzde": emoji_pct,
        "tweet_sayisi": len(all_texts),
    }


def analyze_tweets(tweets: list[dict]) -> dict:
    """
    Full engagement analysis of pulled tweets.
    Returns structured analysis data.
    Saves ALL tweet texts (originals separated from RTs) for style training.
    """
    if not tweets:
        return {"error": "No tweets to analyze"}

    # Calculate engagement scores
    for tweet in tweets:
        tweet["engagement_score"] = calculate_engagement_score(tweet)

    # Separate original tweets from retweets
    original_tweets = []
    retweet_tweets = []
    for t in tweets:
        text = t.get("text", "")
        tweet_data = {
            "text": text,
            "engagement_score": t["engagement_score"],
            "like_count": t.get("like_count", 0),
            "retweet_count": t.get("retweet_count", 0),
            "reply_count": t.get("reply_count", 0),
            "impression_count": t.get("impression_count", 0),
            "created_at": str(t.get("created_at", "")),
        }
        if text.startswith("RT @"):
            retweet_tweets.append(tweet_data)
        else:
            original_tweets.append(tweet_data)

    # Sort by engagement score
    sorted_tweets = sorted(tweets, key=lambda t: t["engagement_score"], reverse=True)
    sorted_originals = sorted(original_tweets, key=lambda t: t["engagement_score"], reverse=True)

    # Top performing tweets (backwards compatible)
    top_tweets = []
    for t in sorted_tweets[:30]:
        top_tweets.append({
            "text": t.get("text", ""),
            "engagement_score": t["engagement_score"],
            "like_count": t.get("like_count", 0),
            "retweet_count": t.get("retweet_count", 0),
            "reply_count": t.get("reply_count", 0),
            "impression_count": t.get("impression_count", 0),
            "created_at": str(t.get("created_at", "")),
        })

    # Keyword-engagement correlation
    keyword_engagement = {}
    keyword_count = Counter()
    all_keywords = []

    for tweet in tweets:
        keywords = extract_keywords(tweet.get("text", ""))
        score = tweet["engagement_score"]
        all_keywords.extend(keywords)

        for kw in set(keywords):  # unique per tweet
            if kw not in keyword_engagement:
                keyword_engagement[kw] = {"total_score": 0, "count": 0}
            keyword_engagement[kw]["total_score"] += score
            keyword_engagement[kw]["count"] += 1
            keyword_count[kw] += 1

    # Average engagement per keyword
    keyword_avg = {}
    for kw, data in keyword_engagement.items():
        if data["count"] >= 3:  # At least 3 tweets with this keyword
            keyword_avg[kw] = round(data["total_score"] / data["count"], 2)

    # Sort by average engagement
    top_keywords = sorted(keyword_avg.items(), key=lambda x: x[1], reverse=True)[:30]
    most_used = keyword_count.most_common(30)

    # Tweet length analysis
    short_tweets = [t for t in tweets if len(t.get("text", "")) <= 280]
    medium_tweets = [t for t in tweets if 280 < len(t.get("text", "")) <= 500]
    long_tweets = [t for t in tweets if len(t.get("text", "")) > 500]

    def avg_score(tweet_list):
        if not tweet_list:
            return 0
        return round(sum(t["engagement_score"] for t in tweet_list) / len(tweet_list), 2)

    length_analysis = {
        "short": {"count": len(short_tweets), "avg_score": avg_score(short_tweets)},
        "medium": {"count": len(medium_tweets), "avg_score": avg_score(medium_tweets)},
        "long": {"count": len(long_tweets), "avg_score": avg_score(long_tweets)},
    }

    # Question vs statement analysis
    question_tweets = [t for t in tweets if "?" in t.get("text", "")]
    statement_tweets = [t for t in tweets if "?" not in t.get("text", "")]

    question_analysis = {
        "question_tweets": {"count": len(question_tweets), "avg_score": avg_score(question_tweets)},
        "statement_tweets": {"count": len(statement_tweets), "avg_score": avg_score(statement_tweets)},
    }

    # Hashtag analysis
    hashtag_engagement = {}
    for tweet in tweets:
        hashtags = re.findall(r'#(\w+)', tweet.get("text", ""))
        score = tweet["engagement_score"]
        for tag in hashtags:
            tag_lower = tag.lower()
            if tag_lower not in hashtag_engagement:
                hashtag_engagement[tag_lower] = {"total_score": 0, "count": 0, "original": tag}
            hashtag_engagement[tag_lower]["total_score"] += score
            hashtag_engagement[tag_lower]["count"] += 1

    top_hashtags = sorted(
        [
            {"tag": f"#{v['original']}", "count": v["count"],
             "avg_score": round(v["total_score"] / v["count"], 2)}
            for v in hashtag_engagement.values()
            if v["count"] >= 2
        ],
        key=lambda x: x["avg_score"], reverse=True
    )[:15]

    # Overall stats
    total_likes = sum(_safe_int(t.get("like_count", 0)) for t in tweets)
    total_rts = sum(_safe_int(t.get("retweet_count", 0)) for t in tweets)
    total_replies = sum(_safe_int(t.get("reply_count", 0)) for t in tweets)
    avg_engagement = avg_score(tweets)

    # Posting time analysis (hour distribution)
    hour_engagement = {}
    for tweet in tweets:
        created = tweet.get("created_at")
        if created and hasattr(created, 'hour'):
            hour = created.hour
            if hour not in hour_engagement:
                hour_engagement[hour] = {"total_score": 0, "count": 0}
            hour_engagement[hour]["total_score"] += tweet["engagement_score"]
            hour_engagement[hour]["count"] += 1

    best_hours = sorted(
        [{"hour": h, "avg_score": round(d["total_score"] / d["count"], 2), "tweet_count": d["count"]}
         for h, d in hour_engagement.items() if d["count"] >= 3],
        key=lambda x: x["avg_score"], reverse=True
    )[:5]

    # Build style DNA from all original tweets
    style_dna = _extract_style_dna(original_tweets)

    return {
        "total_tweets": len(tweets),
        "total_likes": total_likes,
        "total_retweets": total_rts,
        "total_replies": total_replies,
        "avg_engagement_score": avg_engagement,
        "top_tweets": top_tweets,
        # ALL tweet texts for comprehensive style training
        "all_original_tweets": sorted_originals,
        "all_retweets": retweet_tweets,
        "original_count": len(original_tweets),
        "retweet_count": len(retweet_tweets),
        "top_keywords": [{"keyword": kw, "avg_score": sc} for kw, sc in top_keywords],
        "most_used_keywords": [{"keyword": kw, "count": cnt} for kw, cnt in most_used],
        "length_analysis": length_analysis,
        "question_analysis": question_analysis,
        "top_hashtags": top_hashtags,
        "best_hours": best_hours,
        "style_dna": style_dna,
    }


def generate_ai_analysis(analysis_data: dict, ai_client, ai_model: str,
                          ai_provider: str, username: str) -> str:
    """
    Use AI to generate a human-readable analysis report from the data.
    This report becomes part of the training context for MiniMax.
    """
    top_tweets_text = ""
    for i, t in enumerate(analysis_data.get("top_tweets", [])[:15], 1):
        top_tweets_text += f"\n{i}. [{t['engagement_score']} puan | ❤️{t['like_count']} 🔁{t['retweet_count']} 💬{t['reply_count']}]\n\"{t['text'][:300]}\"\n"

    keywords_text = ", ".join([f"{k['keyword']}({k['avg_score']})" for k in analysis_data.get("top_keywords", [])[:15]])

    length_data = analysis_data.get("length_analysis", {})
    question_data = analysis_data.get("question_analysis", {})

    prompt = f"""@{username} hesabının son {analysis_data['total_tweets']} tweet'ini analiz ettim.

## GENEL İSTATİSTİKLER:
- Toplam: {analysis_data['total_tweets']} tweet
- Toplam Like: {analysis_data['total_likes']:,} | RT: {analysis_data['total_retweets']:,} | Reply: {analysis_data['total_replies']:,}
- Ortalama Engagement Skoru: {analysis_data['avg_engagement_score']}

## EN İYİ PERFORMANS GÖSTEREN TWEET'LER:
{top_tweets_text}

## UZUNLUK ANALİZİ:
- Kısa (≤280): {length_data.get('short', {}).get('count', 0)} tweet, ort. skor: {length_data.get('short', {}).get('avg_score', 0)}
- Orta (281-500): {length_data.get('medium', {}).get('count', 0)} tweet, ort. skor: {length_data.get('medium', {}).get('avg_score', 0)}
- Uzun (>500): {length_data.get('long', {}).get('count', 0)} tweet, ort. skor: {length_data.get('long', {}).get('avg_score', 0)}

## SORU vs BEYANI:
- Soru içeren: {question_data.get('question_tweets', {}).get('count', 0)} tweet, ort. skor: {question_data.get('question_tweets', {}).get('avg_score', 0)}
- Beyan: {question_data.get('statement_tweets', {}).get('count', 0)} tweet, ort. skor: {question_data.get('statement_tweets', {}).get('avg_score', 0)}

## EN ETKİLEŞİM ÇEKEN KELİMELER:
{keywords_text}

---

Bu verilere dayanarak detaylı bir analiz raporu yaz. Şunları kapsamalı:

1. **Genel Yazım Tarzı**: Bu hesap nasıl yazıyor? Ton, dil, yaklaşım
2. **Ne İşe Yarıyor**: Hangi tarz tweet'ler en çok etkileşim alıyor? Neden?
3. **Hook Kalıpları**: En iyi tweet'lerin açılış cümleleri nasıl? Ortak kalıplar neler?
4. **Kelime Stratejisi**: Hangi kelimeler/konular etkileşim çekiyor?
5. **Uzunluk Stratejisi**: Kısa mı uzun mu daha iyi performans gösteriyor?
6. **Soru Kullanımı**: Sorularla biten tweet'ler daha mı iyi?
7. **Tavsiyeler**: Bu hesabın tarzını taklit etmek isteyen biri ne yapmalı?

Raporu Türkçe yaz. Spesifik örnekler ver. Genel klişeler değil, VERİYE DAYALI analiz yap."""

    system = """Sen bir Twitter/X içerik analisti ve strateji uzmanısın.
Tweet verilerini analiz edip, etkileşim kalıplarını tespit ediyorsun.
Raporların veriye dayalı, spesifik ve uygulanabilir olmalı."""

    try:
        if ai_provider == "anthropic":
            response = ai_client.messages.create(
                model=ai_model,
                max_tokens=4000,
                system=system,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
            )
            return response.content[0].text.strip()
        else:
            response = ai_client.chat.completions.create(
                model=ai_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=4000,
                temperature=0.7,
            )
            text = response.choices[0].message.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            return text
    except Exception as e:
        return f"AI analiz hatası: {e}"


def save_tweet_analysis(username: str, analysis: dict, ai_report: str = "",
                        session_state=None):
    """
    Save tweet analysis to JSON file AND session_state.
    If a previous analysis exists for the same username, merges
    all_original_tweets (dedup by text[:100]) and recalculates style DNA.
    """
    # --- Eski analizi yükle ve birleştir ---
    existing = load_tweet_analysis(username, session_state)
    if existing:
        old_analysis = existing.get("analysis", {})
        old_originals = old_analysis.get("all_original_tweets", [])
        new_originals = analysis.get("all_original_tweets", [])

        if old_originals and new_originals:
            # Fingerprint ile dedup
            seen = {t.get("text", "")[:100] for t in new_originals}
            merged = list(new_originals)  # yeni olanlar önce
            merged_count = 0
            for t in old_originals:
                fp = t.get("text", "")[:100]
                if fp not in seen:
                    seen.add(fp)
                    merged.append(t)
                    merged_count += 1

            if merged_count > 0:
                analysis["all_original_tweets"] = merged
                # DNA'yı birleşik veriden yeniden hesapla
                analysis["style_dna"] = _extract_style_dna(merged)
                analysis["original_count"] = len(merged)
                analysis["merge_info"] = {
                    "previous_count": len(old_originals),
                    "new_count": len(new_originals),
                    "merged_total": len(merged),
                    "added_from_old": merged_count,
                }

        # Eski retweet'leri de birleştir
        old_rts = old_analysis.get("all_retweets", [])
        new_rts = analysis.get("all_retweets", [])
        if old_rts and new_rts:
            rt_seen = {t.get("text", "")[:100] for t in new_rts}
            for t in old_rts:
                if t.get("text", "")[:100] not in rt_seen:
                    new_rts.append(t)
            analysis["all_retweets"] = new_rts
            analysis["retweet_count"] = len(new_rts)

    data = {
        "username": username,
        "analyzed_at": datetime.datetime.now().isoformat(),
        "analysis": analysis,
        "ai_report": ai_report,
    }

    # Save to session_state (persists during Streamlit session)
    if session_state is not None:
        if "tweet_analyses" not in session_state:
            session_state["tweet_analyses"] = {}
        session_state["tweet_analyses"][username.lower()] = data

    # Also save to file (persists locally or if committed to repo)
    try:
        ANALYSES_DIR.mkdir(parents=True, exist_ok=True)
        path = ANALYSES_DIR / f"{username.lower()}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    except Exception:
        pass  # File save may fail on read-only systems, session_state is primary


def load_tweet_analysis(username: str, session_state=None) -> dict | None:
    """Load tweet analysis — checks session_state first, then files."""
    # Check session_state first
    if session_state is not None:
        analyses = session_state.get("tweet_analyses", {})
        if username.lower() in analyses:
            return analyses[username.lower()]

    # Fall back to file
    path = ANALYSES_DIR / f"{username.lower()}.json"
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Also populate session_state for future reads
            if session_state is not None:
                if "tweet_analyses" not in session_state:
                    session_state["tweet_analyses"] = {}
                session_state["tweet_analyses"][username.lower()] = data
            return data
        except Exception:
            pass
    return None


def load_all_analyses(session_state=None) -> list[dict]:
    """Load all analyses — merges session_state and file system."""
    analyses_map = {}

    # Load from files first
    if ANALYSES_DIR.exists():
        for path in ANALYSES_DIR.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                key = data.get("username", path.stem).lower()
                analyses_map[key] = data
            except Exception:
                continue

    # Overlay with session_state (more recent)
    if session_state is not None:
        for key, data in session_state.get("tweet_analyses", {}).items():
            analyses_map[key] = data

    # Also sync session_state with everything found
    if session_state is not None and analyses_map:
        if "tweet_analyses" not in session_state:
            session_state["tweet_analyses"] = {}
        session_state["tweet_analyses"].update(analyses_map)

    analyses = list(analyses_map.values())
    return sorted(analyses, key=lambda x: x.get("analyzed_at", ""), reverse=True)


def delete_tweet_analysis(username: str, session_state=None) -> bool:
    """Delete a saved analysis from both session_state and file."""
    deleted = False

    # Remove from session_state
    if session_state is not None:
        analyses = session_state.get("tweet_analyses", {})
        if username.lower() in analyses:
            del analyses[username.lower()]
            deleted = True

    # Remove file
    path = ANALYSES_DIR / f"{username.lower()}.json"
    if path.exists():
        try:
            path.unlink()
            deleted = True
        except Exception:
            pass

    return deleted


def export_all_analyses(session_state=None) -> str:
    """Export all analyses as a single JSON string for download."""
    analyses = load_all_analyses(session_state)
    export_data = {
        "type": "tweet_analyses_export",
        "exported_at": datetime.datetime.now().isoformat(),
        "analyses": {a["username"].lower(): a for a in analyses},
    }
    return json.dumps(export_data, ensure_ascii=False, indent=2, default=str)


def import_analyses_from_json(json_str: str, session_state=None) -> int:
    """Import analyses from a JSON string. Returns count of imported analyses."""
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        return 0

    analyses = data.get("analyses", {})
    if not analyses:
        return 0

    count = 0
    for username, analysis_data in analyses.items():
        # Save to session_state
        if session_state is not None:
            if "tweet_analyses" not in session_state:
                session_state["tweet_analyses"] = {}
            session_state["tweet_analyses"][username.lower()] = analysis_data

        # Save to file
        try:
            ANALYSES_DIR.mkdir(parents=True, exist_ok=True)
            path = ANALYSES_DIR / f"{username.lower()}.json"
            with open(path, "w", encoding="utf-8") as f:
                json.dump(analysis_data, f, ensure_ascii=False, indent=2, default=str)
        except Exception:
            pass

        count += 1

    return count


def build_training_context(analyses: list[dict], max_examples: int = 50, topic: str = "") -> str:
    """
    Build optimized training context string from saved analyses.
    This gets injected into the system prompt for MiniMax/AI.

    Strategy: Style DNA rules + curated tweet examples (~5K tokens)
    instead of dumping all 340 tweets (~112K chars) which blows API limits.
    """
    if not analyses:
        return ""

    context_parts = []

    for analysis_data in analyses[:5]:  # Max 5 accounts
        username = analysis_data.get("username", "unknown")
        analysis = analysis_data.get("analysis", {})
        ai_report = analysis_data.get("ai_report", "")
        style_dna = analysis.get("style_dna", {})

        # --- SECTION 1: STYLE DNA RULES (most important, compact) ---
        if style_dna:
            dna_rules = []

            # Lowercase rule
            lc_pct = style_dna.get("kucuk_harf_yuzde", 0)
            if lc_pct > 80:
                dna_rules.append(
                    f"- KÜÇÜK HARF: Tweet'lerin %{lc_pct}'i küçük harfle başlıyor. "
                    f"SEN DE küçük harfle başla. Büyük harf KULLANMA (isimler hariç: OpenAI, Claude vs.)"
                )

            # Signature words
            sig_words = style_dna.get("imza_kelimeleri", {})
            if sig_words:
                top_words = list(sig_words.items())[:15]
                words_text = ", ".join([f'"{w}"({c}x)' for w, c in top_words])
                dna_rules.append(
                    f"- İMZA KELİMELERİ (bunları sık kullan): {words_text}"
                )

            # Signature phrases
            sig_phrases = style_dna.get("imza_kaliplari", {})
            if sig_phrases:
                top_phrases = list(sig_phrases.items())[:10]
                phrases_text = ", ".join([f'"{p}"({c}x)' for p, c in top_phrases])
                dna_rules.append(
                    f"- İMZA KALIPLARl (doğal şekilde kullan): {phrases_text}"
                )

            # Emoji rule
            emoji_pct = style_dna.get("emoji_yuzde", 0)
            if emoji_pct < 5:
                dna_rules.append(
                    f"- EMOJİ: Neredeyse hiç kullanmıyor (%{emoji_pct}). Emoji KOYMA."
                )

            # Ending style
            endings = style_dna.get("kapanis_tercihi", {})
            if endings:
                dominant = max(endings, key=endings.get) if endings else "nokta"
                if dominant == "sevgiler":
                    dna_rules.append('- KAPANIŞ: Bazen "sevgiler." ile bitirir.')
                elif dominant == "noktasiz":
                    dna_rules.append("- KAPANIŞ: Genelde noktasız bitirir, doğal akış.")
                elif dominant == "nokta":
                    dna_rules.append("- KAPANIŞ: Genelde nokta ile bitirir.")

            # Length
            avg_len = style_dna.get("ortalama_uzunluk", 0)
            if avg_len:
                dna_rules.append(f"- UZUNLUK: Ortalama {avg_len} karakter. Orta-uzun tweet'ler.")

            if dna_rules:
                context_parts.append(
                    f"### @{username} - YAZIM TARZI DNA'SI ({style_dna.get('tweet_sayisi', 0)} tweet'ten çıkarıldı):\n"
                    + chr(10).join(dna_rules)
                )

            # Hook examples from DNA
            hooks = style_dna.get("hook_ornekleri", [])
            if hooks:
                hook_text = chr(10).join([f'- "{h}"' for h in hooks[:10]])
                context_parts.append(
                    f"### @{username} - EN ETKİLİ HOOK'LAR (bu açılış tarzlarını kullan):\n"
                    + hook_text
                )

        # --- SECTION 2: CURATED TWEET EXAMPLES (style training) ---
        # Havuz dolu olsa bile, analiz örnekleri her zaman eklenir (çeşitlilik için)
        all_originals = analysis.get("all_original_tweets", [])

        if all_originals:
            import random as _rnd

            # Tüm orijinal tweet'lerden akıllı seçim:
            # - Top %20 engagement (en iyi performans)
            # - Mid %30-60 arası (orta segment, doğal ton)
            # - Rastgele %20 (çeşitlilik, tekrar önleme)
            # - Son 10 tweet (güncel tarz)
            sorted_by_score = sorted(all_originals, key=lambda x: x.get("engagement_score", 0), reverse=True)

            n = len(sorted_by_score)
            top_count = max(8, n // 5)        # en az 8, toplam %20
            mid_start = n // 3
            mid_end = (n * 2) // 3
            mid_count = max(8, n // 5)

            top_examples = sorted_by_score[:top_count]
            mid_pool = sorted_by_score[mid_start:mid_end]
            mid_examples = _rnd.sample(mid_pool, min(mid_count, len(mid_pool))) if mid_pool else []

            # Son tweet'ler (güncel tarz)
            sorted_by_date = sorted(
                all_originals,
                key=lambda x: x.get("created_at", ""),
                reverse=True
            )
            recent_examples = sorted_by_date[:8]

            # Rastgele seçim (her çağrıda farklı kombinasyon)
            remaining = [t for t in all_originals
                         if t not in top_examples and t not in recent_examples]
            random_count = max(6, n // 10)
            random_examples = _rnd.sample(remaining, min(random_count, len(remaining))) if remaining else []

            seen_texts = set()
            curated = []
            for t in top_examples + mid_examples + recent_examples + random_examples:
                text = t.get("text", "").strip()
                if text and len(text) > 30 and text[:100] not in seen_texts:
                    seen_texts.add(text[:100])
                    display_text = text[:500] + "..." if len(text) > 500 else text
                    curated.append(f'"{display_text}"')

            # Karıştır ki AI sıralama etkisine kapılmasın
            _rnd.shuffle(curated)

            if curated:
                context_parts.append(
                    f"### @{username} - YAZIM TARZI ÖRNEKLERİ "
                    f"({len(curated)} seçilmiş tweet / toplam {len(all_originals)} orijinal):\n"
                    f"Bu tweet'lerin TONUNU, CÜMLE YAPISINI, KELİME SEÇİMİNİ "
                    f"ve YAZIM TARZINI birebir model al. Her tweet üretiminde "
                    f"FARKLI örneklerden ilham al, aynı kalıpları TEKRARLAMA:\n\n"
                    + "\n---\n".join(curated)
                )

        # --- SECTION 3: ENGAGEMENT STRATEGY ---
        top_tweets = analysis.get("top_tweets", [])
        top_originals = [t for t in top_tweets if not t.get("text", "").startswith("RT @")]
        top_to_show = top_originals[:max_examples // max(len(analyses), 1)]

        if top_to_show:
            examples = []
            for t in top_to_show:
                score = t["engagement_score"]
                likes = t["like_count"]
                rts = t["retweet_count"]
                replies = t["reply_count"]
                txt = t["text"][:400]
                examples.append(
                    f'- "{txt}" [Skor:{score} | L:{likes} RT:{rts} R:{replies}]'
                )

            context_parts.append(
                "### @" + username + " - EN ÇOK ETKİLEŞİM ALAN ORİJİNAL TWEET'LER:\n"
                + chr(10).join(examples)
            )

        # Fallback: if no all_original_tweets, use top_tweets (old format)
        if not all_originals and top_tweets:
            examples = []
            for t in top_tweets[:max_examples // max(len(analyses), 1)]:
                score = t["engagement_score"]
                likes = t["like_count"]
                rts = t["retweet_count"]
                replies = t["reply_count"]
                txt = t["text"][:400]
                examples.append(
                    f'- "{txt}" [Skor:{score} | L:{likes} RT:{rts} R:{replies}]'
                )
            context_parts.append(
                "### @" + username + " - En İyi Performans Gösteren Tweet'ler:\n"
                + chr(10).join(examples)
            )

        # Top keywords
        top_kw = analysis.get("top_keywords", [])[:10]
        if top_kw:
            kw_text = ", ".join(
                [f"{k['keyword']}(skor:{k['avg_score']})" for k in top_kw]
            )
            context_parts.append(
                "### @" + username + " - Etkileşim Çeken Kelimeler: " + kw_text
            )

        # Most used keywords (writing DNA)
        most_used = analysis.get("most_used_keywords", [])[:15]
        if most_used:
            mu_text = ", ".join(
                [f"{k['keyword']}({k['count']}x)" for k in most_used]
            )
            context_parts.append(
                "### @" + username + " - En Sık Kullanılan Kelimeler (Yazım DNA'sı): " + mu_text
            )

        # AI report (trimmed)
        if ai_report:
            report_lines = ai_report.split("\n")
            short_report = "\n".join(report_lines[:30])
            context_parts.append(
                f"### @{username} - Tarz Analizi:\n{short_report}"
            )

    # --- TWEET HAVUZU ÖRNEKLERİ + HAVUZ DNA'SI ---
    try:
        from backend.modules.tweet_pool import load_pool, select_examples, build_pool_training_context, get_pool_dna
        pool_data = load_pool()
        if pool_data.get("pool") and len(pool_data["pool"]) >= 10:
            # --- ÖNCELİK 1: Claude AI tarafından oluşturulan derin DNA ---
            ai_dna = pool_data.get("pool_dna_ai")
            if ai_dna:
                ai_dna_parts = []

                # Yazım tarzı kuralları
                rules = ai_dna.get("yazim_tarzi_kurallari", {})
                if rules:
                    rules_text = chr(10).join([f"- {k.upper()}: {v}" for k, v in rules.items()])
                    ai_dna_parts.append(f"### YAZIM TARZI KURALLARI:\n{rules_text}")

                # İmza kelimeleri
                sig = ai_dna.get("imza_kelimeleri", {}).get("en_sik", {})
                if sig:
                    sig_text = chr(10).join([f'- "{k}": {v}' for k, v in list(sig.items())[:12]])
                    ai_dna_parts.append(f"### İMZA KELİMELERİ (bunları doğal kullan):\n{sig_text}")

                # Hook stratejileri
                hooks = ai_dna.get("hook_stratejileri", {})
                if hooks:
                    hook_parts = []
                    for strat_name, strat_data in hooks.items():
                        if isinstance(strat_data, dict):
                            desc = strat_data.get("aciklama", "")
                            examples = strat_data.get("ornekler", [])
                            ex_text = chr(10).join([f'  - "{e}"' for e in examples[:3]])
                            hook_parts.append(f"**{strat_name}** ({desc}):\n{ex_text}")
                    ai_dna_parts.append("### HOOK STRATEJİLERİ (açılış tarzları):\n" + chr(10).join(hook_parts))

                # İmza kalıpları
                patterns = ai_dna.get("imza_kaliplari", {})
                giris = patterns.get("giris_kaliplari", [])
                gecis = patterns.get("gecis_kaliplari", [])
                kapanis = patterns.get("kapanis_kaliplari", [])
                if giris:
                    ai_dna_parts.append("### GİRİŞ KALIPLARl:\n" + chr(10).join([f'- "{g}"' for g in giris[:10]]))
                if gecis:
                    ai_dna_parts.append("### GEÇİŞ KALIPLARl:\n" + chr(10).join([f'- "{g}"' for g in gecis]))
                if kapanis:
                    ai_dna_parts.append("### KAPANIŞ KALIPLARl:\n" + chr(10).join([f'- "{g}"' for g in kapanis]))

                # Ton ve kişilik
                ton = ai_dna.get("ton_ve_kisilik", {})
                if ton:
                    ton_text = chr(10).join([f"- {k.upper()}: {v}" for k, v in ton.items()])
                    ai_dna_parts.append(f"### TON VE KİŞİLİK:\n{ton_text}")

                # Yapılmaması gerekenler
                yapma = ai_dna.get("yapilmamasi_gerekenler", [])
                if yapma:
                    yapma_text = chr(10).join([f"- YAPMA: {y}" for y in yapma])
                    ai_dna_parts.append(f"### YAPMAMASI GEREKENLER:\n{yapma_text}")

                # İçerik formülleri
                formuller = ai_dna.get("icerik_formulleri", {})
                if formuller:
                    form_text = chr(10).join([f"- {k}: {v}" for k, v in formuller.items()])
                    ai_dna_parts.append(f"### İÇERİK FORMÜLLERİ:\n{form_text}")

                if ai_dna_parts:
                    tweet_count = ai_dna.get("tweet_sayisi", 0)
                    context_parts.append(
                        f"## DERİN YAZIM DNA'SI (Claude AI tarafından {tweet_count} tweet analiz edilerek oluşturuldu):\n\n"
                        + chr(10) + chr(10).join(ai_dna_parts)
                    )
            else:
                # Fallback: otomatik hesaplanmış havuz DNA'sı
                pool_dna = get_pool_dna()
                if pool_dna:
                    dna_rules = []
                    lc_pct = pool_dna.get("kucuk_harf_yuzde", 0)
                    if lc_pct > 50:
                        dna_rules.append(f"- KÜÇÜK HARF: Havuzdaki tweet'lerin %{lc_pct}'i küçük harfle başlıyor.")
                    sig_words = pool_dna.get("imza_kelimeleri", {})
                    if sig_words:
                        top_words = list(sig_words.items())[:20]
                        words_text = ", ".join([f'"{w}"({c}x)' for w, c in top_words])
                        dna_rules.append(f"- HAVUZ İMZA KELİMELERİ: {words_text}")
                    sig_phrases = pool_dna.get("imza_kaliplari", {})
                    if sig_phrases:
                        top_phrases = list(sig_phrases.items())[:12]
                        phrases_text = ", ".join([f'"{p}"({c}x)' for p, c in top_phrases])
                        dna_rules.append(f"- HAVUZ İMZA KALIPLARl: {phrases_text}")
                    hooks_auto = pool_dna.get("hook_ornekleri", [])
                    if hooks_auto:
                        hook_text = chr(10).join([f'- "{h}"' for h in hooks_auto[:12]])
                        dna_rules.append(f"- HAVUZ EN ETKİLİ HOOK'LAR:\n{hook_text}")
                    if dna_rules:
                        context_parts.append(
                            f"### BİRLEŞİK HAVUZ DNA'SI ({pool_dna.get('tweet_sayisi', 0)} tweet'ten):\n"
                            + chr(10).join(dna_rules)
                        )

            selected = select_examples(pool_data, topic=topic, count=max_examples)
            if selected:
                pool_context = build_pool_training_context(selected)
                if pool_context:
                    context_parts.append(pool_context)
    except Exception:
        pass  # Havuz yoksa veya hata varsa sessizce geç

    if not context_parts:
        return ""

    header = "## EĞİTİM VERİSİ — YAZIM TARZI DNA'SI:"
    body = chr(10).join(context_parts)

    return f"""{header}

Bu veriler gerçek Twitter hesabının tweet'lerinden çıkarılmış KİŞİSEL YAZIM DNA'sıdır.
Bu DNA TÜM yazım tarzlarının (samimi, haber, analitik, kişisel vb.) TEMELİDİR.

### BU DNA'YI NASIL KULLANACAKSIN:

1. İMZA KELİMELERİ: Aşağıdaki imza kelimelerini ve kalıplarını doğal şekilde kullan.
   "bi baktım", "sessiz sedasız", "bence", "cidden" gibi ifadeler senin DNA'n — onları kullan.

2. TON VE YAKLAŞIM: Aşağıdaki tweet örneklerindeki TONU model al:
   - Nasıl giriş yapıyor (hook tarzı)
   - Nasıl geçişler kullanıyor
   - Nasıl bitiyor (kapanış tarzı)
   - Hangi kelimeler seçiyor, nasıl cümle kuruyor

3. YAZIP TARZINA UYARLA: Seçilen yazım tarzı (haber, analitik, kişisel vb.) FORMATI belirler.
   AMA senin kişisel tonun, kelime seçimin, doğallığın HEP bu DNA'dan gelir.
   Yani haber yazarken bile SENİN sesinle yaz, robotik haber bülteni gibi değil.

4. ASLA BİREBİR KOPYALAMA: Örnek tweet'lerin cümlelerini kopyalama.
   Aynı RUHU, TONU ve YAKLAŞIMI koru ama KENDİ cümlelerini kur.

{body}

KRİTİK KURALLAR:
1. YAZIM TARZI DNA'sını uygula — küçük harf, imza kelimeleri, kapanış tarzı.
2. Bu kişi gibi YAZ — aynı doğallık, aynı samimiyet, aynı akış.
3. SORU ile bitirme. "Sizce?", "Siz ne düşünüyorsunuz?" gibi CTA soruları YASAK.
4. ASLA "@hesapadi diyor ki", "yorumlarda", "X'te kullanıcılar" gibi kaynak referansı verme.
5. ASLA "şu tweet'teki", "örnekteki" gibi referans verme — kendi orijinal içeriğini yaz.
6. Bilgiyi KENDİ DENEYİMİN ve BİLGİN gibi yaz — sanki sen araştırdın, sen test ettin.
7. Robotik ve yapay ifadeler YASAK — doğal, samimi, insan gibi yaz.
8. TEKRAR YASAĞI: Yukarıdaki örnek tweet'lerin cümlelerini, kalıplarını BİREBİR kullanma.
   Her seferinde FARKLI açılış (hook), FARKLI geçiş ve FARKLI kapanış kullan.
   Aynı imza kelimelerini bile farklı bağlamlarda ve farklı kombinasyonlarda kullan.
   Monotonluktan kaçın — bazı tweet'ler kısa ve keskin, bazıları uzun ve detaylı olsun.
"""
