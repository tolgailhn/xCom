"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getSmartSuggestions,
  getTrends,
  getDiscoveryTweets,
  triggerClustering,
  generateQuoteTweet,
  researchTopicStream,
  getStyles,
  addDraft,
  schedulePost,
  findMedia,
  extractTweet,
  generateInfographic,
  aiScoreSuggestions,
  aiScoreTrends,
  aiScoreDiscoveryTweets,
  publishTweet,
  type TweetMediaItem,
  type TweetUrl,
  type DiscoveryTweet,
} from "@/lib/api";

import {
  AIScoreBadge,
  CircularGauge,
  StyleFormatBar,
  ResearchPanel,
  GenerationPanel,
  MediaSection,
  LinksBox,
  timeAgo,
  formatNumber,
  isLowQualityTweet,
  openInX,
  copyToClipboard,
  type StyleOption,
  type FormatOption,
  type ResearchData,
  type GeneratedData,
  type MediaItem,
} from "@/components/discovery";

/* ── Types ──────────────────────────────────────────── */

interface ClusterTweet {
  text: string;
  account: string;
  engagement: number;
  tweet_id?: string;
  tweet_url?: string;
}

interface Suggestion {
  type: "trend" | "news";
  topic: string;
  topic_tr?: string;
  reason: string;
  tweets?: ClusterTweet[];
  engagement_potential: number;
  suggested_style: string;
  suggested_hour: string;
  reasoning?: string;
  url?: string;
  source_keywords?: string[];
  total_engagement?: number;
  news_body?: string;
  news_source?: string;
  news_date?: string;
  description_tr?: string;
  top_tweets?: ClusterTweet[];
  suggested_format?: string;
  ai_relevance_score?: number;
  ai_relevance_reason?: string;
}

interface TrendItem {
  keyword: string;
  account_count: number;
  accounts: string[];
  total_engagement: number;
  trend_score: number;
  tweet_count: number;
  top_tweets: ClusterTweet[];
  is_strong_trend: boolean;
  detected_at: string;
  ai_relevance_score?: number;
  ai_relevance_reason?: string;
}

/** Unified feed item — all 3 sources normalized into this shape */
interface FeedItem {
  source: "suggestion" | "trend" | "tweet";
  sourceLabel: string;
  topic: string;
  topicTr?: string;
  description?: string;
  reason?: string;
  engagementPotential: number;
  aiScore?: number;
  aiReason?: string;
  suggestedHour?: string;
  suggestedStyle?: string;
  tweets: ClusterTweet[];
  url?: string;
  newsBody?: string;
  newsSource?: string;
  sourceKeywords?: string[];
  timestamp?: string;
  // original data refs
  _suggestion?: Suggestion;
  _trend?: TrendItem;
  _discoveryTweet?: DiscoveryTweet;
  // dedup key
  _key: string;
}

/* ── Component ──────────────────────────────────────── */

