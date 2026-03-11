"""
Deep Research Module
Full research pipeline: Tweet URL → Fetch thread → AI-powered topic extraction
→ Multi-platform search → Fetch full article content → Compile → Generate

Key principles:
1. Use AI to UNDERSTAND the tweet first, then generate targeted search queries
2. Don't just match brand names — understand what the tweet is actually about
3. Visit and READ the top articles, not just snippets
4. Search across platforms: web, Reddit, tech blogs, news
"""
import re
import json
import time
import datetime
import requests
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
import warnings
with warnings.catch_warnings():
    warnings.simplefilter("ignore", RuntimeWarning)
    try:
        from ddgs import DDGS
    except ImportError:
        from duckduckgo_search import DDGS
from bs4 import BeautifulSoup


# --- Constants ---
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
FETCH_TIMEOUT = 10  # was 15s — reduced to prevent research hangs
MAX_ARTICLE_CHARS = 16000  # 16K: daha fazla bilgi yoğunluğu, uzun makalelerden daha az kayıp
SEARCH_DELAY = 0.3  # Delay between sequential DuckDuckGo calls to avoid IP blocking
SKIP_DOMAINS = {
    "twitter.com", "x.com", "t.co", "youtube.com", "youtu.be",
    "facebook.com", "instagram.com", "tiktok.com",
}


@dataclass
class ResearchResult:
    """Compiled research data for tweet generation"""
    original_tweet_text: str = ""
    original_tweet_author: str = ""
    original_tweet_id: str = ""
    thread_texts: list = field(default_factory=list)
    full_thread_text: str = ""
    topic: str = ""
    web_results: list = field(default_factory=list)
    deep_articles: list = field(default_factory=list)
    reddit_results: list = field(default_factory=list)
    related_tweets: list = field(default_factory=list)
    summary: str = ""
    synthesized_brief: str = ""  # AI-synthesized structured research brief
    media_urls: list = field(default_factory=list)  # Media URLs from tweets (images/videos)


def extract_tweet_id(url_or_id: str) -> str | None:
    """Extract tweet ID from a URL or raw ID string"""
    url_or_id = url_or_id.strip()
    if url_or_id.isdigit():
        return url_or_id
    match = re.search(r'(?:twitter\.com|x\.com)/\w+/status/(\d+)', url_or_id)
    return match.group(1) if match else None


# ========================================================================
# SEARCH FUNCTIONS
# ========================================================================

def web_search(query: str, max_results: int = 8, timelimit: str = "w") -> list[dict]:
    """Search the web using DuckDuckGo with time filter and automatic fallback.

    Args:
        query: Search query
        max_results: Maximum results to return
        timelimit: Time filter - "d" (day), "w" (week), "m" (month), None (all time)
    """
    if not query or not query.strip():
        return []
    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results, timelimit=timelimit):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "body": r.get("body", ""),
                })
    except Exception as e:
        print(f"[DDG] Web search error for '{query[:40]}': {e}")
    # Fallback chain: if time-limited search returned nothing, broaden the time range
    if not results and timelimit:
        fallback_chain = {"d": "w", "w": "m", "m": None}
        next_limit = fallback_chain.get(timelimit)
        time.sleep(SEARCH_DELAY)
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=max_results, timelimit=next_limit):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("href", ""),
                        "body": r.get("body", ""),
                    })
        except Exception as e:
            print(f"[DDG] Web search fallback error for '{query[:40]}': {e}")
    return results


def web_search_news(query: str, max_results: int = 6, timelimit: str = "w") -> list[dict]:
    """Search recent news with time filter and automatic fallback chain.

    Args:
        query: Search query
        max_results: Maximum results to return
        timelimit: Time filter - "d" (day), "w" (week), "m" (month), None (all time)
    """
    if not query or not query.strip():
        return []
    results = []
    # Fallback chain: day → week → month
    time_chain = [timelimit] if timelimit else [None]
    if timelimit == "d":
        time_chain = ["d", "w", "m"]
    elif timelimit == "w":
        time_chain = ["w", "m"]

    for tl in time_chain:
        try:
            with DDGS() as ddgs:
                for r in ddgs.news(query, max_results=max_results, timelimit=tl):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "body": r.get("body", ""),
                        "source": r.get("source", ""),
                    })
        except Exception as e:
            print(f"[DDG] News search error for '{query[:40]}' (timelimit={tl}): {e}")
        if results:
            break
        time.sleep(SEARCH_DELAY)
    return results


def _parallel_web_search(queries: list[tuple[str, int, str]]) -> list[list[dict]]:
    """Run multiple web searches in parallel using ThreadPoolExecutor.

    Args:
        queries: List of (query, max_results, timelimit) tuples

    Returns:
        List of result lists, in the same order as input queries.
    """
    results = [[] for _ in range(len(queries))]

    def _do_search(idx_query_args):
        idx, (query, max_results, timelimit) = idx_query_args
        # Small stagger to avoid burst requests
        time.sleep(idx * 0.15)
        return idx, web_search(query, max_results=max_results, timelimit=timelimit)

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(_do_search, (i, q)) for i, q in enumerate(queries)]
        for future in as_completed(futures):
            try:
                idx, res = future.result()
                results[idx] = res
            except Exception as e:
                print(f"[DDG] Parallel search error: {e}")
    return results


def _parallel_news_search(queries: list[tuple[str, int, str]]) -> list[list[dict]]:
    """Run multiple news searches in parallel using ThreadPoolExecutor.

    Args:
        queries: List of (query, max_results, timelimit) tuples

    Returns:
        List of result lists, in the same order as input queries.
    """
    results = [[] for _ in range(len(queries))]

    def _do_search(idx_query_args):
        idx, (query, max_results, timelimit) = idx_query_args
        time.sleep(idx * 0.15)
        return idx, web_search_news(query, max_results=max_results, timelimit=timelimit)

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(_do_search, (i, q)) for i, q in enumerate(queries)]
        for future in as_completed(futures):
            try:
                idx, res = future.result()
                results[idx] = res
            except Exception as e:
                print(f"[DDG] Parallel news search error: {e}")
    return results


def _parallel_fetch_articles(urls: list[str], max_articles: int = 5,
                              progress_callback=None) -> list[dict]:
    """Fetch multiple articles in parallel.

    Returns list of successfully fetched article dicts.
    """
    articles = []

    def _do_fetch(idx_url):
        idx, url = idx_url
        time.sleep(idx * 0.1)
        return fetch_article_content(url)

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(_do_fetch, (i, url)): url
                   for i, url in enumerate(urls[:max_articles + 3])}  # fetch a few extra in case some fail
        for future in as_completed(futures):
            if len(articles) >= max_articles:
                break
            try:
                article = future.result()
                if article and article.get("content") and len(article["content"]) > 200:
                    articles.append(article)
            except Exception as e:
                print(f"[DDG] Parallel article fetch error: {e}")
    return articles[:max_articles]


# ========================================================================
# AI-POWERED TOPIC EXTRACTION — understands what the tweet is ACTUALLY about
# ========================================================================

def _call_ai(ai_client, provider: str, ai_model: str | None, prompt: str,
             max_tokens: int = 1000, temperature: float = 0.3, system: str = "") -> str | None:
    """Unified AI call helper — supports anthropic, gemini, openai/minimax/groq."""
    if not ai_client:
        return None
    try:
        if provider == "anthropic":
            kwargs = dict(
                model=ai_model or "claude-haiku-4-5-20251001",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
            )
            if system:
                kwargs["system"] = system
            response = ai_client.messages.create(**kwargs)
            return response.content[0].text.strip()
        elif provider == "gemini":
            from google.genai import types
            response = ai_client.models.generate_content(
                model=ai_model or "gemini-3.1-flash-lite",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system or None,
                    max_output_tokens=max_tokens,
                    temperature=temperature,
                ),
            )
            return response.text.strip() if response and response.text else None
        else:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            response = ai_client.chat.completions.create(
                model=ai_model or "MiniMax-M2.5",
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"AI call error ({provider}): {e}")
        return None


def ai_extract_topic(tweet_text: str, ai_client=None, ai_model: str = None,
                     provider: str = "minimax") -> dict | None:
    """
    Use AI to understand the tweet and generate targeted search queries.
    This is the KEY fix: instead of regex matching brand names,
    AI actually reads the tweet and understands the topic.

    Returns:
        {
            "topic": "Blackbox CLI AI terminal tool major update",
            "search_queries": {
                "general": [...],
                "technical": [...],
                "reddit": [...],
                "news": [...]
            }
        }
    """
    if not ai_client:
        return None

    current_year = str(datetime.datetime.now().year)

    # Detect if tweet is short (needs deeper query expansion)
    is_short_tweet = len(tweet_text.strip()) < 300

    short_tweet_extra = """
ÖNEMLİ: Bu tweet KISA. Konu hakkında derinlemesine araştırma yapabilmek için
sorguları çeşitlendir. Sadece "X nedir" değil, şu açılardan da sorgula:
- Bu konuda son gelişmeler neler?
- Rakamlar/istatistikler neler?
- Uzman görüşleri ve karşıt fikirler neler?
- Bu konunun piyasa/sektör etkisi nedir?
""" if is_short_tweet else ""

    prompt = f"""Aşağıdaki tweet'i oku ve konusunu analiz et. Tweet'in ASIL konusu nedir?

TWEET:
{tweet_text[:1500]}

Görevin: Bu tweet'in gerçek konusunu anla ve HABER ANALİZİ yazmaya yetecek derinlikte araştırma sorguları üret.

DİKKAT: Tweet'te birçok marka/ürün adı geçebilir ama asıl konu farklı olabilir.
Örnek: "Claude ve Codex built-in" diyen bir tweet Claude hakkında değil, o ürünleri entegre eden ARAÇ hakkındadır.
{short_tweet_extra}
Yanıtını SADECE şu JSON formatında ver, başka hiçbir şey yazma:
{{
    "topic": "tweet'in asıl konusunun 5-10 kelimelik özeti (İngilizce)",
    "main_subject": "tweet'in ana konusu olan ürün/şirket/olay (tek isim)",
    "general_queries": ["ne oldu/ne çıktı araması", "detay/özellik araması", "etki/analiz araması"],
    "technical_queries": ["teknik detay/benchmark araması", "karşılaştırma/rakip araması"],
    "impact_queries": ["pratik etki/kullanıcıya faydası araması", "sektör etkisi/büyük resim araması"],
    "reddit_queries": ["site:reddit.com spesifik tartışma 1", "site:reddit.com spesifik tartışma 2"],
    "news_queries": ["haber araması 1", "haber araması 2"]
}}

KURALLAR:
- Arama sorgularını İngilizce yaz
- Her sorguya "{current_year}" ekle
- general_queries: 3 farklı AÇI ile ara (ne oldu + detaylar + etki/analiz)
- technical_queries: teknik detay + benchmark/karşılaştırma + önceki sürümle fark
- impact_queries: 2 sorgu — pratik kullanıcı etkisi + sektörel/stratejik etki (ÖNEMLİ: "why it matters", "implications", "impact on" gibi sorgular)
- reddit_queries: Reddit'te kullanıcı deneyimleri ve tartışmaları bul
- news_queries: son haberler ve duyurular
- Sorgular KISA olsun (3-7 kelime ideal), spesifik olsun
- "AI news" gibi genel sorgular YASAK, her sorgu konuya özel olmalı
- impact_queries ÇOK ÖNEMLİ — haber analizi yazmak için "neden önemli" ve "kime etkisi var" bilgisi şart"""

    try:
        raw = _call_ai(ai_client, provider, ai_model, prompt, max_tokens=500, temperature=0.1)
        if not raw:
            return None

        # Strip <think> tags from reasoning models
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()

        # Extract JSON from response
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not json_match:
            return None

        data = json.loads(json_match.group())

        # Use AI-generated news queries if available, fallback to auto-generated
        news_queries = data.get("news_queries", [])[:2]
        if not news_queries:
            news_queries = [
                f"{data.get('main_subject', '')} news {current_year}",
                f"{data.get('topic', '')[:40]} {current_year}",
            ]

        return {
            "topic": data.get("topic", ""),
            "main_subject": data.get("main_subject", ""),
            "search_queries": {
                "general": data.get("general_queries", [])[:3],
                "technical": data.get("technical_queries", [])[:2],
                "impact": data.get("impact_queries", [])[:2],
                "reddit": data.get("reddit_queries", [])[:2],
                "news": news_queries,
            }
        }

    except Exception as e:
        print(f"AI topic extraction error: {e}")
        return None


# ========================================================================
# ARTICLE CONTENT FETCHER — the key missing piece
# ========================================================================

def fetch_article_content(url: str) -> dict | None:
    """
    Fetch and extract the main text content from a web page.
    Returns clean article text that the AI can use for analysis.
    """
    # Skip social media / video sites
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.replace("www.", "")
        if domain in SKIP_DOMAINS:
            return None
    except Exception:
        return None

    # GitHub repos: use API for much richer data
    gh_match = _is_github_repo_url(url)
    if gh_match:
        return _fetch_github_repo(gh_match[0], gh_match[1])

    try:
        # Fetch with retry on timeout only (fast-fail on HTTP errors)
        resp = None
        for attempt in range(2):
            try:
                resp = requests.get(
                    url,
                    headers={"User-Agent": USER_AGENT},
                    timeout=FETCH_TIMEOUT,
                    allow_redirects=True,
                )
                resp.raise_for_status()
                break
            except requests.exceptions.Timeout:
                if attempt == 0:
                    time.sleep(1)
                    continue
                raise
            except requests.exceptions.HTTPError as he:
                # Fast-fail on 403/404/429 — don't retry, don't wait
                status = he.response.status_code if he.response is not None else 0
                print(f"Article fetch error ({url[:60]}): {status}")
                return None
        if resp is None:
            return None

        # Only parse HTML
        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove noise elements
        for tag in soup.find_all(["script", "style", "nav", "header", "footer",
                                   "aside", "iframe", "form", "noscript",
                                   "button", "svg", "img"]):
            tag.decompose()

        # Try to find the main article content
        article_text = ""

        # Strategy 1: Look for <article> tag
        article_tag = soup.find("article")
        if article_tag:
            article_text = article_tag.get_text(separator="\n", strip=True)

        # Strategy 2: Look for main content div
        if not article_text or len(article_text) < 200:
            for selector in ["main", "[role='main']", ".post-content",
                             ".article-content", ".entry-content",
                             ".post-body", "#content", ".content"]:
                main = soup.select_one(selector)
                if main:
                    candidate = main.get_text(separator="\n", strip=True)
                    if len(candidate) > len(article_text):
                        article_text = candidate

        # Strategy 3: Reddit-specific
        if "reddit.com" in url:
            comments = []
            # Post body
            post_body = soup.select_one("[data-test-id='post-content']")
            if post_body:
                comments.append(post_body.get_text(separator="\n", strip=True))
            # Also get top comments
            for comment_div in soup.select(".comment, [data-testid='comment']")[:10]:
                text = comment_div.get_text(separator=" ", strip=True)
                if len(text) > 30:
                    comments.append(text[:500])
            if comments:
                article_text = "\n\n".join(comments)

        # Strategy 4: Fallback to all paragraphs
        if not article_text or len(article_text) < 200:
            paragraphs = []
            for p in soup.find_all("p"):
                text = p.get_text(strip=True)
                if len(text) > 40:
                    paragraphs.append(text)
            article_text = "\n\n".join(paragraphs)

        if not article_text or len(article_text) < 100:
            return None

        # Clean up
        article_text = re.sub(r'\n{3,}', '\n\n', article_text)
        article_text = re.sub(r' {2,}', ' ', article_text)
        article_text = article_text[:MAX_ARTICLE_CHARS]

        # Extract title
        title = ""
        title_tag = soup.find("title")
        if title_tag:
            title = title_tag.get_text(strip=True)[:150]

        return {
            "url": url,
            "title": title,
            "content": article_text,
            "length": len(article_text),
        }

    except Exception as e:
        print(f"Article fetch error ({url[:60]}): {e}")
        return None


