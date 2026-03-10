"""
Auto Reply Worker — Takip edilen hesaplarin yeni tweetlerini kontrol edip
AI ile yanit uretip otomatik paylas.

ROTASYON SİSTEMİ:
- 38 hesap 24 saate dağıtılır (saat başı 1-2 hesap)
- Her saat sadece o saate ait hesaplar kontrol edilir
- Twikit rate limit'e takılmayı önler
- scheduler_worker.py tarafindan her 5 dakikada bir cagirilir
  ama sadece saatin ilk çağrısında çalışır (aynı saat tekrar çalışmaz)

ÇALIŞMA SAATLERİ:
- Varsayılan 09:00-21:00 arası çalışır (config ile ayarlanabilir)
- Gece saatlerinde otomatik duraklar

EN İYİ TWEET SEÇİMİ:
- Her hesaptan 5 tweet çekilir
- Engagement score'a göre sıralanır (RT=20x, Reply=13.5x, Like=1x, Bookmark=10x)
- Sadece en yüksek engagement'lı tweet'e reply atılır

PAYLAŞIM STRATEJİSİ:
- Önce reply dener
- 403 Forbidden alırsa (reply kısıtlı tweet) → Quote Tweet'e fallback
- RT'ler ve reply'lar otomatik filtrelenir
"""
import datetime
import hashlib
import logging
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Track which hour we last processed to avoid duplicate runs within same hour
_last_processed_hour: str | None = None


def _get_accounts_for_hour(accounts: list[str], hour: int) -> list[str]:
    """
    38 hesabı 24 saate dağıt.
    38 / 24 = 1.58 → bazı saatlerde 1, bazılarında 2 hesap.

    Dağılım deterministik: hesap listesi değişmedikçe aynı saat aynı hesapları alır.
    """
    if not accounts:
        return []

    selected = []
    for i, account in enumerate(accounts):
        # Her hesabı bir saate ata: index'e göre round-robin
        assigned_hour = i % 24
        if assigned_hour == hour:
            selected.append(account)

    return selected


def _is_retweet(tweet_text: str) -> bool:
    """RT olup olmadığını kontrol et."""
    return tweet_text.strip().startswith("RT @")


def _engagement_score(tweet: dict) -> float:
    """Tweet engagement score hesapla (X algorithm ağırlıkları)."""
    likes = tweet.get("like_count", 0) or 0
    rts = tweet.get("retweet_count", 0) or 0
    replies = tweet.get("reply_count", 0) or 0
    bookmarks = tweet.get("bookmark_count", 0) or 0
    return likes * 1 + rts * 20 + replies * 13.5 + bookmarks * 10


