"""
Media Finder Module
Searches for relevant images and videos from X (Twitter) and web (DuckDuckGo)
to accompany generated tweets and content.

Sources:
- X/Twitter: Twikit search with filter:images / filter:videos
- Web: DuckDuckGo image search (free, no API key needed)

Usage:
    finder = MediaFinder(twikit_client=client)
    results = finder.find_media("OpenAI GPT-5 release", source="all")
    # results = [MediaItem(...), ...]
"""
import re
import time
import requests
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Literal


# --- Constants ---
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
MAX_IMAGES = 4
MAX_VIDEOS = 2
DDG_SEARCH_DELAY = 0.3
FETCH_TIMEOUT = 10


@dataclass
class MediaItem:
    """A single media result (image or video)."""
    url: str                       # Direct media URL (image or video)
    thumbnail_url: str = ""        # Smaller preview URL (if available)
    source: str = ""               # "x" or "web"
    media_type: str = "image"      # "image" or "video"
    title: str = ""                # Description or tweet text
    source_url: str = ""           # Original page/tweet URL
    author: str = ""               # Author username (for X results)
    width: int = 0
    height: int = 0


@dataclass
class MediaSearchResult:
    """Collection of media search results."""
    query: str = ""
    images: list = field(default_factory=list)   # list[MediaItem]
    videos: list = field(default_factory=list)   # list[MediaItem]
    source_used: str = ""                        # "x", "web", "all"
    error: str = ""

    @property
    def total_count(self) -> int:
        return len(self.images) + len(self.videos)

    @property
    def has_results(self) -> bool:
        return self.total_count > 0


def _extract_keywords(topic_text: str) -> str:
    """Extract search-friendly keywords from a topic/tweet text.

    Strips common Turkish filler words and keeps the core terms
    for image search queries.
    """
    # Remove URLs
    text = re.sub(r'https?://\S+', '', topic_text)
    # Remove hashtags but keep the word
    text = re.sub(r'#(\w+)', r'\1', text)
    # Remove mentions
    text = re.sub(r'@\w+', '', text)
    # Remove emojis (basic range)
    text = re.sub(
        r'[\U0001f600-\U0001f64f\U0001f300-\U0001f5ff'
        r'\U0001f680-\U0001f6ff\U0001f1e0-\U0001f1ff'
        r'\U00002702-\U000027b0\U0001f900-\U0001f9ff]+', '', text
    )

    # Turkish stop words to remove
    stop_words = {
        "bir", "bu", "ve", "ile", "için", "da", "de", "mi", "mu",
        "ama", "çok", "daha", "en", "gibi", "olan", "olarak", "var",
        "yeni", "artık", "şimdi", "bence", "yani", "böyle", "şöyle",
        "diyor", "oldu", "olan", "the", "is", "and", "of", "to", "in",
        "for", "that", "this", "with", "just", "now",
    }

    words = text.split()
    keywords = [w for w in words if w.lower().strip(".,!?:;") not in stop_words and len(w) > 2]

    # Limit to most important terms (first ~8 words)
    result = " ".join(keywords[:8])
    return result.strip() or topic_text[:100]


def _search_x_media(twikit_client, query: str,
                     media_type: str = "images",
                     max_results: int = 10) -> list[MediaItem]:
    """Search X/Twitter for media using twikit.

    Args:
        twikit_client: Authenticated TwikitSearchClient instance
        query: Search query
        media_type: "images" or "videos"
        max_results: Max tweets to scan for media
    """
    if not twikit_client or not twikit_client.is_authenticated:
        return []

    filter_type = "filter:images" if media_type == "images" else "filter:videos"
    search_query = f"{query} {filter_type}"

    try:
        tweets = twikit_client.search_tweets(search_query, count=max_results)
    except Exception as e:
        print(f"MediaFinder X search error: {e}")
        return []

    results = []
    for tweet in tweets:
        media_urls = tweet.get("media_urls", [])
        tweet_text = tweet.get("text", "")
        author = tweet.get("author_username", "")
        tweet_id = tweet.get("id", "")

        for url in media_urls:
            # Determine if image or video based on URL patterns
            is_video = any(ext in url.lower() for ext in [".mp4", "video", "ext_tw_video"])
            item_type = "video" if is_video else "image"

            # Skip if we're looking for images but found video or vice versa
            if media_type == "images" and is_video:
                continue
            if media_type == "videos" and not is_video:
                continue

            results.append(MediaItem(
                url=url,
                thumbnail_url=url + ":small" if not is_video else "",
                source="x",
                media_type=item_type,
                title=tweet_text[:200],
                source_url=f"https://x.com/{author}/status/{tweet_id}" if author and tweet_id else "",
                author=author,
            ))

    return results


def _search_ddg_images(query: str, max_results: int = 8) -> list[MediaItem]:
    """Search DuckDuckGo for images.

    Uses the duckduckgo-search library which is already a project dependency.
    """
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        print("MediaFinder: duckduckgo-search not installed")
        return []

    results = []
    try:
        with DDGS() as ddgs:
            time.sleep(DDG_SEARCH_DELAY)
            images = list(ddgs.images(
                keywords=query,
                max_results=max_results,
                safesearch="moderate",
            ))

            for img in images:
                url = img.get("image", "")
                thumb = img.get("thumbnail", "")
                title = img.get("title", "")
                source_url = img.get("url", "")
                width = img.get("width", 0)
                height = img.get("height", 0)

                if not url:
                    continue

                results.append(MediaItem(
                    url=url,
                    thumbnail_url=thumb or url,
                    source="web",
                    media_type="image",
                    title=title,
                    source_url=source_url,
                    width=width,
                    height=height,
                ))
    except Exception as e:
        print(f"MediaFinder DDG image search error: {e}")

    return results


