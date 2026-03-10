"""
Discovery Worker — Belirli hesaplarin son 24 saatteki tweetlerini tarayip
engagement sırasına göre listeleyen sistem.

ÇALIŞMA MANTIGI:
- Scheduler tarafından her 2 saatte bir çağrılır
- Öncelikli hesaplar (priority) 1.5x engagement bonus alır
- Thread'ler otomatik algılanır ve tüm parçaları çekilir
- Her tweet için kısa Türkçe özet üretilir (AI ile)
- Sonuçlar discovery_cache.json'a kaydedilir

ZAMANLAYICI ÇAKIŞMA:
- Auto-reply: 5dk, Self-reply: 15dk, Metrics: 30dk
- Discovery: 120dk — çakışma riski yok (sadece okuma yapıyor)
"""
import datetime
import logging
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Son tarama zamanını takip et — aynı periyotta tekrar çalışmasın
_last_scan_key: str | None = None


def _engagement_score(tweet: dict) -> float:
    """Tweet engagement score hesapla (X algorithm ağırlıkları)."""
    likes = tweet.get("like_count", 0) or 0
    rts = tweet.get("retweet_count", 0) or 0
    replies = tweet.get("reply_count", 0) or 0
    bookmarks = tweet.get("bookmark_count", 0) or 0
    return likes * 1 + rts * 20 + replies * 13.5 + bookmarks * 10


def _is_retweet(tweet_text: str) -> bool:
    return tweet_text.strip().startswith("RT @")


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
        logger.warning("Discovery: Twikit auth failed: %s", e)
    return None


def _generate_summary(tweet_text: str, author: str) -> str:
    """Kısa Türkçe özet üret (1 cümle)."""
    try:
        from backend.api.helpers import create_generator
        generator = create_generator(topic=tweet_text[:200])
        summary = generator.generate_reply(
            original_tweet=tweet_text,
            original_author=author,
            style="reply",
            additional_context=(
                "SADECE 1 cümlelik kısa Türkçe özet yaz. "
                "Tweet'in ne hakkında olduğunu açıkla. "
                "Yorum yapma, sadece özetle. Maksimum 100 karakter."
            ),
        )
        return summary.strip() if summary else ""
    except Exception as e:
        logger.warning("Discovery: Summary generation failed: %s", e)
        return ""


def _fetch_thread(twikit, tweet_id: str, author: str) -> list[dict]:
    """Tweet'in thread parçalarını çek (varsa)."""
    try:
        thread_parts = twikit.get_thread(tweet_id, author)
        if thread_parts and len(thread_parts) > 1:
            return thread_parts
    except Exception as e:
        logger.debug("Discovery: Thread fetch failed for %s: %s", tweet_id, e)
    return []


def _importance_level(score: float) -> str:
    """Engagement score'a göre önem derecesi."""
    if score >= 500:
        return "yuksek"
    elif score >= 100:
        return "orta"
    return "dusuk"


