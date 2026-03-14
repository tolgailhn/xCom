"""
Twitter/X AI Topic Scanner Module
Scans X for AI developments using Twitter API v2
"""
import tweepy
import datetime
import json
import re
from dataclasses import dataclass, field


def _get_full_text(tweet) -> str:
    """Get full tweet text including note_tweet for long-form posts.

    Twitter API v2 truncates tweets >280 chars unless 'note_tweet' is
    requested in tweet_fields.  When available, note_tweet.text holds the
    complete content.
    """
    if hasattr(tweet, 'data') and isinstance(tweet.data, dict):
        note = tweet.data.get("note_tweet")
        if note and isinstance(note, dict) and note.get("text"):
            return note["text"]
    return tweet.text


@dataclass
class AITopic:
    """Represents a discovered AI topic/development from X"""
    id: str
    text: str
    author_name: str
    author_username: str
    author_profile_image: str
    created_at: datetime.datetime
    like_count: int = 0
    retweet_count: int = 0
    reply_count: int = 0
    impression_count: int = 0
    url: str = ""
    category: str = "Genel"
    relevance_score: float = 0.0
    media_urls: list = field(default_factory=list)
    author_followers_count: int = 0
    content_summary: str = ""

    @property
    def engagement_score(self) -> float:
        from modules.constants import W_RT, W_REPLY, W_LIKE, W_BOOKMARK
        return (self.like_count * W_LIKE + self.retweet_count * W_RT +
                self.reply_count * W_REPLY)

    @property
    def total_engagement(self) -> int:
        return self.like_count + self.retweet_count + self.reply_count

    @property
    def time_ago(self) -> str:
        now = datetime.datetime.now(datetime.timezone.utc)
        diff = now - self.created_at
        hours = diff.total_seconds() / 3600
        if hours < 1:
            return f"{int(diff.total_seconds() / 60)} dk önce"
        elif hours < 24:
            return f"{int(hours)} saat önce"
        else:
            return f"{int(hours / 24)} gün önce"

    @property
    def date_str(self) -> str:
        """Return formatted date string like '2 Mar 2026, 14:30'"""
        try:
            return self.created_at.strftime("%d %b %Y, %H:%M")
        except Exception:
            return ""

    @property
    def time_and_date(self) -> str:
        """Return both relative time and absolute date"""
        date_part = self.date_str
        time_part = self.time_ago
        if date_part:
            return f"{time_part} · {date_part}"
        return time_part


# Default important AI accounts to monitor
# Kategoriler: xAI/Grok, Beta/Leak Avcıları, Teknik Derinlik, Resmi Büyükler,
#              Niche/Open-Source/Indie, Bonus Liderler, Diğer Önemli
DEFAULT_AI_ACCOUNTS = [
    "hrrcnes", "efecim1sn", "XCodeWraith", "merak_makinesi",
    "umutcanbostanci", "demirbulbuloglu", "runthistown5416", "parsluci",
    "ErenAILab", "mentalist_ai", "acerionsjournal", "emrullahai",
    "sarpstar", "AlicanKiraz0", "AIMevzulari", "alphanmanas",
    "AytuncYildizli", "erhanmeydan", "ismailgunaydinn", "GokBoraYlmz",
    "ariferol01", "UfukDegen", "0xemrey", "FlowRiderMM",
    "vibeeval", "onur_a61", "alarax", "yigitakinkaya",
    "Rucknettin", "turkiyeai", "canlandirdik",
    "futuristufuk", "AI4Turkey", "1muhammedavci", "mysancaktutan",
    "bedriozyurt", "devburaq",
]

# AI-related search queries
AI_SEARCH_QUERIES = [
    "(yapay zeka OR AI OR LLM) (yeni OR güncelleme OR duyuru OR çıktı) -is:retweet lang:tr",
    "(GPT OR Claude OR Gemini OR Llama OR Grok OR Mistral) (yeni OR güncelleme OR release) -is:retweet lang:tr",
    "(yapay zeka OR makine öğrenmesi OR derin öğrenme) -is:retweet lang:tr",
    "(AI agent OR AI aracı OR otomasyon) -is:retweet lang:tr",
    "(açık kaynak OR open source) (model OR AI OR LLM) -is:retweet lang:tr",
    "(new model OR new AI OR AI release OR LLM) -is:retweet lang:tr",
    "(GPT OR Claude OR Gemini OR Llama OR Grok OR Mistral) (release OR launch OR update OR new) -is:retweet lang:tr",
    "(AI breakthrough OR AI agent OR AI tool) (new OR release OR launch) -is:retweet lang:tr",
]