def _fetch_github_repo(owner: str, repo: str) -> dict | None:
    """
    Fetch detailed GitHub repo info via API: description, README, topics, stats.
    Returns a rich content dict with all the info an AI needs to write about it.
    """
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": USER_AGENT,
    }

    result_parts = []

    # 1. Repo metadata
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers, timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            meta_lines = [
                f"# {data.get('full_name', f'{owner}/{repo}')}",
                f"**Açıklama:** {data.get('description', 'N/A')}",
                f"**Dil:** {data.get('language', 'N/A')}",
                f"**Lisans:** {data.get('license', {}).get('name', 'N/A') if data.get('license') else 'N/A'}",
                f"**Son güncelleme:** {data.get('pushed_at', 'N/A')[:10]}",
                f"**Oluşturulma:** {data.get('created_at', 'N/A')[:10]}",
            ]
            topics = data.get("topics", [])
            if topics:
                meta_lines.append(f"**Konular:** {', '.join(topics)}")
            homepage = data.get("homepage")
            if homepage:
                meta_lines.append(f"**Website:** {homepage}")
            result_parts.append("\n".join(meta_lines))
    except Exception as e:
        print(f"GitHub API repo fetch error: {e}")

    # 2. README content
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{owner}/{repo}/readme",
            headers={**headers, "Accept": "application/vnd.github.v3.raw"},
            timeout=10
        )
        if resp.status_code == 200:
            readme_text = resp.text
            # Truncate very long READMEs but keep more than regular articles
            if len(readme_text) > 8000:
                readme_text = readme_text[:8000] + "\n\n[README devamı kısaltıldı...]"
            result_parts.append(f"\n## README İÇERİĞİ:\n{readme_text}")
    except Exception as e:
        print(f"GitHub API readme fetch error: {e}")

    # 3. Recent releases (top 3)
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{owner}/{repo}/releases",
            headers=headers, timeout=10, params={"per_page": 3}
        )
        if resp.status_code == 200:
            releases = resp.json()
            if releases:
                release_lines = ["\n## SON SÜRÜMLER:"]
                for rel in releases[:3]:
                    tag = rel.get("tag_name", "?")
                    name = rel.get("name", "")
                    date = rel.get("published_at", "")[:10]
                    body = rel.get("body", "")[:500]
                    release_lines.append(f"**{tag}** ({name}) - {date}")
                    if body:
                        release_lines.append(body)
                result_parts.append("\n".join(release_lines))
    except Exception as e:
        print(f"GitHub API releases fetch error: {e}")

    if not result_parts:
        return None

    full_content = "\n\n".join(result_parts)
    return {
        "url": f"https://github.com/{owner}/{repo}",
        "title": f"GitHub: {owner}/{repo}",
        "content": full_content,
        "length": len(full_content),
        "source": "github_api",
    }


def _is_github_repo_url(url: str) -> tuple[str, str] | None:
    """Check if URL is a GitHub repo and return (owner, repo) or None."""
    match = re.match(r'https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$', url)
    if match:
        owner, repo = match.group(1), match.group(2)
        # Skip GitHub pages that aren't repos
        if owner in ("features", "explore", "topics", "trending", "settings",
                      "notifications", "marketplace", "sponsors"):
            return None
        return owner, repo
    return None


def _resolve_url(url: str, timeout: int = 5) -> str:
    """Resolve shortened URLs (t.co etc.) to their final destination."""
    try:
        resp = requests.head(
            url, allow_redirects=True, timeout=timeout,
            headers={"User-Agent": USER_AGENT},
        )
        return resp.url
    except Exception:
        return url


def _extract_urls_from_tweets(tweets: list[dict]) -> list[str]:
    """Extract unique, non-social-media URLs from a list of tweet dicts."""
    from urllib.parse import urlparse
    urls = []
    seen = set()
    for tw in tweets:
        text = tw.get("text", "")
        found = re.findall(r'https?://\S+', text)
        for raw_url in found:
            # Clean trailing punctuation
            raw_url = raw_url.rstrip('.,;:!?)]\'"')
            if raw_url in seen:
                continue
            seen.add(raw_url)
            # Resolve shortened URLs
            resolved = _resolve_url(raw_url) if "t.co/" in raw_url else raw_url
            try:
                domain = urlparse(resolved).netloc.replace("www.", "")
            except Exception:
                continue
            if domain in SKIP_DOMAINS or not domain:
                continue
            urls.append(resolved)
    return urls


def _follow_tweet_links(
    tweets: list[dict],
    max_articles: int = 5,
    progress_callback=None,
) -> list[dict]:
    """
    Extract URLs from tweet texts, fetch article content in parallel, return articles.
    This enables the system to 'follow links' shared in tweets.
    """
    urls = _extract_urls_from_tweets(tweets)
    if not urls:
        return []

    if progress_callback:
        progress_callback(f"Tweet'teki {min(len(urls), max_articles)} link paralel okunuyor...")

    # Use parallel fetch instead of sequential loop
    articles = _parallel_fetch_articles(urls, max_articles=max_articles,
                                         progress_callback=None)
    for article in articles:
        article["source"] = "tweet_link"
    return articles


def _follow_threads_from_search(
    tweets: list[dict],
    scanner,
    max_threads: int = 5,
    progress_callback=None,
) -> list[dict]:
    """
    For high-engagement tweets from search results, fetch their full threads.
    Returns list of dicts with thread_tweets (list of texts) and links found in threads.
    """
    if not scanner or not hasattr(scanner, 'get_thread'):
        return []

    # Pick top tweets by engagement that might be thread starters
    sorted_tweets = sorted(
        tweets,
        key=lambda x: x.get("likes", 0) + x.get("retweets", 0) * 3,
        reverse=True,
    )

    threads_data = []
    fetched_count = 0
    for tw in sorted_tweets:
        if fetched_count >= max_threads:
            break
        # Only follow threads for tweets with decent engagement
        engagement = tw.get("likes", 0) + tw.get("retweets", 0) * 2
        if engagement < 10:
            continue
        # Extract tweet ID from URL or text
        tw_url = tw.get("url", "")
        tw_id = None
        if tw_url:
            match = re.search(r'/status/(\d+)', tw_url)
            if match:
                tw_id = match.group(1)
        if not tw_id:
            continue

        if progress_callback:
            progress_callback(f"Thread takip ediliyor ({fetched_count + 1}/{max_threads})...")
        try:
            thread_texts = scanner.get_thread(tw_id)
            if thread_texts and len(thread_texts) > 1:
                threads_data.append({
                    "author": tw.get("author", ""),
                    "thread_texts": thread_texts,
                    "likes": tw.get("likes", 0),
                })
                fetched_count += 1
        except Exception as e:
            print(f"Thread fetch error ({tw_id}): {e}")

    return threads_data


# ========================================================================
# TOPIC EXTRACTION
# ========================================================================

def extract_topic_from_text(full_text: str) -> dict:
    """
    Smart topic extraction from tweet/thread text.
    Finds actual product names, companies, and what happened.
    Returns targeted search queries for multiple platforms.
    """
    current_year = str(datetime.datetime.now().year)
    text = re.sub(r'https?://\S+', '', full_text).strip()
    text_clean = re.sub(r'@\w+', '', text)
    text_clean = re.sub(r'#(\w+)', r'\1', text_clean)

    # --- Product/model detection ---
    product_patterns = {
        r'\bGPT[-\s]?4[o.]?\w*\b': 'GPT-4o',
        r'\bGPT[-\s]?5\b': 'GPT-5',
        r'\bGPT[-\s]?4\.?1\b': 'GPT-4.1',
        r'\bo[13][-\s]?(pro|mini|preview)?\b': 'o1',
        r'\bClaude\s*[\d.]*\s*(Opus|Sonnet|Haiku)?\b': 'Claude',
        r'\bGemini\s*[\d.]*\s*(Pro|Ultra|Flash|Nano)?\b': 'Gemini',
        r'\bLlama\s*[\d.]*\b': 'Llama',
        r'\bQwen\s*[\d.]*\b': 'Qwen',
        r'\bMistral\s*\w*\b': 'Mistral',
        r'\bDeepSeek[-\s]?\w*\b': 'DeepSeek',
        r'\bGrok\s*[\d.]*\b': 'Grok',
        r'\bPhi[-\s]?[\d.]+\b': 'Phi',
        r'\bCopilot\b': 'Copilot',
        r'\bCursor\b': 'Cursor',
        r'\bSora\b': 'Sora',
        r'\bDALL[-\s]?E\s*[\d]*\b': 'DALL-E',
        r'\bMidjourney\b': 'Midjourney',
        r'\bStable\s*Diffusion\b': 'Stable Diffusion',
        r'\bChatGPT\b': 'ChatGPT',
        r'\bPerplexity\b': 'Perplexity',
        r'\bNotebookLM\b': 'NotebookLM',
        r'\bWindsurf\b': 'Windsurf',
        r'\bDevin\b': 'Devin',
        r'\bNIM\b': 'NIM',
        r'\bNeMo\b': 'NeMo',
    }

    company_patterns = {
        r'\bOpenAI\b': 'OpenAI', r'\bAnthropic\b': 'Anthropic',
        r'\bGoogle\b': 'Google', r'\bMeta\b': 'Meta',
        r'\bMicrosoft\b': 'Microsoft', r'\bApple\b': 'Apple',
        r'\bNVIDIA\b': 'NVIDIA', r'\bAmazon\b': 'Amazon',
        r'\bxAI\b': 'xAI', r'\bCohere\b': 'Cohere',
        r'\bStability\s*AI\b': 'Stability AI',
        r'\bRunway\b': 'Runway', r'\bMistral\s*AI\b': 'Mistral AI',
        r'\bMiniMax\b': 'MiniMax', r'\bSamsung\b': 'Samsung',
        r'\bSoftBank\b': 'SoftBank', r'\bAlibaba\b': 'Alibaba',
        r'\bBaidu\b': 'Baidu', r'\bHuawei\b': 'Huawei',
    }

    found_products = list({name for pat, name in product_patterns.items()
                          if re.search(pat, text, re.IGNORECASE)})
    found_companies = list({name for pat, name in company_patterns.items()
                           if re.search(pat, text, re.IGNORECASE)})

    # --- Action detection ---
    action_map = {
        r'(?i)(releas|launch|announc|introduc|unveil|drop)': 'release',
        r'(?i)(updat|upgrad|improv|new version)': 'update',
        r'(?i)(benchmark|outperform|beats?|surpass|SOTA)': 'benchmark',
        r'(?i)(open.?sourc|weights?|github)': 'open-source',
        r'(?i)(pric|cost|\$\d|free tier|API.?pric)': 'pricing',
        r'(?i)(acqui|fund|rais|\$\d+[BMb]|valuation|invest)': 'investment',
        r'(?i)(paper|research|arxiv|study)': 'research',
        r'(?i)(agent|autono|tool.?use)': 'agents',
        r'(?i)(ban|regulat|safety|alignment)': 'regulation',
        r'(?i)(partner|deal|collaborat|agreement)': 'partnership',
        r'(?i)(deploy|production|inference|endpoint|API)': 'deployment',
    }

    action = None
    for pat, act in action_map.items():
        if re.search(pat, text):
            action = act
            break

    # --- Dollar amounts, percentages, big numbers ---
    amounts = re.findall(r'\$[\d,.]+\s*[BMKbmk](?:illion)?', text)
    percentages = re.findall(r'\d+(?:\.\d+)?%', text)
    big_numbers = re.findall(r'\b\d+[BMK]\b|\b\d{3,}B\b', text)

    # --- Build DIVERSE search queries ---
    queries = {
        "general": [],
        "technical": [],
        "reddit": [],
        "news": [],
    }

    entities = found_products + found_companies

    if entities and action:
        main = entities[0]
        # General search
        if action == 'investment' and amounts:
            queries["general"].append(f"{main} {amounts[0]} investment funding {current_year}")
        elif action == 'release':
            queries["general"].append(f"{main} release announcement features {current_year}")
        elif action == 'benchmark' and percentages:
            queries["general"].append(f"{main} benchmark results {percentages[0]} {current_year}")
        elif action == 'deployment':
            queries["general"].append(f"{main} deployment API production {current_year}")
        else:
            queries["general"].append(f"{main} {action} {current_year}")

        if len(entities) > 1:
            queries["general"].append(f"{entities[0]} {entities[1]} {action or 'AI'} {current_year}")

        # Technical deep search
        queries["technical"].append(f"{main} technical details specs parameters architecture {current_year}")
        if found_products:
            queries["technical"].append(f"{found_products[0]} benchmark comparison performance {current_year}")

        # Reddit search
        queries["reddit"].append(f"site:reddit.com {' '.join(entities[:2])} {action or 'AI'} {current_year}")
        queries["reddit"].append(f"site:reddit.com {main} {current_year}")

        # News search
        queries["news"].append(f"{main} {action or ''} {current_year}")
        if len(entities) > 1:
            queries["news"].append(f"{' '.join(entities[:3])} news")

    elif entities:
        queries["general"].append(f"{entities[0]} AI news {current_year}")
        queries["technical"].append(f"{entities[0]} technical details {current_year}")
        queries["reddit"].append(f"site:reddit.com {entities[0]} {current_year}")
        queries["news"].append(f"{entities[0]} latest {current_year}")
    else:
        proper = re.findall(r'\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\b', text_clean)
        if proper:
            base = " ".join(proper[:3])
            queries["general"].append(f"{base} AI {current_year}")
            queries["reddit"].append(f"site:reddit.com {base} AI")
            queries["news"].append(f"{base} news {current_year}")
        else:
            queries["general"].append(text_clean[:60])

    # Always add a latest-news query
    if entities:
        queries["general"].append(f"{' '.join(entities[:2])} latest news {current_year}")

    topic_str = " ".join(filter(None, [
        " ".join(found_companies[:2]),
        " ".join(found_products[:2]),
        action or "",
        amounts[0] if amounts else "",
    ])).strip() or text_clean[:80]

    return {
        "topic": topic_str,
        "products": found_products,
        "companies": found_companies,
        "action": action,
        "amounts": amounts,
        "percentages": percentages,
        "big_numbers": big_numbers,
        "search_queries": queries,
    }