def scan_accounts(force: bool = False):
    """
    Tüm discovery hesaplarının son 24 saatteki tweetlerini tara.
    force=True ise zamanlama kontrolü atlanır (manuel tetikleme).
    """
    global _last_scan_key

    from backend.modules.style_manager import (
        load_discovery_config,
        load_discovery_cache,
        save_discovery_cache,
        load_discovery_seen,
        save_discovery_seen,
    )

    config = load_discovery_config()

    if not config.get("enabled") and not force:
        return

    now = datetime.datetime.now(TZ_TR)
    hour = now.hour

    # Çalışma saatleri kontrolü
    work_start = config.get("work_hour_start", 8)
    work_end = config.get("work_hour_end", 23)
    if not force and (hour < work_start or hour >= work_end):
        return

    # Tekrar çalışma kontrolü (2 saatlik periyot)
    interval = config.get("check_interval_hours", 2)
    scan_key = now.strftime(f"%Y-%m-%d-{hour // interval}")
    if not force and _last_scan_key == scan_key:
        return
    _last_scan_key = scan_key

    priority_accounts = config.get("priority_accounts", [])
    normal_accounts = config.get("normal_accounts", [])
    all_accounts = priority_accounts + normal_accounts
    priority_set = set(a.lower().lstrip("@") for a in priority_accounts)

    if not all_accounts:
        logger.info("Discovery: Hesap listesi boş")
        return

    logger.info(
        "Discovery: Tarama başlıyor — %d hesap (%d öncelikli)",
        len(all_accounts), len(priority_accounts),
    )

    twikit = _get_twikit_client()
    if not twikit:
        logger.warning("Discovery: Twikit client kullanılamıyor")
        return

    seen = load_discovery_seen()
    cutoff = now - datetime.timedelta(hours=24)
    new_tweets: list[dict] = []

    for account in all_accounts:
        account = account.strip().lstrip("@")
        if not account:
            continue

        try:
            tweets = twikit.get_user_tweets(account, count=10)
        except Exception as e:
            logger.warning("Discovery: @%s tweet çekme hatası: %s", account, e)
            time.sleep(2)
            continue

        for tweet in tweets:
            tweet_id = tweet.get("id", "")
            if not tweet_id or tweet_id in seen:
                continue

            tweet_text = tweet.get("text", "")

            # RT'leri atla
            if _is_retweet(tweet_text):
                seen.add(tweet_id)
                continue

            # Reply'ları atla (başkasına yanıt)
            if tweet_text.startswith("@"):
                seen.add(tweet_id)
                continue

            # 24 saat kontrolü
            created_at = tweet.get("created_at", "")
            try:
                tweet_time = datetime.datetime.fromisoformat(created_at)
                if tweet_time.tzinfo is None:
                    tweet_time = tweet_time.replace(tzinfo=TZ_TR)
                if tweet_time < cutoff:
                    seen.add(tweet_id)
                    continue
            except (ValueError, TypeError):
                pass  # Zaman parse edilemezse yine de ekle

            # Engagement hesapla
            score = _engagement_score(tweet)
            is_priority = account.lower() in priority_set

            # Öncelikli hesaplara 1.5x bonus
            display_score = score * 1.5 if is_priority else score

            # Thread kontrolü
            thread_parts = []
            conversation_id = tweet.get("conversation_id", "")
            if conversation_id and conversation_id == tweet_id:
                # Bu tweet bir conversation başlatıcı olabilir — thread kontrolü yap
                try:
                    thread_data = _fetch_thread(twikit, tweet_id, account)
                    if thread_data:
                        thread_parts = [
                            {
                                "text": t.get("text", ""),
                                "id": t.get("id", ""),
                            }
                            for t in thread_data
                        ]
                except Exception:
                    pass

            seen.add(tweet_id)

            new_tweets.append({
                "tweet_id": tweet_id,
                "account": account,
                "text": tweet_text,
                "created_at": created_at,
                "like_count": tweet.get("like_count", 0) or 0,
                "retweet_count": tweet.get("retweet_count", 0) or 0,
                "reply_count": tweet.get("reply_count", 0) or 0,
                "bookmark_count": tweet.get("bookmark_count", 0) or 0,
                "engagement_score": score,
                "display_score": display_score,
                "is_priority": is_priority,
                "importance": _importance_level(display_score),
                "thread_parts": thread_parts,
                "is_thread": len(thread_parts) > 1,
                "summary_tr": "",  # Sonra AI ile doldurulacak
                "tweet_url": f"https://x.com/{account}/status/{tweet_id}",
                "scanned_at": now.isoformat(),
            })

        # Rate limit koruması
        time.sleep(2)

    # AI özet üret (ilk 30 tweet için — maliyet kontrolü)
    for item in new_tweets[:30]:
        summary = _generate_summary(item["text"], item["account"])
        item["summary_tr"] = summary
        time.sleep(0.5)

    # Mevcut cache'e ekle ve sırala
    existing_cache = load_discovery_cache()

    # Yeni tweet'leri ekle (duplicate kontrolü)
    existing_ids = {e["tweet_id"] for e in existing_cache}
    for tweet in new_tweets:
        if tweet["tweet_id"] not in existing_ids:
            existing_cache.append(tweet)

    # display_score'a göre sırala (yüksekten düşüğe)
    existing_cache.sort(key=lambda x: x.get("display_score", 0), reverse=True)

    # Maksimum 500 tweet tut (eski tweetler de kalır, sadece limit)
    existing_cache = existing_cache[:500]

    save_discovery_cache(existing_cache)
    save_discovery_seen(seen)

    logger.info(
        "Discovery: Tarama tamamlandı — %d yeni tweet bulundu, cache'te toplam %d tweet",
        len(new_tweets), len(existing_cache),
    )
