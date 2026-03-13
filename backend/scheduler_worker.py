"""
Scheduler Worker - APScheduler ile zamanlanmis tweetleri otomatik paylas.
FastAPI startup event'inde baslatilir.
"""
import datetime
import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler

from backend.modules.style_manager import (
    load_scheduled_posts,
    update_scheduled_post,
    add_to_post_history,
)

logger = logging.getLogger(__name__)

TZ_TR = ZoneInfo("Europe/Istanbul")

scheduler = BackgroundScheduler(timezone=TZ_TR)

# ── Last-run tracking (Faz 1) ────────────────────────
_last_run_times: dict[str, str] = {}  # job_id → ISO timestamp


def _track_run(job_id: str):
    """Record the last run time for a scheduler job."""
    _last_run_times[job_id] = datetime.datetime.now(TZ_TR).isoformat()


def get_scheduler_status() -> dict:
    """Return status of all scheduler jobs (for /scheduler-status endpoint)."""
    jobs = []
    if scheduler.running:
        for job in scheduler.get_jobs():
            next_run = None
            if job.next_run_time:
                next_run = job.next_run_time.isoformat()
            jobs.append({
                "id": job.id,
                "next_run": next_run,
                "last_run": _last_run_times.get(job.id),
            })
    return {
        "running": scheduler.running,
        "jobs": jobs,
        "total_jobs": len(jobs),
    }


def _publish_scheduled_post(post: dict) -> dict:
    """Tek bir zamanlanmis postu paylas. Sonuc dict doner."""
    from backend.config import get_settings

    settings = get_settings()

    api_key = settings.twitter_api_key
    api_secret = settings.twitter_api_secret
    access_token = settings.twitter_access_token
    access_secret = settings.twitter_access_secret
    bearer_token = settings.twitter_bearer_token

    if not (api_key and api_secret and access_token and access_secret):
        return {"success": False, "error": "Twitter API credentials eksik"}

    from backend.modules.tweet_publisher import TweetPublisher

    publisher = TweetPublisher(
        api_key=api_key,
        api_secret=api_secret,
        access_token=access_token,
        access_secret=access_secret,
        bearer_token=bearer_token,
    )

    thread_parts = post.get("thread_parts", [])
    quote_tweet_id = post.get("quote_tweet_id", "")
    reply_to_id = post.get("reply_to_id", "")

    if thread_parts:
        results = publisher.post_thread(thread_parts)
        first = results[0] if results else {}
        if first.get("success"):
            urls = [r.get("url", "") for r in results if r.get("success")]
            add_to_post_history({
                "text": post.get("text", ""),
                "url": first.get("url", ""),
                "type": "scheduled_thread",
                "parts": len(thread_parts),
                "thread_urls": urls,
            })
        return first
    elif reply_to_id:
        # Self-reply or reply to specific tweet
        result = publisher.post_reply(post.get("text", ""), reply_to_id)
        if result.get("success"):
            add_to_post_history({
                "text": post.get("text", ""),
                "url": result.get("url", ""),
                "type": "scheduled_self_reply",
                "reply_to_id": reply_to_id,
            })
        return result
    elif quote_tweet_id:
        result = publisher.post_quote_tweet(post.get("text", ""), quote_tweet_id)
        if result.get("success"):
            add_to_post_history({
                "text": post.get("text", ""),
                "url": result.get("url", ""),
                "type": "scheduled_quote",
            })
        return result
    else:
        result = publisher.post_tweet(post.get("text", ""))
        if result.get("success"):
            add_to_post_history({
                "text": post.get("text", ""),
                "url": result.get("url", ""),
                "type": "scheduled_tweet",
            })
        return result