# Spam/irrelevant patterns to filter out
SPAM_PATTERNS = [
    r"(?i)(giveaway|airdrop|free money|click here|dm me|follow back)",
    r"(?i)(crypto pump|moon soon|100x|nft mint)",
    r"(?i)(good morning|gm everyone|hello world|hi everyone)",
    r"(?i)(follow me|like and retweet|rt to win)",
    r"(?i)(affordable|cheap|discount|promo code|coupon)",
    r"(?i)(join my|subscribe to my|check my link)",
    # Promotional / corporate fluff
    r"(?i)(thank you for|proud to announce|excited to share|thrilled to|honored to)",
    r"(?i)(we('re| are) hiring|job opening|apply now|join our team|career opportunity)",
    r"(?i)(happy birthday|congratulations|congrats to|shout ?out to)",
    r"(?i)(don'?t miss|register now|sign up today|limited time|early bird|save \d+%)",
    r"(?i)(webinar|workshop|meetup|conference|event|live stream).*?(register|join|sign up|link in bio)",
    r"(?i)(check out our|read our latest|our new blog|new blog post|read more at)",
    # Low-quality engagement bait
    r"(?i)^(agree|disagree|thoughts|this|wow|amazing|incredible|game.?changer)[.!?]?$",
    r"(?i)(retweet if|like if|who else|raise your hand|tag someone)",
    r"(?i)(alpha leak|insider info|you won'?t believe|secret.{0,10}reveal)",
    # English greetings / casual / low-value content
    r"(?i)^(good morning|good night|good evening|hello|hey|hi|gm|gn)\b",  # GM with anything after
    r"(?i)^(gm|gn)\s",  # "GM CT", "GM fam", "GN everyone" etc.
    r"(?i)(how('?s| is) your (day|week|weekend|morning|evening))",  # engagement bait questions
    r"(?i)^(hey|hello|hi|yo)\s+(fam|gang|ct|community|friends|everyone|team|folks)",
    r"(?i)(happy (monday|tuesday|wednesday|thursday|friday|saturday|sunday))",
    r"(?i)(happy new year|happy holidays|merry christmas|happy thanksgiving|happy easter)",
    r"(?i)^(have a (great|good|nice|wonderful) (day|week|weekend|evening|night))\b",
    r"(?i)^(thank you all|thanks everyone|appreciate it|grateful for)\b",
    r"(?i)^(what a (day|week|time|journey|ride))[.!?\s]*$",
    # Personal updates / non-informative
    r"(?i)^(feeling|just woke up|can'?t sleep|so tired|need coffee|coffee time)",
    r"(?i)(my weekend|my vacation|my trip|day off|self care|mental health day)",
    r"(?i)^(lol|lmao|haha|omg|bruh|fr fr|no cap|real talk|ngl)[.!?\s]*$",
    # Vague hype without substance
    r"(?i)^(the future is here|mind blown|this is huge|let that sink in|read that again)[.!?\s]*$",
    r"(?i)^(I love this|love this|so true|facts|100%|exactly|period)[.!?\s]*$",
]

# Non-AI content patterns — these indicate the tweet is NOT about AI tech
# Used to filter out false positives (e.g. "Gemini" zodiac, "Agent" movie, etc.)
NOT_AI_PATTERNS = [
    # Astrology / Zodiac — "Gemini" is both a zodiac sign and Google's AI
    r"(?i)\b(zodiac|horoscope|astrology|natal chart|birth chart|mercury retrograde)\b",
    r"(?i)\b(aries|taurus|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b",
    r"(?i)\b(eclipse|full moon|new moon|lunar|solar return|rising sign|moon sign|sun sign)\b",
    r"(?i)\b(tarot|psychic|spiritual|manifestation|crystals|chakra|numerology)\b",
    # Entertainment / Gaming — "agent", "model", etc. have non-AI meanings
    r"(?i)\b(movie|film|trailer|season \d|episode \d|netflix|disney|marvel|dc comics)\b",
    r"(?i)\b(fortnite|valorant|league of legends|call of duty|xbox|playstation|nintendo)\b",
    r"(?i)\b(fashion model|runway model|modeling agency|photo shoot|vogue|magazine cover)\b",
    # Sports
    r"(?i)\b(nba|nfl|fifa|premier league|champions league|world cup|touchdown|goal scored)\b",
    # Crypto/Finance (not AI-related)
    r"(?i)\b(bitcoin|ethereum|solana|dogecoin|memecoin|defi|nft collection|token launch)\b",
    # Music
    r"(?i)\b(album drop|new single|concert|tour dates|spotify|billboard|grammy)\b",
    # Politics
    r"(?i)\b(election|democrat|republican|congress|senate|parliament|vote for)\b",
]

