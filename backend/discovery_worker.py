"""
Discovery Worker — Takip edilen hesapların tweetlerini rotasyonlu tarayıp
engagement sırasına göre listeleyen sistem.

ÇALIŞMA MANTIGI:
- Scheduler tarafından her 30 dakikada bir çağrılır
- Her çalışmada sadece 3-4 hesap taranır (batch)
- Hesaplar "en uzun süredir taranmayan önce" sırasına göre seçilir
- Öncelikli hesaplar 2x sık taranır (her batch'te en az 1 priority)
- 08:00-23:00 arası çalışır → günde ~30 tur → her hesap günde 6-8 kez
- Thread'ler otomatik algılanır ve tüm parçaları çekilir
- Her tweet için kısa Türkçe özet üretilir (AI ile)
- Sonuçlar discovery_cache.json'a kaydedilir (kalıcı arşiv)

BATCH SIZE HESABI:
- 13 hesap, 30dk aralık, 15 saat/gün = 30 slot
- Batch=3 → 30 slot × 3 = 90 tarama/gün → hesap başı ~7 tarama
- Priority hesaplar ek slot alır → günde ~10 tarama

ZAMANLAYICI ÇAKIŞMA:
- Auto-reply: 5dk, Self-reply: 15dk, Metrics: 30dk
- Discovery: 30dk — aynı periyotta metrics ile çakışabilir ama
  ikisi de sadece okuma yapıyor, sorun olmaz
"""
import datetime
import logging
import time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Batch başına kaç hesap taranacak
BATCH_SIZE = 3

# Maksimum tweet yaşı (saat) — bundan eski tweet'ler cache'e alınmaz (7 gün)
MAX_TWEET_AGE_HOURS = 168


def _engagement_score(tweet: dict) -> float:
    """Tweet engagement score hesapla (constants.py tek kaynak)."""
    from modules.constants import calculate_engagement_score
    return calculate_engagement_score(tweet)


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


def _make_preview(tweet_text: str) -> str:
    """Tweet'in ilk ~200 karakterlik önizlemesini döndür (API çağrısı yok)."""
    import re
    text = tweet_text.strip()
    text = re.sub(r'https?://\S+', '[link]', text)
    if len(text) <= 200:
        return text
    cut = text[:200].rsplit(" ", 1)[0]
    return cut + "..."


def _generate_turkish_summary(tweets: list[dict]) -> dict[str, str]:
    """Toplu Türkçe çeviri üret — tweet metinlerinin tamamını Türkçeye çevir."""
    if not tweets:
        return {}

    try:
        from backend.api.helpers import get_ai_provider
        import json as _json
        import ssl
        import urllib.request

        provider, api_key, _ = get_ai_provider()
        if not api_key and provider != "claude_code":
            return {}

        # Tweet'leri numaralı liste yap
        tweet_list = []
        for i, t in enumerate(tweets):
            text = t.get("text", "").strip()
            tweet_list.append(f"[{i+1}]\n{text}\n[/{i+1}]")

        prompt = (
            "Asagidaki tweet'lerin her birini TAMAMEN Turkce'ye cevir. "
            "Teknik terimleri (AI, LLM, API, benchmark, open-source vb.) cevirme, olduklari gibi birak. "
            "Tweet'in tum anlamini koru, kisaltma yapma, tweet'in tamamini cevir. "
            "Her ceviriyi numara etiketiyle yaz. Sadece cevirileri yaz, baska bir sey ekleme.\n\n"
            "Format:\n[1]\nTurkce ceviri buraya\n[/1]\n[2]\nTurkce ceviri buraya\n[/2]\n\n"
            + "\n".join(tweet_list)
        )

        system_msg = "Tweet cevirmen. Ingilizce tweet'leri dogal, akici Turkce'ye cevir. Teknik terimleri olduklari gibi birak."

        # OpenAI-compatible API kullan (MiniMax, Groq, OpenAI)
        if provider in ("minimax", "groq", "openai"):
            base_urls = {
                "minimax": "https://api.minimax.io/v1",
                "groq": "https://api.groq.com/openai/v1",
                "openai": "https://api.openai.com/v1",
            }
            models = {
                "minimax": "MiniMax-M2.5",
                "groq": "llama-3.3-70b-versatile",
                "openai": "gpt-4o-mini",
            }
            url = f"{base_urls[provider]}/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            payload = {
                "model": models[provider],
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 4000,
                "temperature": 0.3,
            }
            data = _json.dumps(payload).encode("utf-8")
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                result = _json.loads(resp.read().decode("utf-8"))
                ai_text = result.get("choices", [{}])[0].get("message", {}).get("content", "")

            # Strip unwanted MiniMax tags
            if provider == "minimax" and ai_text:
                import re as _re
                ai_text = _re.sub(r'<think>.*?</think>', '', ai_text, flags=_re.DOTALL).strip()
                ai_text = _re.sub(r'<minimax:tool_call>.*?</minimax:tool_call>', '', ai_text, flags=_re.DOTALL).strip()
                ai_text = _re.sub(r'<minimax:tool_call>.*', '', ai_text, flags=_re.DOTALL).strip()

        elif provider == "anthropic":
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            }
            payload = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 4000,
                "system": system_msg,
                "messages": [{"role": "user", "content": prompt}],
            }
            data = _json.dumps(payload).encode("utf-8")
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                result = _json.loads(resp.read().decode("utf-8"))
                ai_text = result.get("content", [{}])[0].get("text", "")
        else:
            return {}

        # Parse: [1]...[/1] blok formatını tweet_id'lere eşle
        import re
        summaries = {}
        for i, t in enumerate(tweets):
            pattern = rf"\[{i+1}\]\s*(.*?)\s*\[/{i+1}\]"
            m = re.search(pattern, ai_text, re.DOTALL)
            if m:
                translation = m.group(1).strip()
                if translation:
                    summaries[t["tweet_id"]] = translation

        # Fallback: blok format bulunamazsa satır bazlı dene
        if not summaries:
            lines = ai_text.strip().split("\n")
            current_idx = None
            current_text = []
            for line in lines:
                m = re.match(r"(\d+)\.\s*(.+)", line.strip())
                if m:
                    if current_idx is not None and current_text:
                        if 0 <= current_idx < len(tweets):
                            summaries[tweets[current_idx]["tweet_id"]] = " ".join(current_text)
                    current_idx = int(m.group(1)) - 1
                    current_text = [m.group(2).strip()]
                elif current_idx is not None and line.strip():
                    current_text.append(line.strip())
            if current_idx is not None and current_text:
                if 0 <= current_idx < len(tweets):
                    summaries[tweets[current_idx]["tweet_id"]] = " ".join(current_text)

        return summaries

    except Exception as e:
        logger.warning("Discovery: Turkce ceviri uretilemedi: %s", e)
        return {}


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


