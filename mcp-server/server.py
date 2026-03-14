"""
xCom MCP Server — Claude'un xCom sistemine gerçek zamanlı erişim sağlaması için.

Bu MCP server, xCom FastAPI backend'ine HTTP çağrıları yapar ve Claude'a
tweet keşfi, araştırma, üretim, yayınlama ve analiz araçları sunar.

Kullanım:
  python3 server.py

Ortam değişkenleri:
  XCOM_API_URL — Backend URL (varsayılan: http://localhost:8000)
"""

import json
import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

# ── Config ─────────────────────────────────────────────
API_URL = os.environ.get("XCOM_API_URL", "http://localhost:8000")
TIMEOUT = 120  # seconds — research can take long

mcp = FastMCP(
    "xCom",
    instructions=(
        "xCom AI Tweet Otomasyon sistemi. "
        "Keşif, araştırma, tweet üretimi, yayınlama ve analiz araçları sunar. "
        "Tüm yanıtlar Türkçe olmalı."
    ),
)


# ── Helpers ────────────────────────────────────────────

def _url(path: str) -> str:
    return f"{API_URL}{path}"


async def _get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(_url(path), params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(_url(path), json=body or {})
        r.raise_for_status()
        return r.json()


async def _delete(path: str) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.delete(_url(path))
        r.raise_for_status()
        return r.json()


def _fmt(data: Any) -> str:
    """Format API response as readable text."""
    if isinstance(data, str):
        return data
    return json.dumps(data, ensure_ascii=False, indent=2)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DISCOVERY — Keşif & Tarama
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
async def discovery_tweets(hours: int = 24) -> str:
    """Son N saatteki keşif tweet'lerini getir.

    Monitör edilen AI hesaplarından toplanan tweet'leri döndürür.
    Her tweet: metin, yazar, beğeni, RT, Türkçe özet içerir.

    Args:
        hours: Kaç saatlik tweet'leri getir (varsayılan 24)
    """
    data = await _get("/api/discovery/tweets", {"hours": hours})
    tweets = data.get("tweets", [])
    if not tweets:
        return "Son {hours} saatte keşif tweet'i yok."

    lines = [f"## Keşif Tweet'leri (son {hours} saat) — {len(tweets)} tweet\n"]
    for i, tw in enumerate(tweets[:30], 1):
        account = tw.get("account", "?")
        text = (tw.get("summary_tr") or tw.get("text", ""))[:200]
        likes = tw.get("like_count", 0)
        rts = tw.get("retweet_count", 0)
        url = tw.get("tweet_url", "")
        lines.append(f"{i}. **@{account}** ({likes}❤ {rts}🔁)\n   {text}\n   {url}\n")
    lines.append(f"\nToplam: {data.get('total', len(tweets))} tweet")
    return "\n".join(lines)


@mcp.tool()
async def discovery_trends() -> str:
    """Trend analizi sonuçlarını getir.

    AI/teknoloji dünyasındaki trend konuları, kümeleri ve
    engagement potansiyellerini döndürür.
    """
    data = await _get("/api/discovery/trends")
    trends = data.get("trends", [])
    if not trends:
        return "Trend bulunamadı. Kümeleme henüz çalışmamış olabilir."

    lines = ["## Trendler\n"]
    for i, tr in enumerate(trends[:15], 1):
        keyword = tr.get("keyword", "?")
        count = tr.get("tweet_count", 0)
        score = tr.get("engagement_score", 0)
        lines.append(f"{i}. **{keyword}** — {count} tweet, skor: {score:.0f}")
    return "\n".join(lines)


@mcp.tool()
async def discovery_suggestions() -> str:
    """AI akıllı önerilerini (kümeleri) getir.

    Trend + tweet verilerinden AI'ın ürettiği konu kümeleri.
    Her küme: başlık, açıklama, engagement potansiyeli, önerilen stil/saat içerir.
    """
    data = await _get("/api/discovery/smart-suggestions")
    suggestions = data.get("suggestions", [])
    if not suggestions:
        return "AI önerisi yok. Kümeleme henüz çalışmamış olabilir."

    lines = [f"## AI Önerileri — {len(suggestions)} küme\n"]
    for i, s in enumerate(suggestions[:10], 1):
        topic = s.get("topic", "?")
        desc = s.get("description", "")[:150]
        eng = s.get("engagement_potential", 0)
        style = s.get("suggested_style", "")
        hour = s.get("suggested_hour", "")
        tweet_count = len(s.get("tweets", []))
        lines.append(
            f"{i}. **{topic}** (potansiyel: {eng}/10, stil: {style}, saat: {hour})\n"
            f"   {desc}\n"
            f"   {tweet_count} tweet bu kümede\n"
        )
    return "\n".join(lines)


@mcp.tool()
async def system_status() -> str:
    """Sistemin genel durumunu getir: scheduler, worker'lar, API durumu.

    Backend'deki tüm scheduler job'larının son çalışma ve sonraki
    çalışma zamanlarını gösterir.
    """
    sched = await _get("/api/discovery/scheduler-status")
    dash = await _get("/api/dashboard/stats")

    lines = ["## Sistem Durumu\n"]

    # Dashboard
    lines.append(f"- Bugünkü postlar: {dash.get('today_posts', 0)}")
    lines.append(f"- Toplam taslak: {dash.get('total_drafts', 0)}")
    lines.append(f"- Haftalık post: {dash.get('week_posts', 0)}")
    lines.append(f"- Twitter API: {'✅' if dash.get('has_twitter') else '❌'}")
    lines.append(f"- AI API: {'✅' if dash.get('has_ai') else '❌'}")

    # Scheduler jobs
    jobs = sched.get("jobs", [])
    if jobs:
        lines.append("\n### Scheduler İşleri")
        for job in jobs:
            name = job.get("name", "?")
            last = job.get("last_run", "hiç")
            nxt = job.get("next_run", "?")
            lines.append(f"- **{name}**: son={last}, sonraki={nxt}")

    return "\n".join(lines)


@mcp.tool()
async def trigger_scan(accounts: str = "") -> str:
    """Manuel keşif taraması başlat.

    Belirtilen hesapların tweet'lerini tarar. Boş bırakılırsa
    tüm monitör edilen hesaplar taranır.

    Args:
        accounts: Virgülle ayrılmış hesap listesi (opsiyonel, örn: "OpenAI,AnthropicAI")
    """
    body = {}
    if accounts:
        body["accounts"] = [a.strip() for a in accounts.split(",")]
    data = await _post("/api/discovery/trigger", body)
    return f"Tarama başlatıldı: {data.get('message', 'OK')} — {data.get('total', 0)} tweet"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RESEARCH — Araştırma
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
async def research_topic(
    topic: str,
    engine: str = "default",
    agentic: bool = False,
) -> str:
    """Bir konu hakkında derin araştırma yap (DuckDuckGo/Grok).

    Web araması, makale okuma, sentez ve anahtar bulgular üretir.
    Tweet yazmadan önce kullanılmalı.

    Args:
        topic: Araştırılacak konu (İngilizce veya Türkçe)
        engine: Arama motoru — "default" (DDG), "grok" (xAI Grok)
        agentic: True ise daha derin araştırma (2 döngü, daha yavaş)
    """
    data = await _post("/api/generator/research", {
        "topic": topic,
        "engine": engine,
        "agentic": agentic,
    })
    summary = data.get("summary", "")
    sources = data.get("sources", [])
    key_findings = data.get("key_findings", [])

    lines = [f"## Araştırma: {topic[:80]}\n"]
    if summary:
        lines.append(f"### Özet\n{summary[:3000]}\n")
    if key_findings:
        lines.append("### Anahtar Bulgular")
        for kf in key_findings[:8]:
            lines.append(f"- {kf}")
    if sources:
        lines.append(f"\n### Kaynaklar ({len(sources)})")
        for s in sources[:5]:
            title = s.get("title", "")
            url = s.get("url", "")
            lines.append(f"- [{title}]({url})" if url else f"- {title}")
    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GENERATION — Tweet Üretimi
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
async def get_styles() -> str:
    """Mevcut tweet stillerini ve formatlarını listele.

    Tweet üretirken hangi stil (bilgilendirici, provoke edici vb.)
    ve format (micro, thread vb.) kullanılabileceğini gösterir.
    """
    data = await _get("/api/generator/styles")
    styles = data.get("styles", [])
    formats = data.get("formats", [])

    lines = ["## Tweet Stilleri\n"]
    for s in styles:
        lines.append(f"- **{s['value']}**: {s['label']} — {s.get('description', '')}")
    lines.append("\n## Formatlar\n")
    for f in formats:
        lines.append(f"- **{f['value']}**: {f['label']} — {f.get('description', '')}")
    return "\n".join(lines)


@mcp.tool()
async def generate_tweet(
    topic: str,
    style: str = "informative",
    content_format: str = "spark",
    research_context: str = "",
    provider: str = "",
) -> str:
    """Belirtilen konu hakkında tweet üret.

    Araştırma context'i verilirse daha kaliteli tweet üretilir.
    Önce research_topic ile araştırma yapıp context'ini buraya ver.

    Args:
        topic: Tweet konusu
        style: Stil (informative, provocative, technical, storytelling vb.)
        content_format: Format (spark=kısa, thread_short=3-4 tweet, thread_long=5+ tweet)
        research_context: Araştırma özeti (research_topic çıktısını yapıştır)
        provider: AI provider (her zaman MiniMax kullanılır)
    """
    body: dict[str, Any] = {
        "topic": topic,
        "style": style,
        "content_format": content_format,
        "length": content_format,
    }
    if research_context:
        body["research_context"] = research_context
    if provider:
        body["provider"] = provider

    data = await _post("/api/generator/tweet", body)
    text = data.get("tweet") or data.get("text", "")
    score = data.get("score", {})
    thread_parts = data.get("thread_parts", [])

    lines = ["## Üretilen Tweet\n"]
    if thread_parts and len(thread_parts) > 1:
        lines.append(f"**Thread ({len(thread_parts)} tweet)**\n")
        for i, part in enumerate(thread_parts, 1):
            lines.append(f"{i}/ {part}\n")
    else:
        lines.append(f"```\n{text}\n```\n")

    if isinstance(score, dict) and score.get("overall"):
        lines.append(f"**Kalite skoru**: {score['overall']}/10")
        for dim, val in score.items():
            if dim != "overall" and isinstance(val, (int, float)):
                lines.append(f"  - {dim}: {val}")
    elif isinstance(score, (int, float)):
        lines.append(f"**Kalite skoru**: {score}/10")

    return "\n".join(lines)


@mcp.tool()
async def generate_quote_tweet(
    original_tweet: str,
    original_author: str,
    style: str = "quote_tweet",
    research_summary: str = "",
    provider: str = "",
) -> str:
    """Bir tweet'e quote tweet üret.

    Args:
        original_tweet: Alıntılanacak tweet metni
        original_author: Orijinal tweet yazarı (@username)
        style: Stil
        research_summary: Araştırma özeti (opsiyonel)
        provider: AI provider (opsiyonel)
    """
    body: dict[str, Any] = {
        "original_tweet": original_tweet,
        "original_author": original_author,
        "style": style,
    }
    if research_summary:
        body["research_summary"] = research_summary
    if provider:
        body["provider"] = provider

    data = await _post("/api/generator/quote-tweet", body)
    text = data.get("text", "")
    score = data.get("score", {})

    overall = score.get("overall", 0) if isinstance(score, dict) else score
    return f"## Quote Tweet\n\n```\n{text}\n```\n\nKalite skoru: {overall}/10"


@mcp.tool()
async def score_tweet(text: str) -> str:
    """Tweet kalite skorunu hesapla.

    Engagement, doğallık, hook kalitesi, değer katma ve
    algoritma uyumu boyutlarında 1-10 skor verir.

    Args:
        text: Skorlanacak tweet metni
    """
    data = await _post("/api/generator/score", {"text": text})
    score = data.get("score", data)
    return f"## Tweet Skoru\n\n{_fmt(score)}"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PUBLISH & SCHEDULE — Yayınlama & Zamanlama
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
async def publish_tweet(
    text: str,
    thread_parts: list[str] | None = None,
) -> str:
    """Tweet'i X'te yayınla (Twitter API ile).

    DİKKAT: Bu gerçek bir tweet gönderir! Onay almadan çağırma.

    Args:
        text: Tweet metni (tek tweet veya thread'in ilk tweet'i)
        thread_parts: Thread parçaları (opsiyonel, liste olarak)
    """
    body: dict[str, Any] = {"text": text}
    if thread_parts:
        body["thread_parts"] = thread_parts

    data = await _post("/api/publish/tweet", body)
    if data.get("success"):
        url = data.get("url", "")
        return f"✅ Tweet yayınlandı!\nURL: {url}"
    return f"❌ Yayınlama hatası: {data.get('error', 'Bilinmeyen hata')}"


@mcp.tool()
async def schedule_post(
    text: str,
    scheduled_time: str,
    thread_parts: list[str] | None = None,
) -> str:
    """Tweet'i belirtilen zamanda yayınlanmak üzere zamanla.

    Args:
        text: Tweet metni
        scheduled_time: ISO format tarih/saat (örn: "2026-03-15T14:07:00")
        thread_parts: Thread parçaları (opsiyonel)
    """
    body: dict[str, Any] = {
        "text": text,
        "scheduled_time": scheduled_time,
    }
    if thread_parts:
        body["thread_parts"] = thread_parts

    data = await _post("/api/scheduler/add", body)
    if data.get("success"):
        return f"✅ Tweet zamanlandı: {scheduled_time}\nID: {data.get('post_id', '')}"
    return f"❌ Zamanlama hatası: {data.get('error', 'Bilinmeyen hata')}"


@mcp.tool()
async def pending_posts() -> str:
    """Bekleyen zamanlanmış postları listele."""
    data = await _get("/api/scheduler/pending")
    posts = data.get("posts", [])
    if not posts:
        return "Bekleyen zamanlanmış post yok."

    lines = [f"## Bekleyen Postlar ({len(posts)})\n"]
    for p in posts:
        time = p.get("scheduled_time", "?")
        text = p.get("text", "")[:100]
        pid = p.get("id", "?")
        lines.append(f"- [{pid}] {time}: {text}...")
    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DRAFTS — Taslaklar
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
async def save_draft(text: str, topic: str = "") -> str:
    """Tweet'i taslak olarak kaydet.

    Args:
        text: Tweet metni
        topic: Konu başlığı (opsiyonel)
    """
    data = await _post("/api/drafts/add", {"text": text, "topic": topic})
    return "✅ Taslak kaydedildi." if data.get("success") else "❌ Kaydetme hatası."


@mcp.tool()
async def list_drafts() -> str:
    """Kaydedilmiş taslakları listele."""
    data = await _get("/api/drafts/list")
    drafts = data.get("drafts", [])
    if not drafts:
        return "Kayıtlı taslak yok."

    lines = [f"## Taslaklar ({len(drafts)})\n"]
    for i, d in enumerate(drafts):
        text = d.get("text", "")[:120]
        topic = d.get("topic", "")
        lines.append(f"{i}. {'[' + topic + '] ' if topic else ''}{text}...")
    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ANALYTICS — Analiz
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
async def analyze_account(username: str, tweet_count: int = 20) -> str:
    """X hesabını analiz et — stil DNA, engagement, en iyi saatler.

    Args:
        username: X kullanıcı adı (@ olmadan)
        tweet_count: Analiz edilecek tweet sayısı (varsayılan 20)
    """
    data = await _post("/api/analytics/analyze", {
        "username": username,
        "tweet_count": tweet_count,
        "ai_report": True,
    })
    if not data.get("username"):
        return f"❌ @{username} analiz edilemedi."

    lines = [f"## @{username} Analizi\n"]
    lines.append(f"- Analiz edilen tweet: {data.get('tweets_analyzed', 0)}")
    lines.append(f"- Ort. engagement: {data.get('avg_engagement', 0):.1f}")

    dna = data.get("style_dna", {})
    if dna:
        lines.append(f"\n### Stil DNA")
        lines.append(f"- Ton: {dna.get('tone', '?')}")
        lines.append(f"- Format: {dna.get('format', '?')}")
        lines.append(f"- Konu: {dna.get('topics', '?')}")

    report = data.get("ai_report", "")
    if report:
        lines.append(f"\n### AI Raporu\n{report[:2000]}")

    return "\n".join(lines)


@mcp.tool()
async def performance_stats() -> str:
    """Tweet performans istatistiklerini getir.

    Takip edilen tweet'lerin beğeni, RT, görüntülenme
    ortalamaları ve en iyi tweet.
    """
    data = await _get("/api/performance/stats")
    summary = data.get("summary", {})
    best = data.get("best_tweet", {})

    lines = ["## Performans İstatistikleri\n"]
    lines.append(f"- Takip edilen tweet: {summary.get('tracked_count', 0)}")
    lines.append(f"- Toplam beğeni: {summary.get('total_likes', 0)}")
    lines.append(f"- Ort. beğeni: {summary.get('avg_likes', 0):.1f}")
    lines.append(f"- Toplam RT: {summary.get('total_retweets', 0)}")
    lines.append(f"- Ort. görüntülenme: {summary.get('avg_impressions', 0):.0f}")

    if best:
        lines.append(f"\n### En İyi Tweet")
        lines.append(f"- {best.get('text', '')[:150]}...")
        lines.append(f"- ❤ {best.get('likes', 0)} 🔁 {best.get('retweets', 0)} 👁 {best.get('impressions', 0)}")

    return "\n".join(lines)


@mcp.tool()
async def find_media(topic: str, source: str = "both") -> str:
    """Konu ile ilgili görsel/video bul.

    Args:
        topic: Aranacak konu
        source: Kaynak — "x" (Twitter), "web" (DuckDuckGo), "both"
    """
    data = await _post("/api/generator/find-media", {
        "topic": topic[:200],
        "source": source,
    })
    results = data.get("results", [])
    if not results:
        return f"'{topic}' için medya bulunamadı."

    lines = [f"## Medya Sonuçları — {len(results)} öğe\n"]
    for i, r in enumerate(results[:10], 1):
        mtype = r.get("type", "image")
        url = r.get("url", "")
        title = r.get("title", "")[:80]
        lines.append(f"{i}. [{mtype}] {title}\n   {url}\n")
    return "\n".join(lines)


@mcp.tool()
async def search_x_accounts(query: str, max_results: int = 10) -> str:
    """X'te hesap ara (kullanıcı adı, bio ile eşleşme).

    Args:
        query: Arama sorgusu (örn: "AI researcher", "machine learning")
        max_results: Maksimum sonuç sayısı
    """
    data = await _post("/api/discovery/search-accounts", {
        "query": query,
        "max_results": max_results,
    })
    accounts = data.get("accounts", [])
    if not accounts:
        return f"'{query}' için hesap bulunamadı."

    lines = [f"## X Hesap Araması: '{query}' — {len(accounts)} sonuç\n"]
    for a in accounts:
        name = a.get("name", "?")
        username = a.get("username", "?")
        followers = a.get("followers_count", 0)
        bio = (a.get("bio") or "")[:100]
        lines.append(f"- **@{username}** ({name}) — {followers:,} takipçi\n  {bio}\n")
    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SCAN — Konu Tarama
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
async def scan_topics(
    category: str = "all",
    max_results: int = 20,
    engine: str = "twikit",
) -> str:
    """AI konularını tara (Twikit veya Grok ile).

    Args:
        category: Kategori — "all", "LLM", "Vision", "Robotics", "AI_Agents", "Research"
        max_results: Maksimum sonuç
        engine: "twikit" veya "grok"
    """
    data = await _post("/api/scanner/scan", {
        "category": category,
        "max_results": max_results,
        "engine": engine,
    })
    topics = data.get("topics", [])
    if not topics:
        return "Tarama sonucu bulunamadı."

    lines = [f"## Tarama Sonuçları — {len(topics)} konu\n"]
    for i, t in enumerate(topics[:20], 1):
        text = (t.get("text") or t.get("title", ""))[:150]
        author = t.get("author_username", "?")
        likes = t.get("like_count", 0)
        lines.append(f"{i}. @{author} ({likes}❤): {text}")
    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Entrypoint
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if __name__ == "__main__":
    mcp.run()
