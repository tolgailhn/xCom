"""
Grok AI Client Module
xAI Grok API integration for X search, web search, and agentic research.
Uses xAI Responses API with server-side x_search and web_search tools.
"""
import json
import re
import datetime
import requests as http_requests
from openai import OpenAI


# In-memory cost tracking (replaces _grok_state)
_grok_state: dict = {"grok_usage_cost": 0.0, "grok_call_count": 0}


# Grok model for research — grok-4-1-fast has best agentic search capabilities
GROK_MODEL = "grok-4-1-fast"
GROK_API_BASE = "https://api.x.ai/v1"

# Cost estimates per 1M tokens (USD) — agentic tools are FREE
COST_INPUT_PER_M = 5.00
COST_OUTPUT_PER_M = 25.00


def _get_api_key(api_key: str = None) -> str:
    """Get xAI API key from parameter or secrets."""
    if api_key:
        return api_key
    from backend.modules._compat import get_secret
    return get_secret("xai_api_key", "")


def _grok_responses_api(
    messages: list[dict],
    tools: list[dict] = None,
    model: str = None,
    max_tokens: int = 3000,
    temperature: float = 0.3,
    api_key: str = None,
) -> dict | None:
    """
    Call xAI Responses API with server-side tools (x_search, web_search).

    Unlike Chat Completions, the Responses API lets xAI's server execute
    searches autonomously — Grok actually searches X and web in real-time.

    Returns: {"text": "...", "input_tokens": N, "output_tokens": N} or None
    """
    key = _get_api_key(api_key)
    if not key:
        return None

    payload = {
        "model": model or GROK_MODEL,
        "input": messages,
        "temperature": temperature,
    }
    if tools:
        payload["tools"] = tools
    if max_tokens:
        payload["max_output_tokens"] = max_tokens

    try:
        resp = http_requests.post(
            f"{GROK_API_BASE}/responses",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        # Extract text from response output
        text = ""
        if "output" in data:
            for item in data["output"]:
                if item.get("type") == "message":
                    for content in item.get("content", []):
                        if content.get("type") == "output_text":
                            text += content.get("text", "")
                        elif content.get("type") == "text":
                            text += content.get("text", "")

        # If output parsing didn't work, try output_text directly
        if not text and "output_text" in data:
            text = data["output_text"]

        # Extract usage
        usage = data.get("usage", {})
        input_tokens = usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0)
        output_tokens = usage.get("output_tokens", 0) or usage.get("completion_tokens", 0)

        return {
            "text": text,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    except Exception as e:
        error_str = str(e)
        if "Tunnel connection failed" in error_str or "ProxyError" in str(type(e)):
            print(f"Grok Responses API: Proxy hatası - {e}")
        elif "ConnectError" in str(type(e).__name__) or "name resolution" in error_str.lower():
            print(f"Grok Responses API: Bağlantı hatası - {e}")
        else:
            print(f"Grok Responses API error: {type(e).__name__}: {e}")
        return None


def _parse_json_array(text: str) -> list:
    """Robustly extract a JSON array from text that may contain markdown/extra content."""
    # Strip markdown code fences
    text = re.sub(r'```(?:json)?\s*', '', text).strip()
    text = text.rstrip('`').strip()

    # Try direct parse first
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Find the outermost [...] by bracket matching
    start = text.find('[')
    if start == -1:
        return []

    depth = 0
    for i in range(start, len(text)):
        if text[i] == '[':
            depth += 1
        elif text[i] == ']':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    break

    # Fallback: non-greedy regex
    json_match = re.search(r'\[.*?\]', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    return []


def _track_cost(input_tokens: int = 0, output_tokens: int = 0):
    """Track estimated Grok usage cost in session state. Server-side tools are FREE."""
    total = (input_tokens / 1_000_000 * COST_INPUT_PER_M +
             output_tokens / 1_000_000 * COST_OUTPUT_PER_M)

    if "grok_usage_cost" not in _grok_state:
        _grok_state["grok_usage_cost"] = 0.0
    if "grok_call_count" not in _grok_state:
        _grok_state["grok_call_count"] = 0

    _grok_state["grok_usage_cost"] += total
    _grok_state["grok_call_count"] += 1


# ========================================================================
# SEARCH FUNCTIONS — replacements for DuckDuckGo
# ========================================================================

def grok_search_x(query: str, api_key: str = None, max_results: int = 10) -> list[dict]:
    """
    Search X/Twitter using Grok's REAL server-side x_search tool.
    Uses xAI Responses API — Grok actually searches X in real-time.
    Returns list of dicts with: text, author, likes, retweets.
    """
    result = _grok_responses_api(
        messages=[
            {"role": "system", "content": "You are a research assistant. Search X for the given query and return relevant posts as a JSON array. Return ONLY the JSON array. IMPORTANT: Only return Turkish language tweets (lang:tr). Ignore all non-Turkish tweets."},
            {"role": "user", "content": f"""Search X/Twitter for: "{query}"

Return the top {max_results} most relevant and recent TURKISH language posts as a JSON array. Each item should have:
- "text": the full tweet text
- "author": the username (without @)
- "likes": number of likes
- "retweets": number of retweets

Only include tweets written in Turkish. Return ONLY the JSON array, no other text."""},
        ],
        tools=[{"type": "x_search"}],
        max_tokens=2000,
        temperature=0.1,
        api_key=api_key,
    )

    if not result or not result["text"]:
        return []

    _track_cost(result["input_tokens"], result["output_tokens"])

    raw = re.sub(r'<think>.*?</think>', '', result["text"], flags=re.DOTALL).strip()
    parsed = _parse_json_array(raw)
    return parsed[:max_results] if parsed else []


def grok_search_web(query: str, api_key: str = None, max_results: int = 8) -> list[dict]:
    """
    Search the web using Grok's REAL server-side web_search tool.
    Uses xAI Responses API — Grok actually searches the web in real-time.
    Returns list of dicts with: title, url, body (same format as DuckDuckGo).
    """
    result = _grok_responses_api(
        messages=[
            {"role": "system", "content": "You are a research assistant. Search the web and return results as a JSON array. Return ONLY the JSON array."},
            {"role": "user", "content": f"""Search the web for: "{query}"

Return top {max_results} results as a JSON array. Each item should have:
- "title": the page title
- "url": the page URL
- "body": a brief summary/snippet (2-3 sentences)

Return ONLY the JSON array, no other text."""},
        ],
        tools=[{"type": "web_search"}],
        max_tokens=2000,
        temperature=0.1,
        api_key=api_key,
    )

    if not result or not result["text"]:
        return []

    _track_cost(result["input_tokens"], result["output_tokens"])

    raw = re.sub(r'<think>.*?</think>', '', result["text"], flags=re.DOTALL).strip()
    parsed = _parse_json_array(raw)
    return parsed[:max_results] if parsed else []


# ========================================================================
# AGENTIC RESEARCH — Grok browses autonomously with x_search + web_search
# ========================================================================

def grok_agentic_research(tweet_text: str, tweet_author: str = "",
                          api_key: str = None, max_iterations: int = 5,
                          progress_callback=None) -> str:
    """
    Grok otonom araştırma — xAI Responses API ile Grok gerçekten X'te ve web'de
    arama yaparak tweet konusunu araştırır.

    Server-side tools: x_search + web_search (xAI sunucusu çalıştırır, ÜCRETSİZ).
    """
    if progress_callback:
        progress_callback("🧠 Grok X ve web'de araştırıyor...")

    system_prompt = f"""Sen bir tweet araştırma asistanısın. Sana bir tweet verilecek.
Görevin: Tweet'te bahsedilen konuları hem X'te hem web'de araştırıp kapsamlı bir özet hazırlamak.

ARAŞTIRMA STRATEJİN:
1. Tweet'i oku — hangi konular, ürünler, iddialar var?
2. X'te ara — bu konu hakkında insanlar ne diyor? Hangi tartışmalar var?
3. Web'de ara — teknik detaylar, haberler, benchmark sonuçları
4. Bilgi yeterliyse özetle

⚠️ KURALLAR:
- SADECE tweet'in konusunu araştır, konu dışına çıkma
- Arama sorgularını İngilizce yaz
- X aramalarında gerçek insanların görüşlerini bul
- Web aramalarında somut veriler ve kaynaklar bul
- SADECE gerçek arama sonuçlarına dayalı bilgi ver, BİLGİ UYDURMA
- GitHub repo ise: README içeriğini, teknik mimariyi, hangi problemi çözdüğünü, nasıl çalıştığını araştır

⛔ YÜZEYSEL METRİK YASAĞI:
- Yıldız sayısı (star count), fork sayısı, contributor sayısı gibi popülerlik metriklerini YAZMA
- "X bin yıldız almış" tarzı ifadeler YASAK — bunlar yüzeysel ve hype odaklı
- Bunun yerine: teknik detaylar, mimari kararlar, hangi problemi çözdüğü, rakiplerden farkı, pratik kullanım senaryoları
- Bir proje hakkında yazıyorsan: NE yapıyor, NASIL çalışıyor, NİÇİN önemli — rakamsal popülerlik DEĞİL

TAMAMLADIĞINDA şu formatta özetle:

## X'TEKİ TARTIŞMALAR
(Bu konu hakkında X'te ne konuşuluyor? Öne çıkan görüşler, tepkiler)

## TEMEL BULGULAR
(Web'den ve X'ten elde edilen en önemli 3-5 bilgi — teknik detaylar, mimari, kullanım)

## TEKNİK DETAYLAR
(Mimari, teknoloji stack'i, API tasarımı, performans, desteklenen özellikler)

## RAKAMLAR VE VERİLER
(Benchmark sonuçları, performans metrikleri, fiyatlandırma — kaynaklı. Yıldız/fork sayısı DEĞİL)

## KARŞIT GÖRÜŞ / ÇELİŞKİ
(Varsa farklı bakış açıları)

## BAĞLAM
(Bu olay neden önemli? Sektörel etki, strateji)"""

    result = _grok_responses_api(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""Bu tweet'i araştır:

@{tweet_author}: "{tweet_text[:1200]}"

Hem X'te hem web'de araştır. Önce X'te bu konuda ne konuşulduğunu bul, sonra web'den detayları çek."""},
        ],
        tools=[{"type": "x_search"}, {"type": "web_search"}],
        max_tokens=3000,
        temperature=0.2,
        api_key=api_key,
    )

    if not result:
        return ""

    _track_cost(result["input_tokens"], result["output_tokens"])

    if progress_callback:
        progress_callback("🧠 Grok araştırma tamamlandı")

    return result["text"]


# ========================================================================
# TOPIC DISCOVERY — Grok finds trending topics on X
# ========================================================================

def grok_discover_topics(focus_area: str = "",
                         api_key: str = None,
                         progress_callback=None) -> list[dict]:
    """
    Grok ile X ve web'de spesifik, güncel AI/teknoloji gelişmelerini keşfet.
    xAI Responses API: Grok GERÇEKTEN X'te ve web'de arama yapar (server-side tools).
    """
    if progress_callback:
        progress_callback("🧠 Grok X ve web'de güncel gelişmeleri araştırıyor...")

    current_date = datetime.datetime.now().strftime("%Y-%m-%d")

    focus_instruction = ""
    if focus_area and focus_area.strip():
        focus_instruction = f"""
ODAK ALANI: "{focus_area}"
Bu alana özel gelişmeleri bul. Ama yine de SPESİFİK gelişmeler olsun, genel kategori değil."""
    else:
        focus_instruction = """
ODAK ALANI: AI, yapay zeka, yazılım ve teknoloji (genel)
En güncel ve ilgi çekici gelişmeleri bul."""

    system_prompt = f"""Sen bir teknoloji trend analisti ve içerik keşifçisisin.
Bugünün tarihi: {current_date}
Görevin: X (Twitter) ve web'de SON 24 SAATTEKİ en önemli, spesifik gelişmeleri bulmak.

⚠️ KRİTİK: Genel kategori isimleri YASAK. Her konu SPESİFİK bir gelişme olmalı.

KÖTÜ ÖRNEK (YAPMA):
- "AI in healthcare" ← çok genel, tweet yazılamaz
- "Ethical implications of AI" ← kategori ismi
- "Debates on government AI policies" ← sıkıcı, spesifik değil

İYİ ÖRNEK (BÖYLE YAP):
- "Dvina Code launched: GUI-first agentic coding with Claude Opus 4.6 free" ← spesifik ürün + detay
- "OpenAI raised $110B at $730B valuation — biggest AI round ever" ← spesifik olay + rakam
- "Qwen 3.5 400B MoE beats GPT-4o on coding benchmarks, fully open-source" ← spesifik model + sonuç

{focus_instruction}

⚠️ SADECE İNGİLİZCE İÇERİK ARA. Türkçe hesaplar/tweet'ler ARAMA — onlar zaten
yabancı kaynaklardan çeviri yapıyor, biz doğrudan kaynağa gidelim.

X'te ve web'de arama yap. Yüksek etkileşimli tweet'leri ve son haberleri bul.

TAMAMLADIĞINDA şu JSON formatında 5-8 konu ver:
[
  {{
    "title": "Kısa, spesifik Türkçe başlık (ne oldu?)",
    "description": "2-3 cümle: ne oldu, kim yaptı, önemli detaylar/rakamlar",
    "angle": "Bu konuya hangi açıdan tweet yazılabilir (deneyim/analiz/karşılaştırma/haber)",
    "potential": "Neden bu konu iyi? Engagement potansiyeli nedir?",
    "source_tweets": "Bu konuda gördüğün en önemli 1-2 tweet'in özeti"
  }}
]

SADECE JSON döndür, başka bir şey yazma."""

    result = _grok_responses_api(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""X'te ve web'de son 24 saatteki en önemli AI/teknoloji gelişmelerini bul.

Önce X'te ara — hangi konular çok konuşuluyor, hangi ürünler/şirketler gündemde?
Sonra web'de ara — hangi yeni ürünler çıktı, hangi duyurular yapıldı?

SPESİFİK gelişmeler istiyorum: ürün lansmanları, benchmark sonuçları, büyük yatırımlar,
yeni model çıkışları, önemli güncellemeler. Genel kategori isimleri DEĞİL.

{"Özellikle şu alana odaklan: " + focus_area if focus_area else "Genel AI ve teknoloji alanı."}"""},
        ],
        tools=[{"type": "x_search"}, {"type": "web_search"}],
        max_tokens=4000,
        temperature=0.3,
        api_key=api_key,
    )

    if not result or not result["text"]:
        return []

    _track_cost(result["input_tokens"], result["output_tokens"])

    if progress_callback:
        progress_callback("🧠 Grok araştırma tamamlandı, konular derleniyor...")

    # Parse JSON response
    raw = re.sub(r'<think>.*?</think>', '', result["text"], flags=re.DOTALL).strip()
    return _parse_json_array(raw)


