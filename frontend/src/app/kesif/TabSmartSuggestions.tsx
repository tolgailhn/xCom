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
  TweetMediaItem,
  TweetUrl,
} from "@/lib/api";

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

interface StyleOption { id: string; name: string }
interface FormatOption { id: string; name: string }

interface ResearchResult {
  summary: string;
  key_points: string[];
  sources: { title: string; url?: string }[];
  progress: string;
}

interface GeneratedTweet {
  text: string;
  score: number;
}

const PROVIDER_OPTIONS = [
  { value: "", label: "Otomatik" },
  { value: "minimax", label: "MiniMax" },
  { value: "anthropic", label: "Claude" },
  { value: "openai", label: "GPT" },
  { value: "groq", label: "Groq" },
  { value: "gemini", label: "Gemini" },
];

/* ── Helpers ────────────────────────────────────────── */

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}sn`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

function engagementColor(val: number): string {
  if (val >= 7) return "var(--accent-green)";
  if (val >= 4) return "var(--accent-amber)";
  return "var(--text-secondary)";
}

function engagementBgClass(val: number): string {
  if (val >= 7) return "from-[var(--accent-green)]/20 to-[var(--accent-green)]/5 text-[var(--accent-green)] border-[var(--accent-green)]/30";
  if (val >= 4) return "from-[var(--accent-amber)]/20 to-[var(--accent-amber)]/5 text-[var(--accent-amber)] border-[var(--accent-amber)]/30";
  return "from-[var(--bg-secondary)] to-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)]";
}

function isGMTweet(text: string): boolean {
  return /^(gm|gn|good morning|good night|good evening)\b/i.test(text.trim()) || /how('?s| is) your (day|week|weekend|morning)/i.test(text);
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
  const [sortBy, setSortBy] = useState<"engagement" | "ai">("engagement");

  // AI scoring
  const [aiScoring, setAiScoring] = useState(false);
  const [aiScoredCount, setAiScoredCount] = useState(0);

  // Style/format options
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Per-suggestion state (keyed by suggestion index)
  const [researchData, setResearchData] = useState<Record<number, ResearchResult>>({});
  const [researchingIdx, setResearchingIdx] = useState<number | null>(null);
  const [generatedTweets, setGeneratedTweets] = useState<Record<number, GeneratedTweet>>({});
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});

  // Expanded panels
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Actions
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});
  const [showSchedule, setShowSchedule] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // Media
  const [mediaResults, setMediaResults] = useState<Record<number, Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; source?: string }>>>({});
  const [mediaLoading, setMediaLoading] = useState<number | null>(null);

  // Infographic
  const [infographicResults, setInfographicResults] = useState<Record<number, string>>({});
  const [infographicLoading, setInfographicLoading] = useState<number | null>(null);

  // Extracted tweet media/URLs per suggestion
  const [suggestionMedia, setSuggestionMedia] = useState<Record<number, TweetMediaItem[]>>({});
  const [suggestionUrls, setSuggestionUrls] = useState<Record<number, TweetUrl[]>>({});

  // Refs for scroll
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  /* ── Load ───────────────────────────────────────────── */

  const loadData = useCallback(() => {
    setLoading(true);
    getSmartSuggestions()
      .then(data => {
        setSuggestions(data.suggestions || []);
        setClusteredAt(data.clustered_at || "");
        setTweetCount(data.tweet_count || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  useEffect(() => {
    getStyles()
      .then((data: { styles?: StyleOption[]; formats?: FormatOption[] }) => {
        if (data.styles) setStyles(data.styles);
        if (data.formats) setFormats(data.formats);
      })
      .catch(() => {});
  }, [loadData]);

  // Auto-trigger AI scoring in background on mount
  useEffect(() => {
    aiScoreSuggestions()
      .then(res => {
        setAiScoredCount(res.scored || 0);
        if (res.scored > 0) loadData();  // Reload to get updated scores
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Filtered ──────────────────────────────────────── */

  const filtered = useMemo(() => {
    return suggestions.filter((s, i) => {
      if (dismissed.has(i)) return false;
      if (filterType !== "all" && s.type !== filterType) return false;
      if (s.engagement_potential < filterMinEngagement) return false;
      return true;
    });
  }, [suggestions, dismissed, filterType, filterMinEngagement]);

  const filteredWithIdx = useMemo(() => {
    const mapped = filtered.map(s => ({
      suggestion: s,
      originalIdx: suggestions.indexOf(s),
    }));
    if (sortBy === "ai") {
      mapped.sort((a, b) => (b.suggestion.ai_relevance_score || 0) - (a.suggestion.ai_relevance_score || 0));
    }
    return mapped;
  }, [filtered, suggestions, sortBy]);

  const trendCount = useMemo(() => filtered.filter(s => s.type === "trend").length, [filtered]);
  const newsCount = useMemo(() => filtered.filter(s => s.type === "news").length, [filtered]);
  const highEngCount = useMemo(() => filtered.filter(s => s.engagement_potential >= 7).length, [filtered]);

  /* ── Scroll ────────────────────────────────────────── */

  const scrollToCard = useCallback((idx: number) => {
    setExpandedIdx(idx);
    setTimeout(() => {
      const el = cardRefs.current[idx];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, []);

  /* ── Handlers ───────────────────────────────────────── */

  const handleRecluster = async () => {
    setClustering(true);
    try {
      await triggerClustering();
      loadData();
    } catch { /* ignore */ }
    setClustering(false);
  };

  const handleResearch = async (suggestion: Suggestion, idx: number) => {
    setResearchingIdx(idx);
    setExpandedIdx(idx);
    setResearchData(prev => ({
      ...prev,
      [idx]: { summary: "", key_points: [], sources: [], progress: "Arastirma baslatiliyor..." },
    }));

    try {
      const firstTweet = suggestion.tweets?.[0] || suggestion.top_tweets?.[0];
      let researchTopic = suggestion.topic;

      // Use extractTweet to get full tweet content + media + urls
      if (firstTweet?.tweet_url || (firstTweet?.account && firstTweet?.tweet_id)) {
        const tweetUrl = (firstTweet as { tweet_url?: string }).tweet_url || `https://x.com/${firstTweet.account}/status/${firstTweet.tweet_id}`;
        try {
          const extracted = await extractTweet(tweetUrl);
          if (extracted?.full_thread_text) {
            researchTopic = extracted.full_thread_text;
          } else if (extracted?.text) {
            researchTopic = extracted.text;
          }
          // Store media and URLs
          if (extracted?.media_items?.length) {
            setSuggestionMedia(prev => ({...prev, [idx]: [...(extracted.media_items || []), ...(extracted.thread_media || [])]}));
          }
          const allUrls = [...(extracted?.urls || []), ...(extracted?.thread_urls || [])];
          if (allUrls.length) {
            setSuggestionUrls(prev => ({...prev, [idx]: allUrls}));
          }
        } catch (e) {
          // extractTweet failed, continue with suggestion.topic
        }
      }

      if (suggestion.url) {
        researchTopic += `\n\nKaynak: ${suggestion.url}`;
      }

      const result = await researchTopicStream(
        {
          topic: researchTopic,
          engine: "default",
          tweet_id: firstTweet?.tweet_id || "",
          tweet_author: firstTweet?.account || "",
        },
        (progress) => {
          setResearchData(prev => ({
            ...prev,
            [idx]: { ...prev[idx], progress },
          }));
        },
      );

      setResearchData(prev => ({
        ...prev,
        [idx]: {
          summary: result.summary,
          key_points: result.key_points,
          sources: result.sources,
          progress: "",
        },
      }));
    } catch (e) {
      setResearchData(prev => ({
        ...prev,
        [idx]: { ...prev[idx], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` },
      }));
    } finally {
      setResearchingIdx(null);
    }
  };

  const handleGenerate = async (suggestion: Suggestion, idx: number) => {
    setGeneratingIdx(idx);

    try {
      const research = researchData[idx];
      const researchSummary = research
        ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}`
        : "";

      const tweets = suggestion.tweets || suggestion.top_tweets || [];
      const topTweetsContext = tweets.length > 0
        ? tweets.map(t => `@${t.account}: ${t.text}`).join("\n")
        : "";

      const result = await generateQuoteTweet({
        original_tweet: suggestion.topic + (topTweetsContext ? `\n\n${topTweetsContext}` : ""),
        original_author: (suggestion.tweets?.[0]?.account || suggestion.top_tweets?.[0]?.account || suggestion.topic.slice(0, 50)),
        style: tweetStyle,
        research_summary: researchSummary,
        length_preference: tweetLength,
        provider: provider || undefined,
      });

      const text = result.text || "";
      setGeneratedTweets(prev => ({
        ...prev,
        [idx]: { text, score: result.score?.overall || 0 },
      }));
      setEditedTexts(prev => ({ ...prev, [idx]: text }));
    } catch (e) {
      const errText = `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`;
      setGeneratedTweets(prev => ({
        ...prev,
        [idx]: { text: errText, score: 0 },
      }));
      setEditedTexts(prev => ({ ...prev, [idx]: errText }));
    } finally {
      setGeneratingIdx(null);
    }
  };

  const handleInfographic = async (idx: number, topic: string, keyPoints: string[]) => {
    setInfographicLoading(idx);
    try {
      const result = await generateInfographic({ topic, key_points: keyPoints });
      if (result.image_base64) {
        setInfographicResults(prev => ({ ...prev, [idx]: result.image_base64 }));
      }
    } catch (e) {
      console.error("Infographic failed:", e);
      setActionMsg(prev => ({ ...prev, [idx]: `Infografik hatasi: ${e instanceof Error ? e.message : "Bilinmeyen"}` }));
    } finally {
      setInfographicLoading(null);
    }
  };

  const handleSaveDraft = async (idx: number) => {
    const text = editedTexts[idx];
    if (!text) return;
    const s = suggestions[idx];
    try {
      await addDraft({ text, topic: s.topic, style: tweetStyle });
      showAction(idx, "Taslak kaydedildi!");
    } catch { /* ignore */ }
  };

  const handleScheduleBestTime = async (idx: number) => {
    const text = editedTexts[idx];
    const s = suggestions[idx];
    if (!text || !s.suggested_hour) return;

    const now = new Date();
    const [h, m] = s.suggested_hour.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h || 14, m || 7, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    try {
      await schedulePost({ text, scheduled_time: target.toISOString() });
      showAction(idx, `Zamanlandi: ${target.toLocaleString("tr-TR")}`);
    } catch { /* ignore */ }
  };

  const handleScheduleCustom = async (idx: number) => {
    const text = editedTexts[idx];
    if (!text || !scheduleTime) return;
    try {
      await schedulePost({ text, scheduled_time: scheduleTime });
      showAction(idx, `Zamanlandi: ${new Date(scheduleTime).toLocaleString("tr-TR")}`);
      setShowSchedule(null);
      setScheduleTime("");
    } catch { /* ignore */ }
  };

  const handleFindMedia = async (suggestion: Suggestion, idx: number) => {
    setMediaLoading(idx);
    try {
      const result = await findMedia(suggestion.topic.slice(0, 100), "both");
      setMediaResults(prev => ({ ...prev, [idx]: result.results || [] }));
    } catch { /* ignore */ }
    setMediaLoading(null);
  };

  const showAction = (idx: number, msg: string) => {
    setActionMsg(prev => ({ ...prev, [idx]: msg }));
    setTimeout(() => setActionMsg(prev => ({ ...prev, [idx]: "" })), 3000);
  };

  const handleDismiss = (idx: number) => {
    setDismissed(prev => new Set(prev).add(idx));
  };

  const openInX = (text: string) => {
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    showAction(idx, "Kopyalandi!");
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
        <button
          onClick={handleRecluster}
          disabled={clustering}
          className={`btn-primary text-xs inline-flex items-center gap-1.5 ${clustering ? "animate-pulse" : ""}`}
        >
          {clustering && (
            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          )}
          {clustering ? "Kumeleniyor..." : "Yeniden Kumele"}
        </button>
      </div>

      {/* ════ Overview Panel (Trend-style pills) ════ */}
      {filteredWithIdx.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--text-primary)]">Oneri Ozeti</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium">
                {filtered.length} oneri
              </span>
              {highEngCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-medium">
                  {highEngCount} yuksek potansiyel
                </span>
              )}
              {trendCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] font-medium">
                  {trendCount} trend
                </span>
              )}
              {newsCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] font-medium">
                  {newsCount} haber
                </span>
              )}
              {dismissed.size > 0 && (
                <span className="text-[10px] text-[var(--text-secondary)]">
                  ({dismissed.size} gizlendi)
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredWithIdx.map(({ suggestion, originalIdx: idx }) => {
              const isTrend = suggestion.type === "trend";
              return (
                <button
                  key={idx}
                  onClick={() => scrollToCard(idx)}
                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105 ${
                    suggestion.engagement_potential >= 7
                      ? `bg-gradient-to-r ${engagementBgClass(suggestion.engagement_potential)} hover:shadow-[0_0_16px_var(--accent-green)/25]`
                      : expandedIdx === idx
                        ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/40"
                        : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/40"
                  }`}
                >
                  <span className="text-[10px]">{isTrend ? "\u{1F4C8}" : "\u{1F4F0}"}</span>
                  <span className="max-w-[120px] truncate">{suggestion.topic_tr || suggestion.topic}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold`}
                    style={{ color: engagementColor(suggestion.engagement_potential) }}
                  >
                    {suggestion.engagement_potential}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ════ Filters + Style Bar ════ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
          {(["all", "trend", "news"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filterType === t
                  ? "bg-[var(--accent-blue)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t === "all" ? "Tumu" : t === "trend" ? "Trendler" : "Haberler"}
            </button>
          ))}
        </div>
        <select
          value={filterMinEngagement}
          onChange={e => setFilterMinEngagement(Number(e.target.value))}
          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value={0}>Min Engagement: Tumu</option>
          <option value={4}>4+ Engagement</option>
          <option value={7}>7+ Engagement</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as "engagement" | "ai")}
          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="engagement">Siralama: Engagement</option>
          <option value="ai">Siralama: AI Onerisi</option>
        </select>
        <button
          onClick={async () => {
            setAiScoring(true);
            try {
              const res = await aiScoreSuggestions();
              setAiScoredCount(res.scored || 0);
              if (res.scored > 0) await loadData();
            } catch { /* ignore */ }
            setAiScoring(false);
          }}
          disabled={aiScoring}
          className="px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/30 disabled:opacity-50"
        >
          {aiScoring ? "Skorlaniyor..." : `AI Skorla${aiScoredCount > 0 ? ` (${aiScoredCount})` : ""}`}
        </button>

        {/* Global style/format/provider */}
        <div className="flex gap-2 ml-auto">
          <select
            value={tweetStyle}
            onChange={e => setTweetStyle(e.target.value)}
            className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
          >
            {styles.length > 0 ? styles.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            )) : (
              <option value="quote_tweet">Quote Tweet</option>
            )}
          </select>
          <select
            value={tweetLength}
            onChange={e => setTweetLength(e.target.value)}
            className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
          >
            {formats.length > 0 ? formats.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            )) : (
              <option value="spark">Spark</option>
            )}
          </select>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
          >
            {PROVIDER_OPTIONS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ════ Suggestion Cards ════ */}
      {filteredWithIdx.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/10 to-[var(--accent-purple)]/10 flex items-center justify-center">
            <span className="text-2xl">💡</span>
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Henuz oneri yok</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Trend analizi ve haber taramasi verileri biriktikce oneriler burada gorunecek.</p>
          <button onClick={handleRecluster} disabled={clustering} className={`mt-4 btn-primary text-xs ${clustering ? "animate-pulse" : ""}`}>
            {clustering ? "Kumeleniyor..." : "Yeniden Kumele"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWithIdx.map(({ suggestion, originalIdx: idx }) => {
            const research = researchData[idx];
            const gen = generatedTweets[idx];
            const isResearching = researchingIdx === idx;
            const isGenerating = generatingIdx === idx;
            const isExpanded = expandedIdx === idx;
            const edited = editedTexts[idx] || "";
            const tweets = suggestion.tweets || suggestion.top_tweets || [];
            const isTrend = suggestion.type === "trend";

            return (
              <div
                key={idx}
                ref={el => { cardRefs.current[idx] = el; }}
                className={`glass-card overflow-hidden transition-all duration-300 ${
                  isExpanded ? "ring-1 ring-[var(--accent-blue)]/40" : ""
                }`}
              >
                {/* Top accent gradient */}
                <div className="h-1 rounded-t-xl" style={{
                  background: suggestion.engagement_potential >= 7
                    ? "linear-gradient(90deg, var(--accent-green), var(--accent-green)/30)"
                    : suggestion.engagement_potential >= 4
                      ? "linear-gradient(90deg, var(--accent-amber), var(--accent-amber)/30)"
                      : "linear-gradient(90deg, var(--bg-secondary), transparent)"
                }} />
                {/* ── Card Header (clickable to expand) ── */}
                <div
                  className="p-4 cursor-pointer hover:bg-[var(--bg-secondary)]/30 transition-colors"
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Type badge + Engagement + Topic */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide shrink-0 ${
                          isTrend
                            ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30"
                            : "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30"
                        }`}>
                          {isTrend ? "TREND" : "HABER"}
                        </span>
                        {suggestion.ai_relevance_score != null && suggestion.ai_relevance_score >= 7 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-medium" title={suggestion.ai_relevance_reason || ""}>
                            AI: {suggestion.ai_relevance_score}/10
                          </span>
                        )}
                        {suggestion.ai_relevance_score != null && suggestion.ai_relevance_score <= 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-red)]/15 text-[var(--accent-red)] font-medium" title={suggestion.ai_relevance_reason || ""}>
                            AI: {suggestion.ai_relevance_score}/10
                          </span>
                        )}
                        {suggestion.ai_relevance_score != null && suggestion.ai_relevance_score > 3 && suggestion.ai_relevance_score < 7 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--text-secondary)]/15 text-[var(--text-secondary)] font-medium" title={suggestion.ai_relevance_reason || ""}>
                            AI: {suggestion.ai_relevance_score}/10
                          </span>
                        )}
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          {suggestion.topic_tr || suggestion.topic}
                        </h3>
                      </div>

                      {/* English topic as subtitle when Turkish is available */}
                      {suggestion.topic_tr && suggestion.topic_tr !== suggestion.topic && (
                        <p className="text-[11px] text-[var(--text-secondary)]/60 mb-0.5 italic">{suggestion.topic}</p>
                      )}

                      {/* Turkish description - prominent with cyan accent */}
                      {suggestion.description_tr && (
                        <p className="text-xs text-[var(--accent-cyan)] mt-0.5 mb-1 leading-relaxed line-clamp-2 font-medium">
                          {suggestion.description_tr}
                        </p>
                      )}

                      {/* Reason + Reasoning */}
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">
                        {suggestion.reason}
                      </p>
                      {suggestion.reasoning && (
                        <p className="text-[11px] text-[var(--accent-amber)]/80 mt-0.5 line-clamp-2">
                          {suggestion.reasoning}
                        </p>
                      )}
                    </div>

                    {/* Right side: engagement gauge + expand arrow */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Engagement gauge (circular style) */}
                      <div className="flex flex-col items-center">
                        <div className="relative w-14 h-14 flex items-center justify-center">
                          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-secondary)" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="14" fill="none"
                              stroke={engagementColor(suggestion.engagement_potential)}
                              strokeWidth="3"
                              strokeDasharray={`${suggestion.engagement_potential * 8.8} 88`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span
                            className="absolute text-base font-black"
                            style={{ color: engagementColor(suggestion.engagement_potential) }}
                          >
                            {suggestion.engagement_potential}
                          </span>
                        </div>
                        <span className="text-[8px] text-[var(--text-secondary)] mt-0.5">potansiyel</span>
                      </div>

                      {/* Dismiss + Expand */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDismiss(idx); }}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-red)] p-1 rounded hover:bg-[var(--accent-red)]/10 transition-colors"
                          title="Gec"
                        >
                          ✕
                        </button>
                        <span className={`text-xs text-[var(--text-secondary)] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>
                          ▼
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata row */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {suggestion.suggested_hour && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20">
                        Onerilen saat: {suggestion.suggested_hour}
                      </span>
                    )}
                    {tweets.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                        {tweets.length} tweet
                      </span>
                    )}
                    {suggestion.source_keywords && suggestion.source_keywords.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {suggestion.source_keywords.slice(0, 3).map((kw, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                    {suggestion.news_source && (
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        Kaynak: {suggestion.news_source}
                      </span>
                    )}
                    {/* Quick research badge */}
                    {research?.summary && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)]">
                        Arastirildi
                      </span>
                    )}
                    {gen && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]">
                        Tweet uretildi
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Expanded Content ── */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-4 bg-[var(--bg-secondary)]/20">
                    {/* Description in Turkish (full, not truncated) */}
                    {suggestion.description_tr && (
                      <p className="text-xs text-[var(--accent-cyan)] leading-relaxed">
                        {suggestion.description_tr}
                      </p>
                    )}

                    {/* News body preview */}
                    {suggestion.type === "news" && suggestion.news_body && (
                      <div className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                        {suggestion.news_body.length > 300 ? suggestion.news_body.slice(0, 300) + "..." : suggestion.news_body}
                        {suggestion.url && (
                          <a href={suggestion.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[var(--accent-cyan)] hover:underline">
                            Kaynak
                          </a>
                        )}
                      </div>
                    )}

                    {/* Trend tweets */}
                    {tweets.filter(t => !isGMTweet(t.text)).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Ilgili Tweetler</h4>
                        {tweets.filter(t => !isGMTweet(t.text)).map((tw, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-xs bg-[var(--bg-primary)] rounded-lg px-3 py-2.5 border border-[var(--border)] hover:border-[var(--accent-blue)]/30 transition-colors">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--accent-blue)] shrink-0">
                              {tw.account.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <a
                                href={`https://x.com/${tw.account}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-[var(--accent-blue)] hover:underline text-[11px]"
                              >
                                @{tw.account}
                              </a>
                              <p className="text-[var(--text-primary)] line-clamp-2 mt-0.5 leading-relaxed">{tw.text}</p>
                            </div>
                            {tw.engagement > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] font-medium shrink-0">
                                {tw.engagement.toFixed(0)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Action Buttons ── */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleResearch(suggestion, idx)}
                        disabled={isResearching}
                        className="btn-primary text-xs inline-flex items-center gap-1.5"
                        style={!isResearching ? { background: "linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))" } : undefined}
                      >
                        {isResearching && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                        {isResearching ? "Arastiriliyor..." : research?.summary ? "Tekrar Arastir" : "Arastir"}
                      </button>
                      <button
                        onClick={() => handleGenerate(suggestion, idx)}
                        disabled={isGenerating}
                        className="btn-primary text-xs inline-flex items-center gap-1.5"
                        style={!isGenerating ? { background: "linear-gradient(135deg, var(--accent-amber), var(--accent-purple))" } : undefined}
                      >
                        {isGenerating && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                        {isGenerating ? "Uretiliyor..." : gen ? "Tekrar Uret" : "Tweet Uret"}
                      </button>
                      {suggestion.url && (
                        <a
                          href={suggestion.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-xs inline-flex items-center"
                        >
                          Kaynagi Gor
                        </a>
                      )}
                    </div>

                    {/* Research progress */}
                    {research?.progress && (
                      <div className="text-xs text-[var(--accent-blue)] animate-pulse px-1">
                        {research.progress}
                      </div>
                    )}

                    {/* ── Research Results ── */}
                    {research && research.summary && (
                      <div className="rounded-xl bg-gradient-to-br from-[var(--accent-blue)]/5 to-transparent border border-[var(--accent-blue)]/20 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] animate-pulse" />
                          <h4 className="text-xs font-semibold text-[var(--accent-green)]">Arastirma Sonuclari</h4>
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--text-primary)]">
                          {research.summary.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}
                        </p>
                        {research.key_points.length > 0 && (
                          <div className="space-y-1.5">
                            {research.key_points.map((kp, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] mt-1.5 shrink-0" />
                                <span className="text-xs text-[var(--text-primary)] leading-relaxed">{kp}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {research.sources.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-[var(--accent-blue)]/10">
                            <h5 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Kaynaklar</h5>
                            <div className="space-y-1">
                              {research.sources.slice(0, 5).map((s, i) => (
                                s.url ? (
                                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                                    className="block px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] hover:border-[var(--accent-blue)]/40 transition-colors">
                                    <div className="text-xs font-medium text-[var(--accent-blue)]">{s.title}</div>
                                  </a>
                                ) : (
                                  <div key={i} className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]">
                                    <div className="text-xs text-[var(--text-secondary)]">{s.title}</div>
                                  </div>
                                )
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Tweet Media (from extractTweet) ── */}
                    {suggestionMedia[idx]?.length > 0 && (
                      <div className="mt-3 glass-card p-3 rounded-xl">
                        <h4 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Tweet Gorselleri</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {suggestionMedia[idx].map((m, mi) => (
                            <div key={mi} className="relative group rounded-lg overflow-hidden border border-[var(--border-primary)]/30">
                              {m.type === 'image' ? (
                                <img src={m.url} alt="" className="w-full h-32 object-cover" />
                              ) : (
                                <div className="w-full h-32 bg-[var(--bg-tertiary)] flex items-center justify-center relative">
                                  <span className="text-2xl">&#127916;</span>
                                  {m.thumbnail && <img src={m.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />}
                                </div>
                              )}
                              <a href={m.url} target="_blank" rel="noopener noreferrer"
                                className="absolute bottom-1 right-1 px-2 py-1 rounded-md text-xs font-medium bg-[var(--accent-blue)] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                {m.type === 'video' ? 'Video Indir' : 'Indir'}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Tweet URLs (from extractTweet) ── */}
                    {suggestionUrls[idx]?.length > 0 && (
                      <div className="mt-3 glass-card p-3 rounded-xl">
                        <h4 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Baglantilar</h4>
                        <div className="space-y-1.5">
                          {suggestionUrls[idx].map((u, ui) => (
                            <div key={ui} className="flex items-center gap-2 text-xs bg-[var(--bg-primary)] rounded-lg px-3 py-2 border border-[var(--border)]">
                              <a href={u.url} target="_blank" rel="noopener noreferrer"
                                className="flex-1 text-[var(--accent-blue)] hover:underline truncate">
                                {u.display_url || u.url}
                              </a>
                              <button
                                onClick={() => { navigator.clipboard.writeText(u.url); }}
                                className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                title="Kopyala"
                              >
                                Kopyala
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Generated Tweet ── */}
                    {gen && (
                      <div className="space-y-3">
                        {/* Tweet preview card (X-style) */}
                        <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-sm font-bold shrink-0">X</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] text-[var(--text-secondary)]">Olusturulan Tweet</span>
                                {gen.score > 0 && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    gen.score >= 80 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" :
                                    gen.score >= 60 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" :
                                    "bg-[var(--accent-red)]/20 text-[var(--accent-red)]"
                                  }`}>
                                    {gen.score}/100
                                  </span>
                                )}
                              </div>
                              <textarea
                                value={edited}
                                onChange={e => setEditedTexts(prev => ({ ...prev, [idx]: e.target.value }))}
                                className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full min-h-[80px] resize-y focus:border-[var(--accent-blue)] focus:outline-none"
                                rows={Math.min(6, Math.max(3, edited.split("\n").length + 1))}
                              />
                              <div className="text-[10px] text-[var(--text-secondary)] text-right mt-1">
                                {edited.length} karakter
                                {edited.length > 280 && (
                                  <span className="text-[var(--accent-amber)] ml-2">Thread olarak paylasmayi dusunun</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons - gradient primary, outline secondary */}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openInX(edited)} className="btn-primary text-xs inline-flex items-center gap-1"
                            style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
                            X&apos;te Paylas
                          </button>
                          {suggestion.suggested_hour && (
                            <button onClick={() => handleScheduleBestTime(idx)} className="btn-primary text-xs"
                              style={{ background: "linear-gradient(135deg, var(--accent-purple), var(--accent-amber))" }}>
                              {suggestion.suggested_hour}&apos;de Zamanla
                            </button>
                          )}
                          <button onClick={() => handleSaveDraft(idx)} className="btn-secondary text-xs">
                            Taslak
                          </button>
                          <button onClick={() => copyText(edited, idx)} className="btn-secondary text-xs">
                            Kopyala
                          </button>
                          <button
                            onClick={() => setShowSchedule(showSchedule === idx ? null : idx)}
                            className="btn-secondary text-xs"
                          >
                            Ozel Saat
                          </button>
                          {(() => {
                            const tweets = suggestion.tweets || suggestion.top_tweets || [];
                            const tweetUrl = tweets.find(t => t.tweet_url)?.tweet_url;
                            return tweetUrl ? (
                              <button
                                onClick={() => window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(tweetUrl)}`, "_blank")}
                                className="btn-secondary text-xs"
                              >
                                X Quote Ac
                              </button>
                            ) : null;
                          })()}
                          <button
                            onClick={() => handleGenerate(suggestion, idx)}
                            disabled={generatingIdx === idx}
                            className="btn-secondary text-xs"
                          >
                            {generatingIdx === idx ? "Uretiliyor..." : "Tekrar Uret"}
                          </button>
                          <button
                            onClick={() => {
                              const research = researchData[idx];
                              handleInfographic(idx, edited, research?.key_points || []);
                            }}
                            disabled={infographicLoading === idx}
                            className="btn-secondary text-xs"
                          >
                            {infographicLoading === idx ? "Olusturuluyor..." : "Gemini Infografik"}
                          </button>
                        </div>

                        {/* Custom schedule picker */}
                        {showSchedule === idx && (
                          <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)]">
                            <input
                              type="datetime-local"
                              value={scheduleTime}
                              onChange={e => setScheduleTime(e.target.value)}
                              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:outline-none"
                            />
                            <button
                              onClick={() => handleScheduleCustom(idx)}
                              disabled={!scheduleTime}
                              className="btn-primary text-xs"
                            >
                              Onayla
                            </button>
                          </div>
                        )}

                        {/* Media finder */}
                        <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--border)]">
                          <button
                            onClick={() => handleFindMedia(suggestion, idx)}
                            disabled={mediaLoading === idx}
                            className="btn-secondary text-xs"
                          >
                            {mediaLoading === idx ? "Araniyor..." : "Gorsel/Video Bul"}
                          </button>
                        </div>

                        {/* Media results */}
                        {mediaResults[idx] && mediaResults[idx].length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-[var(--accent-cyan)]">
                              Bulunan Medya ({mediaResults[idx].length})
                            </h5>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {mediaResults[idx].slice(0, 6).map((m, i) => {
                                const thumb = m.thumbnail_url || m.preview || m.url;
                                return (
                                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block bg-[var(--bg-secondary)] rounded-lg p-1.5 hover:ring-2 ring-[var(--accent-blue)] transition-all">
                                    {thumb ? (
                                      <img src={thumb} alt={m.title || ""} className="w-full h-24 object-cover rounded" loading="lazy" />
                                    ) : (
                                      <div className="w-full h-24 flex items-center justify-center text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] rounded">Gorsel</div>
                                    )}
                                    <div className="text-[9px] text-[var(--text-secondary)] mt-1 truncate">{m.title || m.source || ""}</div>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Infographic result */}
                        {infographicResults[idx] && (
                          <div className="mt-2">
                            <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">Infografik</h4>
                            <img src={`data:image/png;base64,${infographicResults[idx]}`} alt="Infografik" className="max-w-full rounded-lg border border-[var(--border)]" />
                            <a href={`data:image/png;base64,${infographicResults[idx]}`} download="infographic.png" className="inline-block mt-1 text-xs text-[var(--accent-blue)] hover:underline">Gorseli Indir</a>
                          </div>
                        )}

                        {/* Action message */}
                        {actionMsg[idx] && (
                          <div className="text-xs text-[var(--accent-green)] font-medium">{actionMsg[idx]}</div>
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
