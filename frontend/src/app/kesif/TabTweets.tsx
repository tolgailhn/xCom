"use client";

import { useState, useEffect } from "react";
import {
  researchTopicStream,
  generateQuoteTweet,
  findMedia,
  generateInfographic,
  addDraft,
  extractTweet,
  getStyles,
  summarizeDiscoveryTweets,
  getDiscoveryTweets,
  markTweetShared,
  unmarkTweetShared,
  getSharedTweets,
  aiScoreDiscoveryTweets,
  type DiscoveryTweet,
  type DiscoveryStatus,
  type TweetMediaItem,
  type TweetUrl,
} from "@/lib/api";

/* ── Helpers ─────────────────────────────────────────── */

function timeAgo(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}sn`;
    if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
    return `${Math.floor(diff / 86400)}g`;
  } catch {
    return "";
  }
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    const today = formatDateStr(new Date());
    const yesterday = formatDateStr(new Date(Date.now() - 86400000));
    if (dateStr === today) return "Bugun";
    if (dateStr === yesterday) return "Dun";
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
  } catch {
    return dateStr;
  }
}

const GM_FILTER_REGEX = /^(GM|GN|Good\s*morning|Good\s*night)\b/i;
const GM_FILTER_REGEX2 = /how\s+is\s+your\s+(week|day)/i;

function isLowQualityTweet(text: string): boolean {
  return GM_FILTER_REGEX.test(text.trim()) || GM_FILTER_REGEX2.test(text);
}

function getImportanceColor(importance: string): string {
  switch (importance) {
    case "yuksek": return "var(--accent-green)";
    case "orta": return "var(--accent-amber)";
    default: return "var(--text-secondary)";
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "var(--accent-green)";
  if (score >= 50) return "var(--accent-amber)";
  if (score >= 20) return "var(--accent-blue)";
  return "var(--text-secondary)";
}

const importanceBadge: Record<string, { label: string; cls: string }> = {
  yuksek: { label: "Yuksek", cls: "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/30" },
  orta: { label: "Orta", cls: "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/30" },
  dusuk: { label: "Dusuk", cls: "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)] border-[var(--text-secondary)]/30" },
};

interface StyleOption {
  id: string;
  name: string;
  desc: string;
}

interface FormatOption {
  id: string;
  name: string;
  desc: string;
}

interface ExtractedMedia {
  media_items: TweetMediaItem[];
  urls: TweetUrl[];
  thread_urls: TweetUrl[];
  thread_media: TweetMediaItem[];
}

/* ── Props ───────────────────────────────────────────── */

interface TabTweetsProps {
  tweets: DiscoveryTweet[];
  setTweets: React.Dispatch<React.SetStateAction<DiscoveryTweet[]>>;
  status: DiscoveryStatus | null;
}

/* ── Main ────────────────────────────────────────────── */

export default function TabTweets({ tweets, setTweets }: TabTweetsProps) {
  // Expanded states
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [activeResearch, setActiveResearch] = useState<string | null>(null);
  const [activeGenerate, setActiveGenerate] = useState<string | null>(null);

  // Per-tweet research & generation state
  const [researchData, setResearchData] = useState<Record<string, { summary: string; key_points: string[]; sources: { title: string; url?: string }[]; progress: string }>>({});
  const [generatedTexts, setGeneratedTexts] = useState<Record<string, { text: string; score: number }>>({});
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // Per-tweet extracted media
  const [extractedMedia, setExtractedMedia] = useState<Record<string, ExtractedMedia>>({});

  // Style & length per tweet
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Media
  const [mediaResults, setMediaResults] = useState<Record<string, Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; media_type?: string; type?: string; source?: string; author?: string }>>>({});
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);

  // Infographic
  const [infographicData, setInfographicData] = useState<Record<string, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<string | null>(null);

  // Filter
  const [filterAccount, setFilterAccount] = useState("");
  const [filterImportance, setFilterImportance] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(formatDateStr(new Date()));
  const [hideGM, setHideGM] = useState(true);

  // Accordion: hesap bazli gruplama
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [groupByAccount, setGroupByAccount] = useState(true);

  // Shared tweet tracking
  const [sharedTweetIds, setSharedTweetIds] = useState<Set<string>>(new Set());
  const [hideShared, setHideShared] = useState(false);

  // AI Scoring
  const [aiScoring, setAiScoring] = useState(false);
  const [aiScoredCount, setAiScoredCount] = useState(0);
  const [sortBy, setSortBy] = useState<"default" | "ai">("default");

  // TR Ceviri
  const [summarizing, setSummarizing] = useState(false);
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [translatingAll, setTranslatingAll] = useState(false);

  // Arka planda Turkce ceviri uret
  useEffect(() => {
    if (tweets.length === 0 || summarizing) return;
    const needsTranslation = tweets.filter(t => {
      const s = t.summary_tr || "";
      if (!s) return true;
      const textClean = t.text.replace(/https?:\/\/\S+/g, "[link]").trim();
      const sClean = s.replace(/https?:\/\/\S+/g, "[link]").trim();
      return sClean === textClean.slice(0, sClean.length) || s === t.text.slice(0, 200);
    });
    if (needsTranslation.length === 0) return;
    setSummarizing(true);
    const ids = needsTranslation.map(t => t.tweet_id);
    summarizeDiscoveryTweets(ids, true)
      .then(res => {
        if (res.updated > 0) {
          getDiscoveryTweets().then(r => setTweets(r.tweets)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setSummarizing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweets.length]);

  // Fetch styles & formats
  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => {
        setStyles(r.styles);
        setFormats(r.formats);
      })
      .catch(() => {});
  }, []);

  // Load shared tweets on mount
  useEffect(() => {
    getSharedTweets()
      .then(data => setSharedTweetIds(new Set(data.tweet_ids || [])))
      .catch(() => {});
  }, []);

  // Trigger AI scoring in background (non-blocking)
  useEffect(() => {
    aiScoreDiscoveryTweets()
      .then(res => setAiScoredCount(res.scored || 0))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Handlers ──────────────────────────────────────── */

  const handleResearch = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setResearchingId(id);
    setActiveResearch(id);
    setResearchData(prev => ({ ...prev, [id]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." } }));

    try {
      let fullText = tweet.text;
      try {
        const extracted = await extractTweet(tweet.tweet_url);
        if (extracted?.full_thread_text) {
          fullText = extracted.full_thread_text;
        } else if (extracted?.text) {
          fullText = extracted.text;
        }
        // Capture media and URLs from extracted tweet
        const mediaItems: TweetMediaItem[] = extracted?.media_items || [];
        const urls: TweetUrl[] = extracted?.urls || [];
        const threadUrls: TweetUrl[] = extracted?.thread_urls || [];
        const threadMedia: TweetMediaItem[] = extracted?.thread_media || [];
        if (mediaItems.length > 0 || urls.length > 0 || threadUrls.length > 0 || threadMedia.length > 0) {
          setExtractedMedia(prev => ({ ...prev, [id]: { media_items: mediaItems, urls, thread_urls: threadUrls, thread_media: threadMedia } }));
        }
      } catch {
        // extract basarisiz olursa orijinal text kullan
      }

      const result = await researchTopicStream(
        { topic: fullText, engine: "default", tweet_id: tweet.tweet_id, tweet_author: tweet.account },
        (progress) => {
          setResearchData(prev => ({
            ...prev,
            [id]: { ...prev[id], progress },
          }));
        },
      );
      setResearchData(prev => ({
        ...prev,
        [id]: {
          summary: result.summary,
          key_points: result.key_points,
          sources: result.sources,
          progress: "",
        },
      }));
    } catch (e) {
      setResearchData(prev => ({
        ...prev,
        [id]: { ...prev[id], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` },
      }));
    } finally {
      setResearchingId(null);
    }
  };

  const handleGenerate = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setGeneratingId(id);
    setActiveGenerate(id);

    try {
      const research = researchData[id];
      const researchSummary = research
        ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}`
        : "";

      const result = await generateQuoteTweet({
        original_tweet: tweet.text,
        original_author: tweet.account,
        style: tweetStyle,
        research_summary: researchSummary,
        length_preference: tweetLength,
        provider: provider || undefined,
      });

      setGeneratedTexts(prev => ({
        ...prev,
        [id]: { text: result.text, score: result.score?.overall || 0 },
      }));
    } catch (e) {
      setGeneratedTexts(prev => ({
        ...prev,
        [id]: { text: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`, score: 0 },
      }));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleFindMedia = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setMediaLoading(id);
    try {
      const result = await findMedia(tweet.text.slice(0, 100), "both");
      setMediaResults(prev => ({ ...prev, [id]: result.results || [] }));
    } catch {
      // ignore
    } finally {
      setMediaLoading(null);
    }
  };

  const handleTranslate = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setTranslatingIds(prev => new Set(prev).add(id));
    try {
      const res = await summarizeDiscoveryTweets([id], true);
      if (res.updated > 0) {
        const r = await getDiscoveryTweets();
        setTweets(r.tweets);
      }
    } catch { /* ignore */ }
    setTranslatingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleInfographic = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setInfographicLoading(id);
    try {
      const research = researchData[id];
      const result = await generateInfographic({
        topic: tweet.text.slice(0, 200),
        research_summary: research?.summary || "",
        key_points: research?.key_points || [],
      });
      if (result.success) {
        setInfographicData(prev => ({ ...prev, [id]: { image: result.image_base64, format: result.image_format } }));
      }
    } catch {
      // ignore
    } finally {
      setInfographicLoading(null);
    }
  };

  const openInX = (text: string) => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const openQuoteInX = (tweetUrl: string) => {
    window.open(tweetUrl, "_blank");
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleThread = (id: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleToggleShared = async (tweetId: string) => {
    const isShared = sharedTweetIds.has(tweetId);
    try {
      if (isShared) {
        const result = await unmarkTweetShared(tweetId);
        setSharedTweetIds(new Set(result.shared_tweets || []));
      } else {
        const result = await markTweetShared(tweetId);
        setSharedTweetIds(new Set(result.shared_tweets || []));
      }
    } catch { /* ignore */ }
  };

  /* ── Computed ──────────────────────────────────────── */

  const todayStr = formatDateStr(new Date());
  const minDateStr = formatDateStr(new Date(Date.now() - 7 * 86400000));

  const goToDate = (offset: number) => {
    if (selectedDate === "all") {
      setSelectedDate(todayStr);
      return;
    }
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    const newDate = formatDateStr(d);
    if (newDate > todayStr || newDate < minDateStr) return;
    setSelectedDate(newDate);
  };

  const goToToday = () => setSelectedDate(todayStr);

  const tweetCountByDate: Record<string, number> = {};
  for (const t of tweets) {
    try {
      const ds = formatDateStr(new Date(t.created_at));
      tweetCountByDate[ds] = (tweetCountByDate[ds] || 0) + 1;
    } catch { /* skip */ }
  }

  const filteredTweets = tweets.filter(t => {
    if (filterAccount && t.account.toLowerCase() !== filterAccount.toLowerCase()) return false;
    if (filterImportance && t.importance !== filterImportance) return false;
    if (hideShared && sharedTweetIds.has(t.tweet_id)) return false;
    if (hideGM && isLowQualityTweet(t.text)) return false;
    if (selectedDate !== "all") {
      try {
        const tweetDate = new Date(t.created_at);
        const tweetDateStr = formatDateStr(tweetDate);
        if (tweetDateStr !== selectedDate) return false;
      } catch { /* keep */ }
    }
    return true;
  });

  // Apply sorting
  if (sortBy === "ai") {
    filteredTweets.sort((a, b) => (b.ai_relevance_score || 0) - (a.ai_relevance_score || 0));
  }

  const uniqueAccounts = [...new Set(tweets.map(t => t.account))].sort();

  /* ── Render ────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Date Navigation Bar */}
      <div className="backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => goToDate(-1)}
            disabled={selectedDate === "all" || selectedDate <= minDateStr}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-all duration-300 disabled:opacity-30"
          >
            &larr; Onceki Gun
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${selectedDate === "all" ? "bg-[var(--accent-blue)] text-white shadow-md shadow-[var(--accent-blue)]/20" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              Tumunu ({tweets.length})
            </button>
            <button
              onClick={goToToday}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${selectedDate === todayStr ? "bg-[var(--accent-blue)] text-white shadow-md shadow-[var(--accent-blue)]/20" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              Bugun
            </button>
            {selectedDate !== "all" && (
              <span className="text-xs font-semibold">
                {formatDateLabel(selectedDate)} &middot; {selectedDate}
                {tweetCountByDate[selectedDate] != null && (
                  <span className="ml-1 text-[var(--text-secondary)]">({tweetCountByDate[selectedDate]})</span>
                )}
              </span>
            )}
          </div>
          <button
            onClick={() => goToDate(1)}
            disabled={selectedDate === "all" || selectedDate >= todayStr}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-all duration-300 disabled:opacity-30"
          >
            Sonraki Gun &rarr;
          </button>
        </div>
      </div>

      {/* Filter Bar - Pill Style */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterAccount}
          onChange={e => setFilterAccount(e.target.value)}
          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-full px-3 py-1.5 text-xs backdrop-blur-sm focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all"
        >
          <option value="">Tum Hesaplar</option>
          {uniqueAccounts.map(a => (
            <option key={a} value={a}>@{a}</option>
          ))}
        </select>
        <select
          value={filterImportance}
          onChange={e => setFilterImportance(e.target.value)}
          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-full px-3 py-1.5 text-xs backdrop-blur-sm focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all"
        >
          <option value="">Tum Onem</option>
          <option value="yuksek">Yuksek</option>
          <option value="orta">Orta</option>
          <option value="dusuk">Dusuk</option>
        </select>
        <button
          onClick={() => setGroupByAccount(!groupByAccount)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border ${groupByAccount ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 shadow-sm shadow-[var(--accent-blue)]/10" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50"}`}
        >
          {groupByAccount ? "Hesap Grubu: Acik" : "Hesap Grubu: Kapali"}
        </button>
        <button
          onClick={async () => {
            setTranslatingAll(true);
            try {
              const ids = filteredTweets.map(t => t.tweet_id);
              const res = await summarizeDiscoveryTweets(ids, true);
              if (res.updated > 0) {
                const r = await getDiscoveryTweets();
                setTweets(r.tweets);
              }
            } catch { /* ignore */ }
            setTranslatingAll(false);
          }}
          disabled={translatingAll || summarizing || filteredTweets.length === 0}
          className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/30 transition-all duration-300 disabled:opacity-50"
        >
          {translatingAll ? "Cevriliyor..." : `Tumunu Cevir (${filteredTweets.length})`}
        </button>
        <button
          onClick={() => setHideShared(!hideShared)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${
            hideShared
              ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/30 shadow-sm shadow-[var(--accent-green)]/10"
              : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50 hover:border-[var(--accent-green)]/50"
          }`}
        >
          {hideShared ? "Paylasilanlari Gizle \u2713" : "Paylasilanlari Gizle"}
          {sharedTweetIds.size > 0 && ` (${sharedTweetIds.size})`}
        </button>
        <button
          onClick={() => setHideGM(!hideGM)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${
            hideGM
              ? "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30 shadow-sm shadow-[var(--accent-purple)]/10"
              : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50 hover:border-[var(--accent-purple)]/50"
          }`}
        >
          {hideGM ? "GM/GN Gizle \u2713" : "GM/GN Goster"}
        </button>
        <button
          onClick={async () => {
            setAiScoring(true);
            try {
              const res = await aiScoreDiscoveryTweets();
              setAiScoredCount(res.scored || 0);
              // Reload tweets to get updated scores
              const r = await getDiscoveryTweets();
              setTweets(r.tweets);
            } catch { /* ignore */ }
            setAiScoring(false);
          }}
          disabled={aiScoring}
          className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/30 disabled:opacity-50"
        >
          {aiScoring ? "Skorlaniyor..." : `AI Skorla${aiScoredCount > 0 ? ` (${aiScoredCount})` : ""}`}
        </button>
        <button
          onClick={() => setSortBy(sortBy === "ai" ? "default" : "ai")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${
            sortBy === "ai"
              ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/30 shadow-sm shadow-[var(--accent-green)]/10"
              : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50 hover:border-[var(--accent-green)]/50"
          }`}
        >
          {sortBy === "ai" ? "AI Onerisi \u2713" : "AI Onerisi"}
        </button>
        {(summarizing || translatingAll) && (
          <span className="text-[10px] text-[var(--accent-amber)] animate-pulse">TR ceviri uretiliyor...</span>
        )}
        <span className="text-xs text-[var(--text-secondary)] ml-auto">
          {filteredTweets.length} tweet
        </span>
      </div>

      {/* Tweet cards */}
      {filteredTweets.length === 0 ? (
        <div className="backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl p-12 text-center">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mx-auto mb-4 opacity-30">
            <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M8 24h48" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="36" r="3" fill="currentColor" opacity="0.3" />
            <rect x="24" y="33" width="24" height="2" rx="1" fill="currentColor" opacity="0.3" />
            <rect x="24" y="38" width="16" height="2" rx="1" fill="currentColor" opacity="0.2" />
          </svg>
          <p className="text-[var(--text-secondary)] text-sm">
            {tweets.length === 0 ? "Henuz tweet taranmadi. \"Simdi Tara\" butonuna basin." : "Filtreye uygun tweet bulunamadi."}
          </p>
          <p className="text-[var(--text-secondary)]/60 text-xs mt-1">
            {tweets.length > 0 && hideGM && "GM/GN filtresi aktif. Kaldirmak icin butona basin."}
          </p>
        </div>
      ) : groupByAccount && !filterAccount ? (
        /* Hesap bazli accordion gruplama */
        <div className="space-y-3">
          {(() => {
            const groups: Record<string, DiscoveryTweet[]> = {};
            for (const t of filteredTweets) {
              if (!groups[t.account]) groups[t.account] = [];
              groups[t.account].push(t);
            }
            const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => {
              const aPriority = a[0]?.is_priority ? 1 : 0;
              const bPriority = b[0]?.is_priority ? 1 : 0;
              if (aPriority !== bPriority) return bPriority - aPriority;
              const aMax = Math.max(...a.map(t => t.display_score));
              const bMax = Math.max(...b.map(t => t.display_score));
              return bMax - aMax;
            });
            let globalIdx = 0;
            return sortedGroups.map(([account, accountTweets]) => {
              const isExpanded = expandedAccounts.has(account);
              const maxScore = Math.max(...accountTweets.map(t => t.display_score));
              const isPriority = accountTweets[0]?.is_priority;
              const latestTime = accountTweets.reduce((latest, t) => {
                const tc = t.created_at || t.scanned_at;
                return tc > latest ? tc : latest;
              }, "");
              const startIdx = globalIdx;
              globalIdx += accountTweets.length;
              const scoreColor = getScoreColor(maxScore);
              return (
                <div key={account} className="backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/5">
                  <button
                    onClick={() => {
                      setExpandedAccounts(prev => {
                        const next = new Set(prev);
                        if (next.has(account)) next.delete(account); else next.add(account);
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between gap-3 p-4 hover:bg-[var(--bg-primary)]/30 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Gradient avatar */}
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ background: `linear-gradient(135deg, ${scoreColor}, ${scoreColor}80)` }}>
                        {account.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://x.com/${account}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-[var(--accent-blue)] hover:underline text-sm"
                            onClick={e => e.stopPropagation()}
                          >
                            @{account}
                          </a>
                          <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-primary)]/60 px-2 py-0.5 rounded-full">
                            {accountTweets.length} tweet
                          </span>
                          {isPriority && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">
                              Oncelikli
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                          {timeAgo(latestTime)} once
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Circular engagement gauge */}
                      <svg width="40" height="40" viewBox="0 0 44 44">
                        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border-primary)" strokeWidth="3" opacity="0.2" />
                        <circle cx="22" cy="22" r="18" fill="none" stroke={scoreColor} strokeWidth="3"
                          strokeDasharray={`${Math.min((maxScore / 100) * 113, 113)} 113`}
                          strokeLinecap="round" transform="rotate(-90 22 22)" />
                        <text x="22" y="26" textAnchor="middle" fill={scoreColor} fontSize="12" fontWeight="bold">{Math.round(maxScore)}</text>
                      </svg>
                      <span className="text-lg" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>&#9654;</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="space-y-3 p-4 pt-0 border-t border-[var(--border-primary)]/30">
                      {accountTweets.map((tweet, idx) => (
                        <TweetCard
                          key={tweet.tweet_id}
                          tweet={tweet}
                          index={startIdx + idx + 1}
                          isThreadExpanded={expandedThreads.has(tweet.tweet_id)}
                          onToggleThread={() => toggleThread(tweet.tweet_id)}
                          isResearchActive={activeResearch === tweet.tweet_id}
                          isGenerateActive={activeGenerate === tweet.tweet_id}
                          researchResult={researchData[tweet.tweet_id]}
                          generatedResult={generatedTexts[tweet.tweet_id]}
                          isResearching={researchingId === tweet.tweet_id}
                          isGenerating={generatingId === tweet.tweet_id}
                          onResearch={() => handleResearch(tweet)}
                          onGenerate={() => handleGenerate(tweet)}
                          onOpenInX={openInX}
                          onOpenQuoteInX={() => openQuoteInX(tweet.tweet_url)}
                          onCopy={copyText}
                          onFindMedia={() => handleFindMedia(tweet)}
                          onInfographic={() => handleInfographic(tweet)}
                          mediaResults={mediaResults[tweet.tweet_id]}
                          mediaLoading={mediaLoading === tweet.tweet_id}
                          infographicData={infographicData[tweet.tweet_id]}
                          infographicLoading={infographicLoading === tweet.tweet_id}
                          styles={styles}
                          formats={formats}
                          tweetStyle={tweetStyle}
                          setTweetStyle={setTweetStyle}
                          tweetLength={tweetLength}
                          setTweetLength={setTweetLength}
                          provider={provider}
                          setProvider={setProvider}
                          onSaveDraft={async (text: string) => {
                            await addDraft({ text, topic: tweet.tweet_url, style: tweetStyle });
                          }}
                          onSetActiveResearch={() => setActiveResearch(activeResearch === tweet.tweet_id ? null : tweet.tweet_id)}
                          onSetActiveGenerate={() => setActiveGenerate(activeGenerate === tweet.tweet_id ? null : tweet.tweet_id)}
                          onTranslate={() => handleTranslate(tweet)}
                          isTranslating={translatingIds.has(tweet.tweet_id)}
                          isShared={sharedTweetIds.has(tweet.tweet_id)}
                          onToggleShared={() => handleToggleShared(tweet.tweet_id)}
                          extractedMedia={extractedMedia[tweet.tweet_id]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      ) : (
        /* Normal duz liste */
        <div className="space-y-3">
          {filteredTweets.map((tweet, idx) => (
            <TweetCard
              key={tweet.tweet_id}
              tweet={tweet}
              index={idx + 1}
              isThreadExpanded={expandedThreads.has(tweet.tweet_id)}
              onToggleThread={() => toggleThread(tweet.tweet_id)}
              isResearchActive={activeResearch === tweet.tweet_id}
              isGenerateActive={activeGenerate === tweet.tweet_id}
              researchResult={researchData[tweet.tweet_id]}
              generatedResult={generatedTexts[tweet.tweet_id]}
              isResearching={researchingId === tweet.tweet_id}
              isGenerating={generatingId === tweet.tweet_id}
              onResearch={() => handleResearch(tweet)}
              onGenerate={() => handleGenerate(tweet)}
              onOpenInX={openInX}
              onOpenQuoteInX={() => openQuoteInX(tweet.tweet_url)}
              onCopy={copyText}
              onFindMedia={() => handleFindMedia(tweet)}
              onInfographic={() => handleInfographic(tweet)}
              mediaResults={mediaResults[tweet.tweet_id]}
              mediaLoading={mediaLoading === tweet.tweet_id}
              infographicData={infographicData[tweet.tweet_id]}
              infographicLoading={infographicLoading === tweet.tweet_id}
              styles={styles}
              formats={formats}
              tweetStyle={tweetStyle}
              setTweetStyle={setTweetStyle}
              tweetLength={tweetLength}
              setTweetLength={setTweetLength}
              provider={provider}
              setProvider={setProvider}
              onSaveDraft={async (text: string) => {
                await addDraft({ text, topic: tweet.tweet_url, style: tweetStyle });
              }}
              onSetActiveResearch={() => setActiveResearch(activeResearch === tweet.tweet_id ? null : tweet.tweet_id)}
              onSetActiveGenerate={() => setActiveGenerate(activeGenerate === tweet.tweet_id ? null : tweet.tweet_id)}
              onTranslate={() => handleTranslate(tweet)}
              isTranslating={translatingIds.has(tweet.tweet_id)}
              isShared={sharedTweetIds.has(tweet.tweet_id)}
              onToggleShared={() => handleToggleShared(tweet.tweet_id)}
              extractedMedia={extractedMedia[tweet.tweet_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TweetCard Component ─────────────────────────────── */

function TweetCard({
  tweet,
  index,
  isThreadExpanded,
  onToggleThread,
  isResearchActive,
  isGenerateActive,
  researchResult,
  generatedResult,
  isResearching,
  isGenerating,
  onResearch,
  onGenerate,
  onOpenInX,
  onOpenQuoteInX,
  onCopy,
  onFindMedia,
  onInfographic,
  mediaResults,
  mediaLoading,
  infographicData,
  infographicLoading,
  styles,
  formats,
  tweetStyle,
  setTweetStyle,
  tweetLength,
  setTweetLength,
  provider,
  setProvider,
  onSaveDraft,
  onSetActiveResearch,
  onSetActiveGenerate,
  onTranslate,
  isTranslating,
  isShared,
  onToggleShared,
  extractedMedia,
}: {
  tweet: DiscoveryTweet;
  index: number;
  isThreadExpanded: boolean;
  onToggleThread: () => void;
  isResearchActive: boolean;
  isGenerateActive: boolean;
  researchResult?: { summary: string; key_points: string[]; sources: { title: string; url?: string }[]; progress: string };
  generatedResult?: { text: string; score: number };
  isResearching: boolean;
  isGenerating: boolean;
  onResearch: () => void;
  onGenerate: () => void;
  onOpenInX: (text: string) => void;
  onOpenQuoteInX: () => void;
  onCopy: (text: string) => void;
  onFindMedia: () => void;
  onInfographic: () => void;
  mediaResults?: Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; media_type?: string; type?: string; source?: string; author?: string }>;
  mediaLoading: boolean;
  infographicData?: { image: string; format: string };
  infographicLoading: boolean;
  styles: StyleOption[];
  formats: FormatOption[];
  tweetStyle: string;
  setTweetStyle: (s: string) => void;
  tweetLength: string;
  setTweetLength: (s: string) => void;
  provider: string;
  setProvider: (s: string) => void;
  onSaveDraft: (text: string) => Promise<void>;
  onSetActiveResearch: () => void;
  onSetActiveGenerate: () => void;
  onTranslate: () => void;
  isTranslating: boolean;
  isShared?: boolean;
  onToggleShared?: () => void;
  extractedMedia?: ExtractedMedia;
}) {
  const badge = importanceBadge[tweet.importance] || importanceBadge.dusuk;
  const [draftSaved, setDraftSaved] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (generatedResult?.text) setEditedText(generatedResult.text);
  }, [generatedResult?.text]);

  const importanceColor = getImportanceColor(tweet.importance);
  const scoreColor = getScoreColor(tweet.display_score);

  // Collect all links from tweet + thread + extracted data
  const allLinks: TweetUrl[] = [];
  const seenUrls = new Set<string>();
  const addUrl = (u: TweetUrl) => {
    if (!seenUrls.has(u.url)) { seenUrls.add(u.url); allLinks.push(u); }
  };
  // From discovery tweet
  if (tweet.urls) tweet.urls.forEach(addUrl);
  if (tweet.thread_parts) {
    tweet.thread_parts.forEach(p => {
      if (p.urls) p.urls.forEach(addUrl);
    });
  }
  // From extracted data
  if (extractedMedia) {
    extractedMedia.urls.forEach(addUrl);
    extractedMedia.thread_urls.forEach(addUrl);
  }

  // Collect all tweet media
  const allTweetMedia: TweetMediaItem[] = [];
  const seenMediaUrls = new Set<string>();
  const addMedia = (m: TweetMediaItem) => {
    if (!seenMediaUrls.has(m.url)) { seenMediaUrls.add(m.url); allTweetMedia.push(m); }
  };
  if (tweet.media_items) tweet.media_items.forEach(addMedia);
  if (tweet.thread_parts) {
    tweet.thread_parts.forEach(p => {
      if (p.media_items) p.media_items.forEach(addMedia);
    });
  }
  if (extractedMedia) {
    extractedMedia.media_items.forEach(addMedia);
    extractedMedia.thread_media.forEach(addMedia);
  }

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div
      className={`backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl p-4 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/10${isShared ? " opacity-50" : ""}`}
      style={{ borderLeft: tweet.ai_relevance_score != null && tweet.ai_relevance_score >= 8 ? '3px solid var(--accent-green)' : `3px solid ${importanceColor}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Gradient avatar */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: `linear-gradient(135deg, var(--accent-blue), var(--accent-purple))` }}>
            {tweet.account.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://x.com/${tweet.account}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--accent-blue)] hover:underline text-sm"
              >
                @{tweet.account}
              </a>
              {tweet.is_priority && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">
                  Oncelikli
                </span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                {badge.label}
              </span>
              {tweet.is_thread && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30">
                  Thread ({tweet.thread_parts.length})
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              {timeAgo(tweet.created_at)} once &middot; {(() => { try { return new Date(tweet.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })()}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {/* AI relevance score badge */}
          {tweet.ai_relevance_score != null && tweet.ai_relevance_score > 0 && (
            <div
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                tweet.ai_relevance_score >= 8 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" :
                tweet.ai_relevance_score >= 5 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" :
                "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]"
              }`}
              title={tweet.ai_relevance_reason || "AI relevance score"}
            >
              AI: {tweet.ai_relevance_score}/10
            </div>
          )}
          {/* Circular engagement gauge */}
          <svg width="40" height="40" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border-primary)" strokeWidth="3" opacity="0.2" />
            <circle cx="22" cy="22" r="18" fill="none" stroke={scoreColor} strokeWidth="3"
              strokeDasharray={`${Math.min((tweet.display_score / 100) * 113, 113)} 113`}
              strokeLinecap="round" transform="rotate(-90 22 22)" />
            <text x="22" y="26" textAnchor="middle" fill={scoreColor} fontSize="12" fontWeight="bold">{Math.round(tweet.display_score)}</text>
          </svg>
        </div>
      </div>

      {/* Engagement stats */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20" title="Begeni">{formatNumber(tweet.like_count)} begeni</span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20" title="Repost">{formatNumber(tweet.retweet_count)} RT</span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20" title="Yanit">{formatNumber(tweet.reply_count)} yanit</span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20" title="Yer Isareti">{formatNumber(tweet.bookmark_count)} kayit</span>
      </div>

      {/* Turkish summary as main text */}
      {tweet.summary_tr && tweet.summary_tr !== tweet.text.slice(0, 200) ? (
        <>
          <div className="text-sm leading-relaxed font-medium text-[var(--text-primary)]">
            &#127481;&#127479; {tweet.summary_tr}
          </div>
          <details className="group">
            <summary className="text-[11px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent-purple)] transition-colors">
              Orijinal tweet&apos;i gor
            </summary>
            <div className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)] opacity-70">{tweet.text}</div>
          </details>
        </>
      ) : (
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{tweet.text}</div>
      )}

      {/* Thread accordion */}
      {tweet.is_thread && tweet.thread_parts.length > 1 && (
        <div>
          <button
            onClick={onToggleThread}
            className="text-xs text-[var(--accent-purple)] hover:underline transition-colors"
          >
            {isThreadExpanded ? "Thread'i Gizle" : `Thread'i Gor (${tweet.thread_parts.length} tweet)`}
          </button>
          {isThreadExpanded && (
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-[var(--accent-purple)]/30">
              {tweet.thread_parts.map((part, i) => (
                <div key={i} className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                  <span className="font-semibold text-[var(--accent-purple)]">{i + 1}.</span> {part.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border-primary)]/30">
        <button
          onClick={onResearch}
          disabled={isResearching}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}
        >
          {isResearching ? "Arastiriliyor..." : "Arastir"}
        </button>
        <a
          href={tweet.tweet_url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50 transition-all duration-300 inline-flex items-center"
        >
          Tweet&apos;i Gor
        </a>
        <button onClick={onOpenQuoteInX} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50 transition-all duration-300">
          X Quote Ac
        </button>
        <button
          onClick={onTranslate}
          disabled={isTranslating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/30 transition-all duration-300 disabled:opacity-50"
        >
          {isTranslating ? "Cevriliyor..." : "&#127481;&#127479; Cevir"}
        </button>
        {onToggleShared && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleShared(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-300 ${
              isShared
                ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/30"
                : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50 hover:border-[var(--accent-green)]/50"
            }`}
          >
            {isShared ? "\u2713 Paylasild" : "Paylasild"}
          </button>
        )}
      </div>

      {/* Research progress */}
      {researchResult?.progress && (
        <div className="text-xs text-[var(--accent-blue)] animate-pulse flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
          {researchResult.progress}
        </div>
      )}

      {/* Tweet Media from extraction */}
      {allTweetMedia.length > 0 && (
        <div className="backdrop-blur-sm bg-gradient-to-br from-[var(--accent-purple)]/5 to-transparent rounded-lg p-3 border border-[var(--accent-purple)]/20">
          <h5 className="text-xs font-semibold text-[var(--accent-purple)] mb-2">Tweet Gorselleri ({allTweetMedia.length})</h5>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allTweetMedia.map((m, i) => (
              <div key={i} className="relative group rounded-lg overflow-hidden bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]/30">
                {m.type === "video" ? (
                  <>
                    {m.thumbnail ? (
                      <img src={m.thumbnail} alt={`Video ${i + 1}`} className="w-full max-h-48 object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center text-[var(--text-secondary)]">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      </div>
                    )}
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    >
                      <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent-purple)]/80">Video Indir</span>
                    </a>
                  </>
                ) : (
                  <>
                    <img src={m.thumbnail || m.url} alt={`Gorsel ${i + 1}`} className="w-full max-h-48 object-cover rounded-lg" loading="lazy" />
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    >
                      <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent-blue)]/80">Indir</span>
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research results */}
      {researchResult && researchResult.summary && (
        <div className="space-y-3 backdrop-blur-sm bg-gradient-to-br from-[var(--accent-blue)]/5 to-transparent rounded-xl p-4 border border-[var(--accent-blue)]/20">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[var(--accent-green)] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
              Arastirma Sonuclari
            </h4>
            <button onClick={onSetActiveResearch} className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              {isResearchActive ? "Gizle" : "Goster"}
            </button>
          </div>
          {isResearchActive && (
            <>
              <p className="text-xs leading-relaxed text-[var(--text-primary)]">
                {researchResult.summary.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}
              </p>
              {researchResult.key_points.length > 0 && (
                <ul className="text-xs space-y-1.5 pl-1">
                  {researchResult.key_points.map((kp, i) => (
                    <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: i < 3 ? "var(--accent-green)" : i < 6 ? "var(--accent-amber)" : "var(--text-secondary)" }} />
                      {kp}
                    </li>
                  ))}
                </ul>
              )}
              {researchResult.sources.length > 0 && (
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    Kaynaklar ({researchResult.sources.length})
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {researchResult.sources.slice(0, 5).map((s, i) => (
                      <div key={i}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline">{s.title}</a>
                        ) : (
                          <span>{s.title}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {/* Generate section */}
          <div className="pt-3 border-t border-[var(--border-primary)]/30 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select value={tweetStyle} onChange={e => setTweetStyle(e.target.value)} className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all">
                {styles.length > 0 ? styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : (
                  <option value="quote_tweet">Quote Tweet</option>
                )}
              </select>
              <select value={tweetLength} onChange={e => setTweetLength(e.target.value)} className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all">
                {formats.length > 0 ? formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : (
                  <option value="spark">Spark</option>
                )}
              </select>
              <select value={provider} onChange={e => setProvider(e.target.value)} className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all">
                <option value="">Otomatik</option>
                <option value="anthropic">Claude</option>
                <option value="openai">GPT</option>
                <option value="minimax">MiniMax</option>
                <option value="groq">Groq</option>
              </select>
              <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}
              >
                {isGenerating ? "Uretiliyor..." : "Tweet Uret"}
              </button>
            </div>
          </div>

          {/* Generated tweet */}
          {generatedResult && (
            <div className="space-y-3 backdrop-blur-sm bg-[var(--bg-primary)]/60 rounded-xl p-4 border border-[var(--border-primary)]/30">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--accent-amber)] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)]" />
                  Uretilen Tweet
                </h4>
                {generatedResult.score > 0 && (
                  <div className="flex items-center gap-2">
                    <svg width="28" height="28" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="16" fill="none" stroke="var(--border-primary)" strokeWidth="2.5" opacity="0.2" />
                      <circle cx="22" cy="22" r="16" fill="none"
                        stroke={generatedResult.score >= 80 ? "var(--accent-green)" : generatedResult.score >= 60 ? "var(--accent-amber)" : "var(--accent-red)"}
                        strokeWidth="2.5"
                        strokeDasharray={`${(generatedResult.score / 100) * 100} 100`}
                        strokeLinecap="round" transform="rotate(-90 22 22)" />
                      <text x="22" y="26" textAnchor="middle"
                        fill={generatedResult.score >= 80 ? "var(--accent-green)" : generatedResult.score >= 60 ? "var(--accent-amber)" : "var(--accent-red)"}
                        fontSize="11" fontWeight="bold">{generatedResult.score}</text>
                    </svg>
                  </div>
                )}
              </div>

              {/* X-style preview card */}
              <div className="bg-[var(--bg-secondary)]/60 rounded-lg p-3 border border-[var(--border-primary)]/20">
                <textarea
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] text-sm w-full min-h-[80px] resize-y outline-none"
                  rows={3}
                />
                <div className="text-[10px] text-[var(--text-secondary)] text-right mt-1">
                  {editedText.length} karakter
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onOpenInX(editedText)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                  style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}
                >
                  X&apos;te Ac
                </button>
                <button
                  onClick={() => {
                    window.open(tweet.tweet_url, "_blank");
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50 transition-all duration-300"
                >
                  X Quote Ac
                </button>
                <button onClick={() => onCopy(editedText)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50 transition-all duration-300">
                  Kopyala
                </button>
                <button
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50 transition-all duration-300 disabled:opacity-50"
                >
                  Yeniden Uret
                </button>
                <button
                  onClick={async () => {
                    await onSaveDraft(editedText);
                    setDraftSaved(true);
                    setTimeout(() => setDraftSaved(false), 3000);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-green)]/50 transition-all duration-300"
                >
                  {draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}
                </button>
              </div>

              {/* Links box */}
              {allLinks.length > 0 && (
                <div className="backdrop-blur-sm bg-[var(--bg-primary)]/40 rounded-lg p-3 border border-[var(--border-primary)]/30"
                  style={{ borderLeft: "3px solid var(--accent-blue)" }}>
                  <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-1.5">Baglantilar</h5>
                  <p className="text-[10px] text-[var(--text-secondary)] mb-2">Bu linkleri 2. tweetinize ekleyebilirsiniz</p>
                  <div className="space-y-1.5">
                    {allLinks.map((link, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs bg-[var(--bg-secondary)]/60 rounded-lg px-2.5 py-1.5">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline truncate min-w-0">
                          {link.display_url || link.url}
                        </a>
                        <button
                          onClick={() => handleCopyUrl(link.url)}
                          className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]/30 transition-all duration-200 shrink-0"
                        >
                          {copiedUrl === link.url ? "Kopyalandi!" : "Kopyala"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Media finder */}
              <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--border-primary)]/30">
                <button
                  onClick={onFindMedia}
                  disabled={mediaLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/50 transition-all duration-300 disabled:opacity-50"
                >
                  {mediaLoading ? "Araniyor..." : "Gorsel/Video Bul"}
                </button>
                <button
                  onClick={onInfographic}
                  disabled={infographicLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-amber)]/50 transition-all duration-300 disabled:opacity-50"
                >
                  {infographicLoading ? "Uretiliyor..." : "Gemini Infografik"}
                </button>
              </div>

              {/* Media results */}
              {mediaResults && mediaResults.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-[var(--accent-cyan)] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)]" />
                    Bulunan Medya ({mediaResults.length})
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {mediaResults.slice(0, 6).map((m, i) => {
                      const thumb = m.thumbnail_url || m.preview || m.url;
                      return (
                        <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block bg-[var(--bg-primary)]/60 rounded-lg p-1.5 hover:ring-2 ring-[var(--accent-blue)] transition-all duration-300 border border-[var(--border-primary)]/20">
                          {thumb ? (
                            <img src={thumb} alt={m.title || ""} className="w-full h-24 object-cover rounded" loading="lazy" />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)]/60 rounded">Gorsel</div>
                          )}
                          <div className="text-[9px] text-[var(--text-secondary)] mt-1 truncate">{m.title || m.source || ""}</div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Infographic */}
              {infographicData && (
                <div className="space-y-2">
                  <img
                    src={`data:image/${infographicData.format};base64,${infographicData.image}`}
                    alt="Infografik"
                    className="w-full rounded-lg border border-[var(--border-primary)]/30"
                  />
                  <a
                    href={`data:image/${infographicData.format};base64,${infographicData.image}`}
                    download={`infographic_${Date.now()}.${infographicData.format}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white inline-block transition-all duration-300"
                    style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}
                  >
                    Gorseli Indir
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