# ========================================================================
# AGENTIC RESEARCH — Model browses the internet autonomously via tool use
# ========================================================================

# Tool definitions for function calling (OpenAI-compatible format)
_RESEARCH_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information. Use this to find facts, news, benchmarks, comparisons, prices, dates. Returns search result titles and snippets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query in English. Keep it short (3-7 words). Be specific."
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_article",
            "description": "Read the full content of a web page/article. Use this when a search result looks promising and you need the full details, data, or analysis from it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to read"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_news",
            "description": "Search for recent news articles. Use this for breaking news, announcements, launches.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "News search query in English"
                    }
                },
                "required": ["query"]
            }
        }
    },
]

# Anthropic tool format
_RESEARCH_TOOLS_ANTHROPIC = [
    {
        "name": "web_search",
        "description": "Search the web for current information. Use this to find facts, news, benchmarks, comparisons, prices, dates. Returns search result titles and snippets.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query in English. Keep it short (3-7 words). Be specific."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "read_article",
        "description": "Read the full content of a web page/article. Use this when a search result looks promising and you need the full details.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to read"
                }
            },
            "required": ["url"]
        }
    },
    {
        "name": "search_news",
        "description": "Search for recent news articles. Use this for breaking news, announcements, launches.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "News search query in English"
                }
            },
            "required": ["query"]
        }
    },
]


def _execute_tool(tool_name: str, args: dict) -> str:
    """Execute a research tool and return results as text."""
    try:
        if tool_name == "web_search":
            query = args.get("query", "")
            results = web_search(query, max_results=6, timelimit="m")
            if not results:
                return "No results found for this query."
            output = []
            for i, r in enumerate(results, 1):
                output.append(f"{i}. {r['title']}")
                output.append(f"   URL: {r['url']}")
                output.append(f"   {r['body'][:500]}")
            return "\n".join(output)

        elif tool_name == "read_article":
            url = args.get("url", "")
            article = fetch_article_content(url)
            if not article or not article.get("content"):
                return "Could not read article content from this URL."
            return f"Title: {article['title']}\n\n{article['content'][:4000]}"

        elif tool_name == "search_news":
            query = args.get("query", "")
            # News search with built-in fallback chain (day → week → month)
            results = web_search_news(query, max_results=5, timelimit="d")
            if not results:
                return "No recent news found for this query."
            output = []
            for i, r in enumerate(results, 1):
                src = f" ({r.get('source', '')})" if r.get('source') else ""
                output.append(f"{i}. {r['title']}{src}")
                output.append(f"   URL: {r['url']}")
                output.append(f"   {r['body'][:400]}")
            return "\n".join(output)

        else:
            return f"Unknown tool: {tool_name}"

    except Exception as e:
        return f"Tool error: {e}"


def agentic_research(tweet_text: str, tweet_author: str = "",
                     ai_client=None, ai_model: str = None,
                     provider: str = "minimax",
                     max_iterations: int = 5,
                     progress_callback=None) -> str:
    """
    Let the AI model browse the internet AUTONOMOUSLY using tool calling.

    Instead of us deciding what to search, the MODEL decides:
    1. What to search for
    2. Which articles to read in full
    3. When it has enough information
    4. How to compile the findings

    This is the key difference from the old pipeline:
    - Old: Our code searches → feeds results to model → model writes
    - New: Model searches itself → reads articles → searches more → writes

    Returns: Structured research summary compiled by the AI after browsing.
    """
    if not ai_client:
        return ""

    current_year = str(datetime.datetime.now().year)

    system_prompt = f"""Sen bir tweet araştırma asistanısın. Sana bir tweet verilecek.
Görevin: Tweet'te bahsedilen SPESİFİK iddiaları, ürünleri, rakamları internette araştırıp doğrulamak.

⚠️ KRİTİK KURALLAR:
1. SADECE tweet'te bahsedilen konuları araştır. Konu dışına ÇIKMA.
2. Tweet'te "X benchmark'ta Y skoru aldı" diyorsa → tam olarak o benchmark'ı ara
3. Tweet'te bir ürün geçiyorsa → o ürünün güncel ({current_year}) bilgilerini bul
4. Tweet'te bir karşılaştırma yapılıyorsa → o spesifik karşılaştırmayı doğrula
5. Tweet'te geçmeyen konuları araştırma, genel sektör analizi yapma
6. Amacın tweet'i ANLAMAK ve İÇİNDEKİ bilgileri DOĞRULAMAK — başka bir şey DEĞİL

ARAÇLARIN:
- web_search: Web'de ara (İngilizce sorgular, kısa ve spesifik)
- read_article: Bir makalenin tam içeriğini oku
- search_news: Son haberleri ara

ARAŞTIRMA STRATEJİN:
1. Tweet'i dikkatlice oku — hangi ürünler, hangi iddialar, hangi rakamlar var?
2. Her bir iddia/ürün/rakam için SPESİFİK arama yap
   Örn: Tweet "Qwen 3.5 9B" diyorsa → "Qwen 3.5 9B benchmark results {current_year}" ara
   Örn: Tweet "$0.4/M tokens" diyorsa → "Qwen 3.5 pricing per million tokens" ara
3. Arama sonuçlarında en güvenilir 1-2 makaleyi tam oku (read_article)
4. Tweet'teki bilgilerin DOĞRU olup olmadığını belirle
5. Tweet'te EKSIK olan ama ilgili güncel veri varsa ekle (aynı konu dahilinde)

YAPMA:
- Tweet'le ilgisiz genel konularda arama yapma
- "AI sektörü nereye gidiyor" tarzı geniş araştırmalar yapma
- Tweet'te olmayan rakip ürünleri araştırma (tweet'te karşılaştırma yoksa)
- 3-4 aramadan fazla yapma (odaklan, dağılma)

⛔ YÜZEYSEL METRİK YASAĞI:
- Yıldız sayısı (star count), fork sayısı, contributor sayısı gibi popülerlik metriklerini RAPORLAMA
- Bunlar yüzeysel vanity metrikler — tweet yazarken işe yaramaz
- Bunun yerine şunları bul: teknik mimari, hangi dili/framework'ü kullanıyor, nasıl çalışıyor, benchmark sonuçları, pratik kullanım, rakiplerden farkı

📦 GitHub REPO İSE:
- Tweet bir GitHub reposu/açık kaynak projesi hakkındaysa → o projenin GitHub sayfasını ve README'sini oku
- Teknik detaylara odaklan: mimari, desteklenen özellikler, API tasarımı, kurulum, entegrasyon
- "Şu kadar star almış" DEĞİL → "şu teknolojiyi kullanıyor, şu problemi çözüyor" yaz

TAMAMLADIĞINDA şu formatta özetle:

## TWEET'TEKİ İDDIALAR VE DOĞRULAMA
(Tweet ne diyor → gerçekte durum ne)

## TEKNİK DETAYLAR
(Mimari, teknoloji, API, desteklenen özellikler, nasıl çalıştığı)

## GÜNCEL VERİLER
(Benchmark sonuçları, performans metrikleri, fiyatlandırma — kaynaklı. Yıldız/fork sayısı DEĞİL)

## EKSİK BAĞLAM
(Tweet'te söylenmeyen ama aynı konuyla ilgili önemli 1-2 bilgi)"""

    user_message = f"""Bu tweet'i araştır:

@{tweet_author}: "{tweet_text[:1200]}"

ADIM 1: Tweet'te tam olarak nelerden bahsediliyor? Hangi ürünler, iddialar, rakamlar var?
ADIM 2: Bu spesifik iddiaları/rakamları internette ara ve doğrula.
ADIM 3: Yalnızca tweet'in konusuna ait güncel verileri bul.

⚠️ Tweet'in konusu dışında araştırma YAPMA. Sadece tweet'teki bilgileri doğrula ve zenginleştir."""

    if provider == "anthropic":
        return _agentic_research_anthropic(
            ai_client, ai_model, system_prompt, user_message,
            max_iterations, progress_callback
        )
    else:
        return _agentic_research_openai(
            ai_client, ai_model, system_prompt, user_message,
            max_iterations, progress_callback
        )


def _agentic_research_openai(ai_client, ai_model: str, system_prompt: str,
                              user_message: str, max_iterations: int,
                              progress_callback=None) -> str:
    """Agentic research loop using OpenAI-compatible API (MiniMax, OpenAI, etc.)"""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    search_count = 0
    article_count = 0

    for iteration in range(max_iterations):
        if progress_callback:
            progress_callback(f"AI araştırıyor... (adım {iteration + 1}, {search_count} arama, {article_count} makale)")

        try:
            response = ai_client.chat.completions.create(
                model=ai_model or "MiniMax-M2.5",
                messages=messages,
                tools=_RESEARCH_TOOLS,
                tool_choice="auto",
                max_tokens=2000,
                temperature=0.2,
            )
        except Exception as e:
            print(f"Agentic research API error: {e}")
            break

        choice = response.choices[0]
        assistant_msg = choice.message

        # Add assistant message to history
        messages.append(assistant_msg)

        # Check if model is done (no more tool calls)
        if choice.finish_reason == "stop" or not assistant_msg.tool_calls:
            # Model finished researching, return its summary
            return assistant_msg.content or ""

        # Execute tool calls
        for tool_call in assistant_msg.tool_calls:
            fn_name = tool_call.function.name
            try:
                fn_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            if fn_name == "web_search" or fn_name == "search_news":
                search_count += 1
            elif fn_name == "read_article":
                article_count += 1

            if progress_callback:
                if fn_name == "web_search":
                    progress_callback(f"🔍 Arıyor: {fn_args.get('query', '')[:50]}...")
                elif fn_name == "read_article":
                    progress_callback(f"📖 Makale okuyor: {fn_args.get('url', '')[:50]}...")
                elif fn_name == "search_news":
                    progress_callback(f"📰 Haber arıyor: {fn_args.get('query', '')[:50]}...")

            result = _execute_tool(fn_name, fn_args)

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result[:4000],  # Cap tool output to prevent token overflow
            })

    # If we hit max iterations, ask model to summarize what it has
    messages.append({
        "role": "user",
        "content": "Araştırmayı bitir ve topladığın bilgileri yapılandırılmış formatta özetle."
    })

    try:
        final = ai_client.chat.completions.create(
            model=ai_model or "MiniMax-M2.5",
            messages=messages,
            max_tokens=2000,
            temperature=0.1,
        )
        return final.choices[0].message.content or ""
    except Exception as e:
        print(f"Agentic research final summary error: {e}")
        return ""


def _agentic_research_anthropic(ai_client, ai_model: str, system_prompt: str,
                                 user_message: str, max_iterations: int,
                                 progress_callback=None) -> str:
    """Agentic research loop using Anthropic API."""
    import anthropic

    messages = [
        {"role": "user", "content": user_message},
    ]

    search_count = 0
    article_count = 0

    for iteration in range(max_iterations):
        if progress_callback:
            progress_callback(f"AI araştırıyor... (adım {iteration + 1}, {search_count} arama, {article_count} makale)")

        try:
            response = ai_client.messages.create(
                model=ai_model or "claude-haiku-4-5-20251001",
                system=system_prompt,
                messages=messages,
                tools=_RESEARCH_TOOLS_ANTHROPIC,
                max_tokens=2000,
                temperature=0.2,
            )
        except Exception as e:
            print(f"Agentic research Anthropic API error: {e}")
            break

        # Check stop reason
        if response.stop_reason == "end_turn":
            # Model is done, extract text
            for block in response.content:
                if hasattr(block, 'text'):
                    return block.text
            return ""

        # Process tool use blocks — convert to plain dicts to avoid
        # SDK serialization issues that can cause duplicate tool_use IDs
        assistant_content = response.content
        assistant_content_dicts = []
        for block in assistant_content:
            if block.type == "tool_use":
                assistant_content_dicts.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
            elif hasattr(block, 'text'):
                assistant_content_dicts.append({
                    "type": "text",
                    "text": block.text,
                })
        messages.append({"role": "assistant", "content": assistant_content_dicts})

        tool_results = []
        for block in assistant_content:
            if block.type == "tool_use":
                fn_name = block.name
                fn_args = block.input

                if fn_name in ("web_search", "search_news"):
                    search_count += 1
                elif fn_name == "read_article":
                    article_count += 1

                if progress_callback:
                    if fn_name == "web_search":
                        progress_callback(f"🔍 Arıyor: {fn_args.get('query', '')[:50]}...")
                    elif fn_name == "read_article":
                        progress_callback(f"📖 Makale okuyor: {fn_args.get('url', '')[:50]}...")
                    elif fn_name == "search_news":
                        progress_callback(f"📰 Haber arıyor: {fn_args.get('query', '')[:50]}...")

                result = _execute_tool(fn_name, fn_args)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result[:4000],
                })

        if tool_results:
            messages.append({"role": "user", "content": tool_results})

    # If we hit max iterations, ask for summary
    messages.append({
        "role": "user",
        "content": [{"type": "text", "text": "Araştırmayı bitir ve topladığın bilgileri yapılandırılmış formatta özetle."}]
    })

    try:
        final = ai_client.messages.create(
            model=ai_model or "claude-haiku-4-5-20251001",
            system=system_prompt,
            messages=messages,
            max_tokens=2000,
            temperature=0.1,
        )
        for block in final.content:
            if hasattr(block, 'text'):
                return block.text
        return ""
    except Exception as e:
        print(f"Agentic research Anthropic final error: {e}")
        return ""


# ========================================================================
# MAIN RESEARCH PIPELINE
# ========================================================================