def check_and_reply():
    """
    Ana worker fonksiyonu — scheduler tarafindan her 5 dakikada bir cagirilir.

    ROTASYON: Her saat sadece 1-2 hesap kontrol edilir (38 hesap / 24 saat).
    Aynı saat içinde tekrar çağrılırsa çalışmaz (duplicate koruması).

    PAYLAŞIM: Reply dener → 403 alırsa Quote Tweet yapar.
    """
    global _last_processed_hour

    from backend.modules.style_manager import (
        load_auto_reply_config,
        load_auto_reply_logs,
        load_auto_reply_seen,
        save_auto_reply_seen,
        add_auto_reply_log,
    )

    config = load_auto_reply_config()

    if not config.get("enabled"):
        return

    accounts = config.get("accounts", [])
    if not accounts:
        return

    now = datetime.datetime.now(TZ_TR)
    hour = now.hour

    # Çalışma saatleri: sadece 09:00-21:00 arası çalış
    work_start = config.get("work_hour_start", 9)
    work_end = config.get("work_hour_end", 21)
    if hour < work_start or hour >= work_end:
        logger.info(
            "Auto-reply: Saat %02d — çalışma saatleri dışında (%02d:00-%02d:00), atlanıyor",
            hour, work_start, work_end,
        )
        return

    current_hour_key = now.strftime("%Y-%m-%d-%H")

    # Aynı saat içinde tekrar çalışma
    if _last_processed_hour == current_hour_key:
        return
    _last_processed_hour = current_hour_key
    hourly_accounts = _get_accounts_for_hour(accounts, hour)

    if not hourly_accounts:
        logger.info(
            "Auto-reply: Saat %02d — bu saatte kontrol edilecek hesap yok", hour
        )
        return

    logger.info(
        "Auto-reply: Saat %02d — %d hesap kontrol ediliyor: %s",
        hour,
        len(hourly_accounts),
        ", ".join(f"@{a}" for a in hourly_accounts),
    )

    # Rate limit: max replies per hour
    max_per_hour = config.get("max_replies_per_hour", 5)
    logs = load_auto_reply_logs()
    one_hour_ago = now - datetime.timedelta(hours=1)

    recent_replies = 0
    for log in logs:
        try:
            log_time = datetime.datetime.fromisoformat(log.get("created_at", ""))
            if log_time.tzinfo is None:
                log_time = log_time.replace(tzinfo=TZ_TR)
            if log_time >= one_hour_ago and log.get("status") == "published":
                recent_replies += 1
        except (ValueError, TypeError):
            continue

    if recent_replies >= max_per_hour:
        logger.info("Auto-reply rate limit: %d/%d replies in last hour", recent_replies, max_per_hour)
        return

    # Load seen tweet IDs
    seen = load_auto_reply_seen()

    # Get twikit client for fetching tweets
    twikit = _get_twikit_client()
    if not twikit:
        logger.warning("Auto-reply: Twikit client not available")
        return

    reply_delay = config.get("reply_delay_seconds", 60)
    style = config.get("style", "reply")
    additional_context = config.get("additional_context", "")
    min_likes = config.get("min_likes_to_reply", 0)
    only_original = config.get("only_original_tweets", True)
    language = config.get("language", "tr")

    replies_made = 0
    remaining = max_per_hour - recent_replies

    for account in hourly_accounts:
        if replies_made >= remaining:
            break

        account = account.strip().lstrip("@")
        if not account:
            continue

        try:
            tweets = twikit.get_user_tweets(account, count=5)
        except Exception as e:
            logger.warning("Auto-reply: Failed to fetch tweets for @%s: %s", account, e)
            continue

        # Tweetleri filtrele ve engagement'a göre sırala → en iyisine reply at
        candidates = []
        for tweet in tweets:
            tweet_id = tweet.get("id", "")
            if not tweet_id or tweet_id in seen:
                continue

            tweet_text = tweet.get("text", "")

            # RT'leri atla
            if _is_retweet(tweet_text):
                seen.add(tweet_id)
                continue

            # Reply tweet'leri atla (only_original açıksa)
            if only_original and tweet_text.startswith("@"):
                seen.add(tweet_id)
                continue

            # Min likes filtresi
            if min_likes > 0 and tweet.get("like_count", 0) < min_likes:
                seen.add(tweet_id)
                continue

            candidates.append(tweet)

        if not candidates:
            continue

        # Engagement score'a göre sırala, en iyisini seç
        candidates.sort(key=_engagement_score, reverse=True)
        best_tweet = candidates[0]
        tweet_id = best_tweet["id"]
        tweet_text = best_tweet.get("text", "")

        logger.info(
            "Auto-reply: @%s — en iyi tweet seçildi (score=%.0f, likes=%s, RTs=%s): %s",
            account,
            _engagement_score(best_tweet),
            best_tweet.get("like_count", 0),
            best_tweet.get("retweet_count", 0),
            tweet_text[:80],
        )

        # Tüm adayları seen'e ekle (bir sonraki saatte tekrar bakılmasın)
        for c in candidates:
            seen.add(c["id"])

        # Optional delay between replies
        if reply_delay > 0 and replies_made > 0:
            time.sleep(min(reply_delay, 120))

        # Generate reply
        try:
            reply_text = _generate_reply(
                original_tweet=tweet_text,
                original_author=account,
                style=style,
                additional_context=additional_context,
                language=language,
            )
        except Exception as e:
            logger.warning("Auto-reply: Failed to generate reply for @%s tweet %s: %s", account, tweet_id, e)
            add_auto_reply_log({
                "account": account,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text[:200],
                "reply_text": "",
                "status": "generation_failed",
                "error": str(e),
            })
            continue

        if not reply_text:
            continue

        # Publish: önce reply dene, 403 alırsa quote tweet yap
        result = _publish_with_fallback(
            text=reply_text,
            tweet_id=tweet_id,
            account=account,
        )

        if result.get("success"):
            publish_type = result.get("type", "reply")
            add_auto_reply_log({
                "account": account,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text[:200],
                "reply_text": reply_text,
                "reply_tweet_id": result.get("tweet_id", ""),
                "reply_url": result.get("url", ""),
                "status": "published",
                "publish_type": publish_type,
            })
            replies_made += 1
            logger.info(
                "Auto-reply: %s to @%s tweet %s — %s",
                publish_type.upper(),
                account,
                tweet_id,
                result.get("url", ""),
            )
        else:
            add_auto_reply_log({
                "account": account,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text[:200],
                "reply_text": reply_text,
                "status": "publish_failed",
                "error": result.get("error", "Unknown error"),
            })

    # Save seen IDs
    save_auto_reply_seen(seen)

    if replies_made > 0:
        logger.info("Auto-reply: Saat %02d — %d paylaşım yapıldı", hour, replies_made)
    else:
        logger.info("Auto-reply: Saat %02d — yeni tweet bulunamadı", hour)


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
        logger.warning("Auto-reply: Twikit auth failed: %s", e)
    return None