def _pick_batch(priority_accounts: list[str], normal_accounts: list[str],
                rotation: dict) -> list[str]:
    """
    Rotasyonla batch seç: en uzun süredir taranmayan hesapları öncelikle al.
    Priority hesaplardan en az 1 tane her batch'te olsun.
    """
    last_scanned = rotation.get("last_scanned", {})
    now_iso = datetime.datetime.now(TZ_TR).isoformat()

    def sort_key(account: str) -> str:
        """En eski taranan en başa gelsin (boş = hiç taranmamış = en öncelikli)."""
        return last_scanned.get(account.lower().lstrip("@"), "2000-01-01")

    # Priority hesapları sırala
    sorted_priority = sorted(priority_accounts, key=sort_key)
    # Normal hesapları sırala
    sorted_normal = sorted(normal_accounts, key=sort_key)

    batch: list[str] = []

    # Her zaman en az 1 priority hesap al (varsa)
    if sorted_priority:
        batch.append(sorted_priority[0])

    # Kalan slotları en eski tarananlardan doldur
    remaining = BATCH_SIZE - len(batch)
    candidates = []
    for a in sorted_priority[1:]:  # priority'nin kalanları
        candidates.append(a)
    for a in sorted_normal:
        candidates.append(a)

    # En eski tarananlara göre sırala
    candidates.sort(key=sort_key)

    for a in candidates:
        if len(batch) >= BATCH_SIZE:
            break
        if a not in batch:
            batch.append(a)

    return batch


