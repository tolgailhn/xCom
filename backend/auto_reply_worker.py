"""
Auto Reply Worker — Pipeline mimarisi: Tarama ve yanıt üretme ayrı çalışır.

PIPELINE:
1. scan_for_candidates() — Twikit ile tweet çeker, kuyruğa yazar (AI çağrısı YOK)
2. generate_and_reply() — Kuyruktan okur, AI yanıt üretir, publish/draft yapar

ROTASYON SİSTEMİ:
- Hesaplar ÇALIŞMA SAATLERİNE dağıtılır (ör. 9-21 = 12 slot)
- 5 hesap → her biri farklı saatte (hepsi kontrol edilir)
- 38 hesap → saat başı ~3 hesap (rate limit güvenli)
- Deterministik: hesap listesi değişmedikçe aynı saat aynı hesapları alır

ÇALIŞMA SAATLERİ:
- Varsayılan 09:00-21:00 arası çalışır (config ile ayarlanabilir)
- Gece saatlerinde otomatik duraklar

PAYLAŞIM STRATEJİSİ:
- Önce reply dener
- 403 Forbidden alırsa (reply kısıtlı tweet) → Quote Tweet'e fallback
- RT'ler ve reply'lar otomatik filtrelenir
"""
import datetime
import logging
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Track which hour we last scanned to avoid duplicate scans within same hour
_last_scanned_hour: str | None = None


def _get_accounts_for_hour(accounts: list[str], hour: int,
                           work_start: int = 9, work_end: int = 21) -> list[str]:
    """
    Hesapları ÇALIŞMA SAATLERİNE dağıt (24 saate değil!).

    Ör: work_start=9, work_end=21 → 12 slot [9,10,...,20]
    5 hesap + 12 slot → her hesap farklı saatte, hepsi kontrol edilir
    38 hesap + 12 slot → saat başı ~3 hesap

    Dağılım deterministik: hesap listesi değişmedikçe aynı saat aynı hesapları alır.
    """
    if not accounts:
        return []

    work_hours = list(range(work_start, work_end))
    num_slots = len(work_hours)

    if not num_slots or hour not in work_hours:
        return []

    slot_index = work_hours.index(hour)
    return [acc for i, acc in enumerate(accounts) if i % num_slots == slot_index]


def _is_retweet(tweet_text: str) -> bool:
    """RT olup olmadığını kontrol et."""
    return tweet_text.strip().startswith("RT @")


def _engagement_score(tweet: dict) -> float:
    """Tweet engagement score hesapla (constants.py tek kaynak)."""
    from modules.constants import calculate_engagement_score
    return calculate_engagement_score(tweet)


# ── PHASE 1: SCANNER ──────────────────────────────────────────