def _search_ddg_videos(query: str, max_results: int = 4) -> list[MediaItem]:
    """Search DuckDuckGo for videos."""
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        return []

    results = []
    try:
        with DDGS() as ddgs:
            time.sleep(DDG_SEARCH_DELAY)
            videos = list(ddgs.videos(
                keywords=query,
                max_results=max_results,
            ))

            for vid in videos:
                url = vid.get("content", "")  # Direct video URL
                title = vid.get("title", "")
                thumb = vid.get("images", {}).get("large", "") or vid.get("images", {}).get("medium", "")
                source_url = url  # For videos, content URL is the source

                if not url:
                    continue

                results.append(MediaItem(
                    url=url,
                    thumbnail_url=thumb,
                    source="web",
                    media_type="video",
                    title=title,
                    source_url=source_url,
                ))
    except Exception as e:
        print(f"MediaFinder DDG video search error: {e}")

    return results


def find_media(
    topic_text: str,
    source: Literal["x", "web", "all"] = "x",
    twikit_client=None,
    max_images: int = MAX_IMAGES,
    max_videos: int = MAX_VIDEOS,
    progress_callback=None,
) -> MediaSearchResult:
    """
    Find relevant images and videos for a given topic.

    Args:
        topic_text: Topic text or tweet content to find media for
        source: Where to search — "x" (Twitter), "web" (DuckDuckGo), or "all"
        twikit_client: Authenticated TwikitSearchClient (required for X search)
        max_images: Maximum number of images to return
        max_videos: Maximum number of videos to return
        progress_callback: Optional callback for progress updates

    Returns:
        MediaSearchResult with images and videos lists
    """
    result = MediaSearchResult(query=topic_text, source_used=source)

    # Extract clean keywords for search
    keywords = _extract_keywords(topic_text)
    if not keywords:
        result.error = "Arama için yeterli anahtar kelime bulunamadı."
        return result

    if progress_callback:
        progress_callback(f"Görsel aranıyor: {keywords[:50]}...")

    all_images = []
    all_videos = []

    # --- Parallel search across sources ---
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {}

        # X/Twitter search
        if source in ("x", "all") and twikit_client:
            if progress_callback:
                progress_callback("X'te görseller aranıyor...")
            futures["x_images"] = executor.submit(
                _search_x_media, twikit_client, keywords, "images", max_images * 3
            )
            futures["x_videos"] = executor.submit(
                _search_x_media, twikit_client, keywords, "videos", max_videos * 3
            )

        # Web (DuckDuckGo) search
        if source in ("web", "all"):
            if progress_callback:
                progress_callback("Web'de görseller aranıyor...")
            futures["web_images"] = executor.submit(
                _search_ddg_images, keywords, max_images * 2
            )
            futures["web_videos"] = executor.submit(
                _search_ddg_videos, keywords, max_videos * 2
            )

        # Collect results
        for key, future in futures.items():
            try:
                items = future.result(timeout=15)
                if "images" in key:
                    all_images.extend(items)
                else:
                    all_videos.extend(items)
            except Exception as e:
                print(f"MediaFinder {key} error: {e}")

    # Deduplicate by URL
    seen_urls = set()

    unique_images = []
    for img in all_images:
        if img.url not in seen_urls:
            seen_urls.add(img.url)
            unique_images.append(img)

    unique_videos = []
    for vid in all_videos:
        if vid.url not in seen_urls:
            seen_urls.add(vid.url)
            unique_videos.append(vid)

    # Prioritize X results first (more relevant to Twitter context)
    x_images = [i for i in unique_images if i.source == "x"]
    web_images = [i for i in unique_images if i.source == "web"]
    result.images = (x_images + web_images)[:max_images]

    x_videos = [v for v in unique_videos if v.source == "x"]
    web_videos = [v for v in unique_videos if v.source == "web"]
    result.videos = (x_videos + web_videos)[:max_videos]

    if progress_callback:
        progress_callback(
            f"Bulunan: {len(result.images)} görsel, {len(result.videos)} video"
        )

    return result


def extract_media_from_tweets(tweets: list) -> list[MediaItem]:
    """
    Extract media items from a list of tweet dicts (from twikit or scanner).
    Useful for collecting media from research results without a new search.

    Args:
        tweets: List of tweet dicts with 'media_urls' field

    Returns:
        List of MediaItem objects
    """
    items = []
    seen = set()

    for tweet in tweets:
        media_urls = []

        # Handle both dict and AITopic objects
        if isinstance(tweet, dict):
            media_urls = tweet.get("media_urls", [])
            author = tweet.get("author_username", "")
            text = tweet.get("text", "")
            tweet_id = tweet.get("id", "")
        else:
            media_urls = getattr(tweet, "media_urls", []) or []
            author = getattr(tweet, "author_username", "")
            text = getattr(tweet, "text", "")
            tweet_id = getattr(tweet, "id", "")

        for url in media_urls:
            if url in seen:
                continue
            seen.add(url)

            is_video = any(ext in url.lower() for ext in [".mp4", "video", "ext_tw_video"])
            items.append(MediaItem(
                url=url,
                thumbnail_url=url + ":small" if not is_video else "",
                source="x",
                media_type="video" if is_video else "image",
                title=text[:200] if text else "",
                source_url=f"https://x.com/{author}/status/{tweet_id}" if author and tweet_id else "",
                author=author,
            ))

    return items