def scan_accounts(force: bool = False, only_accounts: list[str] | None = None):
    """
    Rotasyonlu tarama: her çalışmada sadece BATCH_SIZE hesap tara.
    force=True ise tüm hesapları tara (manuel tetikleme).
    only_accounts verilirse sadece o hesapları tarar.
    """
    from backend.modules.style_manager import (
        load_discovery_config,
        load_discovery_cache,
        save_discovery_cache,
        load_discovery_seen,
        save_discovery_seen,
        load_discovery_rotation,
        save_discovery_rotation,
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

    priority_accounts = config.get("priority_accounts", [])
    normal_accounts = config.get("normal_accounts", [])

    if not priority_accounts and not normal_accounts:
        logger.info("Discovery: Hesap listesi boş")
        return

    rotation = load_discovery_rotation()

    # Hesap seçimi: only_accounts > force (tümü) > rotasyon batch
    if only_accounts:
        accounts_to_scan = [a.strip().lstrip("@") for a in only_accounts if a.strip()]
    elif force:
        accounts_to_scan = [a.strip().lstrip("@") for a in priority_accounts + normal_accounts if a.strip()]
    else:
        accounts_to_scan = _pick_batch(priority_accounts, normal_accounts, rotation)

    priority_set = set(a.lower().lstrip("@") for a in priority_accounts)

    logger.info(
        "Discovery: Tarama başlıyor — %d/%d hesap (batch): %s",
        len(accounts_to_scan),
        len(priority_accounts) + len(normal_accounts),
        ", ".join(f"@{a}" for a in accounts_to_scan),
    )

    twikit = _get_twikit_client()
    if not twikit:
        logger.warning("Discovery: Twikit client kullanılamıyor")
        return

    seen = load_discovery_seen()
    new_tweets: list[dict] = []

    for account in accounts_to_scan:
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

            raw_created = tweet.get("created_at", "")
            created_at = str(raw_created) if not isinstance(raw_created, str) else raw_created

            # Zaman filtresi: MAX_TWEET_AGE_HOURS'dan eski tweet'leri atla
            try:
                tweet_dt = datetime.datetime.fromisoformat(created_at)
                if tweet_dt.tzinfo is None:
                    tweet_dt = tweet_dt.replace(tzinfo=TZ_TR)
                age_hours = (now - tweet_dt).total_seconds() / 3600
                if age_hours > MAX_TWEET_AGE_HOURS:
                    seen.add(tweet_id)
                    continue
            except (ValueError, TypeError):
                pass  # Parse edilemezse devam et

            # Engagement hesapla
            score = _engagement_score(tweet)
            is_priority = account.lower() in priority_set

            # Öncelikli hesaplara 1.5x bonus
            display_score = score * 1.5 if is_priority else score

            # Thread kontrolü
            thread_parts = []
            conversation_id = tweet.get("conversation_id", "")
            if conversation_id and conversation_id == tweet_id:
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
                "summary_tr": _make_preview(tweet_text),
                "tweet_url": f"https://x.com/{account}/status/{tweet_id}",
                "scanned_at": now.isoformat(),
            })

        # Rotasyon kaydı güncelle
        rotation.setdefault("last_scanned", {})[account.lower()] = now.isoformat()

        # Rate limit koruması
        time.sleep(3)

    # Toplu Türkçe özet üret (tek API çağrısı)
    if new_tweets:
        summaries = _generate_turkish_summary(new_tweets)
        if summaries:
            for tweet in new_tweets:
                tid = tweet["tweet_id"]
                if tid in summaries:
                    tweet["summary_tr"] = summaries[tid]
            logger.info("Discovery: %d/%d tweet icin Turkce ozet uretildi",
                        len(summaries), len(new_tweets))

    # Mevcut cache'e ekle ve sırala
    existing_cache = load_discovery_cache()

    # Eski tweet'leri cache'den temizle (MAX_TWEET_AGE_HOURS)
    cutoff = now - datetime.timedelta(hours=MAX_TWEET_AGE_HOURS)
    cleaned_cache = []
    for t in existing_cache:
        try:
            t_dt = datetime.datetime.fromisoformat(t.get("created_at", ""))
            if t_dt.tzinfo is None:
                t_dt = t_dt.replace(tzinfo=TZ_TR)
            if t_dt >= cutoff:
                cleaned_cache.append(t)
        except (ValueError, TypeError):
            cleaned_cache.append(t)  # Parse edilemezse tut
    existing_cache = cleaned_cache

    # Yeni tweet'leri ekle (duplicate kontrolü)
    existing_ids = {e["tweet_id"] for e in existing_cache}
    for tweet in new_tweets:
        if tweet["tweet_id"] not in existing_ids:
            existing_cache.append(tweet)

    # display_score'a göre sırala (yüksekten düşüğe)
    existing_cache.sort(key=lambda x: x.get("display_score", 0), reverse=True)

    # Maksimum 500 tweet tut
    existing_cache = existing_cache[:500]

    save_discovery_cache(existing_cache)
    save_discovery_seen(seen)
    save_discovery_rotation(rotation)

    logger.info(
        "Discovery: Batch tamamlandı — %d yeni tweet, cache'te toplam %d tweet. "
        "Taranan: %s",
        len(new_tweets), len(existing_cache),
        ", ".join(f"@{a}" for a in accounts_to_scan),
    )

    # Telegram bildirimi gonder
    if new_tweets:
        _send_telegram_discovery(
            new_count=len(new_tweets),
            total_count=len(existing_cache),
            accounts_scanned=accounts_to_scan,
            top_tweets=sorted(new_tweets, key=lambda x: x.get("display_score", 0), reverse=True)[:5],
        )


def _send_telegram_discovery(new_count: int, total_count: int,
                              accounts_scanned: list[str],
                              top_tweets: list[dict]):
    """Telegram'a discovery ozeti gonder."""
    try:
        from backend.config import get_settings
        from backend.modules.telegram_notifier import TelegramNotifier

        settings = get_settings()
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return
        notifier = TelegramNotifier(settings.telegram_bot_token, settings.telegram_chat_id)
        notifier.send_discovery_summary(
            new_count=new_count,
            total_count=total_count,
            accounts_scanned=accounts_scanned,
            top_tweets=top_tweets,
        )
    except Exception as e:
        logger.warning("Discovery telegram notification failed: %s", e)