def research_topic(tweet_text: str, tweet_author: str = "",
                   tweet_id: str = "", scanner=None,
                   progress_callback=None,
                   ai_client=None, ai_model: str = None,
                   ai_provider: str = "minimax",
                   research_sources: list = None,
                   use_agentic: bool = True,
                   engine: str = "standard",
                   use_grok_agentic: bool = False) -> ResearchResult:
    """
    Full deep research pipeline with selectable sources:

    research_sources: list of sources to search. Options:
        - "web" : General + technical web search
        - "reddit" : Reddit discussions
        - "news" : News articles
        - "x" : X/Twitter search for related tweets
        - None/empty : defaults to all sources

    use_agentic: If True, AI model browses the internet autonomously
        using tool calling (web_search, read_article). Much more thorough
        but slower. The model decides what to search and when to stop.

    engine: "standard" (DuckDuckGo) or "grok" (xAI Grok x_search + web_search)
    use_grok_agentic: If True, use Grok model for agentic research (X + web)

    1. Fetch thread (if scanner available)
    2. AI-powered topic extraction (understands what the tweet is ACTUALLY about)
    3. Fallback to regex if AI not available
    4. Search selected sources
    5. Compile everything into rich context
    """
    # Default: all sources
    if not research_sources:
        research_sources = ["web", "reddit", "news", "x"]

    result = ResearchResult(
        original_tweet_text=tweet_text,
        original_tweet_author=tweet_author,
        original_tweet_id=tweet_id,
    )

    # === STEP 1: Fetch full thread ===
    if scanner and tweet_id:
        if progress_callback:
            progress_callback("Thread kontrol ediliyor...")
        try:
            thread_texts = scanner.get_thread(tweet_id)
            if thread_texts and len(thread_texts) > 1:
                result.thread_texts = thread_texts
                result.full_thread_text = "\n\n".join(thread_texts)
                if progress_callback:
                    progress_callback(f"Thread bulundu: {len(thread_texts)} tweet")
            else:
                result.thread_texts = [tweet_text]
                result.full_thread_text = tweet_text
        except Exception as e:
            print(f"Thread fetch error: {e}")
            result.thread_texts = [tweet_text]
            result.full_thread_text = tweet_text
    else:
        result.thread_texts = [tweet_text]
        result.full_thread_text = tweet_text

    # === STEP 1.5: Follow links in original tweet/thread ===
    # Extract URLs from the tweet (GitHub repos, articles, etc.) and fetch their content
    original_link_articles = []
    tweet_as_list = [{"text": t} for t in result.thread_texts]
    original_urls = _extract_urls_from_tweets(tweet_as_list)
    if original_urls:
        if progress_callback:
            progress_callback(f"Tweet'teki {len(original_urls)} link okunuyor...")
        for i, url in enumerate(original_urls[:3]):
            if progress_callback:
                progress_callback(f"Link okunuyor ({i + 1}/{min(len(original_urls), 3)}): {url[:60]}...")
            article = fetch_article_content(url)
            if article and article.get("content") and len(article["content"]) > 200:
                article["source"] = "original_tweet_link"
                original_link_articles.append(article)
                result.deep_articles.append(article)
        if original_link_articles and progress_callback:
            progress_callback(f"Tweet linklerinden {len(original_link_articles)} sayfa okundu")

    # === STEP 2: AI-powered topic extraction ===
    ai_topic = None
    if ai_client:
        if progress_callback:
            progress_callback("AI ile konu analiz ediliyor...")
        ai_topic = ai_extract_topic(
            result.full_thread_text,
            ai_client=ai_client,
            ai_model=ai_model,
            provider=ai_provider,
        )

    # Always run regex extraction for entity info
    topic_info = extract_topic_from_text(result.full_thread_text)

    if ai_topic and ai_topic.get("search_queries"):
        result.topic = ai_topic["topic"]
        search_queries = ai_topic["search_queries"]
        if progress_callback:
            progress_callback(f"Konu: {result.topic}")
    else:
        result.topic = topic_info["topic"]
        search_queries = topic_info["search_queries"]

    all_urls = set()

    # === GROK AGENTIC MODE: Grok browses X + web autonomously ===
    if use_grok_agentic:
        if progress_callback:
            progress_callback("🧠 Grok otonom araştırma modunda — X ve web'de geziniyor...")

        try:
            from backend.modules.grok_client import grok_agentic_research
            grok_result = grok_agentic_research(
                tweet_text=result.full_thread_text or tweet_text,
                tweet_author=tweet_author,
                max_iterations=5,
                progress_callback=progress_callback,
            )

            if grok_result:
                # Append original tweet link content to Grok's synthesis
                if original_link_articles:
                    link_context = "\n\n## TWEET'TEKİ LİNKLERDEN OKUNAN İÇERİK\n"
                    for art in original_link_articles:
                        link_context += f"\n### {art.get('title', 'Sayfa')}\n{art['content'][:2000]}\n"
                    result.synthesized_brief = grok_result + link_context
                else:
                    result.synthesized_brief = grok_result

                if progress_callback:
                    progress_callback("🧠 Grok araştırma tamamlandı, X araması yapılıyor...")

                # Still do X search via scanner if requested
                if "x" in research_sources and scanner:
                    topic_info = extract_topic_from_text(result.full_thread_text)
                    try:
                        parts = topic_info["products"][:2] + topic_info["companies"][:1]
                        x_queries = []
                        if parts:
                            x_queries.append(f"({' OR '.join(parts)}) -is:retweet -is:reply lang:en")
                        else:
                            general_q = (result.topic or tweet_text[:50])
                            x_queries.append(f"({general_q}) -is:retweet -is:reply")

                        start = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=72)
                        seen_ids = set()
                        for idx, q in enumerate(x_queries[:2]):
                            if len(result.related_tweets) >= 15:
                                break
                            try:
                                related = scanner._search_tweets(q, start, 15)
                                for t in related:
                                    if t.id != tweet_id and t.id not in seen_ids and len(t.text) > 50:
                                        seen_ids.add(t.id)
                                        t_media = getattr(t, 'media_urls', []) or []
                                        result.related_tweets.append({
                                            "text": t.text, "author": t.author_username,
                                            "likes": t.like_count,
                                            "retweets": getattr(t, 'retweet_count', 0),
                                            "followers": getattr(t, 'author_followers_count', 0),
                                            "media_urls": t_media,
                                        })
                                        result.media_urls.extend(t_media)
                            except Exception as e:
                                print(f"X search in Grok agentic mode error: {e}")
                                break  # Stop X search on error to prevent ban
                        result.related_tweets.sort(key=lambda x: _tweet_quality_score(x), reverse=True)
                        result.related_tweets = result.related_tweets[:15]
                    except Exception as e:
                        print(f"X search in Grok agentic error: {e}")

                result.topic = ai_topic["topic"] if ai_topic else topic_info.get("topic", "")
                result.summary = compile_research_summary(result)
                return result

        except Exception as e:
            print(f"Grok agentic research error: {e}")
            if progress_callback:
                progress_callback(f"⚠️ Grok araştırma hatası, standart moda geçiliyor...")

    # === AGENTIC MODE: Let AI browse the internet autonomously ===
    if use_agentic and ai_client:
        if progress_callback:
            progress_callback("🤖 AI otonom araştırma modunda — model internette geziniyor...")

        agentic_result = agentic_research(
            tweet_text=result.full_thread_text or tweet_text,
            tweet_author=tweet_author,
            ai_client=ai_client,
            ai_model=ai_model,
            provider=ai_provider,
            max_iterations=5,
            progress_callback=progress_callback,
        )

        if agentic_result:
            # Append original tweet link content to AI's synthesis
            if original_link_articles:
                link_context = "\n\n## TWEET'TEKİ LİNKLERDEN OKUNAN İÇERİK\n"
                for art in original_link_articles:
                    link_context += f"\n### {art.get('title', 'Sayfa')}\n{art['content'][:2000]}\n"
                result.synthesized_brief = agentic_result + link_context
            else:
                result.synthesized_brief = agentic_result

            if progress_callback:
                progress_callback("🤖 AI araştırma tamamlandı, X araması yapılıyor...")

            # Still do X search if requested (agentic can't access X API)
            if "x" in research_sources and scanner:
                # Run X search with existing logic (Step 7)
                topic_info = extract_topic_from_text(result.full_thread_text)
                try:
                    parts = topic_info["products"][:2] + topic_info["companies"][:1]
                    x_queries = []
                    if parts:
                        x_queries.append(f"({' OR '.join(parts)}) -is:retweet -is:reply lang:en")
                        if len(parts) > 1:
                            x_queries.append(f"({parts[0]}) -is:retweet -is:reply lang:en min_faves:10")
                    else:
                        general_q = (result.topic or tweet_text[:50])
                        x_queries.append(f"({general_q}) -is:retweet -is:reply")

                    start = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=72)
                    seen_ids = set()
                    per_query_count = 15

                    for idx, q in enumerate(x_queries[:3]):
                        if len(result.related_tweets) >= 15:
                            break
                        if progress_callback:
                            progress_callback(f"X araması {idx + 1}/{len(x_queries)}...")
                        try:
                            related = scanner._search_tweets(q, start, per_query_count)
                            for t in related:
                                if t.id != tweet_id and t.id not in seen_ids and len(t.text) > 50:
                                    seen_ids.add(t.id)
                                    t_media = getattr(t, 'media_urls', []) or []
                                    result.related_tweets.append({
                                        "text": t.text,
                                        "author": t.author_username,
                                        "likes": t.like_count,
                                        "retweets": getattr(t, 'retweet_count', 0),
                                        "followers": getattr(t, 'author_followers_count', 0),
                                        "url": f"https://x.com/{t.author_username}/status/{t.id}",
                                        "media_urls": t_media,
                                    })
                                    result.media_urls.extend(t_media)
                        except Exception as e:
                            print(f"X search error in agentic mode: {e}")
                            break  # Stop X search on error to prevent ban

                    result.related_tweets.sort(key=lambda x: _tweet_quality_score(x), reverse=True)
                    result.related_tweets = result.related_tweets[:15]
                except Exception as e:
                    print(f"X search in agentic mode error: {e}")

            # Compile a basic summary too (for UI display)
            result.topic = ai_topic["topic"] if ai_topic else topic_info.get("topic", "")
            result.summary = compile_research_summary(result)
            return result

    # === STEP 3: Web search (only if "web" in sources) ===
    if "web" in research_sources:
        if engine == "grok":
            # Use Grok web_search instead of DuckDuckGo
            if progress_callback:
                progress_callback("🧠 Grok ile web'de araştırma yapılıyor...")
            try:
                from backend.modules.grok_client import grok_search_web
                for query in search_queries.get("general", [])[:3]:
                    grok_results = grok_search_web(query, max_results=6)
                    for r in grok_results:
                        url = r.get("url", "")
                        if url and url not in all_urls:
                            all_urls.add(url)
                            result.web_results.append(r)
                if progress_callback:
                    progress_callback("🧠 Grok ile teknik detaylar araştırılıyor...")
                for query in search_queries.get("technical", [])[:2]:
                    grok_results = grok_search_web(query, max_results=5)
                    for r in grok_results:
                        url = r.get("url", "")
                        if url and url not in all_urls:
                            all_urls.add(url)
                            r["title"] = f"[TEKNİK] {r.get('title', '')}"
                            result.web_results.append(r)
                # Impact queries — why it matters, practical implications
                for query in search_queries.get("impact", [])[:2]:
                    grok_results = grok_search_web(query, max_results=4)
                    for r in grok_results:
                        url = r.get("url", "")
                        if url and url not in all_urls:
                            all_urls.add(url)
                            r["title"] = f"[ETKİ] {r.get('title', '')}"
                            result.web_results.append(r)
            except Exception as e:
                print(f"Grok web search error, falling back to DuckDuckGo: {e}")
                engine = "standard"  # Fallback
        if engine == "standard":
            if progress_callback:
                progress_callback("Web, teknik detaylar ve Reddit paralel araştırılıyor...")

            # Build all web search queries for parallel execution
            parallel_queries = []
            query_types = []  # Track which type each query belongs to

            for query in search_queries.get("general", [])[:3]:
                parallel_queries.append((query, 6, "w"))
                query_types.append("general")

            for query in search_queries.get("technical", [])[:2]:
                parallel_queries.append((query, 5, "m"))
                query_types.append("technical")

            # Impact queries — why it matters, practical implications
            for query in search_queries.get("impact", [])[:2]:
                parallel_queries.append((query, 4, "m"))
                query_types.append("impact")

            # Include Reddit queries in the same parallel batch
            if "reddit" in research_sources:
                for query in search_queries.get("reddit", [])[:2]:
                    parallel_queries.append((query, 4, "w"))
                    query_types.append("reddit")

            # Execute all searches in parallel
            all_results = _parallel_web_search(parallel_queries)

            for i, results in enumerate(all_results):
                qtype = query_types[i]
                for r in results:
                    if r["url"] not in all_urls:
                        all_urls.add(r["url"])
                        if qtype == "technical":
                            r["title"] = f"[TEKNİK] {r['title']}"
                            result.web_results.append(r)
                        elif qtype == "impact":
                            r["title"] = f"[ETKİ] {r['title']}"
                            result.web_results.append(r)
                        elif qtype == "reddit":
                            result.reddit_results.append(r)
                        else:
                            result.web_results.append(r)

            if progress_callback:
                progress_callback(f"Web araması tamamlandı: {len(result.web_results)} sonuç, {len(result.reddit_results)} Reddit")

    # === STEP 4: Reddit search (only if "reddit" in sources and not already done in parallel) ===
    if "reddit" in research_sources and engine != "standard" and not result.reddit_results:
        if progress_callback:
            progress_callback("Reddit araştırılıyor...")
        for query in search_queries.get("reddit", [])[:2]:
            results = web_search(query, max_results=4, timelimit="w")
            for r in results:
                if r["url"] not in all_urls:
                    all_urls.add(r["url"])
                    result.reddit_results.append(r)

    # === STEP 5: News search (only if "news" in sources) ===
    if "news" in research_sources:
        if engine == "grok":
            if progress_callback:
                progress_callback("🧠 Grok ile son haberler aranıyor...")
            try:
                from backend.modules.grok_client import grok_search_web
                for query in search_queries.get("news", [])[:2]:
                    news_results = grok_search_web(f"{query} news latest", max_results=5)
                    for n in news_results:
                        url = n.get("url", "")
                        if url and url not in all_urls:
                            all_urls.add(url)
                            result.web_results.append({
                                "title": f"[HABER] {n.get('title', '')}",
                                "url": url,
                                "body": n.get("body", ""),
                                "source": "",
                            })
            except Exception as e:
                print(f"Grok news search error: {e}")
        else:
            if progress_callback:
                progress_callback("Son haberler paralel aranıyor...")

            # Parallel news search with built-in fallback chain (d → w → m)
            news_queries = [(q, 5, "d") for q in search_queries.get("news", [])[:2]]
            all_news = _parallel_news_search(news_queries)

            for news_list in all_news:
                for n in news_list:
                    if n["url"] not in all_urls:
                        all_urls.add(n["url"])
                        result.web_results.append({
                            "title": f"[HABER] {n['title']}",
                            "url": n["url"],
                            "body": n["body"],
                            "source": n.get("source", ""),
                        })

    # === STEP 6: DEEP FETCH — parallel article fetching ===
    if any(s in research_sources for s in ["web", "reddit", "news"]):
        if progress_callback:
            progress_callback("Makaleler paralel okunuyor (derin araştırma)...")

        urls_to_fetch = _pick_best_urls(result.web_results + result.reddit_results, max_urls=12)

        articles = _parallel_fetch_articles(urls_to_fetch, max_articles=10,
                                             progress_callback=progress_callback)
        result.deep_articles.extend(articles)

        if progress_callback:
            progress_callback(f"{len(articles)} makale okundu")

    # === STEP 7: X/Twitter search (only if "x" in sources) ===
    # When X is selected, do a DEEP search (40-50 tweets, not just 10)
    if "x" in research_sources and scanner:
        x_only_mode = research_sources == ["x"]
        max_tweets = 50 if x_only_mode else 15
        if progress_callback:
            progress_callback(f"X'te {'detaylı' if x_only_mode else ''} arama yapılıyor...")
        try:
            parts = topic_info["products"][:2] + topic_info["companies"][:1]

            # Build multiple search queries for thorough X coverage
            x_queries = []
            if parts:
                x_queries.append(f"({' OR '.join(parts)}) -is:retweet -is:reply lang:en")
                if len(parts) > 1:
                    x_queries.append(f"({parts[0]}) -is:retweet -is:reply lang:en min_faves:10")
                    x_queries.append(f"({parts[1]}) -is:retweet -is:reply lang:en")
                # Add action-based query
                action = topic_info.get("action", "")
                if action:
                    x_queries.append(f"({parts[0]}) ({action}) -is:retweet -is:reply lang:en")
            else:
                general_q = search_queries.get("general", ["AI"])[0][:50]
                x_queries.append(f"({general_q}) -is:retweet -is:reply")

            # In X-only mode, add more query variations
            if x_only_mode:
                # Use AI-generated queries if available
                if ai_topic and ai_topic.get("search_queries"):
                    for gq in ai_topic["search_queries"].get("general", [])[:2]:
                        x_queries.append(f"({gq[:50]}) -is:retweet -is:reply lang:en")
                # Add topic-based variations
                if topic_info["products"]:
                    for prod in topic_info["products"][:3]:
                        x_queries.append(f"{prod} -is:retweet -is:reply lang:en min_faves:5")
                if topic_info["companies"]:
                    for comp in topic_info["companies"][:2]:
                        x_queries.append(f"{comp} {topic_info.get('action', 'AI')} -is:retweet -is:reply lang:en")

            # Limit total X queries to prevent Twitter rate limiting / temp bans
            MAX_X_QUERIES = 5  # max 5 unique searches per research call
            x_queries = x_queries[:MAX_X_QUERIES]

            start = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=72)
            seen_ids = set()
            per_query_count = max(max_tweets // len(x_queries), 10) if x_queries else 20

            for idx, q in enumerate(x_queries):
                if len(result.related_tweets) >= max_tweets:
                    break
                if progress_callback and idx > 0:
                    progress_callback(f"X araması {idx + 1}/{len(x_queries)}... ({len(result.related_tweets)} tweet bulundu)")
                try:
                    related = scanner._search_tweets(q, start, per_query_count)
                    for t in related:
                        if t.id != tweet_id and t.id not in seen_ids and len(t.text) > 50:
                            seen_ids.add(t.id)
                            t_media = getattr(t, 'media_urls', []) or []
                            result.related_tweets.append({
                                "text": t.text,
                                "author": t.author_username,
                                "likes": t.like_count,
                                "retweets": getattr(t, 'retweet_count', 0),
                                "followers": getattr(t, 'author_followers_count', 0),
                                "url": f"https://x.com/{t.author_username}/status/{t.id}",
                                "media_urls": t_media,
                            })
                            result.media_urls.extend(t_media)
                except Exception as e:
                    print(f"X search error ({q[:40]}): {e}")
                    break  # Stop further X queries on error to prevent Twitter ban

            result.related_tweets.sort(key=lambda x: _tweet_quality_score(x), reverse=True)
            result.related_tweets = result.related_tweets[:max_tweets]

            if progress_callback:
                progress_callback(f"X'te {len(result.related_tweets)} tweet bulundu")

            # === STEP 7b: Follow links found in tweets ===
            if result.related_tweets:
                if progress_callback:
                    progress_callback("Tweet'lerdeki linkler takip ediliyor...")
                tweet_articles = _follow_tweet_links(
                    result.related_tweets, max_articles=5,
                    progress_callback=progress_callback,
                )
                if tweet_articles:
                    result.deep_articles.extend(tweet_articles)
                    if progress_callback:
                        progress_callback(f"Tweet linklerinden {len(tweet_articles)} makale okundu")

            # === STEP 7c: Follow threads from high-engagement search results ===
            if x_only_mode and result.related_tweets and scanner:
                if progress_callback:
                    progress_callback("Yüksek etkileşimli tweet thread'leri takip ediliyor...")
                threads = _follow_threads_from_search(
                    result.related_tweets, scanner, max_threads=3,
                    progress_callback=progress_callback,
                )
                for td in threads:
                    # Add thread content to related_tweets context
                    thread_combined = " | ".join(td["thread_texts"])
                    result.related_tweets.append({
                        "text": f"[THREAD by @{td['author']}] {thread_combined}",
                        "author": td["author"],
                        "likes": td.get("likes", 0),
                        "retweets": 0,
                        "followers": 0,
                        "url": "",
                    })
                if threads and progress_callback:
                    progress_callback(f"{len(threads)} thread bulundu ve eklendi")

        except Exception as e:
            print(f"Twitter search error: {e}")

    # === STEP 8: Compile raw summary ===
    if progress_callback:
        progress_callback("Araştırma derleniyor...")

    result.summary = compile_research_summary(result)

    # === STEP 8.5: Query Refinement — 2nd pass to fill knowledge gaps ===
    if ai_client and any(s in research_sources for s in ["web", "news"]):
        try:
            original_text = result.full_thread_text or result.original_tweet_text or result.topic
            gap_queries = ai_identify_knowledge_gaps(
                original_tweet=original_text,
                current_research=result.summary[:6000],
                ai_client=ai_client,
                ai_model=ai_model,
                provider=ai_provider,
            )
            if gap_queries:
                if progress_callback:
                    progress_callback(f"Bilgi boslugu tespit edildi, {len(gap_queries)} ek arama yapiliyor...")

                # Run refinement searches in parallel
                search_tuples = [(q, 5, "w") for q in gap_queries[:3]]
                gap_search_results = _parallel_web_search(search_tuples)
                gap_results = [item for sublist in gap_search_results for item in sublist]
                new_urls = _pick_best_urls(gap_results, max_urls=4)
                if new_urls:
                    gap_articles = _parallel_fetch_articles(
                        new_urls, max_articles=3, progress_callback=progress_callback,
                    )
                    if gap_articles:
                        result.deep_articles.extend(gap_articles)
                        if progress_callback:
                            progress_callback(f"Ek {len(gap_articles)} kaynak okundu (bilgi boslugu doldurma)")
                        # Recompile with new articles
                        result.summary = compile_research_summary(result)
        except Exception as e:
            print(f"Query refinement error: {e}")

    # === STEP 9: AI Synthesis — structured research brief ===
    # This transforms raw research into prioritized, tweet-friendly format
    if ai_client and (result.deep_articles or result.web_results or result.reddit_results):
        if progress_callback:
            progress_callback("AI ile araştırma sentezleniyor...")
        brief = ai_synthesize_research(
            raw_summary=result.summary,
            original_tweet=result.full_thread_text or result.original_tweet_text,
            ai_client=ai_client,
            ai_model=ai_model,
            provider=ai_provider,
        )
        if brief:
            result.synthesized_brief = brief
            if progress_callback:
                progress_callback("Araştırma sentezi tamamlandı")

    return result


def _tweet_quality_score(tweet: dict) -> float:
    """
    Score a tweet for research relevance.
    Combines absolute engagement with engagement ratio (virality signal).
    High engagement ratio = content resonated beyond the author's usual reach.
    """
    likes = tweet.get("likes", 0) or 0
    rts = tweet.get("retweets", 0) or 0
    followers = tweet.get("followers", 0) or 0

    # Absolute engagement (weighted by algorithm values)
    absolute = likes + rts * 20

    # Engagement ratio bonus (viral content from smaller accounts gets boosted)
    if followers > 100:
        ratio = (likes + rts * 3) / followers
        ratio_bonus = min(ratio * 50, 100)  # Cap at 100 bonus points
    else:
        ratio_bonus = 0

    # Content quality: longer tweets with substance score higher
    text_len = len(tweet.get("text", ""))
    length_bonus = min(text_len / 50, 5)  # Up to 5 bonus for 250+ char tweets

    return absolute + ratio_bonus + length_bonus


def _pick_best_urls(results: list[dict], max_urls: int = 12) -> list[str]:
    """
    Pick the best URLs to deep-fetch based on relevance signals.
    Prioritize: official sources, research papers, tier-1 tech blogs, Reddit.

    Scoring tiers:
    - Tier 1 (official/research): +5 — arxiv, official blogs, papers
    - Tier 2 (premier tech): +4 — TechCrunch, Verge, Ars, SemiAnalysis
    - Tier 3 (community): +3 — Reddit, HuggingFace, GitHub
    - Tier 4 (general tech): +2 — Wired, VentureBeat, etc.
    - Content signals: numbers/data (+2), long body (+1), key title words (+1 each)
    """
    from urllib.parse import urlparse

    scored = []
    seen_domains: set[str] = set()  # Domain diversity — max 2 per domain

    # Tiered domain scoring
    TIER1_DOMAINS = {
        "arxiv.org": 5, "blog.google": 5, "openai.com": 5, "anthropic.com": 5,
        "ai.meta.com": 5, "deepmind.google": 5, "research.nvidia.com": 5,
        "blog.x.ai": 5, "mistral.ai": 5,
    }
    TIER2_DOMAINS = {
        "techcrunch.com": 4, "theverge.com": 4, "arstechnica.com": 4,
        "semianalysis.com": 4, "towardsdatascience.com": 4,
    }
    TIER3_DOMAINS = {
        "reddit.com": 3, "huggingface.co": 3, "github.com": 3,
        "news.ycombinator.com": 3,
    }
    TIER4_DOMAINS = {
        "wired.com": 2, "venturebeat.com": 2, "nvidia.com": 2,
        "microsoft.com": 2, "meta.com": 2, "zdnet.com": 2,
        "bloomberg.com": 2, "reuters.com": 2,
    }

    for r in results:
        url = r.get("url", "")
        title = r.get("title", "").lower()
        body = r.get("body", "").lower()

        score = 0

        try:
            domain = urlparse(url).netloc.replace("www.", "")
            if domain in SKIP_DOMAINS:
                continue
        except Exception:
            continue

        # Domain tier scoring
        for tier_map in [TIER1_DOMAINS, TIER2_DOMAINS, TIER3_DOMAINS, TIER4_DOMAINS]:
            for td, pts in tier_map.items():
                if td in url:
                    score += pts
                    break
            else:
                continue
            break

        # Content quality signals
        if re.search(r'\d+[BMK%]|\$\d', body):
            score += 2
        if len(body) > 150:
            score += 1
        if len(body) > 300:
            score += 1

        # Title key signals
        high_value_signals = ["benchmark", "evaluation", "comparison", "performance",
                              "announced", "released", "launched", "paper", "research"]
        for signal in high_value_signals:
            if signal in title:
                score += 1

        # Freshness signal — recent content keywords
        if any(w in title for w in ["2026", "2025", "new", "latest", "just"]):
            score += 1

        scored.append((score, url, domain))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Domain diversity: max 2 URLs per domain
    picked: list[str] = []
    for _, url, domain in scored:
        base_domain = ".".join(domain.split(".")[-2:])
        domain_count = sum(1 for d in seen_domains if d == base_domain)
        if domain_count >= 2:
            continue
        seen_domains.add(base_domain)
        picked.append(url)
        if len(picked) >= max_urls:
            break

    return picked


# ========================================================================
# AI-POWERED RESEARCH SYNTHESIS — structured Research Brief
# ========================================================================

def ai_synthesize_research(raw_summary: str, original_tweet: str,
                           ai_client=None, ai_model: str = None,
                           provider: str = "minimax") -> str | None:
    """
    Use AI to transform raw research into a structured Research Brief.
    This is the KEY step: instead of dumping raw articles into the tweet prompt,
    we first extract the most useful facts, data, and angles.

    Returns a structured brief optimized for tweet writing, or None if AI unavailable.
    """
    if not ai_client:
        return None

    prompt = f"""Aşağıda bir tweet/thread ve o konu hakkında yapılmış araştırma sonuçları var.

ORİJİNAL TWEET/THREAD:
"{original_tweet[:1500]}"

ARAŞTIRMA SONUÇLARI:
{raw_summary[:12000]}

---

GÖREV: Bu araştırmadan bir TWEET yazmak için gerekli TÜM bilgileri çıkar ve detaylıca aktar.
Amacımız bu gelişmeyi/haberi takipçilerimize DETAYLIYLA aktarmak — okuyucu tweet'i okuyunca konuyu tamamen anlamış olmalı.

Yanıtını şu formatta yaz:

## TEMEL BULGULAR
(Bu gelişme/haber/ürün/olay ne? Kim yaptı? Ne zaman? Orijinal tweet bir thread ise thread'deki TÜM bilgileri dahil et — adım adım anlatım, teknik detaylar, örnekler hepsi önemli. KISALTMA, mümkün olduğunca ÇOK bilgi ver.)

## TEKNİK DETAYLAR VE RAKAMLAR
(Araştırmadan çıkan TÜM spesifik bilgiler — hiçbirini atlama:
- Fiyat, tarih, versiyon numarası, benchmark sonuçları
- Performans karşılaştırmaları (önceki versiyon/rakip ile)
- Nasıl çalışıyor — teknik mekanizma
- Kim kullanabilir, nasıl erişilir (ücretsiz mi, açık kaynak mı, API mi)
- Topluluk/şirket bilgisi, yatırım miktarı, kullanıcı sayısı
- Avantajlar VE dezavantajlar/riskler/limitasyonlar varsa onlar da)

## PRATİK ETKİ
(Bu gelişmenin kullanıcılara, geliştiricilere, sektöre pratik etkisi ne? Somut, herkesin anlayacağı dilde.)

## DOĞRULANMIŞ İDDİALAR
(Araştırmadan çıkan her spesifik iddiayı listele — tweet'te kullanılacak veriler:
- İddia: [somut bilgi/rakam/karşılaştırma]
- Kaynak: [hangi makale/tweet/blog'dan geldi]
- Güven: [yüksek/orta/düşük — birden fazla kaynak teyit ediyorsa yüksek]
ÖNEMLİ: Sadece araştırmada AÇIKÇA bulunan bilgileri yaz. Çıkarım/tahmin YAPMA.)

KURALLAR:
- Orijinal tweet/thread'deki bilgilere SADIK KAL
- Araştırmadan MÜMKÜN OLDUĞUNCA ÇOK somut bilgi aktar — yüzeysel özet YAPMA
- BİLGİ YOĞUNLUĞU en önemli kriter — kısa tutma, uzun ve detaylı yaz
- Teknik kısaltmaları Türkçe aç (eval → değerlendirme/test, CLI → komut satırı aracı vb.)
- Yorum ekleme, sadece gerçekleri yaz
- Bilgi yoksa o bölümü atla, "bulunamadı" yazma
- Eski veya güncelliğini yitirmiş bilgileri DAHIL ETME

⛔ DAHIL ETME:
- Tweet konusuyla ilgisiz karşılaştırmalar
- Popülerlik metrikleri (star, fork, download sayıları)
- Genel/herkesin bildiği bilgiler (örn: "AI sektörü büyüyor")
- Karşıt görüş veya çelişki ARAMA — sadece varsa ve önemliyse yaz"""

    try:
        result = _call_ai(ai_client, provider, ai_model, prompt, max_tokens=4000, temperature=0.1)
        if result:
            # Strip <think> tags from reasoning models
            result = re.sub(r'<think>.*?</think>', '', result, flags=re.DOTALL).strip()
        return result
    except Exception as e:
        print(f"AI research synthesis error: {e}")
        return None


# ========================================================================
# RESEARCH SUMMARY COMPILER
# ========================================================================

def compile_research_summary(r: ResearchResult) -> str:
    """
    Build structured research context optimized for tweet writing.

    Priority order (most important first):
    1. Original tweet/thread (the ANCHOR)
    2. Deep articles (highest info density)
    3. Web snippets (supporting context)
    4. Reddit discussions (community perspective)
    5. X opinions (limited — only high-engagement ones)

    Keeps total under ~12000 chars — bilgi yoğunluğu öncelikli, kısa tutma.
    """
    parts = []
    total_chars = 0
    MAX_TOTAL = 20000  # 20K: 10 makale destekli, daha derin araştırma aktarımı

    # Section 1: Original tweet/thread — MOST IMPORTANT (always included)
    parts.append(f"# ANA KONU: {r.topic}")

    if len(r.thread_texts) > 1:
        parts.append(f"\n## ORİJİNAL THREAD (@{r.original_tweet_author}) - {len(r.thread_texts)} tweet:")
        for i, t in enumerate(r.thread_texts, 1):
            parts.append(f"  {i}/ {t}")
    else:
        parts.append(f"\n## ORİJİNAL TWEET (@{r.original_tweet_author}):")
        parts.append(f"  {r.original_tweet_text}")

    total_chars = sum(len(p) for p in parts)

    # Section 2: DEEP ARTICLES — Key content from fetched pages
    # Limit each article to 4000 chars, max 10 articles — derin bilgi aktarımı
    if r.deep_articles:
        parts.append(f"\n## ARAŞTIRMA KAYNAKLARI ({len(r.deep_articles)} makale okundu):")
        for i, article in enumerate(r.deep_articles[:10], 1):
            content = article['content'][:4000]
            article_text = f"\n### Kaynak {i}: {article['title']}\n{content}"
            if total_chars + len(article_text) > MAX_TOTAL:
                # Truncate this article to fit budget
                remaining = max(800, MAX_TOTAL - total_chars - 200)
                article_text = f"\n### Kaynak {i}: {article['title']}\n{article['content'][:remaining]}..."
            parts.append(article_text)
            total_chars += len(article_text)

    # Section 3: Impact findings — WHY IT MATTERS (priority over general web)
    if r.web_results and total_chars < MAX_TOTAL - 300:
        deep_urls = {a["url"] for a in r.deep_articles}
        impact_results = [wr for wr in r.web_results
                          if wr["url"] not in deep_urls and "[ETKİ]" in wr.get("title", "")]
        if impact_results:
            parts.append(f"\n## ETKİ ANALİZİ (neden önemli, kime etkisi var):")
            for i, wr in enumerate(impact_results[:3], 1):
                clean_title = wr['title'].replace("[ETKİ] ", "")
                snippet = f"  {i}. {clean_title}: {wr['body'][:300]}"
                if total_chars + len(snippet) > MAX_TOTAL:
                    break
                parts.append(snippet)
                total_chars += len(snippet)

    # Section 4: Web search snippets (compact — title + snippet)
    if r.web_results and total_chars < MAX_TOTAL - 300:
        deep_urls = {a["url"] for a in r.deep_articles}
        remaining = [wr for wr in r.web_results
                     if wr["url"] not in deep_urls and "[ETKİ]" not in wr.get("title", "")]

        if remaining:
            parts.append(f"\n## Ek Web Bulguları ({len(remaining)} kaynak):")
            for i, wr in enumerate(remaining[:5], 1):
                snippet = f"  {i}. {wr['title']}: {wr['body'][:250]}"
                if total_chars + len(snippet) > MAX_TOTAL:
                    break
                parts.append(snippet)
                total_chars += len(snippet)

    # Section 5: Reddit (compact)
    if r.reddit_results and total_chars < MAX_TOTAL - 200:
        deep_urls = {a["url"] for a in r.deep_articles}
        remaining_reddit = [rr for rr in r.reddit_results if rr["url"] not in deep_urls]
        if remaining_reddit:
            parts.append(f"\n## Reddit Tartışmaları:")
            for i, rr in enumerate(remaining_reddit[:3], 1):
                snippet = f"  {i}. {rr['title']}: {rr['body'][:200]}"
                if total_chars + len(snippet) > MAX_TOTAL:
                    break
                parts.append(snippet)
                total_chars += len(snippet)

    # Section 6: X opinions — ONLY high-engagement, max 3
    # (This is where irrelevant tangents come from — be very selective)
    if r.related_tweets and total_chars < MAX_TOTAL - 200:
        # Only include tweets with significant engagement
        quality_tweets = [rt for rt in r.related_tweets
                          if rt.get("likes", 0) >= 5 or rt.get("retweets", 0) >= 2]
        if quality_tweets:
            # Sort by engagement (likes + RTs) for best-first
            quality_tweets.sort(key=lambda t: t.get("likes", 0) + t.get("retweets", 0) * 3, reverse=True)
            parts.append(f"\n## X'te Öne Çıkan Yorumlar ({len(quality_tweets)} kaliteli):")
            for i, rt in enumerate(quality_tweets[:5], 1):
                snippet = f"  {i}. @{rt['author']} ({rt['likes']}❤️): {rt['text'][:500]}"
                if total_chars + len(snippet) > MAX_TOTAL:
                    break
                parts.append(snippet)
                total_chars += len(snippet)

    return "\n".join(parts)


# ========================================================================
# AI KNOWLEDGE GAP DETECTION — Find what's missing before writing
# ========================================================================

def ai_identify_knowledge_gaps(original_tweet: str, current_research: str,
                                ai_client=None, ai_model: str = None,
                                provider: str = "minimax") -> list[str]:
    """
    After initial research, ask AI: "What specific info is still missing?"
    Returns a list of targeted search queries to fill the gaps.

    This prevents the AI from making up facts during tweet generation.
    Example: If tweet is about Qwen 3.5 models, and research doesn't have
    benchmark comparisons, AI will request "Qwen 3.5 9B benchmark vs Llama" etc.
    """
    if not ai_client:
        return []

    current_year = str(datetime.datetime.now().year)

    prompt = f"""Bir tweet'e quote tweet yazacağız. Elimizde araştırma var ama bazı bilgiler eksik olabilir.

ORİJİNAL TWEET:
"{original_tweet[:800]}"

ELİMİZDEKİ ARAŞTIRMA:
{current_research[:3000]}

GÖREV: Bu tweet hakkında bilgili ve doğru bir quote tweet yazmak için EKSİK olan bilgileri belirle.

Özellikle şu eksiklikleri ara:
1. Tweet'te bahsedilen ürün/model hakkında GÜNCEL benchmark/performans verileri var mı?
2. Rakip ürünlerle karşılaştırma verileri var mı? (ör. "X modeli Y'den iyi" diyebilmek için)
3. Fiyat/maliyet bilgisi var mı?
4. Lansman/çıkış tarihi kesin mi?
5. Tweet'teki iddiaları doğrulayacak veri var mı?

Yanıtını SADECE JSON formatında ver:
{{
    "gaps": ["eksik bilgi 1 açıklaması", "eksik bilgi 2 açıklaması"],
    "search_queries": ["arama sorgusu 1", "arama sorgusu 2", "arama sorgusu 3"]
}}

KURALLAR:
- Sorgular İngilizce olsun
- Her sorguya "{current_year}" ekle
- Sorgular KISA (3-7 kelime) ve SPESİFİK olsun
- Maks 4 sorgu üret, en önemlileri seç
- Eğer araştırma yeterliyse boş liste döndür: {{"gaps": [], "search_queries": []}}"""

    try:
        raw = _call_ai(ai_client, provider, ai_model, prompt, max_tokens=500, temperature=0.1)
        if not raw:
            return []

        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not json_match:
            return []

        data = json.loads(json_match.group())
        return data.get("search_queries", [])[:4]

    except Exception as e:
        print(f"Knowledge gap detection error: {e}")
        return []


def fill_knowledge_gaps(gap_queries: list[str],
                        progress_callback=None) -> list[dict]:
    """
    Run web searches for knowledge gap queries and fetch top articles.
    Returns list of {query, results, articles} for each gap.
    """
    gap_findings = []

    for i, query in enumerate(gap_queries):
        if progress_callback:
            progress_callback(f"Ek araştırma {i+1}/{len(gap_queries)}: {query[:50]}...")

        # Search web
        results = web_search(query, max_results=4, timelimit="m")
        if not results:
            results = web_search(query, max_results=4, timelimit=None)

        # Fetch best article
        article = None
        urls = _pick_best_urls(results, max_urls=2)
        for url in urls:
            article = fetch_article_content(url)
            if article and len(article.get("content", "")) > 200:
                break

        gap_findings.append({
            "query": query,
            "results": results[:3],
            "article": article,
        })

    return gap_findings


def compile_gap_findings(gap_findings: list[dict]) -> str:
    """Compile knowledge gap findings into concise text for the research brief."""
    if not gap_findings:
        return ""

    parts = ["## EK ARAŞTIRMA (Bilgi Boşlukları Dolduruldu):"]

    for finding in gap_findings:
        query = finding["query"]
        article = finding.get("article")
        results = finding.get("results", [])

        if article and article.get("content"):
            content = article["content"][:1500]
            parts.append(f"\n### {query}")
            parts.append(f"Kaynak: {article.get('title', 'N/A')}")
            parts.append(content)
        elif results:
            parts.append(f"\n### {query}")
            for r in results[:2]:
                parts.append(f"- {r['title']}: {r['body'][:200]}")

    return "\n".join(parts)


# ========================================================================
# AI FACT-CHECK — Verify claims in draft tweet before publishing
# ========================================================================

def ai_fact_check_draft(draft_tweet: str, original_tweet: str,
                        research_context: str,
                        ai_client=None, ai_model: str = None,
                        provider: str = "minimax") -> dict | None:
    """
    Check a draft tweet for factual claims that might be wrong or unverifiable.
    Returns claims that need verification with search queries.

    Example: Draft says "GPT-4o seviyesinde" but GPT-4o might be outdated.
    This function catches that and suggests "Qwen 3.5 9B vs current best models 2026".
    """
    if not ai_client:
        return None

    current_year = str(datetime.datetime.now().year)

    prompt = f"""Aşağıda bir quote tweet taslağı var. Bu taslaktaki ŞÜPHELI veya DOĞRULANMASI GEREKEN iddiaları bul.

TASLAK TWEET:
"{draft_tweet}"

ORİJİNAL TWEET (buna cevap olarak yazıldı):
"{original_tweet[:500]}"

ARAŞTIRMA ÖZETİ:
{research_context[:2000]}

GÖREV: Taslak tweet'teki şu tür sorunları tespit et:
1. ESKİ/GÜNCEL OLMAYAN bilgi (ör. "GPT-4o seviyesinde" ama GPT-4o artık eski olabilir)
2. KAYNAKSIZ İDDİA (araştırmada olmayan ama tweet'e eklenen bilgi)
3. YANLIŞ KARŞILAŞTIRMA (yanlış model/ürün karşılaştırması)
4. UYDURMA RAKAM (araştırmada olmayan istatistik)

Yanıtını SADECE JSON formatında ver:
{{
    "issues": [
        {{
            "claim": "sorunlu ifade",
            "problem": "ne yanlış/şüpheli",
            "search_query": "doğrulama araması ({current_year} ekle)"
        }}
    ],
    "is_clean": false
}}

Eğer taslak temizse: {{"issues": [], "is_clean": true}}

KURALLAR:
- Sadece GERÇEKTEN şüpheli iddiaları listele, her şeye sorun bulma
- Sorgular İngilizce ve kısa (3-7 kelime) olsun
- Maks 3 sorun listele"""

    try:
        raw = _call_ai(ai_client, provider, ai_model, prompt, max_tokens=600, temperature=0.1)
        if not raw:
            return None

        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not json_match:
            return None

        data = json.loads(json_match.group())
        return data

    except Exception as e:
        print(f"Fact check error: {e}")
        return None


def verify_claims(issues: list[dict],
                  progress_callback=None) -> list[dict]:
    """
    Run web searches to verify flagged claims.
    Returns enriched issues with verification results.
    """
    verified = []

    for i, issue in enumerate(issues[:3]):
        query = issue.get("search_query", "")
        if not query:
            continue

        if progress_callback:
            progress_callback(f"Doğrulama {i+1}/{len(issues)}: {issue.get('claim', '')[:40]}...")

        results = web_search(query, max_results=4, timelimit="m")
        # Try to fetch best article for real data
        article = None
        urls = _pick_best_urls(results, max_urls=2)
        for url in urls:
            article = fetch_article_content(url)
            if article and len(article.get("content", "")) > 200:
                break

        verified.append({
            **issue,
            "search_results": results[:3],
            "article": article,
        })

    return verified


def compile_verification_context(verified_issues: list[dict]) -> str:
    """Compile fact-check results into context for tweet rewriting."""
    if not verified_issues:
        return ""

    parts = ["## DOĞRULAMA SONUÇLARI (taslaktaki şüpheli iddialar kontrol edildi):"]

    for issue in verified_issues:
        claim = issue.get("claim", "")
        problem = issue.get("problem", "")
        article = issue.get("article")
        results = issue.get("search_results", [])

        parts.append(f"\n❌ SORUNLU İDDIA: \"{claim}\"")
        parts.append(f"   SORUN: {problem}")

        if article and article.get("content"):
            parts.append(f"   DOĞRU BİLGİ ({article.get('title', '')[:80]}):")
            parts.append(f"   {article['content'][:800]}")
        elif results:
            parts.append("   BULUNAN BİLGİLER:")
            for r in results[:2]:
                parts.append(f"   - {r['title']}: {r['body'][:200]}")

    parts.append("\n⚠️ Yukarıdaki sorunlu iddiaları DÜZELT veya ÇIKAR. Doğrulama bilgilerini kullan.")
    return "\n".join(parts)


# ========================================================================
# TOPIC-BASED RESEARCH (for normal tweet writing — no quote tweet needed)
# ========================================================================

@dataclass
class TopicResearchResult:
    """Research result for a user-provided topic (not a quote tweet)."""
    topic_input: str = ""
    topic: str = ""
    search_mode: str = "x_only"  # "x_only" or "x_and_web"
    x_tweets: list = field(default_factory=list)
    web_results: list = field(default_factory=list)
    deep_articles: list = field(default_factory=list)
    news_results: list = field(default_factory=list)
    summary: str = ""
    agentic_summary: str = ""  # AI autonomous research results
    media_urls: list = field(default_factory=list)  # Media URLs from X tweets


def research_topic_from_text(
    topic_input: str,
    scanner=None,
    time_hours: int = 12,
    search_mode: str = "x_only",
    progress_callback=None,
    ai_client=None,
    ai_model: str = None,
    ai_provider: str = "minimax",
    use_agentic: bool = True,
    engine: str = "standard",
    use_grok_agentic: bool = False,
) -> TopicResearchResult:
    """
    Research a topic by searching X and optionally the web.

    Args:
        topic_input: User's topic text
        scanner: TwitterScanner instance for X search
        time_hours: How far back to search
        search_mode: "x_only" | "x_and_web" | "x_deep" (50-100 tweets for personal mode)
        progress_callback: Progress update function
        ai_client: AI client for topic extraction
        ai_model: AI model name
        ai_provider: AI provider name
        use_agentic: If True, AI browses internet autonomously via tool calling

    Steps:
    1. AI extracts keywords & generates diverse search queries
    2. Deep search X with multiple query variations (TR + EN)
    3. (Optional) Search web + news if search_mode == "x_and_web"
    3b. (Optional) Agentic: AI searches web autonomously
    4. Compile into context for tweet generation
    """
    result = TopicResearchResult(topic_input=topic_input, search_mode=search_mode)

    # === STEP 1: Understand the topic & generate search queries ===
    if progress_callback:
        progress_callback("Konu analiz ediliyor ve arama sorguları üretiliyor...")

    ai_topic = None
    if ai_client:
        ai_topic = _ai_extract_topic_for_research(
            topic_input, ai_client, ai_model, ai_provider
        )

    # Fallback: regex-based extraction
    topic_info = extract_topic_from_text(topic_input)

    if ai_topic and ai_topic.get("x_queries_en"):
        result.topic = ai_topic["topic"]
        search_queries = ai_topic.get("search_queries", {})
        x_queries_tr = ai_topic.get("x_queries_tr", [])
        x_queries_en = ai_topic.get("x_queries_en", [])
    else:
        result.topic = topic_info["topic"]
        search_queries = topic_info["search_queries"]
        # Build X queries from entities
        entities = topic_info["products"][:2] + topic_info["companies"][:2]
        action = topic_info.get("action", "")
        if entities:
            x_queries_en = [
                f"({' OR '.join(entities)}) {action or ''} -is:retweet -is:reply lang:en".strip(),
                f"({' OR '.join(entities)}) -is:retweet -is:reply",
            ]
            x_queries_tr = [f"({' OR '.join(entities)}) -is:retweet -is:reply lang:tr"]
        else:
            words = topic_input.split()[:5]
            q = " ".join(words)
            x_queries_en = [f"({q}) -is:retweet -is:reply lang:en", f"({q}) -is:retweet -is:reply"]
            x_queries_tr = [f"({q}) -is:retweet -is:reply lang:tr"]

    if progress_callback:
        progress_callback(f"Konu: {result.topic}")

    # === STEP 2: Deep X search with multiple query variations ===
    is_deep_mode = search_mode == "x_deep"
    if scanner:
        if progress_callback:
            label = "X'te derin arama yapılıyor (50-100 tweet)..." if is_deep_mode else "X'te detaylı arama yapılıyor..."
            progress_callback(label)

        # In deep mode, search wider time range and more tweets per query
        search_hours = max(time_hours, 48) if is_deep_mode else time_hours
        start = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=search_hours)
        per_query = 15 if is_deep_mode else 20

        seen_ids = set()

        # Combine all X queries — run ALL of them
        all_x_queries = x_queries_en + x_queries_tr

        # Also build extra variations for thorough coverage
        extra_queries = _build_x_query_variations(topic_input, result.topic, ai_topic)
        all_x_queries.extend(extra_queries)

        # In deep mode, add even more query variations
        if is_deep_mode:
            # Add min engagement queries for quality tweets
            for q in x_queries_en[:3]:
                base = q.replace("min_faves:5", "").replace("min_faves:10", "").strip()
                all_x_queries.append(f"{base} min_faves:20")
                all_x_queries.append(f"{base} min_faves:50")

        # Deduplicate queries (case-insensitive)
        seen_queries = set()
        unique_queries = []
        for q in all_x_queries:
            q_key = q.lower().strip()
            if q_key not in seen_queries:
                seen_queries.add(q_key)
                unique_queries.append(q)

        # Limit total X queries to prevent Twitter rate limiting / temp bans
        MAX_AGENTIC_X_QUERIES = 8
        unique_queries = unique_queries[:MAX_AGENTIC_X_QUERIES]
        total_queries = len(unique_queries)
        if progress_callback:
            progress_callback(f"X'te {total_queries} farklı arama yapılıyor...")

        for idx, q in enumerate(unique_queries):
            if progress_callback and idx > 0 and idx % 3 == 0:
                progress_callback(f"X araması {idx}/{total_queries}... ({len(result.x_tweets)} tweet bulundu)")
            try:
                tweets = scanner._search_tweets(q, start, per_query)
                for t in tweets:
                    if t.id not in seen_ids and len(t.text) > 40:
                        seen_ids.add(t.id)
                        t_media = getattr(t, 'media_urls', []) or []
                        result.x_tweets.append({
                            "text": t.text,
                            "author": t.author_username,
                            "likes": t.like_count,
                            "retweets": t.retweet_count,
                            "url": t.url,
                            "created_at": t.created_at.isoformat() if t.created_at else "",
                            "media_urls": t_media,
                        })
                        result.media_urls.extend(t_media)
            except Exception as e:
                print(f"X topic search error ({q[:50]}): {e}")
                break  # Stop further X queries on error to prevent Twitter ban

        # Sort by engagement
        result.x_tweets.sort(key=lambda x: x.get("likes", 0) + x.get("retweets", 0) * 2, reverse=True)

        # Keep top tweets sorted by engagement
        max_keep = 35 if is_deep_mode else 25
        result.x_tweets = result.x_tweets[:max_keep]

        if progress_callback:
            progress_callback(f"X'te {len(result.x_tweets)} tweet bulundu")

        # === STEP 2b: Follow links found in tweets ===
        if result.x_tweets:
            if progress_callback:
                progress_callback("Tweet'lerdeki linkler takip ediliyor...")
            tweet_articles = _follow_tweet_links(
                result.x_tweets, max_articles=5,
                progress_callback=progress_callback,
            )
            if tweet_articles:
                # Store in result for summary compilation
                if not hasattr(result, 'deep_articles'):
                    result.deep_articles = []
                result.deep_articles = tweet_articles
                if progress_callback:
                    progress_callback(f"Tweet linklerinden {len(tweet_articles)} makale okundu")

        # === STEP 2c: Follow threads from high-engagement tweets ===
        if result.x_tweets and scanner:
            if progress_callback:
                progress_callback("Yüksek etkileşimli tweet thread'leri takip ediliyor...")
            threads = _follow_threads_from_search(
                result.x_tweets, scanner, max_threads=3,
                progress_callback=progress_callback,
            )
            for td in threads:
                thread_combined = " | ".join(td["thread_texts"])
                result.x_tweets.append({
                    "text": f"[THREAD by @{td['author']}] {thread_combined}",
                    "author": td["author"],
                    "likes": td.get("likes", 0),
                    "retweets": 0,
                    "url": "",
                    "created_at": "",
                })
            if threads and progress_callback:
                progress_callback(f"{len(threads)} thread bulundu ve eklendi")

    # === STEP 2b-GROK: Grok agentic mode ===
    if use_grok_agentic:
        if progress_callback:
            progress_callback("🧠 Grok otonom araştırma modunda — X ve web'de geziniyor...")
        try:
            from backend.modules.grok_client import grok_agentic_research
            grok_result = grok_agentic_research(
                tweet_text=topic_input,
                tweet_author="",
                max_iterations=5,
                progress_callback=progress_callback,
            )
            if grok_result:
                result.agentic_summary = grok_result
                if progress_callback:
                    progress_callback("🧠 Grok araştırma tamamlandı, derleniyor...")
                parts = []
                if result.x_tweets:
                    parts.append(f"## X'TE BULUNAN GÜNCEL TWEETLER ({len(result.x_tweets)} tweet)")
                    for tw in result.x_tweets[:10]:
                        parts.append(f"- @{tw['author']} ({tw['likes']} ❤️): {tw['text'][:500]}")
                parts.append("\n## GROK OTONOM ARAŞTIRMA SONUÇLARI")
                parts.append(grok_result)
                result.summary = "\n".join(parts)
                return result
        except Exception as e:
            print(f"Grok agentic research error in topic: {e}")
            if progress_callback:
                progress_callback(f"⚠️ Grok araştırma hatası, standart moda geçiliyor...")

    # === STEP 2b: AGENTIC MODE — AI browses web autonomously ===
    if use_agentic and ai_client:
        if progress_callback:
            progress_callback("🤖 AI otonom araştırma modunda — konu hakkında internette geziniyor...")

        agentic_result = agentic_research(
            tweet_text=topic_input,
            tweet_author="",
            ai_client=ai_client,
            ai_model=ai_model,
            provider=ai_provider,
            max_iterations=5,
            progress_callback=progress_callback,
        )

        if agentic_result:
            # Store the AI's autonomous research
            result.agentic_summary = agentic_result

            # Compile full summary: X tweets + agentic research
            if progress_callback:
                progress_callback("🤖 AI araştırma tamamlandı, derleniyor...")

            # Build summary that includes both X findings and agentic research
            parts = []
            if result.x_tweets:
                parts.append(f"## X'TE BULUNAN GÜNCEL TWEETLER ({len(result.x_tweets)} tweet)")
                for tw in result.x_tweets[:10]:
                    parts.append(f"- @{tw['author']} ({tw['likes']} ❤️): {tw['text'][:500]}")

            parts.append("\n## AI OTONOM ARAŞTIRMA SONUÇLARI")
            parts.append(agentic_result)

            result.summary = "\n".join(parts)
            return result

    # === STEP 3: Web + News search (ONLY if search_mode == "x_and_web") ===
    if search_mode == "x_and_web":
        all_urls = set()

        if engine == "grok":
            # Use Grok for web + news search
            if progress_callback:
                progress_callback("🧠 Grok ile web'de araştırma yapılıyor...")
            try:
                from backend.modules.grok_client import grok_search_web
                for query in search_queries.get("general", [])[:4]:
                    if progress_callback:
                        progress_callback(f"🧠 Grok ile aranıyor: {query[:50]}...")
                    grok_results = grok_search_web(query, max_results=8)
                    for r in grok_results:
                        url = r.get("url", "")
                        if url and url not in all_urls:
                            all_urls.add(url)
                            result.web_results.append(r)

                if progress_callback:
                    progress_callback("🧠 Grok ile haberler aranıyor...")
                for query in search_queries.get("news", [])[:3]:
                    news_results = grok_search_web(f"{query} news latest", max_results=6)
                    for n in news_results:
                        url = n.get("url", "")
                        if url and url not in all_urls:
                            all_urls.add(url)
                            result.news_results.append({
                                "title": n.get("title", ""),
                                "url": url,
                                "body": n.get("body", ""),
                                "source": "",
                            })
            except Exception as e:
                print(f"Grok web search error in topic research: {e}")
                engine = "standard"  # Fallback

        if engine == "standard":
            if progress_callback:
                progress_callback("Web'de güncel bilgiler aranıyor...")

            # General web search — last day first, then week, then month
            for query in search_queries.get("general", [])[:4]:
                if progress_callback:
                    progress_callback(f"Web'de aranıyor: {query[:50]}...")
                results = web_search(query, max_results=8, timelimit="d")
                if not results:
                    results = web_search(query, max_results=8, timelimit="w")
                if not results:
                    results = web_search(query, max_results=8, timelimit="m")
                for r in results:
                    if r["url"] not in all_urls:
                        all_urls.add(r["url"])
                        result.web_results.append(r)

            # News search — last day, fallback to week
            if progress_callback:
                progress_callback("Son haberler aranıyor...")
            for query in search_queries.get("news", [])[:3]:
                news = web_search_news(query, max_results=6, timelimit="d")
                if not news:
                    news = web_search_news(query, max_results=6, timelimit="w")
                for n in news:
                    if n["url"] not in all_urls:
                        all_urls.add(n["url"])
                        result.news_results.append({
                            "title": n["title"],
                            "url": n["url"],
                            "body": n["body"],
                            "source": n.get("source", ""),
                        })

        # Deep fetch top articles — read more for richer context
        if progress_callback:
            progress_callback("Makaleler okunuyor...")

        all_search_results = result.web_results + result.news_results
        urls_to_fetch = _pick_best_urls(all_search_results)

        fetched = 0
        for url in urls_to_fetch:
            if fetched >= 5:
                break
            if progress_callback:
                progress_callback(f"Makale okunuyor ({fetched + 1})...")
            article = fetch_article_content(url)
            if article and article.get("content") and len(article["content"]) > 200:
                result.deep_articles.append(article)
                fetched += 1

    # === STEP 4: Compile summary ===
    if progress_callback:
        progress_callback("Araştırma derleniyor...")
    result.summary = _compile_topic_research_summary(result)
    return result