def scan_for_candidates():
    """
    Tarayıcı — scheduler tarafından her 10 dakikada bir çağrılır.

    Twikit ile tweet çeker, filtreler, skorlar, kuyruğa yazar.
    AI çağrısı YAPMAZ, publish YAPMAZ — sadece tarama.
    Aynı saat içinde tekrar çağrılırsa çalışmaz (duplicate koruması).
    """
    global _last_scanned_hour

    from backend.modules.style_manager import (
        load_auto_reply_config,
        load_auto_reply_seen,
        save_auto_reply_seen,
        add_to_auto_reply_queue,
        cleanup_auto_reply_queue,
    )

    config = load_auto_reply_config()

    if not config.get("enabled"):
        return

    accounts = config.get("accounts", [])
    if not accounts:
        return

    now = datetime.datetime.now(TZ_TR)
    hour = now.hour

    # Çalışma saatleri kontrolü
    work_start = config.get("work_hour_start", 9)
    work_end = config.get("work_hour_end", 21)
    if hour < work_start or hour >= work_end:
        logger.info(
            "Auto-reply scanner: Saat %02d — çalışma saatleri dışında (%02d:00-%02d:00), atlanıyor",
            hour, work_start, work_end,
        )
        return

    current_hour_key = now.strftime("%Y-%m-%d-%H")

    # Aynı saat içinde tekrar tarama yapma
    if _last_scanned_hour == current_hour_key:
        return
    _last_scanned_hour = current_hour_key

    hourly_accounts = _get_accounts_for_hour(accounts, hour, work_start, work_end)

    if not hourly_accounts:
        logger.info(
            "Auto-reply scanner: Saat %02d — bu saatte kontrol edilecek hesap yok", hour
        )
        return

    logger.info(
        "Auto-reply scanner: Saat %02d — %d hesap taranıyor: %s",
        hour,
        len(hourly_accounts),
        ", ".join(f"@{a}" for a in hourly_accounts),
    )

    # Load seen tweet IDs
    seen = load_auto_reply_seen()

    # Get twikit client
    twikit = _get_twikit_client()
    if not twikit:
        logger.warning("Auto-reply scanner: Twikit client not available")
        return

    min_likes = config.get("min_likes_to_reply", 0)
    only_original = config.get("only_original_tweets", True)
    queued_count = 0

    for account in hourly_accounts:
        account = account.strip().lstrip("@")
        if not account:
            continue

        try:
            tweets = twikit.get_user_tweets(account, count=5)
        except Exception as e:
            logger.warning("Auto-reply scanner: Failed to fetch tweets for @%s: %s", account, e)
            continue

        # Tweetleri filtrele
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

            # Bugün filtresi: sadece bugünkü tweetler (eski tweetlere reply atma)
            tweet_created = tweet.get("created_at", "")
            if tweet_created:
                try:
                    tweet_dt = datetime.datetime.fromisoformat(tweet_created)
                    if tweet_dt.tzinfo is None:
                        tweet_dt = tweet_dt.replace(tzinfo=datetime.timezone.utc)
                    if tweet_dt.astimezone(TZ_TR).date() != now.date():
                        seen.add(tweet_id)
                        continue
                except (ValueError, TypeError):
                    pass  # Parse hatası olursa geçir

            candidates.append(tweet)

        if not candidates:
            continue

        # Engagement score'a göre sırala, en iyisini kuyruğa ekle
        candidates.sort(key=_engagement_score, reverse=True)
        best_tweet = candidates[0]

        logger.info(
            "Auto-reply scanner: @%s — en iyi tweet kuyruğa ekleniyor (score=%.0f, likes=%s, RTs=%s): %s",
            account,
            _engagement_score(best_tweet),
            best_tweet.get("like_count", 0),
            best_tweet.get("retweet_count", 0),
            best_tweet.get("text", "")[:80],
        )

        # Kuyruğa ekle
        add_to_auto_reply_queue({
            "tweet_id": best_tweet["id"],
            "account": account,
            "text": best_tweet.get("text", ""),
            "like_count": best_tweet.get("like_count", 0),
            "retweet_count": best_tweet.get("retweet_count", 0),
            "reply_count": best_tweet.get("reply_count", 0),
            "bookmark_count": best_tweet.get("bookmark_count", 0),
            "engagement_score": _engagement_score(best_tweet),
        })
        queued_count += 1

        # Tüm adayları seen'e ekle
        for c in candidates:
            seen.add(c["id"])

    # Save seen IDs
    save_auto_reply_seen(seen)

    # Queue bakımı: eski/işlenmiş kayıtları temizle
    cleanup_auto_reply_queue()

    logger.info(
        "Auto-reply scanner: Saat %02d — %d hesap tarandı, %d aday kuyruğa eklendi",
        hour, len(hourly_accounts), queued_count,
    )


# ── PHASE 2: GENERATOR ────────────────────────────────────────

