"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getSmartSuggestions,
  getTrends,
  getDiscoveryTweets,
  getDailyFeed,
  triggerClustering,
  aiScoreSuggestions,
  aiScoreTrends,
  aiScoreDiscoveryTweets,
  publishTweet,
  type DiscoveryTweet,
} from "@/lib/api";
import useResearchWorkflow from "@/hooks/useResearchWorkflow";

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

/* ── Date helpers ──────────────────────────────────── */

const TR_MONTHS = ["Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"];

function formatDateTR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${TR_MONTHS[m - 1]} ${y}`;
}

function todayStr(): string {
  // Turkey is UTC+3
  const now = new Date(Date.now() + 3 * 3600_000);
  return now.toISOString().slice(0, 10);
}

function dateDayLabel(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return "Bugun";
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  const diff = Math.round((t.getTime() - d.getTime()) / 86400_000);
  if (diff === 1) return "Dun";
  if (diff > 1 && diff <= 7) return `${diff} gun once`;
  return "";
}


export default function TabAIOnerileri({ refreshTrigger }: { refreshTrigger?: number }) {
  // Shared research/generate/media workflow
  const wf = useResearchWorkflow();

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);

  // Date navigation
  const [selectedDate, setSelectedDate] = useState<string>(""); // "" = bugün (canlı)
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isLive, setIsLive] = useState(true);

  // Filters
  const [filterSource, setFilterSource] = useState<"all" | "suggestion" | "trend" | "tweet">("all");
  const [filterMinEngagement, setFilterMinEngagement] = useState(0);
  const [sortBy, setSortBy] = useState<"ai" | "engagement" | "newest">("ai");
  const [showFilters, setShowFilters] = useState(false);

  // AI scoring
  const [aiScoring, setAiScoring] = useState(false);

  // Progressive disclosure
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [workflowIdx, setWorkflowIdx] = useState<number | null>(null);

  // Tweet-level progressive disclosure
  const [expandedTweet, setExpandedTweet] = useState<string | null>(null);
  const [workflowTweet, setWorkflowTweet] = useState<string | null>(null);

  // Dismiss (persisted in localStorage with 30-day expiry)
  const DISMISS_EXPIRY_MS = 30 * 86400_000; // 30 gün
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("kesif-dismissed") : null;
      if (!saved) return new Set();
      const parsed = JSON.parse(saved);
      // Eski format uyumluluğu (düz string array)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
        return new Set(parsed);
      }
      // Yeni format — 30 günden eskileri temizle
      const cutoff = Date.now() - DISMISS_EXPIRY_MS;
      const valid = (parsed as { id: string; ts: number }[]).filter(item => item.ts > cutoff);
      if (valid.length < parsed.length) {
        localStorage.setItem("kesif-dismissed", JSON.stringify(valid));
      }
      return new Set(valid.map(item => item.id));
    } catch { return new Set(); }
  });
  const dismissItem = useCallback((key: string) => {
    setDismissed(prev => {
      const next = new Set(prev).add(key);
      try {
        let list: { id: string; ts: number }[] = [];
        const saved = localStorage.getItem("kesif-dismissed");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
            list = parsed;
          }
        }
        if (!list.some(item => item.id === key)) {
          list.push({ id: key, ts: Date.now() });
        }
        localStorage.setItem("kesif-dismissed", JSON.stringify(list));
      } catch { /* localStorage dolu veya erişim yok */ }
      return next;
    });
  }, []);

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

  const buildFeedFromRaw = useCallback((suggestions: Suggestion[], trends: TrendItem[], discoveryTweets: DiscoveryTweet[]) => {
    const sugItems = suggestions.map((s: Suggestion, i: number) => normalizeSuggestion(s, i));
    const trendItems = trends.map((t: TrendItem, i: number) => normalizeTrend(t, i));
    const topTweets = discoveryTweets
      .sort((a: DiscoveryTweet, b: DiscoveryTweet) => (b.engagement_score || 0) - (a.engagement_score || 0))
      .slice(0, 20)
      .map((dt: DiscoveryTweet) => normalizeDiscoveryTweet(dt));

    // Deduplicate — küme topic'leri genellikle uzun cümle, trend keyword'leri kısa
    // Sadece TAMAMEN aynı topic'leri filtrele (kısmi eşleşme dedup yapma)
    const sugTopicsExact = new Set(sugItems.map((s: FeedItem) => s.topic.toLowerCase().trim()));
    const dedupedTrends = trendItems.filter((t: FeedItem) => {
      const kw = t.topic.toLowerCase().trim();
      // Sadece birebir eşleşme varsa filtrele
      return !sugTopicsExact.has(kw);
    });
    const sugTweetIds = new Set(
      sugItems.flatMap((s: FeedItem) => s.tweets.map((tw: ClusterTweet) => tw.tweet_id).filter(Boolean))
    );
    const dedupedTweets = topTweets.filter((t: FeedItem) => {
      const tid = t._discoveryTweet?.tweet_id;
      return !tid || !sugTweetIds.has(tid);
    });

    return [...sugItems, ...dedupedTrends, ...dedupedTweets];
  }, [normalizeSuggestion, normalizeTrend, normalizeDiscoveryTweet]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedDate && selectedDate !== todayStr()) {
        // Geçmiş tarih → arşivden
        const feed = await getDailyFeed(selectedDate);
        setAvailableDates(feed.available_dates || []);
        setIsLive(false);
        const suggestions: Suggestion[] = feed.suggestions || [];
        const trends: TrendItem[] = feed.trends || [];
        const tweets: DiscoveryTweet[] = feed.tweets || [];
        setFeedItems(buildFeedFromRaw(suggestions, trends, tweets));
      } else {
        // Bugün → canlı veri (mevcut davranış) + available_dates
        const [sugRes, trendRes, tweetRes, feedMeta] = await Promise.all([
          getSmartSuggestions().catch(() => ({ suggestions: [] })),
          getTrends().catch(() => ({ trends: [] })),
          getDiscoveryTweets().catch(() => ({ tweets: [] })),
          getDailyFeed().catch(() => ({ available_dates: [] })),
        ]);
        setAvailableDates((feedMeta as { available_dates?: string[] }).available_dates || []);
        setIsLive(true);
        const suggestions: Suggestion[] = sugRes.suggestions || [];
        const trends: TrendItem[] = trendRes.trends || [];
        const discoveryTweets: DiscoveryTweet[] = tweetRes.tweets || [];
        setFeedItems(buildFeedFromRaw(suggestions, trends, discoveryTweets));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedDate, buildFeedFromRaw]);

  useEffect(() => { loadData(); }, [refreshTrigger, loadData, selectedDate]);

  // Styles loaded by wf hook

  // Auto AI scoring on mount (only for live data)
  useEffect(() => {
    if (selectedDate && selectedDate !== todayStr()) return;
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
    setWorkflowIdx(sorted.findIndex((i: FeedItem) => i._key === key));
    const firstTweet = item.tweets[0];
    const tweetUrl = firstTweet?.tweet_url || (firstTweet?.account && firstTweet?.tweet_id ? `https://x.com/${firstTweet.account}/status/${firstTweet.tweet_id}` : undefined);
    await wf.research(key, item.topic, {
      tweetUrl,
      account: firstTweet?.account,
      tweetId: firstTweet?.tweet_id,
      extraContext: item.url ? `Kaynak: ${item.url}` : undefined,
    });
  }, [sorted, wf]);

  const handleGenerate = useCallback(async (item: FeedItem) => {
    const topTweetsContext = item.tweets.length > 0
      ? item.tweets.map((t: ClusterTweet) => `@${t.account}: ${t.text}`).join("\n")
      : "";
    await wf.generateQuote(item._key, {
      originalTweet: item.topic + (topTweetsContext ? `\n\n${topTweetsContext}` : ""),
      originalAuthor: item.tweets[0]?.account || item.topic.slice(0, 50),
    });
  }, [wf]);

  const handleTweetResearch = useCallback(async (compositeKey: string, tweetText: string, tweetUrl: string, account: string, tweetId?: string) => {
    await wf.research(compositeKey, tweetText, { tweetUrl, account, tweetId });
  }, [wf]);

  const handleTweetGenerate = useCallback(async (tw: ClusterTweet, compositeKey: string) => {
    await wf.generateQuote(compositeKey, {
      originalTweet: tw.text,
      originalAuthor: tw.account,
    });
  }, [wf]);

  const handleScheduleBestTime = async (item: FeedItem) => {
    const key = item._key;
    if (!item.suggestedHour) return;
    const now = new Date();
    const [h, m] = item.suggestedHour.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h || 14, m || 7, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    try { await wf.schedule(key, target.toISOString()); } catch { /* ignore */ }
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

  // Date navigation — useMemo MUST be called before any early return (React hooks rule)
  const currentDate = selectedDate || todayStr();
  const allDates = useMemo(() => {
    const set = new Set([todayStr(), ...availableDates]);
    return Array.from(set).sort().reverse();
  }, [availableDates]);

  if (loading) return (
    <div className="text-center py-12">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-[var(--accent-blue)]/30 border-t-[var(--accent-blue)] animate-spin" />
      <div className="text-sm text-[var(--text-secondary)]">3 kaynaktan veriler yukleniyor...</div>
    </div>
  );
  const currentIdx = allDates.indexOf(currentDate);
  const canGoBack = currentIdx < allDates.length - 1;
  const canGoForward = currentIdx > 0;

  const goBack = () => { if (canGoBack) setSelectedDate(allDates[currentIdx + 1]); };
  const goForward = () => {
    if (!canGoForward) return;
    const next = allDates[currentIdx - 1];
    setSelectedDate(next === todayStr() ? "" : next);
  };
  const goToday = () => setSelectedDate("");

  return (
    <div className="space-y-4">
      {/* ════ Date Navigation ════ */}
      <div className="flex items-center justify-center gap-2">
        <button onClick={goBack} disabled={!canGoBack}
          className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={goToday}
          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all min-w-[200px] ${
            isLive
              ? "bg-[var(--accent-blue)]/15 border-[var(--accent-blue)]/30 text-[var(--accent-blue)]"
              : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent-blue)]/40"
          }`}>
          <span>{formatDateTR(currentDate)}</span>
          {dateDayLabel(currentDate) && (
            <span className={`ml-2 text-xs ${isLive ? "text-[var(--accent-green)]" : "text-[var(--text-secondary)]"}`}>
              {isLive ? "Canli" : dateDayLabel(currentDate)}
            </span>
          )}
        </button>
        <button onClick={goForward} disabled={!canGoForward}
          className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* ════ Header ════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-[var(--text-secondary)]">
          {feedItems.length} oneri &middot; {counts.suggestion} kume, {counts.trend} trend, {counts.tweet} tweet
          {!isLive && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">Arsiv</span>}
        </div>
        {isLive && (
          <button onClick={handleRecluster} disabled={clustering}
            className={`btn-primary text-xs inline-flex items-center gap-1.5 ${clustering ? "animate-pulse" : ""}`}>
            {clustering && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
            {clustering ? "Guncelleniyor..." : "Yeniden Kumele"}
          </button>
        )}
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
          <select value={filterSource} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterSource(e.target.value as "all" | "suggestion" | "trend" | "tweet")}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <option value="all">Kaynak: Tumu</option>
            <option value="suggestion">AI Kumeleri</option>
            <option value="trend">Anahtar Kelimeler</option>
            <option value="tweet">Tekil Tweetler</option>
          </select>
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
          {isLive && (
            <button onClick={handleAIScore} disabled={aiScoring}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 disabled:opacity-50">
              {aiScoring ? "Skorlaniyor..." : "AI Skorla"}
            </button>
          )}
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
          styles={wf.styles} formats={wf.formats}
          selectedStyle={wf.selectedStyle} setSelectedStyle={wf.setSelectedStyle}
          selectedFormat={wf.selectedFormat} setSelectedFormat={wf.setSelectedFormat}
          selectedProvider={wf.selectedProvider} setSelectedProvider={wf.setSelectedProvider}
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
                        {/* Time badge */}
                        {item.timestamp && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            (() => { try { return (Date.now() - new Date(item.timestamp).getTime()) > 86400000; } catch { return false; } })()
                              ? "bg-[var(--text-secondary)]/10 text-[var(--text-secondary)]"
                              : "bg-[var(--accent-green)]/10 text-[var(--accent-green)]"
                          }`}>
                            {timeAgo(item.timestamp)} once
                          </span>
                        )}
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
                        <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); dismissItem(key); }}
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

                    {/* Related tweets (for suggestions & trends) — accordion pattern */}
                    {item.source !== "tweet" && tweets.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-[var(--text-secondary)] mb-3">Ilgili Tweetler ({tweets.length})</div>
                        <div className="space-y-2">
                          {tweets.slice(0, 5).map((tw: ClusterTweet, i: number) => {
                            const ck = `${key}::${i}`;
                            const isTwExpanded = expandedTweet === ck;
                            const isTwWorkflow = workflowTweet === ck;
                            const twUrl = tw.tweet_url
                              || (tw.tweet_id ? `https://x.com/${tw.account}/status/${tw.tweet_id}` : "")
                              || (tw.account ? `https://x.com/${tw.account}` : "");

                            return (
                              <div key={i} className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] overflow-hidden transition-all duration-300">
                                {/* Level 1: Tweet summary (always visible) */}
                                <button className="w-full text-left p-3 hover:bg-[var(--accent-blue)]/[0.03] transition-colors"
                                  onClick={() => { setExpandedTweet(isTwExpanded ? null : ck); if (isTwExpanded) setWorkflowTweet(w => w === ck ? null : w); }}>
                                  <div className="flex items-start gap-2.5">
                                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/25 to-[var(--accent-purple)]/15 flex items-center justify-center text-[10px] font-bold text-[var(--accent-blue)] shrink-0">{tw.account.charAt(0).toUpperCase()}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[var(--accent-blue)] text-xs font-semibold">@{tw.account}</span>
                                      </div>
                                      {!isTwExpanded && (
                                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{tw.text}</p>
                                      )}
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2">
                                      {tw.engagement > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-bold tabular-nums">{formatNumber(tw.engagement)}</span>}
                                      <span className="text-xs text-[var(--text-secondary)]" style={{ transform: isTwExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>&#9654;</span>
                                    </div>
                                  </div>
                                </button>

                                {/* Level 2: Expanded tweet + action buttons */}
                                {isTwExpanded && (
                                  <div className="px-3 pb-3 space-y-3 border-t border-[var(--border)]/30">
                                    <div className="pt-2">
                                      <p className="text-sm leading-relaxed text-[var(--text-primary)]">{tw.text}</p>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]/20">
                                      <button onClick={() => handleTweetResearch(ck, tw.text, twUrl, tw.account, tw.tweet_id)}
                                        disabled={wf.researchingKey === ck}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                                        style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
                                        {wf.researchingKey === ck ? "Arastiriliyor..." : (wf.researchData[ck]?.summary ? "Tekrar Arastir" : "Arastir")}
                                      </button>
                                      <button onClick={() => { setWorkflowTweet(isTwWorkflow ? null : ck); if (!wf.researchData[ck]?.summary) handleTweetResearch(ck, tw.text, twUrl, tw.account, tw.tweet_id); }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                                        style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>Tweet Uret</button>
                                      {twUrl && (
                                        <a href={twUrl} target="_blank" rel="noopener noreferrer"
                                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all inline-flex items-center"
                                          onClick={(e: React.MouseEvent) => e.stopPropagation()}>X&apos;te Ac &rarr;</a>
                                      )}
                                    </div>

                                    {/* Level 3: Workflow panel */}
                                    {isTwWorkflow && (
                                      <div className="space-y-3 pt-2">
                                        <ResearchPanel
                                          research={wf.researchData[ck]}
                                          isResearching={wf.researchingKey === ck}
                                          isExpanded={wf.researchExpanded.has(ck) || wf.researchExpanded.has("__all__")}
                                          onToggleExpand={() => wf.toggleResearchExpanded(ck)}
                                        />

                                        {wf.researchData[ck]?.summary && (
                                          <div className="space-y-3 pt-2 border-t border-[var(--border-primary)]/20">
                                            <StyleFormatBar styles={wf.styles} formats={wf.formats}
                                              selectedStyle={wf.selectedStyle} setSelectedStyle={wf.setSelectedStyle}
                                              selectedFormat={wf.selectedFormat} setSelectedFormat={wf.setSelectedFormat}
                                              selectedProvider={wf.selectedProvider} setSelectedProvider={wf.setSelectedProvider} compact />
                                            <button onClick={() => handleTweetGenerate(tw, ck)} disabled={wf.generatingKey === ck}
                                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                                              style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>
                                              {wf.generatingKey === ck ? "Uretiliyor..." : "Tweet Uret"}
                                            </button>
                                          </div>
                                        )}

                                        <GenerationPanel
                                          generated={wf.generatedTexts[ck]}
                                          editedText={wf.editedTexts[ck] || wf.generatedTexts[ck]?.text || ""}
                                          setEditedText={(t: string) => wf.setEditedText(ck, t)}
                                          isGenerating={wf.generatingKey === ck}
                                          onGenerate={() => handleTweetGenerate(tw, ck)}
                                          onPublish={async (text: string, parts?: string[]) => { try { await publishTweet({ text, thread_parts: parts || [] }); } catch { /* ignore */ } }}
                                          onOpenInX={openInX}
                                          onOpenQuote={twUrl ? () => window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(twUrl)}`, "_blank") : undefined}
                                          onCopy={copyToClipboard}
                                          onSaveDraft={async () => { await wf.saveDraft(ck, item.topic); }}
                                          tweetUrl={twUrl}
                                        />

                                        {wf.generatedTexts[ck] && <LinksBox links={wf.extractedMedia[ck]?.urls || []} />}
                                        {wf.generatedTexts[ck] && (
                                          <MediaSection
                                            mediaResults={wf.mediaResults[ck]}
                                            mediaLoading={wf.mediaLoading === ck}
                                            onFindMedia={() => wf.searchMedia(ck, wf.editedTexts[ck] || wf.generatedTexts[ck]?.text || tw.text)}
                                            infographicData={wf.infographicData[ck]}
                                            infographicLoading={wf.infographicLoading === ck}
                                            onGenerateInfographic={() => wf.createInfographic(ck, wf.editedTexts[ck] || wf.generatedTexts[ck]?.text || tw.text, wf.researchData[ck]?.key_points || [])}
                                            tweetMedia={wf.extractedMedia[ck]?.media_items}
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
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]/20">
                      <button onClick={() => handleResearch(item)} disabled={wf.researchingKey === key}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
                        {wf.researchingKey === key ? "Arastiriliyor..." : (wf.researchData[key]?.summary ? "Tekrar Arastir" : "Arastir")}
                      </button>
                      <button onClick={() => { setWorkflowIdx(isWorkflow ? null : idx); if (!wf.researchData[key]?.summary) handleResearch(item); }}
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
                      {item.suggestedHour && wf.generatedTexts[key] && (
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
                          research={wf.researchData[key]}
                          isResearching={wf.researchingKey === key}
                          isExpanded={wf.researchExpanded.has(key) || wf.researchExpanded.has("__all__")}
                          onToggleExpand={() => wf.toggleResearchExpanded(key)}
                        />

                        {wf.researchData[key]?.summary && (
                          <div className="space-y-3 pt-2 border-t border-[var(--border-primary)]/20">
                            <StyleFormatBar styles={wf.styles} formats={wf.formats}
                              selectedStyle={wf.selectedStyle} setSelectedStyle={wf.setSelectedStyle}
                              selectedFormat={wf.selectedFormat} setSelectedFormat={wf.setSelectedFormat}
                              selectedProvider={wf.selectedProvider} setSelectedProvider={wf.setSelectedProvider} compact />
                            <button onClick={() => handleGenerate(item)} disabled={wf.generatingKey === key}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>
                              {wf.generatingKey === key ? "Uretiliyor..." : "Tweet Uret"}
                            </button>
                          </div>
                        )}

                        <GenerationPanel
                          generated={wf.generatedTexts[key]}
                          editedText={wf.editedTexts[key] || wf.generatedTexts[key]?.text || ""}
                          setEditedText={(t: string) => wf.setEditedText(key, t)}
                          isGenerating={wf.generatingKey === key}
                          onGenerate={() => handleGenerate(item)}
                          onPublish={async (text: string, parts?: string[]) => { try { await publishTweet({ text, thread_parts: parts || [] }); } catch { /* ignore */ } }}
                          onOpenInX={openInX}
                          onCopy={copyToClipboard}
                          onSaveDraft={async () => { await wf.saveDraft(key, item.topic); }}
                        />

                        {wf.generatedTexts[key] && <LinksBox links={wf.extractedMedia[key]?.urls || []} />}
                        {wf.generatedTexts[key] && (
                          <MediaSection
                            mediaResults={wf.mediaResults[key]}
                            mediaLoading={wf.mediaLoading === key}
                            onFindMedia={() => wf.searchMedia(key, wf.editedTexts[key] || wf.generatedTexts[key]?.text || item.topic)}
                            infographicData={wf.infographicData[key]}
                            infographicLoading={wf.infographicLoading === key}
                            onGenerateInfographic={() => wf.createInfographic(key, wf.editedTexts[key] || wf.generatedTexts[key]?.text || item.topic, wf.researchData[key]?.key_points || [])}
                            tweetMedia={wf.extractedMedia[key]?.media_items}
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