def check_and_publish():
    """Her dakika calisir: zamani gelen postlari paylas."""
    now = datetime.datetime.now(TZ_TR)
    posts = load_scheduled_posts()

    for post in posts:
        if post.get("status") != "pending":
            continue

        scheduled_time_str = post.get("scheduled_time", "")
        if not scheduled_time_str:
            continue

        try:
            scheduled_dt = datetime.datetime.fromisoformat(scheduled_time_str)
            if scheduled_dt.tzinfo is None:
                scheduled_dt = scheduled_dt.replace(tzinfo=TZ_TR)
        except ValueError:
            logger.warning("Invalid scheduled_time: %s", scheduled_time_str)
            continue

        # Zamani geldi mi? (1 dakika tolerans)
        if scheduled_dt <= now:
            post_id = post.get("id", "")
            logger.info("Publishing scheduled post %s (scheduled: %s)", post_id, scheduled_time_str)

            try:
                result = _publish_scheduled_post(post)
                if result.get("success"):
                    update_scheduled_post(post_id, {
                        "status": "published",
                        "published_at": now.isoformat(),
                        "tweet_id": result.get("tweet_id", ""),
                        "tweet_url": result.get("url", ""),
                    })
                    logger.info("Scheduled post %s published successfully: %s", post_id, result.get("url", ""))

                    # Self-reply chain: update next reply's reply_to_id
                    chain_id = post.get("self_reply_chain_id")
                    chain_index = post.get("self_reply_chain_index", -1)
                    new_tweet_id = result.get("tweet_id", "")
                    if chain_id and new_tweet_id and chain_index >= 0:
                        _update_chain_next_reply(chain_id, chain_index, new_tweet_id)

                    # Telegram bildirimi (opsiyonel)
                    _send_telegram_notification(post, result)
                else:
                    error_msg = result.get("error", "Bilinmeyen hata")
                    update_scheduled_post(post_id, {
                        "status": "failed",
                        "failed_at": now.isoformat(),
                        "error": error_msg,
                    })
                    logger.error("Scheduled post %s failed: %s", post_id, error_msg)

                    # Chain failure: kalan reply'lari da iptal et
                    chain_id = post.get("self_reply_chain_id")
                    if chain_id:
                        _cancel_remaining_chain(chain_id, post.get("self_reply_chain_index", -1))

            except Exception as e:
                update_scheduled_post(post_id, {
                    "status": "failed",
                    "failed_at": now.isoformat(),
                    "error": str(e),
                })
                logger.exception("Scheduled post %s error", post_id)

                # Chain failure: kalan reply'lari da iptal et
                chain_id = post.get("self_reply_chain_id")
                if chain_id:
                    _cancel_remaining_chain(chain_id, post.get("self_reply_chain_index", -1))


def _update_chain_next_reply(chain_id: str, current_index: int, new_tweet_id: str):
    """Self-reply chain: update the next reply's reply_to_id to point to the just-published tweet."""
    posts = load_scheduled_posts()
    next_index = current_index + 1
    for p in posts:
        if (
            p.get("self_reply_chain_id") == chain_id
            and p.get("self_reply_chain_index") == next_index
            and p.get("status") == "pending"
        ):
            # Idempotency: zaten dogru set edildiyse tekrar yazma
            existing_reply_to = p.get("reply_to_id", "")
            if existing_reply_to == new_tweet_id:
                logger.info(
                    "Chain %s: reply #%d already has correct reply_to_id=%s, skipping",
                    chain_id, next_index, new_tweet_id,
                )
                break
            update_scheduled_post(p["id"], {"reply_to_id": new_tweet_id})
            logger.info(
                "Chain %s: updated reply #%d reply_to_id → %s",
                chain_id, next_index, new_tweet_id,
            )
            break


def _cancel_remaining_chain(chain_id: str, failed_index: int):
    """Chain'de bir reply basarisiz olunca kalan reply'lari iptal et."""
    posts = load_scheduled_posts()
    now = datetime.datetime.now(TZ_TR)
    cancelled = 0
    for p in posts:
        if (
            p.get("self_reply_chain_id") == chain_id
            and p.get("self_reply_chain_index", -1) > failed_index
            and p.get("status") == "pending"
        ):
            update_scheduled_post(p["id"], {
                "status": "cancelled",
                "cancelled_at": now.isoformat(),
                "cancel_reason": f"Chain reply #{failed_index} failed",
            })
            cancelled += 1
    if cancelled:
        logger.warning(
            "Chain %s: %d remaining reply(s) cancelled after index %d failed",
            chain_id, cancelled, failed_index,
        )