# AI-relevance keywords — at least one must appear for a tweet to be considered AI-related
AI_RELEVANCE_KEYWORDS = [
    # Core AI terms
    "artificial intelligence", "machine learning", "deep learning", "neural network",
    "large language model", "LLM", "NLP", "natural language",
    # Model names and companies
    "GPT", "GPT-4", "GPT-5", "ChatGPT", "OpenAI", "o1", "o3", "o4",
    "Claude", "Anthropic", "Sonnet", "Opus", "Haiku",
    "Gemini Pro", "Gemini Ultra", "Gemini 2", "Google AI", "DeepMind",
    "Llama", "Llama 3", "Llama 4", "Meta AI",
    "Mistral", "Mixtral", "Qwen", "DeepSeek",
    "Grok", "xAI",
    "Copilot", "GitHub Copilot",
    "Stable Diffusion", "Midjourney", "DALL-E", "Sora", "Runway",
    "Whisper", "Codex",
    # Technical terms
    "transformer", "attention mechanism", "fine-tuning", "fine tuning",
    "RLHF", "reinforcement learning", "inference", "tokenizer",
    "embedding", "vector database", "RAG", "retrieval augmented",
    "prompt engineering", "chain of thought", "CoT",
    "multimodal", "vision language", "text-to-image", "text-to-video",
    "text-to-speech", "speech-to-text",
    "diffusion model", "generative AI", "gen AI", "genAI",
    "foundation model", "frontier model", "AI model",
    "AI agent", "AI agents", "agentic", "tool use", "function calling",
    "AI coding", "AI code", "code generation",
    "AI safety", "AI alignment", "AI regulation",
    "benchmark", "MMLU", "HumanEval", "GPQA", "ARC",
    "open source model", "open-source model", "weights released",
    "SOTA", "state-of-the-art", "state of the art",
    # Tools and platforms
    "Cursor", "Windsurf", "Replit", "v0.dev", "bolt.new",
    "Hugging Face", "HuggingFace", "Ollama", "vLLM", "LangChain", "LlamaIndex",
    "AutoGPT", "CrewAI", "Devin",
    "Perplexity", "NotebookLM", "AI Studio",
    # GitHub/repo terms
    "github.com", "open source", "open-source", "repository", "repo",
    "huggingface.co", "arxiv.org",
    # Industry
    "AI startup", "AI company", "AI lab", "AI chip", "AI infrastructure",
    "GPU", "NVIDIA", "H100", "H200", "B200", "TPU",
    "data center", "compute", "training run",
]

# Minimum content quality thresholds
MIN_TWEET_LENGTH = 50  # Skip very short tweets
MIN_FOLLOWER_COUNT_DISCOVER = 1000  # Min followers for discover results

# Turkish language detection patterns
TURKISH_PATTERNS = [
    r"(?i)\b(yapay zeka|gelişme|güncel|duyuru|önemli|açıklama|teknoloji|haberler)\b",
    r"(?i)\b(arkadaşlar|takipçiler|paylaşım|beğeni|yorum|herkese)\b",
    r"(?i)\b(bugün|yarın|dün|şimdi|artık|çünkü|bunun|şöyle|böyle)\b",
    r"(?i)\b(değil mi|olarak|hakkında|tarafından|başarılı|güzel|harika)\b",
]

# Content summary keyword mapping (English tweet -> Turkish summary)
CONTENT_SUMMARY_MAP = {
    "release": "Yeni sürüm/lansman",
    "launch": "Yeni lansman",
    "new model": "Yeni AI modeli",
    "update": "Güncelleme",
    "upgrade": "Yükseltme",
    "benchmark": "Performans testi",
    "open source": "Açık kaynak",
    "open-source": "Açık kaynak",
    "funding": "Yatırım/fonlama",
    "investment": "Yatırım",
    "billion": "Milyar dolarlık gelişme",
    "acquisition": "Satın alma",
    "partnership": "Ortaklık/işbirliği",
    "API": "API/Platform gelişmesi",
    "pricing": "Fiyatlandırma değişikliği",
    "agent": "AI ajan gelişmesi",
    "autonomous": "Otonom AI sistemi",
    "image": "Görüntü üretimi",
    "video": "Video üretimi",
    "coding": "Kodlama AI'ı",
    "reasoning": "Akıl yürütme",
    "multimodal": "Çoklu modalite",
    "safety": "AI güvenliği",
    "regulation": "AI düzenlemesi",
    "paper": "Araştırma makalesi",
    "research": "Araştırma",
    "GPT": "GPT modeli gelişmesi",
    "Claude": "Claude modeli gelişmesi",
    "Gemini": "Gemini modeli gelişmesi",
    "Llama": "Llama modeli gelişmesi",
    "Qwen": "Qwen modeli gelişmesi",
    "Mistral": "Mistral modeli gelişmesi",
    "data center": "Veri merkezi",
    "chip": "Çip/donanım gelişmesi",
    "GPU": "GPU/donanım gelişmesi",
    "training": "Model eğitimi",
    "inference": "Model çıkarımı",
    "fine-tuning": "İnce ayar",
    "layoff": "İşten çıkarma",
    "hiring": "İşe alım",
    "IPO": "Halka arz",
    "valuation": "Değerleme",
    "robotics": "Robotik",
    "healthcare": "Sağlık AI'ı",
    "education": "Eğitim AI'ı",
    "military": "Askeri AI",
    "infrastructure": "AI altyapısı",
    "cloud": "Bulut bilişim",
    "AWS": "AWS/Amazon gelişmesi",
    "Azure": "Azure/Microsoft gelişmesi",
    "competition": "Rekabet/yarış",
    "github.com": "GitHub repo paylaşımı",
    "repository": "Açık kaynak repo",
    "pip install": "Python paketi",
    "npm install": "NPM paketi",
    "docker": "Docker/konteyner",
    "huggingface.co": "HuggingFace modeli",
    "arxiv.org": "Araştırma makalesi",
    "Cursor": "Cursor IDE gelişmesi",
    "Windsurf": "Windsurf IDE gelişmesi",
    "Copilot": "GitHub Copilot gelişmesi",
    "Devin": "AI kodlama ajanı",
    "MCP": "Model Context Protocol",
    "context window": "Bağlam penceresi güncellemesi",
    "H100": "NVIDIA H100 GPU",
    "H200": "NVIDIA H200 GPU",
    "B200": "NVIDIA B200 GPU",
    "MMLU": "MMLU benchmark sonucu",
    "leaderboard": "Liderlik tablosu",
    "Perplexity": "Perplexity AI gelişmesi",
    "DeepSeek": "DeepSeek modeli gelişmesi",
    "Grok": "Grok modeli gelişmesi",
    "xAI": "xAI gelişmesi",
}