def _generate_reply(original_tweet: str, original_author: str,
                    style: str = "reply", additional_context: str = "",
                    language: str = "tr") -> str:
    """Generate a reply using AI."""
    from backend.api.helpers import create_generator

    # Add language context
    lang_context = ""
    if language == "tr":
        lang_context = "MUTLAKA Turkce yaz. Dogal, samimi bir dille yanit ver."
    elif language == "en":
        lang_context = "Write in English. Natural, conversational tone."

    full_context = f"{lang_context} {additional_context}".strip()

    generator = create_generator(topic=original_tweet)
    reply = generator.generate_reply(
        original_tweet=original_tweet,
        original_author=original_author,
        style=style,
        additional_context=full_context,
    )
    return reply.strip() if reply else ""


def _publish_with_fallback(text: str, tweet_id: str, account: str) -> dict:
    """
    Paylaşım stratejisi:
    1. Önce reply dene
    2. 403 Forbidden alırsa → Quote Tweet yap
    3. Her ikisi de başarısızsa hata döndür
    """
    from backend.config import get_settings
    from backend.modules.tweet_publisher import TweetPublisher
    from backend.modules.style_manager import add_to_post_history, add_tweet_metric

    settings = get_settings()

    if not (settings.twitter_api_key and settings.twitter_api_secret
            and settings.twitter_access_token and settings.twitter_access_secret):
        return {"success": False, "error": "Twitter API credentials eksik"}

    publisher = TweetPublisher(
        api_key=settings.twitter_api_key,
        api_secret=settings.twitter_api_secret,
        access_token=settings.twitter_access_token,
        access_secret=settings.twitter_access_secret,
        bearer_token=settings.twitter_bearer_token,
    )

    # 1. Önce reply dene
    result = publisher.post_reply(text, tweet_id)

    publish_type = "reply"

    # 2. 403 Forbidden → Quote Tweet'e fallback
    if not result.get("success") and "403" in str(result.get("error", "")):
        logger.info(
            "Auto-reply: Reply 403 for @%s tweet %s — trying quote tweet",
            account, tweet_id,
        )
        result = publisher.post_quote_tweet(text, tweet_id)
        publish_type = "quote_tweet"

    if result.get("success"):
        result["type"] = publish_type

        add_to_post_history({
            "text": text,
            "url": result.get("url", ""),
            "type": f"auto_{publish_type}",
            "reply_to_id": tweet_id,
        })

        now_str = datetime.datetime.now(TZ_TR).isoformat()
        if result.get("tweet_id"):
            add_tweet_metric({
                "tweet_id": result["tweet_id"],
                "text": text[:200],
                "url": result.get("url", ""),
                "metrics": {},
                "last_checked": now_str,
                "first_tracked": now_str,
                "source": f"auto_{publish_type}",
            })

    return result