# ========================================================================
# FACT CHECK — Grok verifies claims using X + web data
# ========================================================================

def grok_fact_check(draft_text: str, original_tweet: str = "",
                    api_key: str = None,
                    progress_callback=None) -> str:
    """
    Grok ile tweet taslağındaki iddiaları doğrula.
    xAI Responses API ile X'te ve web'de GERÇEK arama yaparak doğrular.
    """
    if progress_callback:
        progress_callback("🧠 Grok iddiaları doğruluyor...")

    result = _grok_responses_api(
        messages=[
            {"role": "system", "content": "You are a fact-checker. Verify claims using X and web search. Only report facts you can verify from search results."},
            {"role": "user", "content": f"""Aşağıdaki tweet taslağındaki iddiaları doğrula:

TASLAK:
"{draft_text}"

{f'ORİJİNAL TWEET: "{original_tweet[:500]}"' if original_tweet else ''}

Her iddiayı X'te ve web'de araştır. Sonucu şu formatta ver:

## DOĞRULAMA SONUÇLARI
- ✅ [doğru iddia] — kaynak
- ⚠️ [kısmen doğru/güncel değil] — düzeltme + kaynak
- ❌ [yanlış iddia] — doğrusu + kaynak

## ÖNERİLEN DÜZELTMELER
(Varsa düzeltilmesi gereken kısımlar)"""},
        ],
        tools=[{"type": "x_search"}, {"type": "web_search"}],
        max_tokens=2000,
        temperature=0.1,
        api_key=api_key,
    )

    if not result:
        return ""

    _track_cost(result["input_tokens"], result["output_tokens"])

    if progress_callback:
        progress_callback("🧠 Grok doğrulama tamamlandı")

    return result["text"]