def is_turkish_account(text: str, author_name: str = "") -> bool:
    """Detect if a tweet is likely from a Turkish account"""
    combined = f"{text} {author_name}"
    turkish_char_count = sum(1 for c in combined if c in "çÇşŞğĞüÜöÖıİ")

    # If the text has many Turkish-specific characters, it's likely Turkish
    if turkish_char_count > 3:
        return True

    # Check for Turkish language patterns
    match_count = sum(1 for pattern in TURKISH_PATTERNS if re.search(pattern, text))
    if match_count >= 2:
        return True

    return False


def generate_content_summary(text: str, category: str) -> str:
    """Generate a brief Turkish summary of what the tweet is about"""
    if not text:
        return ""
    text_lower = text.lower()
    summaries = []

    # Check each keyword
    for keyword, summary in CONTENT_SUMMARY_MAP.items():
        if keyword.lower() in text_lower:
            if summary not in summaries:
                summaries.append(summary)

    # Limit to top 2 most relevant summaries
    if summaries:
        return " · ".join(summaries[:2])

    # Fallback to category
    category_summaries = {
        "Yeni Model": "Yeni AI modeli hakkında",
        "Model Güncelleme": "Model güncellemesi",
        "Araştırma": "AI araştırması",
        "Benchmark": "Performans karşılaştırması",
        "Açık Kaynak": "Açık kaynak gelişmesi",
        "GitHub/Repo": "GitHub repo paylaşımı",
        "API/Platform": "Platform/API gelişmesi",
        "AI Ajanlar": "AI ajan gelişmesi",
        "AI Araçlar": "AI araç gelişmesi",
        "Görüntü/Video": "Görsel/video AI gelişmesi",
        "Donanım": "AI donanım gelişmesi",
        "Endüstri": "Endüstri gelişmesi",
        "Genel": "AI gelişmesi",
    }
    return category_summaries.get(category, "AI gelişmesi")


def _safe_int(val) -> int:
    """Safely convert a value to int (twikit sometimes returns strings)."""
    if val is None:
        return 0
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0


# Category keywords for classification
CATEGORY_KEYWORDS = {
    "Yeni Model": ["new model", "release", "launch", "introducing", "announce", "unveiled",
                    "just released", "just launched", "now available"],
    "Model Güncelleme": ["update", "upgrade", "improved", "v2", "v3", "v4", "new version", "patch",
                         "new feature", "changelog"],
    "Araştırma": ["paper", "research", "study", "findings", "arxiv", "published", "preprint"],
    "Benchmark": ["benchmark", "SOTA", "state-of-the-art", "outperforms", "beats", "score",
                   "MMLU", "HumanEval", "leaderboard", "evaluation"],
    "Açık Kaynak": ["open source", "open-source", "huggingface", "weights released",
                     "model weights", "Apache 2.0", "MIT license"],
    "GitHub/Repo": ["github.com", "repository", "repo", "star", "fork", "pull request",
                     "pip install", "npm install", "docker", "readme"],
    "API/Platform": ["API", "platform", "developer", "SDK", "endpoint", "pricing",
                     "rate limit", "context window", "token limit"],
    "AI Ajanlar": ["agent", "agentic", "autonomous", "tool use", "function calling",
                    "MCP", "computer use", "browser use"],
    "AI Araçlar": ["AI tool", "AI app", "Cursor", "Windsurf", "Copilot", "Replit",
                    "v0.dev", "bolt.new", "Devin", "IDE", "code editor"],
    "Görüntü/Video": ["image", "video", "diffusion", "generation", "Sora", "DALL-E",
                       "Midjourney", "Stable Diffusion", "Flux", "text-to-image", "text-to-video"],
    "Donanım": ["GPU", "TPU", "H100", "H200", "B200", "chip", "NVIDIA", "data center",
                 "inference chip", "AI chip", "compute"],
    "Endüstri": ["acquisition", "funding", "partnership", "billion", "valuation", "IPO",
                  "Series A", "Series B", "raised", "investment"],
}


def is_spam(text: str) -> bool:
    """Check if a tweet is likely spam or irrelevant"""
    if not text:
        return True
    # Too short to be meaningful AI content
    if len(text.strip()) < MIN_TWEET_LENGTH:
        return True

    # Pattern-based filtering
    for pattern in SPAM_PATTERNS:
        if re.search(pattern, text):
            return True

    # Link-only tweets (just a URL with minimal text)
    text_no_urls = re.sub(r'https?://\S+', '', text).strip()
    if len(text_no_urls) < 30:
        return True

    return False