def _build_x_query_variations(topic_input: str, topic_en: str, ai_topic: dict | None) -> list[str]:
    """
    Build extra X search query variations for thorough coverage.
    Extracts keywords and creates different combinations.
    """
    extra = []

    # Extract key words from topic_input (Turkish)
    # Remove common Turkish stop words
    tr_stop = {"bir", "ve", "de", "da", "bu", "şu", "o", "ile", "için", "gibi",
               "ama", "ya", "diye", "ki", "mi", "mu", "mü", "mı", "ne", "var",
               "yok", "olan", "ben", "sen", "biz", "siz", "onlar", "kadar"}
    tr_words = [w for w in topic_input.split() if w.lower() not in tr_stop and len(w) > 2]

    # Extract key words from English topic
    en_stop = {"the", "a", "an", "is", "are", "was", "were", "in", "on", "at",
               "to", "for", "of", "and", "or", "but", "has", "had", "by", "its"}
    en_words = [w for w in topic_en.split() if w.lower() not in en_stop and len(w) > 2] if topic_en else []

    # Build variations from Turkish keywords
    if len(tr_words) >= 2:
        # Pairs of keywords
        for i in range(min(len(tr_words), 4)):
            for j in range(i + 1, min(len(tr_words), 4)):
                q = f"{tr_words[i]} {tr_words[j]} -is:retweet -is:reply"
                extra.append(q)

    # Build variations from English keywords
    if len(en_words) >= 2:
        for i in range(min(len(en_words), 4)):
            for j in range(i + 1, min(len(en_words), 4)):
                q = f"{en_words[i]} {en_words[j]} -is:retweet -is:reply lang:en"
                extra.append(q)

    # Use AI-provided keywords if available
    if ai_topic:
        kw_tr = ai_topic.get("keywords_tr", [])
        kw_en = ai_topic.get("keywords_en", [])

        # Build OR queries from keyword groups
        if len(kw_en) >= 2:
            # Top keywords combined
            extra.append(f"({' '.join(kw_en[:3])}) -is:retweet -is:reply lang:en")
            # Individual important keywords with min engagement
            for kw in kw_en[:3]:
                if len(kw) > 3:
                    extra.append(f"{kw} -is:retweet -is:reply lang:en min_faves:5")

        if len(kw_tr) >= 2:
            extra.append(f"({' '.join(kw_tr[:3])}) -is:retweet -is:reply lang:tr")

    # Limit total extra queries to prevent rate limiting
    return extra[:8]