def generate_and_reply():
    """
    Üretici — scheduler tarafından her 5 dakikada bir çağrılır.

    Kuyruktan en yüksek engagement'lı pending tweet'i alır,
    AI ile yanıt üretir, publish/draft yapar.
    """
    from backend.modules.style_manager import (
        load_auto_reply_config,
        load_auto_reply_logs,
        add_auto_reply_log,
        load_auto_reply_queue,
        update_auto_reply_queue_entry,
    )

    config = load_auto_reply_config()

    if not config.get("enabled"):
        return

    now = datetime.datetime.now(TZ_TR)
    hour = now.hour

    # Çalışma saatleri kontrolü
    work_start = config.get("work_hour_start", 9)
    work_end = config.get("work_hour_end", 21)
    if hour < work_start or hour >= work_end:
        return

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
            if log_time >= one_hour_ago and log.get("status") in ("published", "ready"):
                recent_replies += 1
        except (ValueError, TypeError):
            continue

    if recent_replies >= max_per_hour:
        logger.info("Auto-reply generator: Rate limit — %d/%d replies in last hour", recent_replies, max_per_hour)
        return

    # Günlük limit kontrolü
    daily_max = config.get("daily_max_replies", 20)
    today_str = now.strftime("%Y-%m-%d")
    today_published = sum(
        1 for log in logs
        if log.get("status") == "published"
        and log.get("created_at", "").startswith(today_str)
    )
    if today_published >= daily_max:
        logger.info("Auto-reply generator: Günlük limit doldu (%d/%d)", today_published, daily_max)
        return

    # Kuyruktan pending olanları al
    queue = load_auto_reply_queue()
    pending = [q for q in queue if q.get("status") == "pending"]

    if not pending:
        return

    # En yüksek engagement'lı adayı seç
    pending.sort(key=lambda x: x.get("engagement_score", 0), reverse=True)
    candidate = pending[0]

    tweet_id = candidate["tweet_id"]
    account = candidate["account"]
    tweet_text = candidate.get("text", "")

    logger.info(
        "Auto-reply generator: @%s tweet %s işleniyor (score=%.0f)",
        account, tweet_id, candidate.get("engagement_score", 0),
    )

    # Mark as processing
    update_auto_reply_queue_entry(tweet_id, {"status": "processing"})

    style = config.get("style", "reply")
    additional_context = config.get("additional_context", "")
    language = config.get("language", "tr")
    draft_only = config.get("draft_only", True)

    # 3 modlu publish_mode: draft / twikit / api
    publish_mode = config.get("publish_mode", "draft")
    # Backward compat: publish_mode yoksa draft_only'ye bak
    if "publish_mode" not in config:
        publish_mode = "draft" if draft_only else "api"

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
        logger.warning("Auto-reply generator: Failed to generate reply for @%s tweet %s: %s", account, tweet_id, e)
        update_auto_reply_queue_entry(tweet_id, {
            "status": "failed",
            "processed_at": now.isoformat(),
        })
        add_auto_reply_log({
            "account": account,
            "tweet_id": tweet_id,
            "tweet_text": tweet_text,
            "reply_text": "",
            "status": "generation_failed",
            "error": str(e),
            "engagement_score": candidate.get("engagement_score", 0),
            "like_count": candidate.get("like_count", 0),
            "retweet_count": candidate.get("retweet_count", 0),
        })
        return

    if not reply_text:
        update_auto_reply_queue_entry(tweet_id, {
            "status": "failed",
            "processed_at": now.isoformat(),
        })
        return

    # ── PUBLISH MODE ROUTING ────────────────────────────────────

    if publish_mode == "draft":
        # Sadece üret, paylaşma
        update_auto_reply_queue_entry(tweet_id, {
            "status": "done",
            "reply_text": reply_text,
            "processed_at": now.isoformat(),
        })
        add_auto_reply_log({
            "account": account,
            "tweet_id": tweet_id,
            "tweet_text": tweet_text,
            "reply_text": reply_text,
            "status": "ready",
            "engagement_score": candidate.get("engagement_score", 0),
            "like_count": candidate.get("like_count", 0),
            "retweet_count": candidate.get("retweet_count", 0),
        })
        logger.info(
            "Auto-reply generator: DRAFT for @%s tweet %s — ready for manual posting",
            account, tweet_id,
        )
        _send_telegram_auto_reply(
            account, tweet_text, reply_text, tweet_id,
            candidate.get("engagement_score", 0),
        )
        return

    elif publish_mode == "twikit":
        # İnsan-benzeri rastgele bekleme (30-90 saniye)
        import random
        delay = random.randint(30, 90)
        logger.info("Auto-reply generator: %ds bekleniyor (insan-benzeri delay)", delay)
        time.sleep(delay)

        # Twikit (cookie) ile reply gönder
        result = _publish_via_twikit(
            text=reply_text,
            tweet_id=tweet_id,
            account=account,
        )

        if result.get("success"):
            update_auto_reply_queue_entry(tweet_id, {
                "status": "done",
                "reply_text": reply_text,
                "processed_at": now.isoformat(),
            })
            add_auto_reply_log({
                "account": account,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text,
                "reply_text": reply_text,
                "reply_tweet_id": result.get("tweet_id", ""),
                "reply_url": result.get("url", ""),
                "status": "published",
                "publish_type": "twikit_reply",
                "engagement_score": candidate.get("engagement_score", 0),
                "like_count": candidate.get("like_count", 0),
                "retweet_count": candidate.get("retweet_count", 0),
            })
            logger.info(
                "Auto-reply generator: TWIKIT REPLY to @%s tweet %s — %s",
                account, tweet_id, result.get("url", ""),
            )
            _send_telegram_auto_reply(
                account, tweet_text, reply_text, tweet_id,
                candidate.get("engagement_score", 0),
            )
        else:
            # Başarısız — sadece logla, atla (fallback yok)
            update_auto_reply_queue_entry(tweet_id, {
                "status": "failed",
                "processed_at": now.isoformat(),
            })
            add_auto_reply_log({
                "account": account,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text,
                "reply_text": reply_text,
                "status": "publish_failed",
                "error": result.get("error", "Unknown error"),
                "engagement_score": candidate.get("engagement_score", 0),
                "like_count": candidate.get("like_count", 0),
                "retweet_count": candidate.get("retweet_count", 0),
            })
            logger.warning(
                "Auto-reply generator: TWIKIT FAILED for @%s tweet %s — %s",
                account, tweet_id, result.get("error", ""),
            )
        return

    elif publish_mode == "api":
        # Twitter API ile gönder (mevcut davranış)
        result = _publish_with_fallback(
            text=reply_text,
            tweet_id=tweet_id,
            account=account,
        )

        if result.get("success"):
            publish_type = result.get("type", "reply")
            update_auto_reply_queue_entry(tweet_id, {
                "status": "done",
                "reply_text": reply_text,
                "processed_at": now.isoformat(),
            })
            add_auto_reply_log({
                "account": account,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text,
                "reply_text": reply_text,
                "reply_tweet_id": result.get("tweet_id", ""),
                "reply_url": result.get("url", ""),
                "status": "published",
                "publish_type": publish_type,
                "engagement_score": candidate.get("engagement_score", 0),
                "like_count": candidate.get("like_count", 0),
                "retweet_count": candidate.get("retweet_count", 0),
            })
            logger.info(
                "Auto-reply generator: %s to @%s tweet %s — %s",
                publish_type.upper(), account, tweet_id, result.get("url", ""),
            )
        else:
            update_auto_reply_queue_entry(tweet_id, {
                "status": "failed",
                "processed_at": now.isoformat(),
            })
            add_auto_reply_log({
                "account": account,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text,
                "reply_text": reply_text,
                "status": "publish_failed",
                "error": result.get("error", "Unknown error"),
                "engagement_score": candidate.get("engagement_score", 0),
                "like_count": candidate.get("like_count", 0),
                "retweet_count": candidate.get("retweet_count", 0),
            })