export default function TabAIOnerileri({ refreshTrigger }: { refreshTrigger?: number }) {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);

  // Filters
  const [filterSource, setFilterSource] = useState<"all" | "suggestion" | "trend" | "tweet">("all");
  const [filterMinEngagement, setFilterMinEngagement] = useState(0);
  const [sortBy, setSortBy] = useState<"ai" | "engagement" | "newest">("ai");
  const [showFilters, setShowFilters] = useState(false);

  // AI scoring
  const [aiScoring, setAiScoring] = useState(false);

  // Style/format
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Progressive disclosure
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [workflowIdx, setWorkflowIdx] = useState<number | null>(null);

  // Research & Generation per feed item (keyed by _key)
  const [researchData, setResearchData] = useState<Record<string, ResearchData>>({});
  const [researchingKey, setResearchingKey] = useState<string | null>(null);
  const [researchExpanded, setResearchExpanded] = useState<Set<string>>(new Set(["__all__"]));
  const [generatedTweets, setGeneratedTweets] = useState<Record<string, GeneratedData>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

  // Media
  const [mediaResults, setMediaResults] = useState<Record<string, MediaItem[]>>({});
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);
  const [infographicData, setInfographicData] = useState<Record<string, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<string | null>(null);
  const [itemMedia, setItemMedia] = useState<Record<string, TweetMediaItem[]>>({});
  const [itemUrls, setItemUrls] = useState<Record<string, TweetUrl[]>>({});

  // Dismiss
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Refs
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* ── Normalize into FeedItems ──────────────────────── */

  const normalizeSuggestion = useCallback((s: Suggestion, idx: number): FeedItem => ({
    source: "suggestion",
    sourceLabel: s.type === "trend" ? "Trend Oneri" : "Haber Oneri",
    topic: s.topic,
    topicTr: s.topic_tr,
    description: s.description_tr,
    reason: s.reason,
    engagementPotential: s.engagement_potential,
    aiScore: s.ai_relevance_score,
    aiReason: s.ai_relevance_reason,
    suggestedHour: s.suggested_hour,
    suggestedStyle: s.suggested_style,
    tweets: s.tweets || s.top_tweets || [],
    url: s.url,
    newsBody: s.news_body,
    newsSource: s.news_source,
    sourceKeywords: s.source_keywords,
    timestamp: s.news_date || (s.top_tweets?.[0] as ClusterTweet & { created_at?: string })?.created_at || (s.tweets?.[0] as ClusterTweet & { created_at?: string })?.created_at,
    _suggestion: s,
    _key: `sug-${idx}-${s.topic.slice(0, 30)}`,
  }), []);

  const normalizeTrend = useCallback((t: TrendItem, idx: number): FeedItem => ({
    source: "trend",
    sourceLabel: t.is_strong_trend ? "Guclu Trend" : "Trend",
    topic: t.keyword,
    reason: `${t.account_count} hesap, ${t.tweet_count} tweet, ${formatNumber(t.total_engagement)} engagement`,
    engagementPotential: Math.min(10, Math.round(t.trend_score / 10)),
    aiScore: t.ai_relevance_score,
    aiReason: t.ai_relevance_reason,
    tweets: (t.top_tweets || []).map(tw => ({
      text: tw.text,
      account: tw.account,
      engagement: tw.engagement,
      tweet_id: tw.tweet_id,
      tweet_url: tw.tweet_url,
    })),
    sourceKeywords: t.accounts?.slice(0, 5),
    timestamp: t.detected_at,
    _trend: t,
    _key: `trend-${idx}-${t.keyword.slice(0, 30)}`,
  }), []);

  const normalizeDiscoveryTweet = useCallback((dt: DiscoveryTweet): FeedItem => ({
    source: "tweet",
    sourceLabel: dt.is_priority ? "Oncelikli Tweet" : "Kesif Tweet",
    topic: dt.summary_tr || dt.text.slice(0, 120),
    description: dt.text,
    reason: `@${dt.account} · ${formatNumber(dt.like_count)} begeni, ${formatNumber(dt.retweet_count)} RT`,
    engagementPotential: Math.min(10, Math.round(dt.display_score / 10)),
    aiScore: dt.ai_relevance_score,
    aiReason: dt.ai_relevance_reason,
    tweets: [{
      text: dt.text,
      account: dt.account,
      engagement: dt.engagement_score,
      tweet_id: dt.tweet_id,
      tweet_url: dt.tweet_url,
    }],
    url: dt.tweet_url,
    timestamp: dt.created_at,
    _discoveryTweet: dt,
    _key: `tweet-${dt.tweet_id}`,
  }), []);

  /* ── Load Data ────────────────────────────────────── */

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sugRes, trendRes, tweetRes] = await Promise.all([
        getSmartSuggestions().catch(() => ({ suggestions: [] })),
        getTrends().catch(() => ({ trends: [] })),
        getDiscoveryTweets().catch(() => ({ tweets: [] })),
      ]);

      const suggestions: Suggestion[] = sugRes.suggestions || [];
      const trends: TrendItem[] = trendRes.trends || [];
      const discoveryTweets: DiscoveryTweet[] = tweetRes.tweets || [];

      // Normalize all sources
      const sugItems = suggestions.map((s: Suggestion, i: number) => normalizeSuggestion(s, i));
      const trendItems = trends.map((t: TrendItem, i: number) => normalizeTrend(t, i));
      // Only top discovery tweets by engagement
      const topTweets = discoveryTweets
        .sort((a: DiscoveryTweet, b: DiscoveryTweet) => b.engagement_score - a.engagement_score)
        .slice(0, 20)
        .map((dt: DiscoveryTweet) => normalizeDiscoveryTweet(dt));

      // Deduplicate: if a trend keyword appears in suggestions, skip the raw trend
      const sugTopics = new Set(sugItems.map((s: FeedItem) => s.topic.toLowerCase()));
      const dedupedTrends = trendItems.filter((t: FeedItem) => !sugTopics.has(t.topic.toLowerCase()));

      // Deduplicate: if a tweet_id appears in suggestions tweets, skip
      const sugTweetIds = new Set(
        sugItems.flatMap((s: FeedItem) => s.tweets.map((tw: ClusterTweet) => tw.tweet_id).filter(Boolean))
      );
      const dedupedTweets = topTweets.filter((t: FeedItem) => {
        const tid = t._discoveryTweet?.tweet_id;
        return !tid || !sugTweetIds.has(tid);
      });

      setFeedItems([...sugItems, ...dedupedTrends, ...dedupedTweets]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [normalizeSuggestion, normalizeTrend, normalizeDiscoveryTweet]);

  useEffect(() => { loadData(); }, [refreshTrigger, loadData]);

  useEffect(() => {
    getStyles()
      .then((data: { styles?: StyleOption[]; formats?: FormatOption[] }) => {
        if (data.styles) setStyles(data.styles);
        if (data.formats) setFormats(data.formats);
      })
      .catch(() => {});
  }, []);

  // Auto AI scoring on mount
  useEffect(() => {
    Promise.all([
      aiScoreSuggestions().catch(() => ({ scored: 0 })),
      aiScoreTrends().catch(() => ({ scored: 0 })),
      aiScoreDiscoveryTweets().catch(() => ({ scored: 0 })),
    ]).then(results => {
      const total = results.reduce((sum, r) => sum + (r.scored || 0), 0);
      if (total > 0) loadData();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Computed ──────────────────────────────────────── */

  const filtered = useMemo(() => {
    return feedItems.filter((item: FeedItem) => {
      if (dismissed.has(item._key)) return false;
      if (filterSource !== "all" && item.source !== filterSource) return false;
      if (item.engagementPotential < filterMinEngagement) return false;
      return true;
    });
  }, [feedItems, dismissed, filterSource, filterMinEngagement]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "ai") {
      arr.sort((a: FeedItem, b: FeedItem) => (b.aiScore || 0) - (a.aiScore || 0));
    } else if (sortBy === "newest") {
      arr.sort((a: FeedItem, b: FeedItem) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });
    } else {
      arr.sort((a: FeedItem, b: FeedItem) => b.engagementPotential - a.engagementPotential);
    }
    return arr;
  }, [filtered, sortBy]);

  const counts = useMemo(() => ({
    suggestion: filtered.filter((i: FeedItem) => i.source === "suggestion").length,
    trend: filtered.filter((i: FeedItem) => i.source === "trend").length,
    tweet: filtered.filter((i: FeedItem) => i.source === "tweet").length,
    high: filtered.filter((i: FeedItem) => i.engagementPotential >= 7).length,
  }), [filtered]);

  const activeFilterCount = [filterSource !== "all", filterMinEngagement > 0].filter(Boolean).length;

  const scrollToCard = useCallback((key: string) => {
    const idx = sorted.findIndex((i: FeedItem) => i._key === key);
    if (idx >= 0) setExpandedIdx(idx);
    setTimeout(() => { cardRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  }, [sorted]);

  /* ── Handlers ─────────────────────────────────────── */

  const handleRecluster = async () => {
    setClustering(true);
    try { await triggerClustering(); await loadData(); } catch { /* ignore */ }
    setClustering(false);
  };

  const handleAIScore = async () => {
    setAiScoring(true);
    try {
      await Promise.all([
        aiScoreSuggestions(),
        aiScoreTrends(),
        aiScoreDiscoveryTweets(),
      ]);
      await loadData();
    } catch { /* ignore */ }
    setAiScoring(false);
  };

  const handleResearch = useCallback(async (item: FeedItem) => {
    const key = item._key;
    setResearchingKey(key);
    setWorkflowIdx(sorted.findIndex((i: FeedItem) => i._key === key));
    setResearchData(prev => ({ ...prev, [key]: { summary: "", key_points: [], sources: [], progress: "Arastirma baslatiliyor..." } }));

    try {
      let researchTopic = item.topic;
      const firstTweet = item.tweets[0];

      if (firstTweet?.tweet_url || (firstTweet?.account && firstTweet?.tweet_id)) {
        const tweetUrl = firstTweet.tweet_url || `https://x.com/${firstTweet.account}/status/${firstTweet.tweet_id}`;
        try {
          const extracted = await extractTweet(tweetUrl);
          if (extracted?.full_thread_text) researchTopic = extracted.full_thread_text;
          else if (extracted?.text) researchTopic = extracted.text;
          if (extracted?.media_items?.length) setItemMedia(prev => ({ ...prev, [key]: [...(extracted.media_items || []), ...(extracted.thread_media || [])] }));
          const allUrls = [...(extracted?.urls || []), ...(extracted?.thread_urls || [])];
          if (allUrls.length) setItemUrls(prev => ({ ...prev, [key]: allUrls }));
        } catch { /* use original topic */ }
      }

      if (item.url && !researchTopic.includes(item.url)) researchTopic += `\n\nKaynak: ${item.url}`;

      const result = await researchTopicStream(
        { topic: researchTopic, engine: "default", tweet_id: firstTweet?.tweet_id || "", tweet_author: firstTweet?.account || "" },
        (progress: string) => setResearchData(prev => ({ ...prev, [key]: { ...prev[key], progress } })),
      );
      setResearchData(prev => ({ ...prev, [key]: { summary: result.summary, key_points: result.key_points, sources: result.sources, progress: "" } }));
    } catch (e) {
      setResearchData(prev => ({ ...prev, [key]: { ...prev[key], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` } }));
    } finally { setResearchingKey(null); }
  }, [sorted]);

  const handleGenerate = useCallback(async (item: FeedItem) => {
    const key = item._key;
    setGeneratingKey(key);
    try {
      const research = researchData[key];
      const researchSummary = research?.summary ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}` : "";
      const topTweetsContext = item.tweets.length > 0
        ? item.tweets.map((t: ClusterTweet) => `@${t.account}: ${t.text}`).join("\n")
        : "";

      const result = await generateQuoteTweet({
        original_tweet: item.topic + (topTweetsContext ? `\n\n${topTweetsContext}` : ""),
        original_author: item.tweets[0]?.account || item.topic.slice(0, 50),
        style: tweetStyle,
        research_summary: researchSummary,
        length_preference: tweetLength,
        provider: provider || undefined,
      });
      const text = result.text || "";
      setGeneratedTweets(prev => ({ ...prev, [key]: { text, score: result.score?.overall || 0, thread_parts: result.thread_parts } }));
      setEditedTexts(prev => ({ ...prev, [key]: text }));
    } catch (e) {
      const errText = `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`;
      setGeneratedTweets(prev => ({ ...prev, [key]: { text: errText, score: 0 } }));
      setEditedTexts(prev => ({ ...prev, [key]: errText }));
    } finally { setGeneratingKey(null); }
  }, [researchData, tweetStyle, tweetLength, provider]);

  const handleFindMedia = useCallback(async (topic: string, key: string) => {
    setMediaLoading(key);
    try { const r = await findMedia(topic.slice(0, 100), "both"); setMediaResults(prev => ({ ...prev, [key]: r.results || [] })); }
    catch { /* ignore */ }
    finally { setMediaLoading(null); }
  }, []);

  const handleInfographic = useCallback(async (key: string, topic: string, keyPoints: string[]) => {
    setInfographicLoading(key);
    try {
      const result = await generateInfographic({ topic, key_points: keyPoints });
      if (result.image_base64) setInfographicData(prev => ({ ...prev, [key]: { image: result.image_base64, format: result.image_format || "png" } }));
    } catch { /* ignore */ }
    finally { setInfographicLoading(null); }
  }, []);

  const handleScheduleBestTime = async (item: FeedItem) => {
    const key = item._key;
    const text = editedTexts[key];
    if (!text || !item.suggestedHour) return;
    const now = new Date();
    const [h, m] = item.suggestedHour.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h || 14, m || 7, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    try { await schedulePost({ text, scheduled_time: target.toISOString() }); } catch { /* ignore */ }
  };

  /* ── Helpers ──────────────────────────────────────── */

  const engagementColor = (val: number) => {
    if (val >= 7) return "var(--accent-green)";
    if (val >= 4) return "var(--accent-amber)";
    return "var(--text-secondary)";
  };

  const sourceColor = (src: string) => {
    switch (src) {
      case "suggestion": return { bg: "var(--accent-purple)", border: "var(--accent-purple)" };
      case "trend": return { bg: "var(--accent-amber)", border: "var(--accent-amber)" };
      case "tweet": return { bg: "var(--accent-cyan)", border: "var(--accent-cyan)" };
      default: return { bg: "var(--text-secondary)", border: "var(--text-secondary)" };
    }
  };

  /* ── Render ───────────────────────────────────────── */

  if (loading) return (
    <div className="text-center py-12">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-[var(--accent-blue)]/30 border-t-[var(--accent-blue)] animate-spin" />
      <div className="text-sm text-[var(--text-secondary)]">3 kaynaktan veriler yukleniyor...</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ════ Header ════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-[var(--text-secondary)]">
          {feedItems.length} oneri &middot; {counts.suggestion} kume, {counts.trend} trend, {counts.tweet} tweet
        </div>
        <button onClick={handleRecluster} disabled={clustering}
          className={`btn-primary text-xs inline-flex items-center gap-1.5 ${clustering ? "animate-pulse" : ""}`}>
          {clustering && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
          {clustering ? "Guncelleniyor..." : "Yeniden Kumele"}
        </button>
      </div>

      {/* ════ Overview Panel ════ */}
      {sorted.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm font-bold text-[var(--text-primary)]">Birlesik Feed</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium">{filtered.length} oneri</span>
            {counts.high > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-medium">{counts.high} yuksek</span>}
            {counts.suggestion > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] font-medium">{counts.suggestion} kume</span>}
            {counts.trend > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] font-medium">{counts.trend} trend</span>}
            {counts.tweet > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] font-medium">{counts.tweet} tweet</span>}
            {dismissed.size > 0 && <span className="text-[10px] text-[var(--text-secondary)]">({dismissed.size} gizlendi)</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {sorted.slice(0, 15).map((item: FeedItem) => {
              const sc = sourceColor(item.source);
              return (
                <button key={item._key} onClick={() => scrollToCard(item._key)}
                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105 ${
                    item.engagementPotential >= 7
                      ? "bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--accent-green)]/5 text-[var(--accent-green)] border-[var(--accent-green)]/30"
                      : `bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)]`
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc.bg }} />
                  <span className="max-w-[120px] truncate">{item.topicTr || item.topic}</span>
                  <AIScoreBadge score={item.aiScore} reason={item.aiReason} size="sm" />
                  <span className="text-[10px] font-bold" style={{ color: engagementColor(item.engagementPotential) }}>{item.engagementPotential}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Filter Bar ═══ */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
            {([
              { key: "all", label: "Tumu" },
              { key: "suggestion", label: "Kumeler" },
              { key: "trend", label: "Trendler" },
              { key: "tweet", label: "Tweetler" },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setFilterSource(t.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterSource === t.key ? "bg-[var(--accent-blue)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as "ai" | "engagement" | "newest")}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <option value="ai">Siralama: AI Skoru</option>
            <option value="newest">Siralama: Yeniden Eskiye</option>
            <option value="engagement">Siralama: Engagement</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)]"
            }`}>Filtreler{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</button>
          <button onClick={handleAIScore} disabled={aiScoring}
            className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 disabled:opacity-50">
            {aiScoring ? "Skorlaniyor..." : "AI Skorla"}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-[var(--bg-secondary)]/40 border border-[var(--border)]/30">
            <select value={filterMinEngagement} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterMinEngagement(Number(e.target.value))}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
              <option value={0}>Min Engagement: Tumu</option>
              <option value={4}>4+ Engagement</option>
              <option value={7}>7+ Engagement</option>
            </select>
          </div>
        )}
      </div>

      {/* Style/Format/Provider */}
      <div className="glass-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">Tweet Uretim Ayarlari</span>
        </div>
        <StyleFormatBar
          styles={styles} formats={formats}
          selectedStyle={tweetStyle} setSelectedStyle={setTweetStyle}
          selectedFormat={tweetLength} setSelectedFormat={setTweetLength}
          selectedProvider={provider} setSelectedProvider={setProvider}
          compact
        />
      </div>

      {/* ════ Feed Cards ════ */}
      {sorted.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/10 to-[var(--accent-purple)]/10 flex items-center justify-center">
            <span className="text-2xl">&#129302;</span>
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Henuz oneri yok</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Trend analizi, haber taramasi ve hesap taramasi verileri biriktikce oneriler burada gorunecek.</p>
          <button onClick={handleRecluster} disabled={clustering} className={`mt-4 btn-primary text-xs ${clustering ? "animate-pulse" : ""}`}>
            {clustering ? "Guncelleniyor..." : "Yeniden Kumele"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((item: FeedItem, idx: number) => {
            const key = item._key;
            const isExpanded = expandedIdx === idx;
            const isWorkflow = workflowIdx === idx;
            const sc = sourceColor(item.source);
            const tweets = item.tweets.filter((t: ClusterTweet) => !isLowQualityTweet(t.text));

            return (
              <div key={key} ref={(el: HTMLDivElement | null) => { cardRefs.current[key] = el; }}
                className={`glass-card overflow-hidden transition-all duration-300 ${isExpanded ? "ring-1 ring-[var(--accent-blue)]/40" : ""}`}>

                {/* Top accent gradient */}
                <div className="h-1 rounded-t-xl" style={{
                  background: item.engagementPotential >= 7
                    ? `linear-gradient(90deg, var(--accent-green), var(--accent-green)/30)`
                    : `linear-gradient(90deg, ${sc.bg}, ${sc.bg}30)`
                }} />

                {/* ── Level 1: Card Header ── */}
                <div className="w-full text-left p-4 hover:bg-[var(--bg-secondary)]/30 transition-colors cursor-pointer" role="button" tabIndex={0}
                  onClick={() => { setExpandedIdx(isExpanded ? null : idx); if (isExpanded) setWorkflowIdx(w => w === idx ? null : w); }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Source badge + AI score + Topic */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide shrink-0 border"
                          style={{ background: `${sc.bg}20`, color: sc.bg, borderColor: `${sc.border}40` }}>
                          {item.sourceLabel.toUpperCase()}
                        </span>
                        <AIScoreBadge score={item.aiScore} reason={item.aiReason} />
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">{item.topicTr || item.topic}</h3>
                      </div>

                      {/* English subtitle */}
                      {item.topicTr && item.topicTr !== item.topic && (
                        <p className="text-[11px] text-[var(--text-secondary)]/60 mb-0.5 italic">{item.topic}</p>
                      )}

                      {/* Description preview */}
                      {item.description && !isExpanded && (
                        <p className="text-xs text-[var(--accent-cyan)] mt-0.5 mb-1 leading-relaxed line-clamp-2 font-medium">{item.description}</p>
                      )}

                      {/* Reason */}
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">{item.reason}</p>

                      {/* Metadata row */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.suggestedHour && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20">Saat: {item.suggestedHour}</span>
                        )}
                        {tweets.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">{tweets.length} tweet</span>}
                        {item.newsSource && <span className="text-[10px] text-[var(--text-secondary)]">Kaynak: {item.newsSource}</span>}
                        {item.sourceKeywords && item.sourceKeywords.length > 0 && item.sourceKeywords.slice(0, 3).map((kw: string, i: number) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">{kw}</span>
                        ))}
                      </div>
                    </div>

                    {/* Right: engagement gauge + dismiss + expand */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex flex-col items-center">
                        <CircularGauge value={item.engagementPotential} maxValue={10} size={48} strokeWidth={3}
                          colorFn={(v: number) => engagementColor(v)} />
                        <span className="text-[8px] text-[var(--text-secondary)] mt-0.5">potansiyel</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDismissed(prev => new Set(prev).add(key)); }}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-red)] p-1 rounded hover:bg-[var(--accent-red)]/10 transition-colors" title="Gec">&#10005;</button>
                        <span className={`text-xs text-[var(--text-secondary)] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>&#9660;</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Level 2: Expanded — full content + action buttons ── */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-4 bg-[var(--bg-secondary)]/20">
                    {/* Full description */}
                    {item.description && (
                      <p className="text-xs text-[var(--accent-cyan)] leading-relaxed">{item.description}</p>
                    )}

                    {/* News body */}
                    {item.newsBody && (
                      <div className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                        {item.newsBody.length > 300 ? item.newsBody.slice(0, 300) + "..." : item.newsBody}
                        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[var(--accent-cyan)] hover:underline">Kaynak</a>}
                      </div>
                    )}

                    {/* Discovery tweet full text */}
                    {item.source === "tweet" && item._discoveryTweet && (
                      <div className="text-xs bg-[var(--bg-primary)] rounded-lg px-3 py-2.5 border border-[var(--border)]">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--accent-blue)]">
                            {item._discoveryTweet.account.charAt(0).toUpperCase()}
                          </div>
                          <a href={`https://x.com/${item._discoveryTweet.account}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent-blue)] hover:underline text-[11px]">@{item._discoveryTweet.account}</a>
                          <span className="text-[10px] text-[var(--text-secondary)]">{timeAgo(item._discoveryTweet.created_at)} once</span>
                        </div>
                        <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{item._discoveryTweet.text}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-secondary)]">
                          <span>{formatNumber(item._discoveryTweet.like_count)} begeni</span>
                          <span>{formatNumber(item._discoveryTweet.retweet_count)} RT</span>
                          <span>{formatNumber(item._discoveryTweet.reply_count)} yanit</span>
                          <span>{formatNumber(item._discoveryTweet.bookmark_count)} yer imi</span>
                          {item._discoveryTweet.tweet_url && (
                            <a href={item._discoveryTweet.tweet_url} target="_blank" rel="noopener noreferrer"
                              className="ml-auto text-[11px] text-[var(--accent-blue)] hover:underline font-medium inline-flex items-center gap-1">
                              X&apos;te Gor &rarr;
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Related tweets (for suggestions & trends) */}
                    {item.source !== "tweet" && tweets.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Ilgili Tweetler</h4>
                        {tweets.slice(0, 5).map((tw: ClusterTweet, i: number) => {
                          const twUrl = tw.tweet_url
                            || (tw.tweet_id ? `https://x.com/${tw.account}/status/${tw.tweet_id}` : "")
                            || (tw.account ? `https://x.com/${tw.account}` : "");
                          return (
                          <div key={i}
                            className="group flex items-start gap-2.5 text-xs bg-[var(--bg-primary)] rounded-lg px-3 py-2.5 border border-[var(--border)] hover:border-[var(--accent-blue)]/60 hover:bg-[var(--accent-blue)]/5 transition-all duration-200 cursor-pointer"
                            onClick={() => { if (twUrl) window.open(twUrl, "_blank"); }}>
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--accent-blue)] shrink-0">{tw.account.charAt(0).toUpperCase()}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <a href={`https://x.com/${tw.account}`} target="_blank" rel="noopener noreferrer" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="font-semibold text-[var(--accent-blue)] hover:underline text-[11px]">@{tw.account}</a>
                                {tw.engagement > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] font-medium ml-auto shrink-0">{tw.engagement.toFixed(0)}</span>}
                              </div>
                              <p className="text-[var(--text-primary)] line-clamp-2 mt-0.5 leading-relaxed">{tw.text}</p>
                              {twUrl && (
                                <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[var(--accent-blue)] group-hover:underline font-medium opacity-70 group-hover:opacity-100 transition-opacity">
                                  X&apos;te Gor &rarr;
                                </span>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]/20">
                      <button onClick={() => handleResearch(item)} disabled={researchingKey === key}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
                        {researchingKey === key ? "Arastiriliyor..." : (researchData[key]?.summary ? "Tekrar Arastir" : "Arastir")}
                      </button>
                      <button onClick={() => { setWorkflowIdx(isWorkflow ? null : idx); if (!researchData[key]?.summary) handleResearch(item); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                        style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>Tweet Uret</button>
                      {(() => {
                        const firstTw = tweets[0] || item.tweets[0];
                        const twUrl = firstTw?.tweet_url
                          || (firstTw?.tweet_id ? `https://x.com/${firstTw.account}/status/${firstTw.tweet_id}` : "")
                          || (item._discoveryTweet?.tweet_url)
                          || (item.url);
                        return twUrl ? (
                          <a href={twUrl} target="_blank" rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--accent-blue)]/30 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-all inline-flex items-center gap-1">X&apos;te Ac &rarr;</a>
                        ) : null;
                      })()}
                      {item.suggestedHour && generatedTweets[key] && (
                        <button onClick={() => handleScheduleBestTime(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--accent-purple)]/30 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 transition-all">
                          {item.suggestedHour}&apos;de Zamanla
                        </button>
                      )}
                    </div>

                    {/* ── Level 3: Workflow panel ── */}
                    {isWorkflow && (
                      <div className="space-y-3 pt-2">
                        <ResearchPanel
                          research={researchData[key]}
                          isResearching={researchingKey === key}
                          isExpanded={researchExpanded.has(key) || researchExpanded.has("__all__")}
                          onToggleExpand={() => setResearchExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                        />

                        {researchData[key]?.summary && (
                          <div className="space-y-3 pt-2 border-t border-[var(--border-primary)]/20">
                            <StyleFormatBar styles={styles} formats={formats}
                              selectedStyle={tweetStyle} setSelectedStyle={setTweetStyle}
                              selectedFormat={tweetLength} setSelectedFormat={setTweetLength}
                              selectedProvider={provider} setSelectedProvider={setProvider} compact />
                            <button onClick={() => handleGenerate(item)} disabled={generatingKey === key}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>
                              {generatingKey === key ? "Uretiliyor..." : "Tweet Uret"}
                            </button>
                          </div>
                        )}

                        <GenerationPanel
                          generated={generatedTweets[key]}
                          editedText={editedTexts[key] || generatedTweets[key]?.text || ""}
                          setEditedText={(t: string) => setEditedTexts(prev => ({ ...prev, [key]: t }))}
                          isGenerating={generatingKey === key}
                          onGenerate={() => handleGenerate(item)}
                          onPublish={async (text: string, parts?: string[]) => { try { await publishTweet({ text, thread_parts: parts || [] }); } catch { /* ignore */ } }}
                          onOpenInX={openInX}
                          onCopy={copyToClipboard}
                          onSaveDraft={async (text: string) => { await addDraft({ text, topic: item.topic, style: tweetStyle }); }}
                        />

                        {generatedTweets[key] && <LinksBox links={itemUrls[key] || []} />}
                        {generatedTweets[key] && (
                          <MediaSection
                            mediaResults={mediaResults[key]}
                            mediaLoading={mediaLoading === key}
                            onFindMedia={() => handleFindMedia(editedTexts[key] || generatedTweets[key]?.text || item.topic, key)}
                            infographicData={infographicData[key]}
                            infographicLoading={infographicLoading === key}
                            onGenerateInfographic={() => handleInfographic(key, editedTexts[key] || generatedTweets[key]?.text || item.topic, researchData[key]?.key_points || [])}
                            tweetMedia={itemMedia[key]}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
