"use client";

import { useState, useEffect } from "react";
import {
  getSmartSuggestions,
  triggerClustering,
  generateQuoteTweet,
  researchTopicStream,
  getStyles,
  addDraft,
  schedulePost,
  findMedia,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

interface ClusterTweet {
  text: string;
  account: string;
  engagement: number;
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
  // Legacy fields for fallback
  description_tr?: string;
  top_tweets?: ClusterTweet[];
  suggested_format?: string;
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

/* ── Component ──────────────────────────────────────── */

export default function TabSmartSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [clusteredAt, setClusteredAt] = useState("");
  const [tweetCount, setTweetCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<"all" | "trend" | "news">("all");
  const [filterMinEngagement, setFilterMinEngagement] = useState(0);

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
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [expandedResearch, setExpandedResearch] = useState<Set<number>>(new Set());

  // Actions
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});
  const [showSchedule, setShowSchedule] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // Media
  const [mediaResults, setMediaResults] = useState<Record<number, Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; source?: string }>>>({});
  const [mediaLoading, setMediaLoading] = useState<number | null>(null);

  /* ── Load ───────────────────────────────────────────── */

  const loadData = () => {
    setLoading(true);
    getSmartSuggestions()
      .then(data => {
        setSuggestions(data.suggestions || []);
        setClusteredAt(data.clustered_at || "");
        setTweetCount(data.tweet_count || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    getStyles()
      .then((data: { styles?: StyleOption[]; formats?: FormatOption[] }) => {
        if (data.styles) setStyles(data.styles);
        if (data.formats) setFormats(data.formats);
      })
      .catch(() => {});
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
    setResearchData(prev => ({
      ...prev,
      [idx]: { summary: "", key_points: [], sources: [], progress: "Arastirma baslatiliyor..." },
    }));
    setExpandedResearch(prev => new Set(prev).add(idx));

    try {
      // Research ONLY the specific topic (not all tweets)
      let researchTopic = suggestion.topic;
      if (suggestion.url) {
        researchTopic += `\n\nKaynak: ${suggestion.url}`;
      }

      const result = await researchTopicStream(
        { topic: researchTopic, engine: "default" },
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
        original_author: suggestion.type === "trend" ? "trend" : "news",
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

  const toggleSet = (set: Set<number>, val: number): Set<number> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  };

  /* ── Filter ──────────────────────────────────────────── */

  const filtered = suggestions.filter((s, i) => {
    if (dismissed.has(i)) return false;
    if (filterType !== "all" && s.type !== filterType) return false;
    if (s.engagement_potential < filterMinEngagement) return false;
    return true;
  });

  // Map filtered indices back to original
  const filteredWithIdx = filtered.map(s => ({
    suggestion: s,
    originalIdx: suggestions.indexOf(s),
  }));

  /* ── Render ─────────────────────────────────────────── */

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">
            {filtered.length} oneri
            {dismissed.size > 0 && <span className="text-[var(--text-secondary)] font-normal"> ({dismissed.size} gizlendi)</span>}
          </h3>
          {clusteredAt && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">
              Kume: {timeAgo(clusteredAt)} once
            </span>
          )}
          {tweetCount > 0 && (
            <span className="text-[10px] text-[var(--text-secondary)]">
              ({tweetCount} tweet analiz edildi)
            </span>
          )}
        </div>
        <button
          onClick={handleRecluster}
          disabled={clustering}
          className="btn-secondary text-xs"
        >
          {clustering ? "Kumeleniyor..." : "Yeniden Kumele"}
        </button>
      </div>

      {/* Filters */}
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
      </div>

      {/* Suggestions */}
      {filteredWithIdx.length === 0 ? (
        <div className="glass-card p-8 text-center text-[var(--text-secondary)]">
          Henuz oneri yok. Trend analizi ve haber taramasi verileri biriktikce oneriler burada gorunecek.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWithIdx.map(({ suggestion, originalIdx: idx }) => {
            const research = researchData[idx];
            const gen = generatedTweets[idx];
            const isResearching = researchingIdx === idx;
            const isGenerating = generatingIdx === idx;
            const isExpanded = expandedCards.has(idx);
            const isResearchExpanded = expandedResearch.has(idx);
            const edited = editedTexts[idx] || "";
            const tweets = suggestion.tweets || suggestion.top_tweets || [];
            const isTrend = suggestion.type === "trend";
            const borderColor = isTrend ? "var(--accent-amber)" : "var(--accent-cyan)";

            return (
              <div
                key={idx}
                className="glass-card overflow-hidden"
                style={{ borderLeft: `3px solid ${borderColor}` }}
              >
                {/* Card Header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Type badge + Topic */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide shrink-0 ${
                          isTrend
                            ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30"
                            : "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30"
                        }`}>
                          {isTrend ? "TREND" : "HABER"}
                        </span>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          {suggestion.topic_tr || suggestion.topic}
                        </h3>
                      </div>

                      {/* Reason / metadata */}
                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                        <span>{suggestion.reason}</span>
                        {suggestion.reasoning && (
                          <span className="italic">{suggestion.reasoning}</span>
                        )}
                      </div>
                    </div>

                    {/* Right side: engagement + dismiss */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Engagement gauge */}
                      <div className="flex flex-col items-center">
                        <div
                          className="text-lg font-black"
                          style={{ color: engagementColor(suggestion.engagement_potential) }}
                        >
                          {suggestion.engagement_potential}
                        </div>
                        <div className="text-[9px] text-[var(--text-secondary)]">/10</div>
                      </div>
                      <button
                        onClick={() => handleDismiss(idx)}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-red)] p-1 rounded hover:bg-[var(--accent-red)]/10 transition-colors"
                        title="Gec"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Engagement bar + metadata row */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${suggestion.engagement_potential * 10}%`,
                            backgroundColor: engagementColor(suggestion.engagement_potential),
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                      {suggestion.suggested_hour}
                    </span>
                    {tweets.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                        {tweets.length} tweet
                      </span>
                    )}
                    {suggestion.source_keywords && suggestion.source_keywords.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {suggestion.source_keywords.slice(0, 3).map((kw, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* News body preview */}
                  {suggestion.type === "news" && suggestion.news_body && (
                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                      {suggestion.news_body.length > 200 ? suggestion.news_body.slice(0, 200) + "..." : suggestion.news_body}
                      {suggestion.url && (
                        <a href={suggestion.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[var(--accent-cyan)] hover:underline">
                          Kaynak
                        </a>
                      )}
                    </div>
                  )}

                  {/* Trend tweets preview (first 2, always visible) */}
                  {isTrend && tweets.length > 0 && !isExpanded && (
                    <div className="space-y-1.5">
                      {tweets.slice(0, 2).map((tw, i) => (
                        <div key={i} className="flex gap-2 text-xs bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                          <a
                            href={`https://x.com/${tw.account}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-[var(--accent-blue)] hover:underline shrink-0"
                          >
                            @{tw.account}
                          </a>
                          <span className="text-[var(--text-primary)] line-clamp-2">{tw.text}</span>
                          {tw.engagement > 0 && (
                            <span className="text-[10px] text-[var(--text-secondary)] shrink-0">{tw.engagement.toFixed(0)}</span>
                          )}
                        </div>
                      ))}
                      {tweets.length > 2 && (
                        <button
                          onClick={() => setExpandedCards(prev => toggleSet(prev, idx))}
                          className="text-[11px] text-[var(--accent-blue)] hover:underline pl-3"
                        >
                          +{tweets.length - 2} tweet daha goster
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded tweets */}
                  {isTrend && isExpanded && tweets.length > 0 && (
                    <div className="space-y-1.5">
                      {tweets.map((tw, i) => (
                        <div key={i} className="flex gap-2 text-xs bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                          <a
                            href={`https://x.com/${tw.account}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-[var(--accent-blue)] hover:underline shrink-0"
                          >
                            @{tw.account}
                          </a>
                          <span className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{tw.text}</span>
                          {tw.engagement > 0 && (
                            <span className="text-[10px] text-[var(--text-secondary)] shrink-0">{tw.engagement.toFixed(0)}</span>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setExpandedCards(prev => toggleSet(prev, idx))}
                        className="text-[11px] text-[var(--accent-blue)] hover:underline pl-3"
                      >
                        Tweet&apos;leri gizle
                      </button>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                    <button
                      onClick={() => handleResearch(suggestion, idx)}
                      disabled={isResearching}
                      className="btn-primary text-xs"
                    >
                      {isResearching ? "Arastiriliyor..." : research?.summary ? "Tekrar Arastir" : "Arastir"}
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

                  {/* Research results */}
                  {research && research.summary && (
                    <div className="space-y-3 bg-[var(--bg-primary)] rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-[var(--accent-green)]">Arastirma Sonuclari</h4>
                        <button
                          onClick={() => setExpandedResearch(prev => toggleSet(prev, idx))}
                          className="text-[10px] text-[var(--text-secondary)] hover:underline"
                        >
                          {isResearchExpanded ? "Gizle" : "Goster"}
                        </button>
                      </div>

                      {isResearchExpanded && (
                        <>
                          <p className="text-xs leading-relaxed text-[var(--text-primary)]">
                            {research.summary.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}
                          </p>
                          {research.key_points.length > 0 && (
                            <ul className="text-xs space-y-1 list-disc pl-4 text-[var(--text-secondary)]">
                              {research.key_points.map((kp, i) => (
                                <li key={i}>{kp}</li>
                              ))}
                            </ul>
                          )}
                          {research.sources.length > 0 && (
                            <details className="text-[10px]">
                              <summary className="cursor-pointer text-[var(--text-secondary)]">
                                Kaynaklar ({research.sources.length})
                              </summary>
                              <div className="mt-1 space-y-0.5">
                                {research.sources.slice(0, 5).map((s, i) => (
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

                      {/* Tweet generation section */}
                      <div className="pt-3 border-t border-[var(--border)] space-y-3">
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            value={tweetStyle}
                            onChange={e => setTweetStyle(e.target.value)}
                            className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
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
                            className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
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
                            className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                          >
                            {PROVIDER_OPTIONS.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleGenerate(suggestion, idx)}
                            disabled={isGenerating}
                            className="btn-primary text-xs"
                          >
                            {isGenerating ? "Uretiliyor..." : "Tweet Uret"}
                          </button>
                        </div>
                      </div>

                      {/* Generated tweet */}
                      {gen && (
                        <div className="space-y-3 bg-[var(--bg-secondary)] rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-[var(--accent-amber)]">Uretilen Tweet</h4>
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
                            className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full min-h-[80px] resize-y focus:border-[var(--accent-blue)] focus:outline-none"
                            rows={Math.min(6, Math.max(3, edited.split("\n").length + 1))}
                          />
                          <div className="text-[10px] text-[var(--text-secondary)] text-right">
                            {edited.length} karakter
                            {edited.length > 280 && (
                              <span className="text-[var(--accent-amber)] ml-2">Thread olarak paylasmayi dusunun</span>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => openInX(edited)} className="btn-primary text-xs">
                              X&apos;te Ac
                            </button>
                            <button onClick={() => copyText(edited, idx)} className="btn-secondary text-xs">
                              Kopyala
                            </button>
                            <button onClick={() => handleSaveDraft(idx)} className="btn-secondary text-xs">
                              Taslak
                            </button>
                            <button onClick={() => handleScheduleBestTime(idx)} className="btn-primary text-xs">
                              {suggestion.suggested_hour}&apos;de Zamanla
                            </button>
                            <button
                              onClick={() => setShowSchedule(showSchedule === idx ? null : idx)}
                              className="btn-secondary text-xs"
                            >
                              Ozel Saat
                            </button>
                            <button
                              onClick={() => handleGenerate(suggestion, idx)}
                              disabled={isGenerating}
                              className="btn-secondary text-xs"
                            >
                              {isGenerating ? "..." : "Tekrar Uret"}
                            </button>
                          </div>

                          {/* Custom schedule picker */}
                          {showSchedule === idx && (
                            <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)]">
                              <input
                                type="datetime-local"
                                value={scheduleTime}
                                onChange={e => setScheduleTime(e.target.value)}
                                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:outline-none"
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
                                    <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block bg-[var(--bg-primary)] rounded-lg p-1.5 hover:ring-2 ring-[var(--accent-blue)] transition-all">
                                      {thumb ? (
                                        <img src={thumb} alt={m.title || ""} className="w-full h-24 object-cover rounded" loading="lazy" />
                                      ) : (
                                        <div className="w-full h-24 flex items-center justify-center text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded">Gorsel</div>
                                      )}
                                      <div className="text-[9px] text-[var(--text-secondary)] mt-1 truncate">{m.title || m.source || ""}</div>
                                    </a>
                                  );
                                })}
                              </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