def is_ai_relevant(text: str) -> bool:
    """Check if a tweet is actually about AI/tech, not zodiac/gaming/etc."""
    text_lower = text.lower()

    # First: check if it matches any NOT-AI pattern (strong negative signal)
    not_ai_score = 0
    for pattern in NOT_AI_PATTERNS:
        matches = re.findall(pattern, text)
        not_ai_score += len(matches)

    # If 2+ non-AI matches, very likely not about AI
    if not_ai_score >= 2:
        return False

    # Second: check if at least one AI keyword exists
    for kw in AI_RELEVANCE_KEYWORDS:
        if kw.lower() in text_lower:
            return True

    # Third: check for AI-related URLs
    if "github.com" in text_lower or "huggingface.co" in text_lower or "arxiv.org" in text_lower:
        return True

    # If 1 non-AI match and no AI keywords, reject
    if not_ai_score >= 1:
        return False

    # No AI keywords found at all — not relevant
    return False


# Top AI keywords for quick relevance check (subset for performance)
_QUICK_AI_KEYWORDS = frozenset(kw.lower() for kw in AI_RELEVANCE_KEYWORDS[:50])


def is_low_quality_discovery(text: str) -> bool:
    """Check if a tweet is too low-quality for the discovery feed.

    Softer than is_spam()+is_ai_relevant() — designed for monitored accounts
    which are semi-trusted. Catches obvious junk (greetings, casual chat)
    while allowing short but AI-relevant tweets through.
    """
    if not text:
        return True

    # Definite spam → reject (checks patterns regardless of length)
    if is_spam(text):
        return True

    # Strip URLs and check remaining text length
    text_no_urls = re.sub(r"https?://\S+", "", text).strip()

    # Very short tweet with no AI keyword → likely casual
    if len(text_no_urls) < 60:
        text_lower = text.lower()
        # Allow if it contains an AI keyword
        if any(kw in text_lower for kw in _QUICK_AI_KEYWORDS):
            return False
        # Allow if it has an AI-related URL
        if "github.com" in text_lower or "huggingface.co" in text_lower or "arxiv.org" in text_lower:
            return False
        return True

    # Even for long tweets, check greeting/casual patterns specifically
    # (is_spam already handles most, but this catches edge cases)
    text_no_urls_lower = text_no_urls.lower().strip()
    greeting_patterns = [
        r"(?i)^(gm|gn)\s",
        r"(?i)^(good morning|good night|good evening)\b",
        r"(?i)(how('?s| is) your (day|week|weekend|morning))",
    ]
    for pat in greeting_patterns:
        if re.search(pat, text_no_urls_lower):
            # But allow if it also contains AI keywords
            if any(kw in text_no_urls_lower for kw in _QUICK_AI_KEYWORDS):
                return False
            return True

    return False


def categorize_topic(text: str) -> str:
    """Categorize a tweet into an AI topic category"""
    if not text:
        return "general"
    text_lower = text.lower()
    best_category = "Genel"
    best_score = 0

    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in text_lower)
        if score > best_score:
            best_score = score
            best_category = category

    return best_category


# Pre-computed lowercase set for fast membership checks
_DEFAULT_AI_ACCOUNTS_LOWER = frozenset(a.lower() for a in DEFAULT_AI_ACCOUNTS)


def calculate_relevance(topic: AITopic, time_range_hours: int) -> float:
    """Calculate relevance score based on engagement, recency, and content"""
    # Engagement component (0-40 points) — adjusted for X algorithm weights
    engagement = min(40, (topic.engagement_score / 1000) * 40)

    # Recency component (0-30 points)
    now = datetime.datetime.now(datetime.timezone.utc)
    hours_old = (now - topic.created_at).total_seconds() / 3600
    recency = max(0, 30 * (1 - hours_old / time_range_hours))

    # Content quality component (0-30 points)
    text = topic.text
    quality = 0
    if len(text) > 100:
        quality += 10
    if any(kw in text.lower() for cat_kws in CATEGORY_KEYWORDS.values() for kw in cat_kws):
        quality += 10
    if "http" in text or "pic.twitter" in text:
        quality += 5
    if topic.author_username.lower() in _DEFAULT_AI_ACCOUNTS_LOWER:
        quality += 5

    return engagement + recency + quality