def _ai_extract_topic_for_research(
    topic_input: str, ai_client, ai_model: str, provider: str
) -> dict | None:
    """Use AI to understand user's topic input and generate X + web search queries."""
    current_year = str(datetime.datetime.now().year)

    prompt = f"""Kullanıcı şu konuda tweet yazmak istiyor:
"{topic_input}"

Bu konuyu KAPSAMLI analiz et ve X/Twitter + web arama sorguları üret.

SADECE şu JSON formatında yanıt ver:
{{
    "topic": "konunun 5-10 kelimelik İngilizce özeti",
    "keywords_tr": ["türkçe", "anahtar", "kelimeler", "max 6"],
    "keywords_en": ["english", "keywords", "max 6"],
    "x_queries_tr": [
        "X'te Türkçe arama sorgusu 1 -is:retweet -is:reply lang:tr",
        "X'te Türkçe arama sorgusu 2 -is:retweet -is:reply lang:tr",
        "X'te Türkçe arama sorgusu 3 -is:retweet -is:reply lang:tr",
        "X'te Türkçe arama sorgusu 4 -is:retweet -is:reply lang:tr"
    ],
    "x_queries_en": [
        "X English search query 1 (genel) -is:retweet -is:reply lang:en",
        "X English search query 2 (teknik detay) -is:retweet -is:reply lang:en",
        "X English search query 3 (kullanıcı deneyimi) -is:retweet -is:reply lang:en",
        "X English search query 4 (karşılaştırma/alternifler) -is:retweet -is:reply lang:en",
        "X English search query 5 (eleştiri/sorunlar) -is:retweet -is:reply lang:en",
        "X English search query 6 (özellikler/nasıl çalışır) -is:retweet -is:reply lang:en"
    ],
    "general_queries": [
        "kapsamlı web araması 1 {current_year}",
        "ürünün/konunun teknik detayları {current_year}",
        "nasıl çalışıyor / features {current_year}",
        "kullanıcı deneyimleri review {current_year}"
    ],
    "news_queries": [
        "son haberler announcement {current_year}",
        "güncel gelişmeler release {current_year}"
    ]
}}

ÖNEMLİ KURALLAR:
- KAPSAMLI ARAŞTIRMA: Konunun sadece bir yönüne (örn: benchmark) odaklanma! Her sorgu FARKLI bir açıdan araştırsın:
  * Genel bilgi ve tanıtım (ne olduğu, ne zaman çıktığı, beta/release durumu)
  * Teknik özellikler ve nasıl çalıştığı (mimari, altyapı, farklılıklar)
  * Kullanıcı deneyimleri ve yorumları (hands-on, ilk izlenimler)
  * Karşılaştırma ve alternatifler (rakipler, benchmark ama sadece benchmark DEĞİL)
  * Eleştiriler, sorunlar, limitasyonlar
  * Gelecek planları, yol haritası, beklentiler
- x_queries: X/Twitter'da arama yapılacak. KISA ve SPESİFİK sorgular yaz
- Konuyu en az 5-6 farklı İngilizce X sorgusuyla ara — HER BİRİ farklı açıdan!
- Konuyu en az 3-4 farklı Türkçe X sorgusuyla ara
- general_queries: Web'de farklı açılardan arama yap (en az 3-4 sorgu)
- news_queries: Haber/duyuru araması (release, announcement, beta vs.)
- Her web sorguya {current_year} ekle
- Ürün/teknoloji konusuysa: sürüm bilgisi, release tarihi, beta/GA durumu da araştır"""

    try:
        raw = _call_ai(ai_client, provider, ai_model, prompt, max_tokens=1200, temperature=0.2)
        if not raw:
            return None

        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not json_match:
            return None

        data = json.loads(json_match.group())

        return {
            "topic": data.get("topic", ""),
            "keywords_tr": data.get("keywords_tr", [])[:6],
            "keywords_en": data.get("keywords_en", [])[:6],
            "x_queries_tr": data.get("x_queries_tr", [])[:5],
            "x_queries_en": data.get("x_queries_en", [])[:7],
            "search_queries": {
                "general": data.get("general_queries", [])[:4],
                "news": data.get("news_queries", [])[:3],
                "technical": [],
                "reddit": [],
            },
        }
    except Exception as e:
        print(f"AI topic research extraction error: {e}")
        return None