# ========================================================================
# SCAN HELPERS — for Tara page integration
# ========================================================================

def grok_scan_topics(query: str, api_key: str = None,
                     progress_callback=None) -> list[dict]:
    """
    Grok ile X'te belirli bir sorgu hakkında tweet ara.
    Tara sayfası custom query aramaları için kullanılır.

    Returns list of dicts compatible with AITopic format:
        text, author_username, like_count, retweet_count, url
    """
    results = grok_search_x(query, api_key=api_key, max_results=20)

    formatted = []
    for r in results:
        author = r.get("author", "unknown")
        formatted.append({
            "text": r.get("text", ""),
            "author_username": author,
            "author_name": author,
            "like_count": r.get("likes", 0),
            "retweet_count": r.get("retweets", 0),
            "reply_count": 0,
            "url": f"https://x.com/{author}/status/0",
            "category": "Grok Arama",
        })

    return formatted


def grok_discover_ai_trends(api_key: str = None,
                            progress_callback=None) -> list[dict]:
    """
    Grok ile X'te AI trendlerini keşfet.
    Tara sayfası Keşfet sekmesi için kullanılır.
    """
    if progress_callback:
        progress_callback("🧠 Grok AI trendlerini araştırıyor...")

    return grok_discover_topics(
        focus_area="AI, machine learning, LLM, new model releases, AI tools",
        api_key=api_key,
        progress_callback=progress_callback,
    )


# ========================================================================
# UTILITY
# ========================================================================

def test_grok_connection(api_key: str) -> dict:
    """Test Grok API connection."""
    try:
        client = OpenAI(api_key=api_key, base_url="https://api.x.ai/v1")
        response = client.chat.completions.create(
            model=GROK_MODEL,
            messages=[{"role": "user", "content": "Say 'connected' in one word."}],
            max_tokens=10,
        )
        return {"success": True, "message": response.choices[0].message.content.strip()}
    except Exception as e:
        return {"success": False, "error": str(e)}


def has_grok_key() -> bool:
    """Check if Grok API key is configured."""
    from backend.config import get_settings
    return bool(get_settings().xai_api_key)


def get_grok_cost() -> float:
    """Get current session's estimated Grok cost."""
    return _grok_state.get("grok_usage_cost", 0.0)


def get_grok_call_count() -> int:
    """Get current session's Grok API call count."""
    return _grok_state.get("grok_call_count", 0)


def reset_grok_cost():
    """Reset Grok usage cost and call count for the current session."""
    _grok_state["grok_usage_cost"] = 0.0
    _grok_state["grok_call_count"] = 0
