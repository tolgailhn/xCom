"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getTrends,
  getTrendHistory,
  triggerTrendAnalysis,
  researchTopicStream,
  generateTweet,
  generateQuoteTweet,
  extractTweet,
  getStyles,
  addDraft,
  findMedia,
  generateInfographic,
  aiScoreTrends,
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
  formatNumber,
  formatDateStr,
  formatDateLabel,
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

interface TrendTweet {
  tweet_id?: string;
  text: string;
  account: string;
  engagement: number;
  tweet_url?: string;
  summary_tr?: string;
  created_at?: string;
}

interface Trend {
  keyword: string;
  account_count: number;
  accounts: string[];
  total_engagement: number;
  trend_score: number;
  tweet_count: number;
  top_tweets: TrendTweet[];
  is_strong_trend: boolean;
  detected_at: string;
  ai_relevance_score?: number;
  ai_relevance_reason?: string;
}

interface TrendHistoryEntry {
  date: string;
  analysis_date: string;
  trends: Trend[];
  total_tweets_analyzed: number;
}

/* ── Component ──────────────────────────────────────── */

export default function TabTrends({ refreshTrigger }: { refreshTrigger?: number }) {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [trendHistory, setTrendHistory] = useState<TrendHistoryEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [totalAnalyzed, setTotalAnalyzed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Day navigation
  const [selectedDate, setSelectedDate] = useState<string>("today");

  // Filters
  const [filterStrong, setFilterStrong] = useState(false);
  const [filterMinScore, setFilterMinScore] = useState(0);
  const [filterAccount, setFilterAccount] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "ai">("ai");
  const [hideGM, setHideGM] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // AI scoring
  const [aiScoring, setAiScoring] = useState(false);
  const [aiScoredCount, setAiScoredCount] = useState(0);

  // Expansion: trend-level + tweet-level progressive disclosure
  const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
  const [expandedTweet, setExpandedTweet] = useState<string | null>(null);  // compositeKey
  const [workflowTweet, setWorkflowTweet] = useState<string | null>(null);  // compositeKey

  // Research & Generation (both trend-level and tweet-level share same maps)
  const [researchData, setResearchData] = useState<Record<string, ResearchData>>({});
  const [researchingKey, setResearchingKey] = useState<string | null>(null);
  const [generatedTexts, setGeneratedTexts] = useState<Record<string, GeneratedData>>({});
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [researchExpanded, setResearchExpanded] = useState<Set<string>>(new Set(["__all__"]));

  // Media
  const [tweetMedia, setTweetMedia] = useState<Record<string, TweetMediaItem[]>>({});
  const [tweetUrls, setTweetUrls] = useState<Record<string, TweetUrl[]>>({});
  const [mediaResults, setMediaResults] = useState<Record<string, MediaItem[]>>({});
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);
  const [infographicData, setInfographicData] = useState<Record<string, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<string | null>(null);

  // Style/format/provider
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("informative");
  const [selectedFormat, setSelectedFormat] = useState("spark");
  const [selectedProvider, setSelectedProvider] = useState("");

  // Refs
  const trendRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* ── Load data ──────────────────────────────────────── */

  const loadTrends = useCallback(async () => {
    try {
      const [trendData, historyData] = await Promise.all([
        getTrends(),
        getTrendHistory().catch(() => ({ history: [] })),
      ]);
      setTrends(trendData.trends || []);
      setLastUpdated(trendData.last_updated || "");
      setTotalAnalyzed(trendData.total_tweets_analyzed || 0);
      setTrendHistory(historyData.history || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTrends(); }, [refreshTrigger, loadTrends]);

  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => { setStyles(r.styles); setFormats(r.formats); })
      .catch(() => {});
  }, []);

  // Auto AI scoring on mount
  useEffect(() => {
    aiScoreTrends()
      .then((res: { scored: number }) => { setAiScoredCount(res.scored || 0); if (res.scored > 0) loadTrends(); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Computed ──────────────────────────────────────── */

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    if (trends.length > 0) dates.add(formatDateStr(new Date()));
    for (const h of trendHistory) { if (h.date) dates.add(h.date); }
    return Array.from(dates).sort().reverse();
  }, [trends, trendHistory]);

  const displayTrends = useMemo(() => {
    if (selectedDate === "today" || selectedDate === formatDateStr(new Date())) return trends;
    const entry = trendHistory.find((h: TrendHistoryEntry) => h.date === selectedDate);
    return entry?.trends || [];
  }, [selectedDate, trends, trendHistory]);

  const goToDate = (offset: number) => {
    const currentIdx = selectedDate === "today" ? 0 : availableDates.indexOf(selectedDate);
    const newIdx = Math.max(0, Math.min(availableDates.length - 1, currentIdx + offset));
    setSelectedDate(availableDates[newIdx] || "today");
  };

  const filteredTrends = useMemo(() => {
    let result = displayTrends;
    if (filterStrong) result = result.filter((t: Trend) => t.is_strong_trend);
    if (filterMinScore > 0) result = result.filter((t: Trend) => t.trend_score >= filterMinScore);
    if (filterAccount) result = result.filter((t: Trend) => t.accounts.some((a: string) => a.toLowerCase().includes(filterAccount.toLowerCase())));
    if (sortBy === "ai") result = [...result].sort((a, b) => (b.ai_relevance_score || 0) - (a.ai_relevance_score || 0));
    return result;
  }, [displayTrends, filterStrong, filterMinScore, filterAccount, sortBy]);

  const maxScore = useMemo(() => Math.max(...(filteredTrends.map((t: Trend) => t.trend_score) || [1])), [filteredTrends]);

  const allAccounts = useMemo(() => {
    const acc = new Set<string>();
    displayTrends.forEach((t: Trend) => t.accounts.forEach((a: string) => acc.add(a)));
    return Array.from(acc).sort();
  }, [displayTrends]);

  const strongCount = useMemo(() => filteredTrends.filter((t: Trend) => t.is_strong_trend).length, [filteredTrends]);

  const activeFilterCount = [filterStrong, hideGM, filterMinScore > 0, filterAccount].filter(Boolean).length;

  const scrollToTrend = useCallback((keyword: string) => {
    setExpandedTrend(keyword);
    setTimeout(() => { trendRefs.current[keyword]?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  }, []);

  /* ── Handlers ───────────────────────────────────────── */

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try { await triggerTrendAnalysis(); await loadTrends(); } catch { /* ignore */ }
    finally { setAnalyzing(false); }
  };

  const handleResearch = useCallback(async (key: string, topic: string, tweetUrl?: string, account?: string, tweetId?: string) => {
    setResearchingKey(key);
    setWorkflowTweet(key);
    setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [key]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." } }));

    try {
      let fullText = topic;
      if (tweetUrl) {
        try {
          const extracted = await extractTweet(tweetUrl);
          if (extracted?.full_thread_text) fullText = extracted.full_thread_text;
          else if (extracted?.text) fullText = extracted.text;
          if (extracted?.media_items?.length) setTweetMedia((prev: Record<string, TweetMediaItem[]>) => ({ ...prev, [key]: extracted.media_items }));
          const allUrls = [...(extracted?.urls || []), ...(extracted?.thread_urls || [])];
          if (allUrls.length) setTweetUrls((prev: Record<string, TweetUrl[]>) => ({ ...prev, [key]: allUrls }));
          if (extracted?.thread_media?.length) setTweetMedia((prev: Record<string, TweetMediaItem[]>) => ({ ...prev, [key]: [...(prev[key] || []), ...extracted.thread_media] }));
        } catch { fullText = topic; }
      }

      const result = await researchTopicStream(
        { topic: fullText, engine: "default", tweet_id: tweetId || "", tweet_author: account || "" },
        (progress: string) => setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [key]: { ...prev[key], progress } })),
      );
      setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [key]: { summary: result.summary, key_points: result.key_points, sources: result.sources, progress: "" } }));
    } catch (e) {
      setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [key]: { ...prev[key], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` } }));
    } finally { setResearchingKey(null); }
  }, []);

  const handleTrendGenerate = useCallback(async (trend: Trend) => {
    const key = trend.keyword;
    setGeneratingKey(key);
    try {
      const research = researchData[key];
      const researchContext = research?.summary ? `Arastirma Ozeti:\n${research.summary}\n\nAnahtar Noktalar:\n${research.key_points.join("\n")}` : "";
      const tweetContext = trend.top_tweets.slice(0, 3).map(t => `@${t.account} (${t.engagement} eng): ${t.text}`).join("\n---\n");
      const result = await generateTweet({
        topic: `${trend.keyword} hakkinda tweet yaz`,
        style: selectedStyle, length: selectedFormat, content_format: selectedFormat,
        research_context: researchContext ? `${researchContext}\n\nTrend Tweet Ornekleri:\n${tweetContext}` : `Trend: ${trend.keyword}\n${trend.account_count} hesapta goruldu.\n\nOrnek Tweetler:\n${tweetContext}`,
        provider: selectedProvider || undefined,
      });
      setGeneratedTexts((prev: Record<string, GeneratedData>) => ({ ...prev, [key]: { text: result.tweet || result.text || "", score: result.score?.overall || result.quality_score || 0, thread_parts: result.thread_parts } }));
    } catch (e) {
      setGeneratedTexts((prev: Record<string, GeneratedData>) => ({ ...prev, [key]: { text: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`, score: 0 } }));
    } finally { setGeneratingKey(null); }
  }, [researchData, selectedStyle, selectedFormat, selectedProvider]);

  const handleTweetGenerate = useCallback(async (tw: TrendTweet, compositeKey: string) => {
    setGeneratingKey(compositeKey);
    try {
      const research = researchData[compositeKey];
      const researchSummary = research?.summary ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}` : "";
      const result = await generateQuoteTweet({
        original_tweet: tw.text, original_author: tw.account, style: selectedStyle,
        research_summary: researchSummary, length_preference: selectedFormat, provider: selectedProvider || undefined,
      });
      const text = result.text || "";
      setGeneratedTexts((prev: Record<string, GeneratedData>) => ({ ...prev, [compositeKey]: { text, score: result.score?.overall || 0, thread_parts: result.thread_parts } }));
      setEditedTexts((prev: Record<string, string>) => ({ ...prev, [compositeKey]: text }));
    } catch (e) {
      const errText = `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`;
      setGeneratedTexts((prev: Record<string, GeneratedData>) => ({ ...prev, [compositeKey]: { text: errText, score: 0 } }));
    } finally { setGeneratingKey(null); }
  }, [researchData, selectedStyle, selectedFormat, selectedProvider]);

  const handleFindMedia = useCallback(async (key: string, query: string) => {
    setMediaLoading(key);
    try { const r = await findMedia(query.slice(0, 200), "both"); setMediaResults((prev: Record<string, MediaItem[]>) => ({ ...prev, [key]: r.results || [] })); }
    catch { setMediaResults((prev: Record<string, MediaItem[]>) => ({ ...prev, [key]: [] })); }
    finally { setMediaLoading(null); }
  }, []);

  const handleInfographic = useCallback(async (key: string, topic: string, keyPoints: string[]) => {
    setInfographicLoading(key);
    try {
      const result = await generateInfographic({ topic, key_points: keyPoints });
      if (result.image_base64) setInfographicData((prev: Record<string, { image: string; format: string }>) => ({ ...prev, [key]: { image: result.image_base64, format: result.image_format || "png" } }));
    } catch { /* ignore */ }
    finally { setInfographicLoading(null); }
  }, []);

  /* ── Score helpers ─────────────────────────────────── */

  const scoreColor = (score: number) => {
    const pct = maxScore > 0 ? score / maxScore : 0;
    if (pct >= 0.7) return "var(--accent-green)";
    if (pct >= 0.4) return "var(--accent-amber)";
    return "var(--text-secondary)";
  };

  /* ── Render ─────────────────────────────────────────── */

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-[var(--text-secondary)]">
          {totalAnalyzed > 0 && `${totalAnalyzed} tweet analiz edildi`}
          {lastUpdated && ` · Son: ${new Date(lastUpdated).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
        <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary text-xs">
          {analyzing ? "Analiz ediliyor..." : "Trend Analiz Et"}
        </button>
      </div>

      {/* ════ Trend Overview Panel ════ */}
      {filteredTrends.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--text-primary)]">Trend Ozeti</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium">{filteredTrends.length} trend</span>
              {strongCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] font-medium">{strongCount} guclu</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredTrends.map((t: Trend) => (
              <button key={t.keyword} onClick={() => scrollToTrend(t.keyword)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105 ${
                  t.is_strong_trend
                    ? "bg-gradient-to-r from-[var(--accent-amber)]/20 to-[var(--accent-amber)]/5 text-[var(--accent-amber)] border-[var(--accent-amber)]/30 hover:border-[var(--accent-amber)]/60"
                    : expandedTrend === t.keyword
                      ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/40"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/40"
                }`}>
                {t.is_strong_trend && <span className="text-[10px]">&#9650;</span>}
                <span>{t.keyword}</span>
                <AIScoreBadge score={t.ai_relevance_score} reason={t.ai_relevance_reason} size="sm" />
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">{t.account_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day navigation */}
      {availableDates.length > 0 && (
        <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)]/60 backdrop-blur-sm rounded-full p-1.5 border border-[var(--border)]/50">
          <button onClick={() => goToDate(1)} disabled={availableDates.indexOf(selectedDate === "today" ? availableDates[0] : selectedDate) >= availableDates.length - 1}
            className="px-3.5 py-2 rounded-full text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] disabled:opacity-30 transition-all">&#8592;</button>
          <div className="flex-1 flex items-center justify-center gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">{selectedDate === "today" ? "Bugun" : formatDateLabel(selectedDate)}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] font-medium">{filteredTrends.length} trend</span>
          </div>
          <button onClick={() => goToDate(-1)} disabled={selectedDate === "today" || availableDates.indexOf(selectedDate) <= 0}
            className="px-3.5 py-2 rounded-full text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] disabled:opacity-30 transition-all">&#8594;</button>
          <button onClick={() => setSelectedDate("today")}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 ${
              selectedDate === "today" ? "bg-[var(--accent-blue)] text-white shadow-[0_0_12px_var(--accent-blue)/30]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
            }`}>Bugun</button>
        </div>
      )}

      {/* ═══ Filter Bar (2-tier) ═══ */}
      <div className="space-y-2">
        {/* Tier 1: Always visible */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={sortBy} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as "score" | "ai")}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <option value="ai">Siralama: AI Onerisi</option>
            <option value="score">Siralama: Skor</option>
          </select>
          {allAccounts.length > 0 && (
            <select value={filterAccount} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterAccount(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
              <option value="">Tum Hesaplar</option>
              {allAccounts.map((a: string) => <option key={a} value={a}>@{a}</option>)}
            </select>
          )}
          <button onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-blue)]/50"
            }`}>
            Filtreler{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <button onClick={async () => {
              setAiScoring(true);
              try { const res = await aiScoreTrends(); setAiScoredCount(res.scored || 0); if (res.scored > 0) await loadTrends(); } catch { /* ignore */ }
              setAiScoring(false);
            }} disabled={aiScoring}
            className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/30 disabled:opacity-50">
            {aiScoring ? "Skorlaniyor..." : `AI Skorla${aiScoredCount > 0 ? ` (${aiScoredCount})` : ""}`}
          </button>
        </div>

        {/* Tier 2: Collapsible */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-[var(--bg-secondary)]/40 border border-[var(--border)]/30">
            <button onClick={() => setFilterStrong(!filterStrong)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterStrong ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/30" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)]"
              }`}>Guclu Trendler</button>
            <button onClick={() => setHideGM(!hideGM)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                hideGM ? "bg-[var(--accent-red)]/20 text-[var(--accent-red)] border-[var(--accent-red)]/30" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)]"
              }`}>GM/GN Gizle</button>
            <select value={filterMinScore} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterMinScore(Number(e.target.value))}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
              <option value={0}>Min Skor: Tumu</option>
              <option value={100}>100+</option>
              <option value={500}>500+</option>
              <option value={1000}>1000+</option>
            </select>
          </div>
        )}
      </div>

      {/* Style/Format/Provider */}
      <div className="glass-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">Tweet Uretim Ayarlari</span>
        </div>
        <StyleFormatBar
          styles={styles} formats={formats}
          selectedStyle={selectedStyle} setSelectedStyle={setSelectedStyle}
          selectedFormat={selectedFormat} setSelectedFormat={setSelectedFormat}
          selectedProvider={selectedProvider} setSelectedProvider={setSelectedProvider}
          compact
        />
      </div>

      {/* ════ Trend Cards ════ */}
      {filteredTrends.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent-blue)]/10 to-[var(--accent-purple)]/10 border border-[var(--border)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--text-secondary)] opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {displayTrends.length === 0 ? "Henuz trend tespit edilmedi" : "Filtrelere uyan trend yok"}
            </div>
            <div className="text-xs text-[var(--text-secondary)] max-w-sm leading-relaxed">
              {displayTrends.length === 0 ? "\"Trend Analiz Et\" butonu ile hemen analiz baslatin." : "Filtreleri genisleterek daha fazla sonuc gorebilirsiniz."}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTrends.map((trend: Trend) => {
            const key = trend.keyword;
            const isExpanded = expandedTrend === key;
            const trendColor = trend.is_strong_trend ? "var(--accent-amber)" : "var(--accent-blue)";
            const scorePct = maxScore > 0 ? (trend.trend_score / maxScore) * 100 : 0;

            return (
              <div key={key} ref={(el: HTMLDivElement | null) => { trendRefs.current[key] = el; }}
                className="glass-card overflow-hidden hover:shadow-lg transition-all duration-300"
                style={{ borderLeft: `3px solid ${trendColor}` }}>

                {/* ──── Trend Header (clickable) ──── */}
                <button className="w-full text-left p-4 hover:bg-[var(--accent-blue)]/5 transition-all duration-200"
                  onClick={() => setExpandedTrend(isExpanded ? null : key)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Keyword + badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-xl font-extrabold tracking-tight" style={{ color: trendColor }}>{key}</span>
                        {trend.is_strong_trend && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-[var(--accent-amber)]/25 to-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">&#9650; GUCLU TREND</span>
                        )}
                        <AIScoreBadge score={trend.ai_relevance_score} reason={trend.ai_relevance_reason} />
                        <span className="text-sm text-[var(--text-secondary)]" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s", display: "inline-block" }}>&#9654;</span>
                      </div>

                      {/* Score gauge + account pills */}
                      <div className="flex items-center gap-3 mb-2">
                        <CircularGauge value={trend.trend_score} maxValue={maxScore} size={44} strokeWidth={3}
                          colorFn={() => scoreColor(trend.trend_score)} />
                        <div className="flex flex-wrap gap-1.5">
                          {trend.accounts.slice(0, 5).map((acc: string) => (
                            <span key={acc} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] text-[10px] font-medium border border-[var(--accent-blue)]/15">
                              <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent-blue)]/20 flex items-center justify-center text-[8px] font-bold">{acc[0]?.toUpperCase()}</span>
                              @{acc}
                            </span>
                          ))}
                          {trend.accounts.length > 5 && <span className="px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[10px] text-[var(--text-secondary)]">+{trend.accounts.length - 5} daha</span>}
                        </div>
                      </div>
                    </div>

                    {/* Stats badges */}
                    <div className="flex gap-2 shrink-0">
                      <div className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
                        <span className="text-base font-bold text-[var(--text-primary)]">{trend.account_count}</span>
                        <span className="text-[9px] text-[var(--text-secondary)]">hesap</span>
                      </div>
                      <div className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
                        <span className="text-base font-bold text-[var(--text-primary)]">{trend.tweet_count}</span>
                        <span className="text-[9px] text-[var(--text-secondary)]">tweet</span>
                      </div>
                      <div className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20">
                        <span className="text-base font-bold text-[var(--accent-green)]">{formatNumber(trend.total_engagement)}</span>
                        <span className="text-[9px] text-[var(--text-secondary)]">eng.</span>
                      </div>
                    </div>
                  </div>

                  {/* First tweet preview (collapsed only) */}
                  {!isExpanded && trend.top_tweets.length > 0 && (
                    <div className="mt-3 rounded-lg bg-[var(--bg-primary)]/80 border border-[var(--border)]/60 px-3 py-2.5">
                      {trend.top_tweets[0].summary_tr && (
                        <div className="text-xs text-[var(--accent-cyan)] mb-1.5 font-semibold px-2 py-1 rounded-md bg-[var(--accent-cyan)]/8 inline-block">{trend.top_tweets[0].summary_tr}</div>
                      )}
                      <div className="flex items-start gap-2 text-xs">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/10 flex items-center justify-center text-[9px] font-bold text-[var(--accent-blue)] shrink-0 mt-0.5">{trend.top_tweets[0].account[0]?.toUpperCase()}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[var(--accent-blue)] font-semibold">@{trend.top_tweets[0].account}</span>
                            {trend.top_tweets[0].created_at && <span className="text-[10px] text-[var(--text-secondary)]">{timeAgo(trend.top_tweets[0].created_at)} once</span>}
                          </div>
                          <span className="text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{trend.top_tweets[0].text}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </button>

                {/* ──── Expanded Content ──── */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-4">
                    {/* Tweets with progressive disclosure */}
                    {trend.top_tweets.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-[var(--text-secondary)] mb-3">Tweet&apos;ler ({trend.top_tweets.filter((t: TrendTweet) => !hideGM || !isLowQualityTweet(t.text)).length})</div>
                        <div className="space-y-2">
                          {trend.top_tweets.filter((t: TrendTweet) => !hideGM || !isLowQualityTweet(t.text)).map((tw: TrendTweet, i: number) => {
                            const origIdx = trend.top_tweets.indexOf(tw);
                            const ck = `${key}::${origIdx}`;
                            const isTwExpanded = expandedTweet === ck;
                            const isTwWorkflow = workflowTweet === ck;
                            const twUrl = tw.tweet_url || (tw.tweet_id ? `https://x.com/${tw.account}/status/${tw.tweet_id}` : "");

                            return (
                              <div key={i} className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] overflow-hidden transition-all duration-300">
                                {/* Level 1: Tweet summary (always visible) */}
                                <button className="w-full text-left p-3 hover:bg-[var(--accent-blue)]/[0.03] transition-colors"
                                  onClick={() => { setExpandedTweet(isTwExpanded ? null : ck); if (isTwExpanded) setWorkflowTweet((w: string | null) => w === ck ? null : w); }}>
                                  <div className="flex items-start gap-2.5">
                                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/25 to-[var(--accent-purple)]/15 flex items-center justify-center text-[10px] font-bold text-[var(--accent-blue)] shrink-0">{tw.account[0]?.toUpperCase()}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[var(--accent-blue)] text-xs font-semibold">@{tw.account}</span>
                                        {tw.created_at && <span className="text-[10px] text-[var(--text-secondary)]">{timeAgo(tw.created_at)} once</span>}
                                      </div>
                                      {!isTwExpanded && (
                                        <>
                                          {tw.summary_tr && <p className="text-xs text-[var(--accent-cyan)] font-medium mt-0.5 line-clamp-1">{tw.summary_tr}</p>}
                                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{tw.text}</p>
                                        </>
                                      )}
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2">
                                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-bold tabular-nums">{formatNumber(tw.engagement)}</span>
                                      <span className="text-xs text-[var(--text-secondary)]" style={{ transform: isTwExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>&#9654;</span>
                                    </div>
                                  </div>
                                </button>

                                {/* Level 2: Expanded tweet + action buttons */}
                                {isTwExpanded && (
                                  <div className="px-3 pb-3 space-y-3 border-t border-[var(--border)]/30">
                                    {/* Full text */}
                                    <div className="pt-2">
                                      {tw.summary_tr && (
                                        <div className="mb-2 px-3 py-2 rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
                                          <span className="text-xs text-[var(--accent-cyan)] font-semibold leading-relaxed">{tw.summary_tr}</span>
                                        </div>
                                      )}
                                      <p className="text-sm leading-relaxed text-[var(--text-primary)]">{tw.text}</p>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]/20">
                                      <button onClick={() => handleResearch(ck, tw.text, twUrl, tw.account, tw.tweet_id)}
                                        disabled={researchingKey === ck}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                                        style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
                                        {researchingKey === ck ? "Arastiriliyor..." : (researchData[ck]?.summary ? "Tekrar Arastir" : "Arastir")}
                                      </button>
                                      <button onClick={() => { setWorkflowTweet(isTwWorkflow ? null : ck); if (!researchData[ck]?.summary) handleResearch(ck, tw.text, twUrl, tw.account, tw.tweet_id); }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                                        style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>Tweet Uret</button>
                                      {twUrl && (
                                        <a href={twUrl} target="_blank" rel="noopener noreferrer"
                                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all inline-flex items-center"
                                          onClick={(e: React.MouseEvent) => e.stopPropagation()}>X&apos;te Ac</a>
                                      )}
                                    </div>

                                    {/* Level 3: Workflow panel */}
                                    {isTwWorkflow && (
                                      <div className="space-y-3 pt-2">
                                        <ResearchPanel
                                          research={researchData[ck]}
                                          isResearching={researchingKey === ck}
                                          isExpanded={researchExpanded.has(ck) || researchExpanded.has("__all__")}
                                          onToggleExpand={() => setResearchExpanded((prev: Set<string>) => { const n = new Set(prev); n.has(ck) ? n.delete(ck) : n.add(ck); return n; })}
                                        />

                                        {researchData[ck]?.summary && (
                                          <div className="space-y-3 pt-2 border-t border-[var(--border-primary)]/20">
                                            <StyleFormatBar styles={styles} formats={formats}
                                              selectedStyle={selectedStyle} setSelectedStyle={setSelectedStyle}
                                              selectedFormat={selectedFormat} setSelectedFormat={setSelectedFormat}
                                              selectedProvider={selectedProvider} setSelectedProvider={setSelectedProvider} compact />
                                            <button onClick={() => handleTweetGenerate(tw, ck)} disabled={generatingKey === ck}
                                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                                              style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>
                                              {generatingKey === ck ? "Uretiliyor..." : "Tweet Uret"}
                                            </button>
                                          </div>
                                        )}

                                        <GenerationPanel
                                          generated={generatedTexts[ck]}
                                          editedText={editedTexts[ck] || generatedTexts[ck]?.text || ""}
                                          setEditedText={(t: string) => setEditedTexts((prev: Record<string, string>) => ({ ...prev, [ck]: t }))}
                                          isGenerating={generatingKey === ck}
                                          onGenerate={() => handleTweetGenerate(tw, ck)}
                                          onPublish={async (text: string, parts?: string[]) => { try { await publishTweet({ text, thread_parts: parts || [] }); } catch { /* ignore */ } }}
                                          onOpenInX={openInX}
                                          onOpenQuote={twUrl ? () => window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(twUrl)}`, "_blank") : undefined}
                                          onCopy={copyToClipboard}
                                          onSaveDraft={async (text: string) => { await addDraft({ text, topic: key, style: selectedStyle }); }}
                                          tweetUrl={twUrl}
                                        />

                                        {generatedTexts[ck] && <LinksBox links={tweetUrls[ck] || []} />}
                                        {generatedTexts[ck] && (
                                          <MediaSection
                                            mediaResults={mediaResults[ck]}
                                            mediaLoading={mediaLoading === ck}
                                            onFindMedia={() => handleFindMedia(ck, editedTexts[ck] || generatedTexts[ck]?.text || tw.text)}
                                            infographicData={infographicData[ck]}
                                            infographicLoading={infographicLoading === ck}
                                            onGenerateInfographic={() => handleInfographic(ck, editedTexts[ck] || generatedTexts[ck]?.text || tw.text, researchData[ck]?.key_points || [])}
                                            tweetMedia={tweetMedia[ck]}
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

                    {/* ── Trend-level actions ── */}
                    <div className="border-t border-[var(--border)] pt-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" />
                        <span className="text-xs font-medium text-[var(--text-secondary)]">Tum trend hakkinda</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => {
                            const firstTweet = trend.top_tweets[0];
                            const twUrl = firstTweet?.tweet_url || (firstTweet?.tweet_id ? `https://x.com/${firstTweet.account}/status/${firstTweet.tweet_id}` : "");
                            handleResearch(key, trend.keyword + (firstTweet ? `: ${firstTweet.text}` : ""), twUrl, firstTweet?.account, firstTweet?.tweet_id);
                          }}
                          disabled={researchingKey === key}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
                          {researchingKey === key ? "Arastiriliyor..." : (researchData[key]?.summary ? "Tekrar Arastir" : "Tum Trendi Arastir")}
                        </button>
                        <button onClick={() => handleTrendGenerate(trend)} disabled={generatingKey === key}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}>
                          {generatingKey === key ? "Uretiliyor..." : (generatedTexts[key]?.text ? "Tekrar Uret" : "Tweet Uret")}
                        </button>
                      </div>

                      {/* Trend-level research */}
                      <ResearchPanel
                        research={researchData[key]}
                        isResearching={researchingKey === key}
                        isExpanded={researchExpanded.has(key) || researchExpanded.has("__all__")}
                        onToggleExpand={() => setResearchExpanded((prev: Set<string>) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                      />

                      {/* Trend-level generated tweet */}
                      <GenerationPanel
                        generated={generatedTexts[key]}
                        editedText={editedTexts[key] || generatedTexts[key]?.text || ""}
                        setEditedText={(t: string) => setEditedTexts((prev: Record<string, string>) => ({ ...prev, [key]: t }))}
                        isGenerating={generatingKey === key}
                        onGenerate={() => handleTrendGenerate(trend)}
                        onPublish={async (text: string, parts?: string[]) => { try { await publishTweet({ text, thread_parts: parts || [] }); } catch { /* ignore */ } }}
                        onOpenInX={openInX}
                        onCopy={copyToClipboard}
                        onSaveDraft={async (text: string) => { await addDraft({ text, topic: key, style: selectedStyle }); }}
                      />

                      {generatedTexts[key] && <LinksBox links={tweetUrls[key] || []} />}
                      {generatedTexts[key] && (
                        <MediaSection
                          mediaResults={mediaResults[key]}
                          mediaLoading={mediaLoading === key}
                          onFindMedia={() => handleFindMedia(key, editedTexts[key] || generatedTexts[key]?.text || trend.keyword)}
                          infographicData={infographicData[key]}
                          infographicLoading={infographicLoading === key}
                          onGenerateInfographic={() => handleInfographic(key, editedTexts[key] || generatedTexts[key]?.text || trend.keyword, researchData[key]?.key_points || [])}
                          tweetMedia={tweetMedia[key]}
                        />
                      )}
                    </div>
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