def _compile_topic_research_summary(r: TopicResearchResult) -> str:
    """Compile topic research into context for tweet generation."""
    parts = []

    parts.append(f"# ARAŞTIRMA KONUSU: {r.topic}")
    parts.append(f"Kullanıcının yazmak istediği konu: {r.topic_input}")

    # X tweets — ALWAYS the primary source
    if r.x_tweets:
        show_count = 15 if r.search_mode == "x_deep" else 20
        parts.append(f"\n## X'TE SON PAYLAŞIMLAR ({len(r.x_tweets)} tweet, en iyi {show_count} gösteriliyor):")
        parts.append("(Bu tweetler konuyla ilgili EN GÜNCEL bilgiler — BİRİNCİL KAYNAĞIN BUNLAR!)\n")
        for i, tw in enumerate(r.x_tweets[:show_count], 1):
            parts.append(f"  {i}. @{tw['author']} ({tw['likes']}L {tw['retweets']}RT): {tw['text'][:600]}")

    # Tweet link articles (from link-following, always show)
    tweet_link_articles = [a for a in r.deep_articles if a.get("source") == "tweet_link"]
    if tweet_link_articles:
        parts.append(f"\n## TWEET LİNKLERİNDEN OKUNAN İÇERİKLER ({len(tweet_link_articles)} kaynak):")
        for i, article in enumerate(tweet_link_articles, 1):
            parts.append(f"### Kaynak {i}: {article['title']}")
            parts.append(f"{article['content'][:2000]}")
            parts.append("")

    # Web content only if search_mode was x_and_web
    if r.search_mode == "x_and_web":
        web_articles = [a for a in r.deep_articles if a.get("source") != "tweet_link"]
        if web_articles:
            parts.append(f"\n## OKUNAN MAKALELER ({len(web_articles)} kaynak):")
            for i, article in enumerate(web_articles, 1):
                parts.append(f"### Kaynak {i}: {article['title']}")
                parts.append(f"URL: {article['url']}")
                parts.append(f"{article['content']}")
                parts.append("")

        if r.news_results:
            parts.append(f"\n## SON HABERLER ({len(r.news_results)} haber):")
            for i, n in enumerate(r.news_results[:5], 1):
                src = f" ({n['source']})" if n.get("source") else ""
                parts.append(f"  {i}. {n['title']}{src}")
                parts.append(f"     {n['body'][:300]}")

        if r.web_results:
            deep_urls = {a["url"] for a in r.deep_articles}
            remaining = [w for w in r.web_results if w["url"] not in deep_urls]
            if remaining:
                parts.append(f"\n## EK WEB BULGULARI ({len(remaining)} kaynak):")
                for i, wr in enumerate(remaining[:5], 1):
                    parts.append(f"  {i}. {wr['title']}")
                    parts.append(f"     {wr['body'][:200]}")

    return "\n".join(parts)