def _send_telegram_notification(post: dict, result: dict):
    """Basarili zamanlanmis paylasim icin Telegram bildirimi gonder."""
    try:
        from backend.config import get_settings
        settings = get_settings()
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            return

        from backend.modules.telegram_notifier import send_telegram_message
        text = post.get("text", "")[:100]
        url = result.get("url", "")
        msg = f"Zamanlanmis tweet paylasild!\n\n{text}...\n\n{url}"
        send_telegram_message(msg, settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        pass  # Telegram hatasi kritik degil


def _check_metrics():
    """Her 30 dakikada bir tweet metriklerini guncelle."""
    try:
        from backend.api.performance import check_and_update_metrics
        check_and_update_metrics()
    except Exception:
        logger.exception("Metrics auto-check error")


def _scan_auto_reply_candidates():
    """Auto-reply scanner — tweet'leri tarayıp kuyruğa yazar (AI çağrısı yok)."""
    try:
        from backend.auto_reply_worker import scan_for_candidates
        scan_for_candidates()
    except Exception:
        logger.exception("Auto-reply scanner error")


def _generate_auto_replies():
    """Auto-reply generator — kuyruktan okuyup AI yanıt üretir."""
    try:
        from backend.auto_reply_worker import generate_and_reply
        generate_and_reply()
    except Exception:
        logger.exception("Auto-reply generator error")


def _publish_ready_auto_replies():
    """Auto-reply twikit publisher — hazır taslakları cookie ile gönderir."""
    try:
        from backend.auto_reply_worker import publish_ready_drafts
        publish_ready_drafts()
    except Exception:
        logger.exception("Auto-reply twikit publisher error")


def _check_self_replies():
    """Self-reply worker — her 15 dakikada kendi tweetlerine self-reply atar."""
    try:
        from backend.self_reply_worker import check_self_replies
        check_self_replies()
    except Exception:
        logger.exception("Self-reply check error")


def _check_discovery():
    """Discovery worker — her 30 dakikada 3-4 hesap rotasyonla tara."""
    try:
        from backend.discovery_worker import scan_accounts
        scan_accounts()
        _track_run("discovery_checker")
    except Exception:
        logger.exception("Discovery check error")


def _check_telegram():
    """Telegram bot — mesajlari kontrol et ve cevapla."""
    try:
        from backend.telegram_bot import check_telegram_messages
        check_telegram_messages()
    except Exception:
        logger.exception("Telegram bot check error")


def _auto_scan_topics():
    """Faz 3: Her 2 saatte otomatik konu taramasi — trending AI topics."""
    try:
        from backend.auto_topic_scanner import run_auto_scan
        run_auto_scan()
        _track_run("auto_topic_scanner")
    except Exception:
        logger.exception("Auto topic scan error")


def _generate_dynamic_queries():
    """Faz 11: Haftada 1 kez AI ile yeni arama sorguları üret."""
    try:
        from backend.auto_topic_scanner import generate_dynamic_queries
        generate_dynamic_queries()
        _track_run("dynamic_query_generator")
    except Exception:
        logger.exception("Dynamic query generation error")


def _analyze_trends():
    """Faz 4: Her 1 saatte trend tespiti — cross-account keyword analysis."""
    try:
        from backend.trend_analyzer import analyze_trends
        analyze_trends()
        _track_run("trend_analyzer")
    except Exception:
        logger.exception("Trend analysis error")



def _discover_new_accounts():
    """Her 6 saatte akıllı hesap keşfi — çoklu strateji ile."""
    try:
        from backend.account_discoverer import discover_accounts_smart
        discover_accounts_smart(
            strategies=["cache_based", "trend_based", "interaction_based"],
            max_per_strategy=5,
        )
        _track_run("account_discoverer")
    except Exception:
        logger.exception("Account discovery error")


def _auto_cluster_suggestions():
    """Her 30 dakikada akıllı önerileri otomatik kümele (trend verilerinden)."""
    try:
        from backend.trend_analyzer import analyze_trends
        # analyze_trends() internally calls _cluster_smart_suggestions()
        analyze_trends()
        _track_run("auto_content_suggester")
    except Exception:
        logger.exception("Auto content suggestion/clustering error")


def _auto_analyze_my_tweets(cache_path=None):
    """Tweet çekiminden sonra otomatik MiniMax analizi yap."""
    import json
    from pathlib import Path
    from datetime import datetime

    if cache_path is None:
        cache_path = Path(__file__).parent.parent / "data" / "my_tweets_cache.json"

    if not cache_path.exists():
        return

    with open(cache_path, "r", encoding="utf-8") as f:
        cache = json.load(f)

    tweets = cache.get("tweets", [])
    if not tweets:
        return

    top_tweets = tweets[:50]
    tweet_texts = "\n---\n".join([
        f"[{tw.get('like_count', 0)} like, {tw.get('retweet_count', 0)} RT] {tw['text'][:300]}"
        for tw in top_tweets
    ])

    from backend.api.helpers import get_ai_client
    client, model = get_ai_client()

    prompt = f"""Aşağıda bir X (Twitter) kullanıcısının son 50 tweet'i var. Bunları analiz et ve şu bilgileri JSON olarak döndür:

1. "topics": Kullanıcının en çok paylaşım yaptığı konular (liste, max 10)
2. "style": Yazım tarzı özeti (2-3 cümle)
3. "engagement_patterns": Hangi tür içerikler daha çok etkileşim alıyor (2-3 cümle)
4. "best_performing_topics": En yüksek etkileşim alan konu başlıkları (liste, max 5)
5. "avoid_topics": Kullanıcının paylaşmadığı/ilgilenmediği konular (liste, max 5)
6. "posting_frequency": Günde ortalama kaç tweet
7. "content_type_distribution": {{"haber_analizi": %, "kisisel_yorum": %, "teknik": %, "diger": %}}
8. "recommended_topics": Bu kullanıcıya önerilecek konu önerileri (liste, max 5)

Tweetler:
{tweet_texts}

Sadece JSON döndür, başka bir şey yazma."""

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    text = response.choices[0].message.content.strip()
    import re as re_mod
    json_match = re_mod.search(r'\{[\s\S]*\}', text)
    if json_match:
        analysis = json.loads(json_match.group())
    else:
        analysis = {"raw_response": text}

    result = {
        "analysis": analysis,
        "last_analyzed": datetime.now().isoformat(),
        "tweet_count": len(top_tweets),
        "username": cache.get("username", ""),
    }

    analysis_path = cache_path.parent / "my_tweets_analysis.json"
    with open(analysis_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    logger.info(f"Auto-analyze: {len(top_tweets)} tweets analyzed, topics: {analysis.get('topics', [])[:5]}")


def _fetch_my_tweets():
    """Her 2 saatte kullanıcının kendi tweetlerini çek ve analiz et."""
    try:
        import asyncio
        from backend.modules.style_manager import load_self_reply_config
        sr_config = load_self_reply_config()
        username = sr_config.get("username", "")
        if not username:
            logger.debug("My tweets fetch skipped — no username configured")
            return

        from backend.modules.twikit_client import TwikitSearchClient
        from backend.config import get_settings
        s = get_settings()
        client = TwikitSearchClient(
            username=s.twikit_username or "",
            password=s.twikit_password or "",
            email=s.twikit_email or "",
        )
        if not client.authenticate():
            logger.warning("My tweets fetch — twikit auth failed")
            return

        from backend.modules.tweet_analyzer import pull_user_tweets
        raw_tweets = pull_user_tweets(client, username, count=100)

        tweets = []
        for tw in raw_tweets:
            eng = (
                tw.get("like_count", 0) * 1
                + tw.get("retweet_count", 0) * 20
                + tw.get("reply_count", 0) * 13.5
                + tw.get("bookmark_count", 0) * 10
            )
            tweets.append({
                "tweet_id": tw.get("id", ""),
                "text": tw.get("text", ""),
                "created_at": tw.get("created_at", ""),
                "like_count": tw.get("like_count", 0),
                "retweet_count": tw.get("retweet_count", 0),
                "reply_count": tw.get("reply_count", 0),
                "bookmark_count": tw.get("bookmark_count", 0),
                "view_count": tw.get("view_count", 0),
                "engagement_score": eng,
                "media_items": tw.get("media", []),
                "urls": tw.get("urls", []),
                "is_retweet": tw.get("is_retweet", False),
            })

        tweets.sort(key=lambda x: x["engagement_score"], reverse=True)

        import json
        from pathlib import Path
        from datetime import datetime
        cache_path = Path(__file__).parent.parent / "data" / "my_tweets_cache.json"
        import os
        os.makedirs(cache_path.parent, exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({
                "username": username,
                "tweets": tweets,
                "last_fetch": datetime.now().isoformat(),
                "total": len(tweets),
            }, f, ensure_ascii=False, indent=2)

        _track_run("my_tweet_fetcher")
        logger.info(f"My tweets fetched: {len(tweets)} tweets for @{username}")

        # Otomatik MiniMax analizi — tweet çekimi başarılıysa
        if tweets:
            try:
                _auto_analyze_my_tweets(cache_path)
                logger.info("Auto-analyze completed after tweet fetch")
            except Exception:
                logger.exception("Auto-analyze after fetch failed")
    except Exception:
        logger.exception("My tweets fetch error")


def _auto_score_all():
    """Her 1 saatte tüm keşif verilerini kullanıcı profiline göre AI ile skorla."""
    import asyncio
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        from backend.api.discovery import ai_score_tweets, ai_score_trends, ai_score_suggestions

        try:
            result = loop.run_until_complete(ai_score_tweets())
            logger.info(f"Auto-score tweets: {result}")
        except Exception:
            logger.exception("Auto-score tweets failed")

        try:
            result = loop.run_until_complete(ai_score_trends())
            logger.info(f"Auto-score trends: {result}")
        except Exception:
            logger.exception("Auto-score trends failed")

        try:
            result = loop.run_until_complete(ai_score_suggestions())
            logger.info(f"Auto-score suggestions: {result}")
        except Exception:
            logger.exception("Auto-score suggestions failed")

        loop.close()
        _track_run("ai_scorer")
    except Exception:
        logger.exception("Auto-score all error")


def start_scheduler():
    """Scheduler'i baslat — FastAPI startup'ta cagirilir."""
    if not scheduler.running:
        scheduler.add_job(
            check_and_publish,
            "interval",
            minutes=1,
            id="scheduled_publisher",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_metrics,
            "interval",
            minutes=30,
            id="metrics_checker",
            replace_existing=True,
        )
        scheduler.add_job(
            _scan_auto_reply_candidates,
            "interval",
            minutes=10,
            id="auto_reply_scanner",
            replace_existing=True,
        )
        scheduler.add_job(
            _generate_auto_replies,
            "interval",
            minutes=5,
            id="auto_reply_generator",
            replace_existing=True,
        )
        scheduler.add_job(
            _publish_ready_auto_replies,
            "interval",
            minutes=7,
            id="auto_reply_twikit_publisher",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_self_replies,
            "interval",
            minutes=3,
            id="self_reply_checker",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_discovery,
            "interval",
            minutes=20,
            id="discovery_checker",
            replace_existing=True,
        )
        scheduler.add_job(
            _check_telegram,
            "interval",
            seconds=5,
            id="telegram_bot",
            replace_existing=True,
        )
        # Faz 3: Otomatik konu taraması — her 45 dakikada
        scheduler.add_job(
            _auto_scan_topics,
            "interval",
            minutes=45,
            id="auto_topic_scanner",
            replace_existing=True,
        )
        # Faz 4: Trend tespiti — her 20 dakikada
        scheduler.add_job(
            _analyze_trends,
            "interval",
            minutes=20,
            id="trend_analyzer",
            replace_existing=True,
        )
        # Faz 9: Dinamik hesap keşfi — her 3 saatte
        scheduler.add_job(
            _discover_new_accounts,
            "interval",
            hours=3,
            id="account_discoverer",
            replace_existing=True,
        )
        # Akıllı öneriler — her 15 dakikada otomatik kümele
        scheduler.add_job(
            _auto_cluster_suggestions,
            "interval",
            minutes=15,
            id="auto_content_suggester",
            replace_existing=True,
        )
        # Kullanıcının kendi tweetlerini çek — her 2 saatte
        scheduler.add_job(
            _fetch_my_tweets,
            "interval",
            hours=2,
            id="my_tweet_fetcher",
            replace_existing=True,
        )
        # AI skorlama — her 30 dakikada keşif verilerini kullanıcı profiline göre skorla
        scheduler.add_job(
            _auto_score_all,
            "interval",
            minutes=30,
            id="ai_scorer",
            replace_existing=True,
        )
        # Faz 11: Dinamik sorgu üretimi — haftada 1 kez AI ile yeni arama sorguları
        scheduler.add_job(
            _generate_dynamic_queries,
            "interval",
            hours=168,  # 7 gün = 168 saat
            id="dynamic_query_generator",
            replace_existing=True,
        )
        scheduler.start()
        logger.info(
            "Scheduler started — publish 1m, metrics 30m, auto-reply scanner 10m, "
            "auto-reply generator 5m, self-reply 3m, discovery 20m, telegram 5s, "
            "auto-scan 45m, trends 20m, account-discovery 3h, suggestions 15m, "
            "my-tweets 2h, ai-scorer 30m, dynamic-queries 7d"
        )


def stop_scheduler():
    """Scheduler'i durdur — FastAPI shutdown'da cagirilir."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
