"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getSmartSuggestions,
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
  publishTweet,
  type TweetMediaItem,
  type TweetUrl,
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
  created_at?: string;
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "";
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "az once";
  if (mins < 60) return `${mins}dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}s`;
  const days = Math.floor(hours / 24);
  return `${days}g`;
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

/* ── Component ──────────────────────────────────────── */

export default function TabSmartSuggestions({ refreshTrigger }: { refreshTrigger?: number }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [clusteredAt, setClusteredAt] = useState("");
  const [tweetCount, setTweetCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<"all" | "trend" | "news">("all");
  const [filterMinEngagement, setFilterMinEngagement] = useState(0);
  const [sortBy, setSortBy] = useState<"engagement" | "ai" | "newest">("ai");
  const [showFilters, setShowFilters] = useState(false);

  // AI scoring
  const [aiScoring, setAiScoring] = useState(false);
  const [aiScoredCount, setAiScoredCount] = useState(0);

  // Style/format
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Progressive disclosure: expanded card + workflow panel
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [workflowIdx, setWorkflowIdx] = useState<number | null>(null);

  // Research & Generation
  const [researchData, setResearchData] = useState<Record<number, ResearchData>>({});
  const [researchingIdx, setResearchingIdx] = useState<number | null>(null);
  const [researchExpanded, setResearchExpanded] = useState<Set<string>>(new Set(["__all__"]));
  const [generatedTweets, setGeneratedTweets] = useState<Record<number, GeneratedData>>({});
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});

  // Media
  const [mediaResults, setMediaResults] = useState<Record<number, MediaItem[]>>({});
  const [mediaLoading, setMediaLoading] = useState<number | null>(null);
  const [infographicData, setInfographicData] = useState<Record<number, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<number | null>(null);
  const [suggestionMedia, setSuggestionMedia] = useState<Record<number, TweetMediaItem[]>>({});
  const [suggestionUrls, setSuggestionUrls] = useState<Record<number, TweetUrl[]>>({});

  // Dismiss
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // Refs
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  /* ── Load ───────────────────────────────────────────── */

  const loadData = useCallback(() => {
    setLoading(true);
    getSmartSuggestions()
      .then((data: { suggestions?: Suggestion[]; clustered_at?: string; tweet_count?: number }) => {
        setSuggestions(data.suggestions || []);
        setClusteredAt(data.clustered_at || "");
        setTweetCount(data.tweet_count || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    aiScoreSuggestions()
      .then((res: { scored: number }) => { setAiScoredCount(res.scored || 0); if (res.scored > 0) loadData(); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Computed ──────────────────────────────────────── */

  const filtered = useMemo(() => {
    return suggestions.filter((s: Suggestion, i: number) => {
      if (dismissed.has(i)) return false;
      if (filterType !== "all" && s.type !== filterType) return false;
      if (s.engagement_potential < filterMinEngagement) return false;
      return true;
    });
  }, [suggestions, dismissed, filterType, filterMinEngagement]);

  const filteredWithIdx = useMemo(() => {
    const mapped = filtered.map((s: Suggestion) => ({ suggestion: s, originalIdx: suggestions.indexOf(s) }));
    if (sortBy === "ai") mapped.sort((a: { suggestion: Suggestion }, b: { suggestion: Suggestion }) => (b.suggestion.ai_relevance_score || 0) - (a.suggestion.ai_relevance_score || 0));
    else if (sortBy === "newest") mapped.sort((a: { suggestion: Suggestion }, b: { suggestion: Suggestion }) => {
      const ta = a.suggestion.news_date ? new Date(a.suggestion.news_date).getTime() : 0;
      const tb = b.suggestion.news_date ? new Date(b.suggestion.news_date).getTime() : 0;
      return tb - ta;
    });
    return mapped;
  }, [filtered, suggestions, sortBy]);

  const trendCount = useMemo(() => filtered.filter((s: Suggestion) => s.type === "trend").length, [filtered]);
  const newsCount = useMemo(() => filtered.filter((s: Suggestion) => s.type === "news").length, [filtered]);
  const highEngCount = useMemo(() => filtered.filter((s: Suggestion) => s.engagement_potential >= 7).length, [filtered]);

  const activeFilterCount = [filterType !== "all", filterMinEngagement > 0].filter(Boolean).length;

  const scrollToCard = useCallback((idx: number) => {
    setExpandedIdx(idx);
    setTimeout(() => { cardRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  }, []);

  /* ── Handlers ───────────────────────────────────────── */

  const handleRecluster = async () => {
    setClustering(true);
    try { await triggerClustering(); loadData(); } catch { /* ignore */ }
    setClustering(false);
  };

  const handleResearch = useCallback(async (suggestion: Suggestion, idx: number) => {
    setResearchingIdx(idx);
    setWorkflowIdx(idx);
    setResearchData((prev: Record<number, ResearchData>) => ({ ...prev, [idx]: { summary: "", key_points: [], sources: [], progress: "Arastirma baslatiliyor..." } }));

    try {
      const firstTweet = suggestion.tweets?.[0] || suggestion.top_tweets?.[0];
      let researchTopic = suggestion.topic;

      if (firstTweet?.tweet_url || (firstTweet?.account && firstTweet?.tweet_id)) {
        const tweetUrl = firstTweet.tweet_url || `https://x.com/${firstTweet.account}/status/${firstTweet.tweet_id}`;
        try {
          const extracted = await extractTweet(tweetUrl);
          if (extracted?.full_thread_text) researchTopic = extracted.full_thread_text;
          else if (extracted?.text) researchTopic = extracted.text;
          if (extracted?.media_items?.length) setSuggestionMedia((prev: Record<number, TweetMediaItem[]>) => ({ ...prev, [idx]: [...(extracted.media_items || []), ...(extracted.thread_media || [])] }));
          const allUrls = [...(extracted?.urls || []), ...(extracted?.thread_urls || [])];
          if (allUrls.length) setSuggestionUrls((prev: Record<number, TweetUrl[]>) => ({ ...prev, [idx]: allUrls }));
        } catch { /* use original topic */ }
      }

      if (suggestion.url) researchTopic += `\n\nKaynak: ${suggestion.url}`;

      const result = await researchTopicStream(
        { topic: researchTopic, engine: "default", tweet_id: firstTweet?.tweet_id || "", tweet_author: firstTweet?.account || "" },
        (progress: string) => setResearchData((prev: Record<number, ResearchData>) => ({ ...prev, [idx]: { ...prev[idx], progress } })),
      );
      setResearchData((prev: Record<number, ResearchData>) => ({ ...prev, [idx]: { summary: result.summary, key_points: result.key_points, sources: result.sources, progress: "" } }));
    } catch (e) {
      setResearchData((prev: Record<number, ResearchData>) => ({ ...prev, [idx]: { ...prev[idx], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` } }));
    } finally { setResearchingIdx(null); }
  }, []);

  const handleGenerate = useCallback(async (suggestion: Suggestion, idx: number) => {
    setGeneratingIdx(idx);
    try {
      const research = researchData[idx];
      const researchSummary = research?.summary ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}` : "";
      const tweets = suggestion.tweets || suggestion.top_tweets || [];
      const topTweetsContext = tweets.length > 0 ? tweets.map((t: ClusterTweet) => `@${t.account}: ${t.text}`).join("\n") : "";

      const result = await generateQuoteTweet({
        original_tweet: suggestion.topic + (topTweetsContext ? `\n\n${topTweetsContext}` : ""),
        original_author: (suggestion.tweets?.[0]?.account || suggestion.top_tweets?.[0]?.account || suggestion.topic.slice(0, 50)),
        style: tweetStyle, research_summary: researchSummary, length_preference: tweetLength, provider: provider || undefined,
      });
      const text = result.text || "";
      setGeneratedTweets((prev: Record<number, GeneratedData>) => ({ ...prev, [idx]: { text, score: result.score?.overall || 0, thread_parts: result.thread_parts } }));
      setEditedTexts((prev: Record<number, string>) => ({ ...prev, [idx]: text }));
    } catch (e) {
      const errText = `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`;
      setGeneratedTweets((prev: Record<number, GeneratedData>) => ({ ...prev, [idx]: { text: errText, score: 0 } }));
      setEditedTexts((prev: Record<number, string>) => ({ ...prev, [idx]: errText }));
    } finally { setGeneratingIdx(null); }
  }, [researchData, tweetStyle, tweetLength, provider]);

  const handleFindMedia = useCallback(async (topic: string, idx: number) => {
    setMediaLoading(idx);
    try { const r = await findMedia(topic.slice(0, 100), "both"); setMediaResults((prev: Record<number, MediaItem[]>) => ({ ...prev, [idx]: r.results || [] })); }
    catch { /* ignore */ }
    finally { setMediaLoading(null); }
  }, []);

  const handleInfographic = useCallback(async (idx: number, topic: string, keyPoints: string[]) => {
    setInfographicLoading(idx);
    try {
      const result = await generateInfographic({ topic, key_points: keyPoints });
      if (result.image_base64) setInfographicData((prev: Record<number, { image: string; format: string }>) => ({ ...prev, [idx]: { image: result.image_base64, format: result.image_format || "png" } }));
    } catch { /* ignore */ }
    finally { setInfographicLoading(null); }
  }, []);

  const handleScheduleBestTime = async (idx: number) => {
    const text = editedTexts[idx];
    const s = suggestions[idx];
    if (!text || !s.suggested_hour) return;
    const now = new Date();
    const [h, m] = s.suggested_hour.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h || 14, m || 7, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    try { await schedulePost({ text, scheduled_time: target.toISOString() }); } catch { /* ignore */ }
  };

  /* ── Engagement color helper ─────────────────────── */

  const engagementColor = (val: number) => {
    if (val >= 7) return "var(--accent-green)";
    if (val >= 4) return "var(--accent-amber)";
    return "var(--text-secondary)";
  };

  /* ── Render ─────────────────────────────────────────── */

  if (loading) return (
    <div className="text-center py-12">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-[var(--accent-blue)]/30 border-t-[var(--accent-blue)] animate-spin" />
      <div className="text-sm text-[var(--text-secondary)]">Yukleniyor...</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ════ Header ════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-[var(--text-secondary)]">
          {tweetCount > 0 && `${tweetCount} tweet analiz edildi`}
          {clusteredAt && ` · Son kume: ${timeAgo(clusteredAt)} once`}
        </div>
        <button onClick={handleRecluster} disabled={clustering}
          className={`btn-primary text-xs inline-flex items-center gap-1.5 ${clustering ? "animate-pulse" : ""}`}>
          {clustering && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
          {clustering ? "Kumeleniyor..." : "Yeniden Kumele"}
        </button>
      </div>

      {/* ════ Overview Panel ════ */}
      {filteredWithIdx.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm font-bold text-[var(--text-primary)]">Oneri Ozeti</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium">{filtered.length} oneri</span>
            {highEngCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-medium">{highEngCount} yuksek</span>}
            {trendCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] font-medium">{trendCount} trend</span>}
            {dismissed.size > 0 && <span className="text-[10px] text-[var(--text-secondary)]">({dismissed.size} gizlendi)</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredWithIdx.map(({ suggestion, originalIdx: idx }: { suggestion: Suggestion; originalIdx: number }) => (
              <button key={idx} onClick={() => scrollToCard(idx)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105 ${
                  suggestion.engagement_potential >= 7
                    ? "bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--accent-green)]/5 text-[var(--accent-green)] border-[var(--accent-green)]/30"
                    : expandedIdx === idx
                      ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/40"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/40"
                }`}>
                <span className="text-[10px]">{suggestion.type === "trend" ? "\u{1F4C8}" : "\u{1F4F0}"}</span>
                <span className="max-w-[120px] truncate">{suggestion.topic_tr || suggestion.topic}</span>
                <AIScoreBadge score={suggestion.ai_relevance_score} reason={suggestion.ai_relevance_reason} size="sm" />
                <span className="text-[10px] font-bold" style={{ color: engagementColor(suggestion.engagement_potential) }}>{suggestion.engagement_potential}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Filter Bar (2-tier) ═══ */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Type filter — only trends (news removed) */}
          <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
            {(["all", "trend"] as const).map((t: "all" | "trend") => (
              <button key={t} onClick={() => setFilterType(t as "all" | "trend" | "news")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterType === t ? "bg-[var(--accent-blue)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {t === "all" ? "Tumu" : "Trendler"}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as "engagement" | "ai" | "newest")}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <option value="ai">Siralama: AI Onerisi</option>
            <option value="newest">Siralama: Yeniden Eskiye</option>
            <option value="engagement">Siralama: Engagement</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)]"
            }`}>Filtreler{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</button>
          <button onClick={async () => {
              setAiScoring(true);
              try { const res = await aiScoreSuggestions(); setAiScoredCount(res.scored || 0); if (res.scored > 0) await loadData(); } catch { /* ignore */ }
              setAiScoring(false);
            }} disabled={aiScoring}
            className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 disabled:opacity-50">
            {aiScoring ? "Skorlaniyor..." : `AI Skorla${aiScoredCount > 0 ? ` (${aiScoredCount})` : ""}`}
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

      {/* ════ Suggestion Cards ════ */}
      {filteredWithIdx.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/10 to-[var(--accent-purple)]/10 flex items-center justify-center">
            <span className="text-2xl">&#128161;</span>
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Henuz oneri yok</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Trend analizi ve haber taramasi verileri biriktikce oneriler burada gorunecek.</p>
          <button onClick={handleRecluster} disabled={clustering} className={`mt-4 btn-primary text-xs ${clustering ? "animate-pulse" : ""}`}>
            {clustering ? "Kumeleniyor..." : "Yeniden Kumele"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWithIdx.map(({ suggestion, originalIdx: idx }: { suggestion: Suggestion; originalIdx: number }) => {
            const isExpanded = expandedIdx === idx;
            const isWorkflow = workflowIdx === idx;
            const isTrend = suggestion.type === "trend";
            const tweets = suggestion.tweets || suggestion.top_tweets || [];

            return (
              <div key={idx} ref={(el: HTMLDivElement | null) => { cardRefs.current[idx] = el; }}
                className={`glass-card overflow-hidden transition-all duration-300 ${isExpanded ? "ring-1 ring-[var(--accent-blue)]/40" : ""}`}>

                {/* Top accent gradient */}
                <div className="h-1 rounded-t-xl" style={{
                  background: suggestion.engagement_potential >= 7
                    ? "linear-gradient(90deg, var(--accent-green), var(--accent-green)/30)"
                    : suggestion.engagement_potential >= 4
                      ? "linear-gradient(90deg, var(--accent-amber), var(--accent-amber)/30)"
                      : "linear-gradient(90deg, var(--bg-secondary), transparent)"
                }} />

                {/* ── Level 1: Card Header (always visible, clickable) ── */}
                <div className="w-full text-left p-4 hover:bg-[var(--bg-secondary)]/30 transition-colors cursor-pointer" role="button" tabIndex={0}
                  onClick={() => { setExpandedIdx(isExpanded ? null : idx); if (isExpanded) setWorkflowIdx((w: number | null) => w === idx ? null : w); }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Type badge + AI score + Topic */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide shrink-0 ${
                          isTrend ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30" : "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30"
                        }`}>{isTrend ? "TREND" : "HABER"}</span>
                        <AIScoreBadge score={suggestion.ai_relevance_score} reason={suggestion.ai_relevance_reason} />
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">{suggestion.topic_tr || suggestion.topic}</h3>
                      </div>

                      {/* English subtitle */}
                      {suggestion.topic_tr && suggestion.topic_tr !== suggestion.topic && (
                        <p className="text-[11px] text-[var(--text-secondary)]/60 mb-0.5 italic">{suggestion.topic}</p>
                      )}

                      {/* Turkish description preview */}
                      {suggestion.description_tr && !isExpanded && (
                        <p className="text-xs text-[var(--accent-cyan)] mt-0.5 mb-1 leading-relaxed line-clamp-2 font-medium">{suggestion.description_tr}</p>
                      )}

                      {/* Reason */}
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">{suggestion.reason}</p>

                      {/* Metadata row */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {suggestion.suggested_hour && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20">Saat: {suggestion.suggested_hour}</span>
                        )}
                        {tweets.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">{tweets.length} tweet</span>}
                        {suggestion.news_source && <span className="text-[10px] text-[var(--text-secondary)]">Kaynak: {suggestion.news_source}</span>}
                        {suggestion.source_keywords && suggestion.source_keywords.length > 0 && suggestion.source_keywords.slice(0, 3).map((kw: string, i: number) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">{kw}</span>
                        ))}
                      </div>
                    </div>

                    {/* Right: engagement gauge + dismiss + expand */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex flex-col items-center">
                        <CircularGauge value={suggestion.engagement_potential} maxValue={10} size={48} strokeWidth={3}
                          colorFn={(v: number) => engagementColor(v)} />
                        <span className="text-[8px] text-[var(--text-secondary)] mt-0.5">potansiyel</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDismissed((prev: Set<number>) => new Set(prev).add(idx)); }}
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
                    {suggestion.description_tr && (
                      <p className="text-xs text-[var(--accent-cyan)] leading-relaxed">{suggestion.description_tr}</p>
                    )}

                    {/* Reasoning */}
                    {suggestion.reasoning && (
                      <p className="text-[11px] text-[var(--accent-amber)]/80 leading-relaxed">{suggestion.reasoning}</p>
                    )}

                    {/* Related tweets */}
                    {tweets.filter((t: ClusterTweet) => !isLowQualityTweet(t.text)).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Ilgili Tweetler</h4>
                        {tweets.filter((t: ClusterTweet) => !isLowQualityTweet(t.text)).map((tw: ClusterTweet, i: number) => {
                          const tweetUrl = tw.tweet_url
                            || (tw.tweet_id ? `https://x.com/${tw.account}/status/${tw.tweet_id}` : "")
                            || (tw.account ? `https://x.com/search?q=from:${tw.account} ${encodeURIComponent(tw.text.slice(0, 40))}` : "")
                            || (tw.account ? `https://x.com/${tw.account}` : "");
                          return (
                          <div key={i} className="text-xs bg-[var(--bg-primary)] rounded-lg px-3 py-2.5 border border-[var(--border)] hover:border-[var(--accent-blue)]/40 transition-colors cursor-pointer"
                            onClick={() => tweetUrl && window.open(tweetUrl, '_blank')}>
                            <div className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--accent-blue)] shrink-0">{tw.account.charAt(0).toUpperCase()}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <a href={`https://x.com/${tw.account}`} target="_blank" rel="noopener noreferrer" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="font-semibold text-[var(--accent-blue)] hover:underline text-[11px]">@{tw.account}</a>
                                  {tw.created_at && relativeTime(tw.created_at) && (
                                    <span className="text-[10px] text-[var(--text-tertiary)]">&middot; {relativeTime(tw.created_at)}</span>
                                  )}
                                  {tw.engagement > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] font-medium ml-auto shrink-0">{tw.engagement.toFixed(0)}</span>}
                                </div>
                                <p className="text-[var(--text-primary)] line-clamp-2 mt-0.5 leading-relaxed">{tw.text}</p>
                                {tweetUrl && (
                                  <a href={tweetUrl} target="_blank" rel="noopener noreferrer" onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[var(--accent-blue)] hover:underline font-medium">
                                    X{"'"}te Gor &rarr;
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]/20">
                      <button onClick={() => handleResearch(suggestion, idx)} disabled={researchingIdx === idx}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
                        {researchingIdx === idx ? "Arastiriliyor..." : (researchData[idx]?.summary ? "Tekrar Arastir" : "Arastir")}
                      </button>
                      <button onClick={() => { setWorkflowIdx(isWorkflow ? null : idx); if (!researchData[idx]?.summary) handleResearch(suggestion, idx); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                        style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>Tweet Uret</button>
                      {suggestion.suggested_hour && generatedTweets[idx] && (
                        <button onClick={() => handleScheduleBestTime(idx)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--accent-purple)]/30 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 transition-all">
                          {suggestion.suggested_hour}&apos;de Zamanla
                        </button>
                      )}
                    </div>

                    {/* ── Level 3: Workflow panel ── */}
                    {isWorkflow && (
                      <div className="space-y-3 pt-2">
                        <ResearchPanel
                          research={researchData[idx]}
                          isResearching={researchingIdx === idx}
                          isExpanded={researchExpanded.has(String(idx)) || researchExpanded.has("__all__")}
                          onToggleExpand={() => setResearchExpanded((prev: Set<string>) => { const n = new Set(prev); const k = String(idx); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                        />

                        {researchData[idx]?.summary && (
                          <div className="space-y-3 pt-2 border-t border-[var(--border-primary)]/20">
                            <StyleFormatBar styles={styles} formats={formats}
                              selectedStyle={tweetStyle} setSelectedStyle={setTweetStyle}
                              selectedFormat={tweetLength} setSelectedFormat={setTweetLength}
                              selectedProvider={provider} setSelectedProvider={setProvider} compact />
                            <button onClick={() => handleGenerate(suggestion, idx)} disabled={generatingIdx === idx}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>
                              {generatingIdx === idx ? "Uretiliyor..." : "Tweet Uret"}
                            </button>
                          </div>
                        )}

                        <GenerationPanel
                          generated={generatedTweets[idx]}
                          editedText={editedTexts[idx] || generatedTweets[idx]?.text || ""}
                          setEditedText={(t: string) => setEditedTexts((prev: Record<number, string>) => ({ ...prev, [idx]: t }))}
                          isGenerating={generatingIdx === idx}
                          onGenerate={() => handleGenerate(suggestion, idx)}
                          onPublish={async (text: string, parts?: string[]) => { try { await publishTweet({ text, thread_parts: parts || [] }); } catch { /* ignore */ } }}
                          onOpenInX={openInX}
                          onCopy={copyToClipboard}
                          onSaveDraft={async (text: string) => { await addDraft({ text, topic: suggestion.topic, style: tweetStyle }); }}
                        />

                        {generatedTweets[idx] && <LinksBox links={suggestionUrls[idx] || []} />}
                        {generatedTweets[idx] && (
                          <MediaSection
                            mediaResults={mediaResults[idx]}
                            mediaLoading={mediaLoading === idx}
                            onFindMedia={() => handleFindMedia(editedTexts[idx] || generatedTweets[idx]?.text || suggestion.topic, idx)}
                            infographicData={infographicData[idx]}
                            infographicLoading={infographicLoading === idx}
                            onGenerateInfographic={() => handleInfographic(idx, editedTexts[idx] || generatedTweets[idx]?.text || suggestion.topic, researchData[idx]?.key_points || [])}
                            tweetMedia={suggestionMedia[idx]}
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