# ── BACKWARD COMPAT WRAPPER ───────────────────────────────────

def check_and_reply():
    """
    Backward compat wrapper — hem tarar hem üretir.
    Manuel trigger (/api/auto-reply/trigger) bu fonksiyonu çağırır.
    """
    scan_for_candidates()
    generate_and_reply()


# ── HELPER FUNCTIONS ──────────────────────────────────────────

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


def _publish_via_twikit(text: str, tweet_id: str, account: str) -> dict:
    """Twikit (cookie) ile reply gönder."""
    twikit = _get_twikit_client()
    if not twikit:
        return {"success": False, "error": "Twikit client mevcut değil"}

    # 280 karakter güvenlik
    if len(text) > 280:
        text = text[:277] + "..."

    try:
        result = twikit.create_reply(text, tweet_id)
        if result.get("success"):
            result["type"] = "twikit_reply"
        return result
    except Exception as e:
        logger.warning("Twikit reply failed @%s tweet %s: %s", account, tweet_id, e)
        return {"success": False, "error": str(e)}


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


def _send_telegram_auto_reply(account: str, tweet_text: str, reply_text: str,
                               tweet_id: str, engagement_score: float):
    """Telegram'a auto-reply bildirimi gonder."""
    try:
        from backend.config import get_settings
        from backend.modules.telegram_notifier import TelegramNotifier

        settings = get_settings()
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return
        notifier = TelegramNotifier(settings.telegram_bot_token, settings.telegram_chat_id)
        notifier.send_auto_reply_notification(
            account=account,
            tweet_text=tweet_text,
            reply_text=reply_text,
            tweet_id=tweet_id,
            engagement_score=engagement_score,
        )
    except Exception as e:
        logger.warning("Auto-reply telegram notification failed: %s", e)