class TwitterScanner:
    """Main scanner class for finding AI topics on X/Twitter"""

    def __init__(self, bearer_token: str = None, api_key: str = None,
                 api_secret: str = None, access_token: str = None,
                 access_secret: str = None,
                 twikit_username: str = None, twikit_password: str = None,
                 twikit_email: str = None):
        self.bearer_token = bearer_token
        self.api_key = api_key
        self.api_secret = api_secret
        self.access_token = access_token
        self.access_secret = access_secret
        self.client = None
        self.twikit_client = None
        self.use_twikit = False
        self.twikit_error = ""
        self.search_errors = []
        self._init_twikit(twikit_username, twikit_password, twikit_email)
        self._init_client()

    def _init_twikit(self, username: str = None, password: str = None,
                     email: str = None):
        """Initialize Twikit client for free Twitter search"""
        try:
            from backend.modules.twikit_client import TwikitSearchClient, COOKIES_PATH

            # Check if cookies exist in secrets.toml
            has_secret_cookies = False
            try:
                from backend.modules._compat import get_secret
                has_secret_cookies = (
                    bool(get_secret("twikit_auth_token", ""))
                    and bool(get_secret("twikit_ct0", ""))
                )
            except Exception:
                pass

            if username and password:
                self.twikit_client = TwikitSearchClient(username, password, email or "")
                if self.twikit_client.authenticate():
                    self.use_twikit = True
            elif has_secret_cookies or COOKIES_PATH.exists():
                # Cookies in secrets.toml or on disk — no username/password needed
                self.twikit_client = TwikitSearchClient()
                if self.twikit_client.authenticate():
                    self.use_twikit = True

            # Store last error for display
            if self.twikit_client and not self.use_twikit:
                self.twikit_error = self.twikit_client.last_error
            else:
                self.twikit_error = ""

            # Log authentication result for debugging
            if self.use_twikit:
                src = getattr(self.twikit_client, '_cookie_source', 'unknown')
                print(f"TwitterScanner: Twikit aktif (kaynak: {src})")
            elif self.twikit_client:
                print(f"TwitterScanner: Twikit başarısız: {self.twikit_error}")
        except ImportError:
            self.twikit_error = "twikit paketi kurulu değil"
        except Exception as e:
            self.twikit_error = f"Twikit başlatma hatası: {e}"

    def _dict_to_topic(self, d: dict) -> AITopic:
        """Convert a twikit result dict to an AITopic object"""
        return AITopic(
            id=d['id'],
            text=d['text'],
            author_name=d['author_name'],
            author_username=d['author_username'],
            author_profile_image=d.get('author_profile_image', ''),
            created_at=d['created_at'],
            like_count=_safe_int(d.get('like_count', 0)),
            retweet_count=_safe_int(d.get('retweet_count', 0)),
            reply_count=_safe_int(d.get('reply_count', 0)),
            impression_count=_safe_int(d.get('impression_count', 0)),
            url=f"https://x.com/{d['author_username']}/status/{d['id']}",
            media_urls=d.get('media_urls', []),
            author_followers_count=_safe_int(d.get('author_followers_count', 0)),
        )

    def _init_client(self):
        """Initialize Twitter API client"""
        if self.bearer_token:
            self.client = tweepy.Client(
                bearer_token=self.bearer_token,
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_secret,
                wait_on_rate_limit=True
            )

    def scan_ai_topics(self, time_range_hours: int = 24,
                       max_results_per_query: int = 20,
                       custom_accounts: list = None,
                       custom_queries: list = None) -> list[AITopic]:
        """
        Scan X for AI-related topics and developments

        Args:
            time_range_hours: How far back to search (6, 12, or 24 hours)
            max_results_per_query: Max tweets per search query
            custom_accounts: Additional accounts to monitor
            custom_queries: Additional search queries

        Returns:
            List of AITopic objects sorted by relevance
        """
        if not self.client and not self.use_twikit:
            raise ValueError("Twitter API client not initialized. Check your API keys or Twikit credentials.")

        all_topics = []
        seen_ids = set()
        self.search_errors = []  # Track errors for UI display

        start_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=time_range_hours)

        # Search queries
        queries = AI_SEARCH_QUERIES.copy()
        if custom_queries:
            queries.extend(custom_queries)

        import time as _time

        # Search by queries (with delay between requests)
        for i, query in enumerate(queries):
            try:
                topics = self._search_tweets(query, start_time, max_results_per_query)
                for topic in topics:
                    if topic.id not in seen_ids:
                        seen_ids.add(topic.id)
                        all_topics.append(topic)
                # Delay between search queries to avoid rate limits
                if i < len(queries) - 1:
                    _time.sleep(0.5)
            except Exception as e:
                self.search_errors.append(f"Sorgu hatası: {e}")
                continue

        # Search by monitored accounts (with rate limit protection)
        accounts = list(DEFAULT_AI_ACCOUNTS)
        if custom_accounts:
            accounts.extend(custom_accounts)

        rate_limited = False
        for i, account in enumerate(accounts):
            # If rate limited, stop querying more accounts
            if rate_limited:
                break
            try:
                topics = self._get_user_tweets(account, start_time, 3)
                for topic in topics:
                    if topic.id not in seen_ids:
                        seen_ids.add(topic.id)
                        all_topics.append(topic)
                # Check if twikit hit rate limit
                if self.use_twikit and self.twikit_client:
                    last_err = self.twikit_client.last_error or ""
                    if "Rate limit" in last_err or "429" in last_err:
                        rate_limited = True
                        break
                # Delay between account requests (1s every 5 accounts)
                if (i + 1) % 5 == 0:
                    _time.sleep(1.0)
                elif i < len(accounts) - 1:
                    _time.sleep(0.3)
            except Exception as e:
                self.search_errors.append(f"Hesap hatası (@{account}): {e}")
                continue

        # Filter spam, low-follower accounts and calculate relevance
        filtered_topics = []
        for topic in all_topics:
            if is_spam(topic.text):
                continue
            topic.category = categorize_topic(topic.text)
            topic.relevance_score = calculate_relevance(topic, time_range_hours)
            topic.content_summary = generate_content_summary(topic.text, topic.category)
            filtered_topics.append(topic)

        # Sort by relevance score
        filtered_topics.sort(key=lambda t: t.relevance_score, reverse=True)

        return filtered_topics

    def _search_tweets(self, query: str, start_time: datetime.datetime,
                       max_results: int) -> list[AITopic]:
        """Search tweets using Twikit (primary) or Twitter API v2 (fallback)"""
        # Try Twikit first (free, no API cost)
        # Skip if Twikit search already failed with 403 in this scan session
        if self.use_twikit and self.twikit_client and not getattr(self, '_twikit_search_disabled', False):
            try:
                since_date = start_time.strftime("%Y-%m-%d")
                results = self.twikit_client.search_tweets(
                    query, count=max_results, since_date=since_date
                )
                if not results and self.twikit_client.last_error:
                    err = self.twikit_client.last_error
                    # Only add unique errors (avoid flooding with same message)
                    if err not in self.search_errors:
                        self.search_errors.append(err)
                    # If 403/404/Forbidden/NotFound, disable Twikit for remaining queries
                    if ("403" in err or "404" in err or "reddedildi" in err.lower()
                            or "NotFound" in err):
                        self._twikit_search_disabled = True
                topics = []
                for d in results:
                    if d.get('created_at') and d['created_at'] >= start_time:
                        topics.append(self._dict_to_topic(d))
                return topics
            except Exception as e:
                err_msg = f"Twikit arama hatası: {type(e).__name__}: {e}"
                if err_msg not in self.search_errors:
                    self.search_errors.append(err_msg)
                # Disable Twikit SEARCH on 403/404 (user_tweets uses different endpoint, keep working)
                err_str = str(e)
                if "403" in err_str or "404" in err_str or "Forbidden" in type(e).__name__ or "NotFound" in type(e).__name__:
                    self._twikit_search_disabled = True

        # Fallback: Twitter API v2
        if not self.client:
            return []

        topics = []

        try:
            response = self.client.search_recent_tweets(
                query=query,
                start_time=start_time,
                max_results=min(max_results, 100),
                tweet_fields=["created_at", "public_metrics", "author_id", "entities", "note_tweet"],
                user_fields=["name", "username", "profile_image_url"],
                media_fields=["url", "preview_image_url"],
                expansions=["author_id", "attachments.media_keys"]
            )

            if not response.data:
                return topics

            # Build user lookup
            users = {}
            if response.includes and "users" in response.includes:
                for user in response.includes["users"]:
                    users[user.id] = user

            # Build media lookup
            media = {}
            if response.includes and "media" in response.includes:
                for m in response.includes["media"]:
                    media[m.media_key] = m

            for tweet in response.data:
                author = users.get(tweet.author_id)
                if not author:
                    continue

                # Get media URLs
                media_urls = []
                if tweet.data.get("attachments", {}).get("media_keys"):
                    for mk in tweet.data["attachments"]["media_keys"]:
                        if mk in media:
                            m = media[mk]
                            url = getattr(m, 'url', None) or getattr(m, 'preview_image_url', None)
                            if url:
                                media_urls.append(url)

                metrics = tweet.public_metrics or {}

                topic = AITopic(
                    id=str(tweet.id),
                    text=_get_full_text(tweet),
                    author_name=author.name,
                    author_username=author.username,
                    author_profile_image=getattr(author, 'profile_image_url', ''),
                    created_at=tweet.created_at,
                    like_count=metrics.get("like_count", 0),
                    retweet_count=metrics.get("retweet_count", 0),
                    reply_count=metrics.get("reply_count", 0),
                    impression_count=metrics.get("impression_count", 0),
                    url=f"https://x.com/{author.username}/status/{tweet.id}",
                    media_urls=media_urls,
                )
                topics.append(topic)

        except tweepy.TooManyRequests:
            print("Rate limit reached, waiting...")
        except Exception as e:
            print(f"Search error: {e}")

        return topics

    def _get_user_tweets(self, username: str, start_time: datetime.datetime,
                         max_results: int) -> list[AITopic]:
        """Get recent tweets using Twikit (primary) or Twitter API v2 (fallback)"""
        # Try Twikit first (free, no API cost)
        if self.use_twikit and self.twikit_client:
            try:
                results = self.twikit_client.get_user_tweets(username, count=max_results)
                if not results and self.twikit_client.last_error:
                    err = self.twikit_client.last_error
                    if err not in self.search_errors:
                        self.search_errors.append(err)
                topics = []
                for d in results:
                    if d.get('created_at') and d['created_at'] >= start_time:
                        topics.append(self._dict_to_topic(d))
                return topics
            except Exception as e:
                err_msg = f"Twikit kullanıcı tweet hatası (@{username}): {e}"
                if err_msg not in self.search_errors:
                    self.search_errors.append(err_msg)

        # Fallback: Twitter API v2
        if not self.client:
            return []

        topics = []

        try:
            # Get user ID first
            user = self.client.get_user(username=username,
                                        user_fields=["profile_image_url"])
            if not user.data:
                return topics

            user_data = user.data

            response = self.client.get_users_tweets(
                id=user_data.id,
                start_time=start_time,
                max_results=min(max_results, 100),
                tweet_fields=["created_at", "public_metrics", "entities", "note_tweet"],
                exclude=["retweets", "replies"]
            )

            if not response.data:
                return topics

            for tweet in response.data:
                metrics = tweet.public_metrics or {}

                topic = AITopic(
                    id=str(tweet.id),
                    text=_get_full_text(tweet),
                    author_name=user_data.name,
                    author_username=user_data.username,
                    author_profile_image=getattr(user_data, 'profile_image_url', ''),
                    created_at=tweet.created_at,
                    like_count=metrics.get("like_count", 0),
                    retweet_count=metrics.get("retweet_count", 0),
                    reply_count=metrics.get("reply_count", 0),
                    impression_count=metrics.get("impression_count", 0),
                    url=f"https://x.com/{user_data.username}/status/{tweet.id}",
                )
                topics.append(topic)

        except Exception as e:
            print(f"User tweets error ({username}): {e}")

        return topics

    def _get_tweet_by_id_twikit(self, tweet_id: str) -> AITopic | None:
        """Fetch tweet by ID using twikit (free, cookie-based)."""
        if not self.twikit_client or not self.use_twikit:
            return None
        try:
            data = self.twikit_client.get_tweet_by_id(tweet_id)
            if data:
                return self._dict_to_topic(data)
        except Exception as e:
            print(f"Twikit get_tweet_by_id error: {e}")
        return None

    def get_tweet_by_id(self, tweet_id: str) -> AITopic | None:
        """Fetch a specific tweet by its ID. Uses bearer token if available, else twikit."""
        # Method 1: Tweepy (bearer token)
        if self.client:
            try:
                response = self.client.get_tweet(
                    id=tweet_id,
                    tweet_fields=["created_at", "public_metrics", "author_id", "conversation_id", "note_tweet"],
                    user_fields=["name", "username", "profile_image_url"],
                    expansions=["author_id"]
                )

                if response.data:
                    tweet = response.data
                    users = {}
                    if response.includes and "users" in response.includes:
                        for user in response.includes["users"]:
                            users[user.id] = user

                    author = users.get(tweet.author_id)
                    metrics = tweet.public_metrics or {}

                    return AITopic(
                        id=str(tweet.id),
                        text=_get_full_text(tweet),
                        author_name=author.name if author else "Unknown",
                        author_username=author.username if author else "unknown",
                        author_profile_image=getattr(author, 'profile_image_url', '') if author else '',
                        created_at=tweet.created_at,
                        like_count=metrics.get("like_count", 0),
                        retweet_count=metrics.get("retweet_count", 0),
                        reply_count=metrics.get("reply_count", 0),
                        impression_count=metrics.get("impression_count", 0),
                        url=f"https://x.com/{author.username if author else 'unknown'}/status/{tweet.id}",
                    )
            except Exception as e:
                print(f"Tweepy get_tweet_by_id error: {e}")

        # Method 2: Twikit fallback (free)
        return self._get_tweet_by_id_twikit(tweet_id)

    def get_thread(self, tweet_id: str) -> list[str]:
        """
        Fetch the full thread for a given tweet.
        Returns list of tweet texts in order (oldest first).
        Uses bearer token if available, else twikit.
        """
        # Method 1: Tweepy (bearer token)
        if self.client:
            try:
                response = self.client.get_tweet(
                    id=tweet_id,
                    tweet_fields=["conversation_id", "author_id", "created_at", "note_tweet"],
                    expansions=["author_id"]
                )
                if response.data:
                    tweet = response.data
                    conversation_id = tweet.data.get("conversation_id", tweet_id)
                    author_id = tweet.author_id

                    query = f"conversation_id:{conversation_id} from:{author_id} -is:retweet"
                    search_response = self.client.search_recent_tweets(
                        query=query,
                        max_results=100,
                        tweet_fields=["created_at", "in_reply_to_user_id", "note_tweet"],
                        sort_order="recency"
                    )

                    if not search_response.data:
                        return [_get_full_text(tweet)]

                    thread_tweets = sorted(search_response.data, key=lambda t: t.created_at)
                    texts = [_get_full_text(t) for t in thread_tweets]

                    original_ids = {str(t.id) for t in thread_tweets}
                    if str(tweet_id) not in original_ids and str(conversation_id) not in original_ids:
                        texts.insert(0, _get_full_text(tweet))

                    return texts
            except Exception as e:
                print(f"Tweepy get_thread error: {e}")

        # Method 2: Twikit fallback — fetch full thread via twikit
        if self.twikit_client and self.use_twikit:
            try:
                thread_data = self.twikit_client.get_thread(tweet_id)
                if thread_data and len(thread_data) > 0:
                    texts = [t.get('text', '') for t in thread_data if t.get('text')]
                    if texts:
                        return texts
            except Exception as e:
                print(f"Twikit get_thread error: {e}")

        # Method 3: Last resort — single tweet
        twikit_result = self._get_tweet_by_id_twikit(tweet_id)
        if twikit_result:
            return [twikit_result.text]

        return []