# ========================================================================
# TOPIC DISCOVERY — AI finds interesting content topics
# ========================================================================

def discover_topics(ai_client=None, ai_model: str = None,
                    ai_provider: str = "minimax",
                    scanner=None,
                    focus_area: str = "",
                    progress_callback=None,
                    engine: str = "standard") -> list[dict]:
    """
    Discover specific, tweetable AI/tech developments from X and web.
    Searches ENGLISH sources only (Turkish accounts mostly translate from these).

    Returns list of topic dicts with title, description, angle, potential.
    """
    if not ai_client:
        return []

    # Grok shortcut: use Grok's native X + web search for topic discovery
    if engine == "grok":
        try:
            from backend.modules.grok_client import grok_discover_topics
            if progress_callback:
                progress_callback("🧠 Grok ile güncel gelişmeler keşfediliyor...")
            topics = grok_discover_topics(
                focus_area=focus_area,
                progress_callback=progress_callback,
            )
            if topics:
                return topics
            if progress_callback:
                progress_callback("Grok sonuç bulamadı, standart modla devam ediliyor...")
        except Exception as e:
            print(f"Grok discover topics error: {e}")
            if progress_callback:
                progress_callback("⚠️ Grok hata verdi, standart modla devam ediliyor...")

    # Step 1: Search X for trending conversations (ENGLISH ONLY)
    x_tweets = []
    if scanner:
        if progress_callback:
            progress_callback("X'te güncel gelişmeler araştırılıyor (İngilizce)...")

        import datetime as _dt
        start = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=24)

        # Build targeted queries — English only, high engagement
        if focus_area and focus_area.strip():
            focus_words = focus_area.strip()
            trend_queries = [
                f"({focus_words}) -is:retweet -is:reply lang:en min_faves:50",
                f"({focus_words}) -is:retweet -is:reply lang:en min_faves:20",
                f"({focus_words}) launched OR released OR announced -is:retweet -is:reply lang:en",
            ]
        else:
            trend_queries = [
                "(AI OR LLM OR GPT OR Claude OR Gemini) launched OR released OR announced -is:retweet -is:reply lang:en min_faves:100",
                "(AI coding OR agentic OR AI tool) -is:retweet -is:reply lang:en min_faves:50",
                "(benchmark OR open-source OR new model) AI -is:retweet -is:reply lang:en min_faves:50",
                "(OpenAI OR Anthropic OR Google OR Meta OR xAI) -is:retweet -is:reply lang:en min_faves:100",
                "(Cursor OR Windsurf OR Copilot OR Devin) -is:retweet -is:reply lang:en min_faves:30",
            ]

        seen_ids = set()
        for q in trend_queries:
            try:
                results = scanner._search_tweets(q, start, 20)
                for t in results:
                    if t.id not in seen_ids and len(t.text) > 60:
                        seen_ids.add(t.id)
                        x_tweets.append({
                            "text": t.text[:600],
                            "author": t.author_username,
                            "likes": t.like_count,
                            "retweets": getattr(t, 'retweet_count', 0),
                        })
            except Exception as e:
                print(f"Topic discovery X search error: {e}")
                break  # Stop further X queries on error to prevent Twitter ban

        x_tweets.sort(key=lambda x: x.get("likes", 0) + x.get("retweets", 0) * 2, reverse=True)
        x_tweets = x_tweets[:25]

    # Step 2: Search web for recent news (English)
    web_results = []
    if progress_callback:
        progress_callback("Web'de güncel haberler araştırılıyor...")

    current_year = str(datetime.datetime.now().year)

    if focus_area and focus_area.strip():
        web_queries = [
            f"{focus_area} news {current_year}",
            f"{focus_area} launch release announcement {current_year}",
        ]
    else:
        web_queries = [
            f"AI launch release announcement today {current_year}",
            f"AI new model benchmark results {current_year}",
            f"AI startup funding news {current_year}",
        ]

    for q in web_queries:
        try:
            results = web_search_news(q, max_results=6, timelimit="d")
            if not results:
                results = web_search_news(q, max_results=6, timelimit="w")
            for r in results:
                web_results.append({
                    "title": r.get("title", ""),
                    "body": r.get("body", "")[:300],
                    "source": r.get("source", ""),
                })
        except Exception:
            pass

    # Step 3: AI analyzes and picks specific developments
    if progress_callback:
        progress_callback("AI spesifik konu önerileri oluşturuyor...")

    x_context = ""
    if x_tweets:
        x_items = []
        for tw in x_tweets[:20]:
            x_items.append(f"- @{tw['author']} ({tw['likes']}❤️ {tw['retweets']}RT): {tw['text'][:500]}")
        x_context = "\n".join(x_items)

    web_context = ""
    if web_results:
        web_items = []
        for wr in web_results[:10]:
            src = f" ({wr['source']})" if wr.get('source') else ""
            web_items.append(f"- {wr['title']}{src}: {wr['body'][:200]}")
        web_context = "\n".join(web_items)

    focus_text = f"ODAK ALANI: {focus_area}" if focus_area else "ODAK ALANI: AI ve teknoloji genel"

    prompt = f"""Sen bir Türk teknoloji/AI içerik üreticisisin. X'te Türkçe içerik üretiyorsun.

Aşağıda X'te şu an konuşulan konular ve güncel haberler var. Bunlardan SPESİFİK, tweet yazılabilir
gelişmeleri çıkar.

## X'TE GÜNCEL PAYLAŞIMLAR (İngilizce, orijinal kaynak):
{x_context or "(X verisi yok)"}

## GÜNCEL HABERLER:
{web_context or "(Haber verisi yok)"}

## {focus_text}

⚠️ KRİTİK: Genel kategori isimleri YASAK. Her konu SPESİFİK bir gelişme olmalı.

KÖTÜ (YAPMA): "AI in healthcare", "Ethical AI debates", "AI coding tools trend"
İYİ (BÖYLE YAP): "Dvina Code çıktı: GUI-first platform, Claude Opus 4.6 free plana geldi"
İYİ: "OpenAI 110 milyar dolar topladı — 730 milyar değerleme"
İYİ: "Qwen 3.5 400B açık kaynak: GPT-4o'yu coding'de geçti"

Her gelişme için şunu ver:
1. title: Kısa, spesifik Türkçe başlık — NE OLDU?
2. description: 2-3 cümle detay — ne oldu, kim yaptı, önemli rakamlar (tweet'lerden ve haberlerden çıkar)
3. angle: Bu konuya hangi açıdan tweet yazılmalı (analiz/karşılaştırma/deneyim/haber)
4. potential: Neden bu konu iyi? Engagement potansiyeli

JSON formatında 5-8 konu ver:
[
  {{"title": "...", "description": "...", "angle": "...", "potential": "..."}},
  ...
]

SADECE JSON ver, başka bir şey yazma."""

    try:
        if ai_provider == "anthropic":
            response = ai_client.messages.create(
                model=ai_model or "claude-haiku-4-5-20251001",
                max_tokens=2500,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
            )
            text = response.content[0].text
        else:
            response = ai_client.chat.completions.create(
                model=ai_model or "MiniMax-M2.5",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2500,
                temperature=0.5,
            )
            text = response.choices[0].message.content

        # Parse JSON
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
        json_match = re.search(r'\[.*\]', text, re.DOTALL)
        if json_match:
            topics = json.loads(json_match.group())
            return topics
        return []

    except Exception as e:
        print(f"Topic discovery AI error: {e}")
        return []
