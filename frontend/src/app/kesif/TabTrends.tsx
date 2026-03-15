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
  schedulePost,
  TweetMediaItem,
  TweetUrl,
} from "@/lib/api";

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
}

interface TrendHistoryEntry {
  date: string;
  analysis_date: string;
  trends: Trend[];
  total_tweets_analyzed: number;
}

interface StyleOption { id: string; name: string; desc: string }
interface FormatOption { id: string; name: string; desc: string }

interface ResearchState {
  summary: string;
  key_points: string[];
  sources: { title: string; url?: string }[];
  progress: string;
}

/* ── Helpers ────────────────────────────────────────── */

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = formatDateStr(new Date());
  const yesterday = formatDateStr(new Date(Date.now() - 86400000));
  if (dateStr === today) return "Bugun";
  if (dateStr === yesterday) return "Dun";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });
}

function scoreColor(score: number, maxScore: number): string {
  const pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.7) return "var(--accent-green)";
  if (pct >= 0.4) return "var(--accent-amber)";
  return "var(--text-secondary)";
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return "";
    const diff = now - then;
    const absDiff = Math.abs(diff);
    const mins = Math.floor(absDiff / 60000);
    if (mins < 1) return "az once";
    if (mins < 60) return `${mins}dk once`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}sa once`;
    const days = Math.floor(hrs / 24);
    return `${days}g once`;
  } catch {
    return "";
  }
}

function formatEngagement(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function isGMTweet(text: string): boolean {
  return /^(gm|gn|good morning|good night|good evening)\b/i.test(text.trim()) || /how('?s| is) your (day|week|weekend|morning)/i.test(text);
}

/* ── Component ──────────────────────────────────────── */

export default function TabTrends() {
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

  // Expanded panels
  const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
  const [activeResearch, setActiveResearch] = useState<string | null>(null);
  const [activeGenerate, setActiveGenerate] = useState<string | null>(null);

  // Trend-level research & generation state
  const [researchData, setResearchData] = useState<Record<string, ResearchState>>({});
  const [researchingKey, setResearchingKey] = useState<string | null>(null);
  const [generatedTexts, setGeneratedTexts] = useState<Record<string, { text: string; score: number }>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  // Per-tweet state
  const [tweetResearchData, setTweetResearchData] = useState<Record<string, ResearchState>>({});
  const [tweetResearchingKey, setTweetResearchingKey] = useState<string | null>(null);
  const [tweetGeneratedTexts, setTweetGeneratedTexts] = useState<Record<string, { text: string; score: number }>>({});
  const [tweetGeneratingKey, setTweetGeneratingKey] = useState<string | null>(null);
  const [tweetEditedTexts, setTweetEditedTexts] = useState<Record<string, string>>({});
  const [activeTweetKey, setActiveTweetKey] = useState<string | null>(null);

  // Per-tweet media & URLs
  const [tweetMedia, setTweetMedia] = useState<Record<string, TweetMediaItem[]>>({});
  const [tweetUrls, setTweetUrls] = useState<Record<string, TweetUrl[]>>({});

  // GM tweet filter
  const [hideGM, setHideGM] = useState(true);

  // Style/format/provider
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("informative");
  const [selectedFormat, setSelectedFormat] = useState("spark");
  const [selectedProvider, setSelectedProvider] = useState("");

  // Draft/schedule
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
  const [showSchedule, setShowSchedule] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");

  // Refs for scroll-to-trend
  const trendRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* ── Load data ──────────────────────────────────────── */

  const loadTrends = async () => {
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
  };

  useEffect(() => { loadTrends(); }, []);

  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => {
        setStyles(r.styles);
        setFormats(r.formats);
      })
      .catch(() => {});
  }, []);

  /* ── Date navigation ────────────────────────────────── */

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    if (trends.length > 0) {
      const todayStr = formatDateStr(new Date());
      dates.add(todayStr);
    }
    for (const h of trendHistory) {
      if (h.date) dates.add(h.date);
    }
    return Array.from(dates).sort().reverse();
  }, [trends, trendHistory]);

  const displayTrends = useMemo(() => {
    if (selectedDate === "today" || selectedDate === formatDateStr(new Date())) {
      return trends;
    }
    const entry = trendHistory.find(h => h.date === selectedDate);
    return entry?.trends || [];
  }, [selectedDate, trends, trendHistory]);

  const goToDate = (offset: number) => {
    const currentIdx = selectedDate === "today"
      ? 0
      : availableDates.indexOf(selectedDate);
    const newIdx = Math.max(0, Math.min(availableDates.length - 1, currentIdx + offset));
    setSelectedDate(availableDates[newIdx] || "today");
  };

  /* ── Filtered trends ────────────────────────────────── */

  const filteredTrends = useMemo(() => {
    let result = displayTrends;
    if (filterStrong) result = result.filter(t => t.is_strong_trend);
    if (filterMinScore > 0) result = result.filter(t => t.trend_score >= filterMinScore);
    if (filterAccount) result = result.filter(t => t.accounts.some(a => a.toLowerCase().includes(filterAccount.toLowerCase())));
    return result;
  }, [displayTrends, filterStrong, filterMinScore, filterAccount]);

  const maxScore = useMemo(() => Math.max(...(filteredTrends.map(t => t.trend_score) || [1])), [filteredTrends]);

  const allAccounts = useMemo(() => {
    const acc = new Set<string>();
    displayTrends.forEach(t => t.accounts.forEach(a => acc.add(a)));
    return Array.from(acc).sort();
  }, [displayTrends]);

  const strongCount = useMemo(() => filteredTrends.filter(t => t.is_strong_trend).length, [filteredTrends]);

  /* ── Scroll to trend ─────────────────────────────────── */

  const scrollToTrend = useCallback((keyword: string) => {
    setExpandedTrend(keyword);
    setTimeout(() => {
      const el = trendRefs.current[keyword];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }, []);

  /* ── Handlers ───────────────────────────────────────── */

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await triggerTrendAnalysis();
      await loadTrends();
    } catch { /* ignore */ }
    finally { setAnalyzing(false); }
  };

  const handleResearch = async (trend: Trend) => {
    const key = trend.keyword;
    setResearchingKey(key);
    setActiveResearch(key);
    setResearchData(prev => ({
      ...prev,
      [key]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." },
    }));

    try {
      // Use the first tweet's full text for better research context
      const firstTweet = trend.top_tweets[0];
      let topic = trend.keyword;
      if (firstTweet) {
        // Try to extract full thread text from first tweet
        try {
          const tweetUrl = firstTweet.tweet_url || (firstTweet.tweet_id ? `https://x.com/${firstTweet.account}/status/${firstTweet.tweet_id}` : "");
          if (tweetUrl) {
            const extracted = await extractTweet(tweetUrl);
            if (extracted?.full_thread_text) {
              topic = extracted.full_thread_text;
            } else if (extracted?.text) {
              topic = extracted.text;
            }
            // Capture media and URLs
            const tweetId = `${key}::0`;
            if (extracted?.media_items?.length) {
              setTweetMedia(prev => ({...prev, [tweetId]: extracted.media_items}));
            }
            const allUrls = [...(extracted?.urls || []), ...(extracted?.thread_urls || [])];
            if (allUrls.length) {
              setTweetUrls(prev => ({...prev, [tweetId]: allUrls}));
            }
            if (extracted?.thread_media?.length) {
              setTweetMedia(prev => ({...prev, [tweetId]: [...(prev[tweetId] || []), ...extracted.thread_media]}));
            }
          }
        } catch {
          // Fallback: use first tweet text + keyword
          topic = `${trend.keyword}: ${firstTweet.text}`;
        }
      }

      const result = await researchTopicStream(
        {
          topic,
          engine: "default",
          tweet_id: firstTweet?.tweet_id || "",
          tweet_author: firstTweet?.account || "",
        },
        (progress) => {
          setResearchData(prev => ({
            ...prev,
            [key]: { ...prev[key], progress },
          }));
        },
      );

      setResearchData(prev => ({
        ...prev,
        [key]: { summary: result.summary, key_points: result.key_points, sources: result.sources, progress: "" },
      }));
    } catch (e) {
      setResearchData(prev => ({
        ...prev,
        [key]: { ...prev[key], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` },
      }));
    } finally {
      setResearchingKey(null);
    }
  };

  const handleGenerate = async (trend: Trend) => {
    const key = trend.keyword;
    setGeneratingKey(key);
    setActiveGenerate(key);

    try {
      const research = researchData[key];
      let researchContext = "";
      if (research?.summary) {
        researchContext = `Arastirma Ozeti:\n${research.summary}\n\nAnahtar Noktalar:\n${research.key_points.join("\n")}`;
      }
      const tweetContext = trend.top_tweets.slice(0, 3).map(t => `@${t.account} (${t.engagement} eng): ${t.text}`).join("\n---\n");

      const result = await generateTweet({
        topic: `${trend.keyword} hakkinda tweet yaz`,
        style: selectedStyle,
        length: selectedFormat,
        content_format: selectedFormat,
        research_context: researchContext
          ? `${researchContext}\n\nTrend Tweet Ornekleri:\n${tweetContext}`
          : `Trend: ${trend.keyword}\n${trend.account_count} hesapta goruldu.\n\nOrnek Tweetler:\n${tweetContext}`,
        provider: selectedProvider || undefined,
      });

      setGeneratedTexts(prev => ({
        ...prev,
        [key]: { text: result.tweet || result.text || "", score: result.score?.overall || result.quality_score || 0 },
      }));
    } catch (e) {
      setGeneratedTexts(prev => ({
        ...prev,
        [key]: { text: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`, score: 0 },
      }));
    } finally {
      setGeneratingKey(null);
    }
  };

  const handleTweetResearch = async (trend: Trend, tweetIdx: number) => {
    const tw = trend.top_tweets[tweetIdx];
    const compositeKey = `${trend.keyword}::${tweetIdx}`;
    setTweetResearchingKey(compositeKey);
    setActiveTweetKey(compositeKey);
    setTweetResearchData(prev => ({
      ...prev,
      [compositeKey]: { summary: "", key_points: [], sources: [], progress: "Arastirma baslatiliyor..." },
    }));

    try {
      // Try to extract full tweet/thread text first (like TabTweets pattern)
      let fullText = tw.text;
      try {
        const tweetUrl = tw.tweet_url || (tw.tweet_id ? `https://x.com/${tw.account}/status/${tw.tweet_id}` : "");
        if (tweetUrl) {
          const extracted = await extractTweet(tweetUrl);
          if (extracted?.full_thread_text) fullText = extracted.full_thread_text;
          else if (extracted?.text) fullText = extracted.text;
          // Capture media and URLs
          if (extracted?.media_items?.length) {
            setTweetMedia(prev => ({...prev, [compositeKey]: extracted.media_items}));
          }
          const allUrls = [...(extracted?.urls || []), ...(extracted?.thread_urls || [])];
          if (allUrls.length) {
            setTweetUrls(prev => ({...prev, [compositeKey]: allUrls}));
          }
          if (extracted?.thread_media?.length) {
            setTweetMedia(prev => ({...prev, [compositeKey]: [...(prev[compositeKey] || []), ...extracted.thread_media]}));
          }
        }
      } catch { /* use original text */ }

      const result = await researchTopicStream(
        {
          topic: fullText,
          engine: "default",
          tweet_id: tw.tweet_id || "",
          tweet_author: tw.account,
        },
        (progress) => {
          setTweetResearchData(prev => ({ ...prev, [compositeKey]: { ...prev[compositeKey], progress } }));
        },
      );
      setTweetResearchData(prev => ({
        ...prev,
        [compositeKey]: { summary: result.summary, key_points: result.key_points, sources: result.sources, progress: "" },
      }));
    } catch (e) {
      setTweetResearchData(prev => ({
        ...prev,
        [compositeKey]: { ...prev[compositeKey], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` },
      }));
    } finally {
      setTweetResearchingKey(null);
    }
  };

  const handleTweetGenerate = async (trend: Trend, tweetIdx: number) => {
    const tw = trend.top_tweets[tweetIdx];
    const compositeKey = `${trend.keyword}::${tweetIdx}`;
    setTweetGeneratingKey(compositeKey);

    try {
      const research = tweetResearchData[compositeKey];
      const researchSummary = research?.summary ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}` : "";
      const result = await generateQuoteTweet({
        original_tweet: tw.text,
        original_author: tw.account,
        style: selectedStyle,
        research_summary: researchSummary,
        length_preference: selectedFormat,
        provider: selectedProvider || undefined,
      });
      const text = result.text || "";
      setTweetGeneratedTexts(prev => ({ ...prev, [compositeKey]: { text, score: result.score?.overall || 0 } }));
      setTweetEditedTexts(prev => ({ ...prev, [compositeKey]: text }));
    } catch (e) {
      const errText = `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`;
      setTweetGeneratedTexts(prev => ({ ...prev, [compositeKey]: { text: errText, score: 0 } }));
      setTweetEditedTexts(prev => ({ ...prev, [compositeKey]: errText }));
    } finally {
      setTweetGeneratingKey(null);
    }
  };

  const handleSaveDraft = async (key: string, textSource: "trend" | "tweet" = "trend") => {
    const text = textSource === "tweet" ? (tweetEditedTexts[key] || tweetGeneratedTexts[key]?.text) : generatedTexts[key]?.text;
    if (!text) return;
    const topic = key.includes("::") ? key.split("::")[0] : key;
    try {
      await addDraft({ text, topic, style: selectedStyle });
      setActionMsg(prev => ({ ...prev, [key]: "Taslak kaydedildi!" }));
      setTimeout(() => setActionMsg(prev => ({ ...prev, [key]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const handleSchedule = async (key: string, textSource: "trend" | "tweet" = "trend") => {
    const text = textSource === "tweet" ? (tweetEditedTexts[key] || tweetGeneratedTexts[key]?.text) : generatedTexts[key]?.text;
    if (!text || !scheduleTime) return;
    try {
      await schedulePost({ text, scheduled_time: scheduleTime });
      setActionMsg(prev => ({ ...prev, [key]: `Zamanlandi: ${new Date(scheduleTime).toLocaleString("tr-TR")}` }));
      setShowSchedule(null);
      setScheduleTime("");
      setTimeout(() => setActionMsg(prev => ({ ...prev, [key]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const openInX = (text: string) => window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setActionMsg(prev => ({ ...prev, [key]: "Kopyalandi!" }));
    setTimeout(() => setActionMsg(prev => ({ ...prev, [key]: "" })), 2000);
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium">
                {filteredTrends.length} trend
              </span>
              {strongCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] font-medium">
                  {strongCount} guclu
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredTrends.map((t) => (
              <button
                key={t.keyword}
                onClick={() => scrollToTrend(t.keyword)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105 ${
                  t.is_strong_trend
                    ? "bg-gradient-to-r from-[var(--accent-amber)]/20 to-[var(--accent-amber)]/5 text-[var(--accent-amber)] border-[var(--accent-amber)]/30 hover:border-[var(--accent-amber)]/60 hover:shadow-[0_0_12px_var(--accent-amber)/20]"
                    : expandedTrend === t.keyword
                      ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/40"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/40"
                }`}
              >
                {t.is_strong_trend && <span className="text-[10px]">&#9650;</span>}
                <span>{t.keyword}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  t.is_strong_trend
                    ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]"
                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                }`}>
                  {t.account_count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day navigation - Modern pill style */}
      {availableDates.length > 0 && (
        <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)]/60 backdrop-blur-sm rounded-full p-1.5 border border-[var(--border)]/50">
          <button
            onClick={() => goToDate(1)}
            disabled={availableDates.indexOf(selectedDate === "today" ? availableDates[0] : selectedDate) >= availableDates.length - 1}
            className="px-3.5 py-2 rounded-full text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] disabled:opacity-30 transition-all duration-200"
          >
            &#8592;
          </button>
          <div className="flex-1 flex items-center justify-center gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {selectedDate === "today" ? "Bugun" : formatDateDisplay(selectedDate)}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] font-medium">
              {filteredTrends.length} trend
            </span>
          </div>
          <button
            onClick={() => goToDate(-1)}
            disabled={selectedDate === "today" || availableDates.indexOf(selectedDate) <= 0}
            className="px-3.5 py-2 rounded-full text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] disabled:opacity-30 transition-all duration-200"
          >
            &#8594;
          </button>
          <button
            onClick={() => setSelectedDate("today")}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 ${
              selectedDate === "today"
                ? "bg-[var(--accent-blue)] text-white shadow-[0_0_12px_var(--accent-blue)/30]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
            }`}
          >
            Bugun
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFilterStrong(!filterStrong)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filterStrong
              ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/30"
              : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-amber)]/50"
          }`}
        >
          Guclu Trendler
        </button>
        <button
          onClick={() => setHideGM(!hideGM)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            hideGM
              ? "bg-[var(--accent-red)]/20 text-[var(--accent-red)] border-[var(--accent-red)]/30"
              : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-red)]/50"
          }`}
        >
          GM/GN Gizle
        </button>
        <select
          value={filterMinScore}
          onChange={e => setFilterMinScore(Number(e.target.value))}
          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]"
        >
          <option value={0}>Min Skor: Tumu</option>
          <option value={100}>100+</option>
          <option value={500}>500+</option>
          <option value={1000}>1000+</option>
        </select>
        {allAccounts.length > 0 && (
          <select
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <option value="">Tum Hesaplar</option>
            {allAccounts.map(a => (
              <option key={a} value={a}>@{a}</option>
            ))}
          </select>
        )}
      </div>

      {/* Style/Format/Provider bar */}
      <div className="glass-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">Tweet Uretim Ayarlari</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            {styles.length > 0 ? styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : (
              <>
                <option value="informative">Bilgilendirici</option>
                <option value="provocative">Provoke Edici</option>
                <option value="technical">Teknik</option>
                <option value="storytelling">Hikaye</option>
                <option value="analytical">Analitik</option>
              </>
            )}
          </select>
          <select value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            {formats.length > 0 ? formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : (
              <>
                <option value="spark">Micro Tweet</option>
                <option value="single">Tek Tweet</option>
                <option value="short_thread">Kisa Thread</option>
                <option value="thread">Thread</option>
              </>
            )}
          </select>
          <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <option value="">Varsayilan AI</option>
            <option value="minimax">MiniMax</option>
            <option value="anthropic">Claude</option>
            <option value="openai">GPT</option>
            <option value="groq">Groq</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
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
              {displayTrends.length === 0
                ? "Kesfet ve otomatik tarama verileri biriktikce trendler burada gorunecek. Yukaridaki \"Trend Analiz Et\" butonu ile hemen analiz baslatin."
                : "Filtreleri genisleterek daha fazla sonuc gorebilirsiniz."}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTrends.map((trend) => {
            const key = trend.keyword;
            const isExpanded = expandedTrend === key;
            const research = researchData[key];
            const generated = generatedTexts[key];
            const isResearching = researchingKey === key;
            const isGenerating = generatingKey === key;
            const scorePct = maxScore > 0 ? (trend.trend_score / maxScore) * 100 : 0;
            const trendColor = trend.is_strong_trend ? "var(--accent-amber)" : "var(--accent-blue)";

            return (
              <div
                key={key}
                ref={el => { trendRefs.current[key] = el; }}
                className="glass-card overflow-hidden hover:shadow-lg transition-all duration-300"
                style={{ borderLeft: `3px solid ${trend.is_strong_trend ? "var(--accent-amber)" : "var(--accent-blue)"}` }}
              >
                {/* ──── Trend Header (clickable) ──── */}
                <div
                  className="p-4 cursor-pointer hover:bg-[var(--accent-blue)]/5 transition-all duration-200"
                  onClick={() => setExpandedTrend(isExpanded ? null : key)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Keyword title */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span
                          className="text-xl font-extrabold tracking-tight"
                          style={{ color: trendColor }}
                        >
                          {key}
                        </span>
                        {trend.is_strong_trend && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-[var(--accent-amber)]/25 to-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">
                            &#9650; GUCLU TREND
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          {isExpanded ? "&#9650;" : "&#9660;"}
                        </span>
                      </div>

                      {/* Circular score gauge */}
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className="relative w-12 h-12 flex items-center justify-center">
                          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-primary)" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="14" fill="none"
                              stroke={scoreColor(trend.trend_score, maxScore)}
                              strokeWidth="3"
                              strokeDasharray={`${Math.min(100, scorePct) * 0.88} 88`}
                              strokeLinecap="round"
                              className="transition-all duration-700"
                            />
                          </svg>
                          <span className="absolute text-sm font-black tabular-nums" style={{ color: scoreColor(trend.trend_score, maxScore) }}>
                            {trend.trend_score.toFixed(0)}
                          </span>
                        </div>
                      </div>

                      {/* Account pills with avatar letter */}
                      <div className="flex flex-wrap gap-1.5">
                        {trend.accounts.slice(0, 6).map((acc) => (
                          <span key={acc} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] text-[10px] font-medium border border-[var(--accent-blue)]/15">
                            <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent-blue)]/20 flex items-center justify-center text-[8px] font-bold">
                              {acc[0]?.toUpperCase()}
                            </span>
                            @{acc}
                          </span>
                        ))}
                        {trend.accounts.length > 6 && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[10px] text-[var(--text-secondary)]">
                            +{trend.accounts.length - 6} daha
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats badges (right side) */}
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
                        <span className="text-base font-bold text-[var(--accent-green)]">
                          {formatEngagement(trend.total_engagement)}
                        </span>
                        <span className="text-[9px] text-[var(--text-secondary)]">eng.</span>
                      </div>
                    </div>
                  </div>

                  {/* First tweet preview (collapsed only) */}
                  {trend.top_tweets.length > 0 && !isExpanded && (
                    <div className="mt-3 rounded-lg bg-[var(--bg-primary)]/80 border border-[var(--border)]/60 px-3 py-2.5">
                      {/* Turkish summary if available */}
                      {trend.top_tweets[0].summary_tr && (
                        <div className="text-xs text-[var(--accent-cyan)] mb-1.5 font-semibold px-2 py-1 rounded-md bg-[var(--accent-cyan)]/8 inline-block">
                          {trend.top_tweets[0].summary_tr}
                        </div>
                      )}
                      <div className="flex items-start gap-2 text-xs">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/10 ring-1 ring-[var(--accent-blue)]/20 flex items-center justify-center text-[9px] font-bold text-[var(--accent-blue)] shrink-0 mt-0.5">
                          {trend.top_tweets[0].account[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[var(--accent-blue)] font-semibold">@{trend.top_tweets[0].account}</span>
                            {trend.top_tweets[0].created_at && (
                              <span className="text-[10px] text-[var(--text-secondary)]">{relativeTime(trend.top_tweets[0].created_at)}</span>
                            )}
                          </div>
                          <span className="text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{trend.top_tweets[0].text}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ──── Expanded Content ──── */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-4">
                    {/* Top tweets */}
                    {trend.top_tweets.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-[var(--text-secondary)] mb-3">
                          Tweet&apos;ler ({trend.top_tweets.length})
                        </div>
                        <div className="space-y-3">
                          {trend.top_tweets.filter(t => !hideGM || !isGMTweet(t.text)).map((tw, i) => {
                            const origIdx = trend.top_tweets.indexOf(tw);
                            const compositeKey = `${key}::${origIdx}`;
                            const twResearch = tweetResearchData[compositeKey];
                            const twGenerated = tweetGeneratedTexts[compositeKey];
                            const twEdited = tweetEditedTexts[compositeKey] || "";
                            const isTwResearching = tweetResearchingKey === compositeKey;
                            const isTwGenerating = tweetGeneratingKey === compositeKey;
                            const isActive = activeTweetKey === compositeKey;
                            const tweetUrl = tw.tweet_url || (tw.tweet_id ? `https://x.com/${tw.account}/status/${tw.tweet_id}` : "");

                            return (
                              <div key={i} className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] overflow-hidden hover:bg-gradient-to-br hover:from-[var(--accent-blue)]/[0.03] hover:to-transparent transition-all duration-300">
                                <div className="p-3.5">
                                  {/* Turkish summary badge */}
                                  {tw.summary_tr && (
                                    <div className="mb-2.5 px-3 py-2 rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
                                      <span className="text-xs text-[var(--accent-cyan)] font-semibold leading-relaxed">
                                        {tw.summary_tr}
                                      </span>
                                    </div>
                                  )}

                                  {/* Author line */}
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/25 to-[var(--accent-purple)]/15 ring-2 ring-[var(--accent-blue)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--accent-blue)]">
                                        {tw.account[0]?.toUpperCase()}
                                      </span>
                                      <a
                                        href={`https://x.com/${tw.account}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[var(--accent-blue)] text-xs font-semibold hover:underline"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        @{tw.account}
                                      </a>
                                      {tw.created_at && (
                                        <span className="text-[10px] text-[var(--text-secondary)]">
                                          {relativeTime(tw.created_at)}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] border border-[var(--accent-green)]/25 font-bold tabular-nums">
                                      {formatEngagement(tw.engagement)} eng.
                                    </span>
                                  </div>

                                  {/* Tweet text */}
                                  <p className="text-sm leading-relaxed text-[var(--text-primary)] mb-3">{tw.text}</p>

                                  {/* Action buttons */}
                                  <div className="flex flex-wrap gap-2">
                                    {tweetUrl && (
                                      <a
                                        href={tweetUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/25 border border-[var(--accent-blue)]/20 transition-colors"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        Tweet&apos;e Git &#8599;
                                      </a>
                                    )}
                                    <button
                                      onClick={() => handleTweetResearch(trend, origIdx)}
                                      disabled={isTwResearching}
                                      className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-[var(--accent-green)]/15 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/25 border border-[var(--accent-green)]/20 transition-colors disabled:opacity-50"
                                    >
                                      {isTwResearching ? "Arastiriliyor..." : twResearch?.summary ? "Tekrar Arastir" : "Arastir"}
                                    </button>
                                    <a
                                      href={`https://x.com/${tw.account}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] transition-colors"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      Profil
                                    </a>
                                  </div>
                                </div>

                                {isTwResearching && twResearch?.progress && (
                                  <div className="px-3.5 pb-2 text-xs text-[var(--accent-blue)] animate-pulse">{twResearch.progress}</div>
                                )}

                                {isActive && twResearch?.summary && (
                                  <div className="border-t border-[var(--border)] p-3.5 space-y-3">
                                    <div className="rounded-xl bg-gradient-to-br from-[var(--accent-green)]/5 to-transparent border border-[var(--accent-green)]/20 p-4 space-y-2.5">
                                      <div className="text-xs font-bold text-[var(--accent-green)]">Arastirma Sonuclari</div>
                                      <p className="text-xs leading-relaxed text-[var(--text-primary)]">{twResearch.summary.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}</p>
                                      {twResearch.key_points.length > 0 && (
                                        <ul className="text-xs space-y-1.5 pl-1">
                                          {twResearch.key_points.map((kp, ki) => (
                                            <li key={ki} className="flex items-start gap-2 text-[var(--text-secondary)]">
                                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ki % 3 === 0 ? "var(--accent-blue)" : ki % 3 === 1 ? "var(--accent-green)" : "var(--accent-amber)" }} />
                                              <span>{kp}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {twResearch.sources.length > 0 && (
                                        <div className="pt-2 border-t border-[var(--border)]/50">
                                          <div className="text-[10px] font-medium text-[var(--text-secondary)] mb-1.5">Kaynaklar ({twResearch.sources.length})</div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {twResearch.sources.slice(0, 5).map((s, si) => (
                                              <div key={si}>
                                                {s.url ? (
                                                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[var(--accent-blue)]/8 text-[var(--accent-blue)] border border-[var(--accent-blue)]/15 hover:bg-[var(--accent-blue)]/15 hover:border-[var(--accent-blue)]/30 transition-all duration-200">
                                                    {s.title} &#8599;
                                                  </a>
                                                ) : (
                                                  <span className="inline-flex text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]">{s.title}</span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    {/* Tweet Gorselleri */}
                                    {tweetMedia[compositeKey]?.length > 0 && (
                                      <div className="mt-3 glass-card p-3 rounded-xl">
                                        <h4 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Tweet Gorselleri</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                          {tweetMedia[compositeKey].map((m, mi) => (
                                            <div key={mi} className="relative group rounded-lg overflow-hidden border border-[var(--border-primary)]/30">
                                              {m.type === 'image' ? (
                                                <img src={m.url} alt="" className="w-full h-32 object-cover" />
                                              ) : (
                                                <div className="w-full h-32 bg-[var(--bg-tertiary)] flex items-center justify-center">
                                                  <span className="text-2xl">&#127916;</span>
                                                  {m.thumbnail && <img src={m.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />}
                                                </div>
                                              )}
                                              <a href={m.url} target="_blank" rel="noopener noreferrer" download
                                                className="absolute bottom-1 right-1 px-2 py-1 rounded-md text-xs font-medium bg-[var(--accent-blue)] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                {m.type === 'video' ? 'Video Indir' : 'Indir'}
                                              </a>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    <div className="pt-2 border-t border-[var(--border)] space-y-2">
                                      <div className="text-[10px] font-medium text-[var(--text-secondary)]">Uretim Ayarlari</div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <select value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]">
                                          {styles.length > 0 ? styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : (
                                            <>
                                              <option value="informative">Bilgilendirici</option>
                                              <option value="provocative">Provoke Edici</option>
                                              <option value="technical">Teknik</option>
                                              <option value="storytelling">Hikaye</option>
                                              <option value="analytical">Analitik</option>
                                            </>
                                          )}
                                        </select>
                                        <select value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]">
                                          {formats.length > 0 ? formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : (
                                            <>
                                              <option value="spark">Micro Tweet</option>
                                              <option value="single">Tek Tweet</option>
                                              <option value="short_thread">Kisa Thread</option>
                                              <option value="thread">Thread</option>
                                            </>
                                          )}
                                        </select>
                                        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]">
                                          <option value="">Varsayilan AI</option>
                                          <option value="minimax">MiniMax</option>
                                          <option value="anthropic">Claude</option>
                                          <option value="openai">GPT</option>
                                          <option value="groq">Groq</option>
                                          <option value="gemini">Gemini</option>
                                        </select>
                                        <button onClick={() => handleTweetGenerate(trend, origIdx)} disabled={isTwGenerating} className="btn-primary text-xs">
                                          {isTwGenerating ? "Uretiliyor..." : twGenerated?.text ? "Tekrar Uret" : "Tweet Uret"}
                                        </button>
                                      </div>
                                    </div>
                                    {twGenerated && (
                                      <div className="space-y-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] p-4">
                                        {/* Tweet card preview */}
                                        <div className="flex items-start gap-3">
                                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-sm font-bold shrink-0">X</div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                              <div className="text-[11px] text-[var(--text-secondary)]">Olusturulan Tweet</div>
                                              {twGenerated.score > 0 && (
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${twGenerated.score >= 80 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" : twGenerated.score >= 60 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" : "bg-[var(--accent-red)]/20 text-[var(--accent-red)]"}`}>
                                                  {twGenerated.score}/100
                                                </span>
                                              )}
                                            </div>
                                            <textarea value={twEdited} onChange={e => setTweetEditedTexts(prev => ({ ...prev, [compositeKey]: e.target.value }))} className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full min-h-[80px] resize-y focus:border-[var(--accent-blue)] focus:outline-none leading-relaxed" rows={Math.min(6, Math.max(3, twEdited.split("\n").length + 1))} />
                                          </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] pl-[52px]">
                                          <span>{twEdited.length} karakter</span>
                                          {twEdited.length > 280 && <span className="text-[var(--accent-amber)]">Thread olarak paylasmayi dusunun</span>}
                                        </div>
                                        {/* Action buttons with primary/secondary distinction */}
                                        <div className="flex flex-wrap gap-2 pl-[52px]">
                                          <button onClick={() => openInX(twEdited)} className="btn-primary text-xs px-4">X&apos;te Paylas</button>
                                          <button onClick={() => copyText(twEdited, compositeKey)} className="btn-secondary text-xs">Kopyala</button>
                                          <button onClick={() => handleSaveDraft(compositeKey, "tweet")} className="btn-secondary text-xs">Taslak</button>
                                          <button onClick={() => setShowSchedule(showSchedule === compositeKey ? null : compositeKey)} className="btn-secondary text-xs">Zamanla</button>
                                          <button onClick={() => handleTweetGenerate(trend, origIdx)} disabled={isTwGenerating} className="btn-secondary text-xs">{isTwGenerating ? "..." : "Tekrar Uret"}</button>
                                        </div>
                                        {showSchedule === compositeKey && (
                                          <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)]">
                                            <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]" />
                                            <button onClick={() => handleSchedule(compositeKey, "tweet")} disabled={!scheduleTime} className="btn-primary text-xs">Onayla</button>
                                          </div>
                                        )}
                                        {actionMsg[compositeKey] && <div className="text-xs text-[var(--accent-green)]">{actionMsg[compositeKey]}</div>}
                                        {/* Baglantilar */}
                                        {tweetUrls[compositeKey]?.length > 0 && (
                                          <div className="mt-3 glass-card p-3 rounded-xl" style={{borderLeft: '3px solid var(--accent-blue)'}}>
                                            <h4 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">Baglantilar</h4>
                                            <p className="text-xs text-[var(--text-muted)] mb-2">Bu linkleri 2. tweetinize ekleyebilirsiniz</p>
                                            <div className="space-y-1.5">
                                              {tweetUrls[compositeKey].map((u, ui) => (
                                                <div key={ui} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-tertiary)]/50 hover:bg-[var(--bg-tertiary)] transition-colors">
                                                  <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--accent-blue)] hover:underline truncate flex-1">{u.display_url || u.url}</a>
                                                  <button onClick={() => {navigator.clipboard.writeText(u.url)}} className="px-2 py-1 text-xs rounded-md bg-[var(--bg-secondary)] hover:bg-[var(--accent-blue)] hover:text-white transition-colors">Kopyala</button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
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

                    {/* Trend-level actions */}
                    <div className="border-t border-[var(--border)] pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" />
                        <span className="text-xs font-medium text-[var(--text-secondary)]">Tum trend hakkinda</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]">
                          {styles.length > 0 ? styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : (
                            <>
                              <option value="informative">Bilgilendirici</option>
                              <option value="provocative">Provoke Edici</option>
                              <option value="technical">Teknik</option>
                              <option value="storytelling">Hikaye</option>
                              <option value="analytical">Analitik</option>
                            </>
                          )}
                        </select>
                        <select value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]">
                          {formats.length > 0 ? formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : (
                            <>
                              <option value="spark">Micro Tweet</option>
                              <option value="single">Tek Tweet</option>
                              <option value="short_thread">Kisa Thread</option>
                              <option value="thread">Thread</option>
                            </>
                          )}
                        </select>
                        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)]">
                          <option value="">Varsayilan AI</option>
                          <option value="minimax">MiniMax</option>
                          <option value="anthropic">Claude</option>
                          <option value="openai">GPT</option>
                          <option value="groq">Groq</option>
                          <option value="gemini">Gemini</option>
                        </select>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => handleResearch(trend)} disabled={isResearching} className="btn-secondary text-xs">
                          {isResearching ? "Arastiriliyor..." : activeResearch === key && research?.summary ? "Tekrar Arastir" : "Tum Trendi Arastir"}
                        </button>
                        <button onClick={() => handleGenerate(trend)} disabled={isGenerating} className="btn-primary text-xs px-5">
                          {isGenerating ? "Uretiliyor..." : activeGenerate === key && generated?.text ? "Tekrar Uret" : "Tweet Uret"}
                        </button>
                      </div>
                    </div>

                    {/* Trend-level research */}
                    {activeResearch === key && research && (
                      <div className="space-y-2">
                        {research.progress && <div className="text-xs text-[var(--accent-blue)] animate-pulse">{research.progress}</div>}
                        {research.summary && (
                          <div className="rounded-xl bg-gradient-to-br from-[var(--accent-blue)]/5 to-transparent border border-[var(--accent-blue)]/20 p-4 space-y-3">
                            <div className="text-xs font-bold text-[var(--accent-blue)]">Arastirma Sonuclari</div>
                            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{research.summary}</p>
                            {research.key_points.length > 0 && (
                              <ul className="text-sm space-y-2 pl-1">
                                {research.key_points.map((kp, i) => (
                                  <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: i % 3 === 0 ? "var(--accent-blue)" : i % 3 === 1 ? "var(--accent-green)" : "var(--accent-amber)" }} />
                                    <span>{kp}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {research.sources.length > 0 && (
                              <div className="pt-2 border-t border-[var(--border)]/50">
                                <div className="text-[10px] font-medium text-[var(--text-secondary)] mb-2">Kaynaklar</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {research.sources.map((s, i) => (
                                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-[var(--accent-blue)]/8 text-[var(--accent-blue)] border border-[var(--accent-blue)]/15 hover:bg-[var(--accent-blue)]/15 hover:border-[var(--accent-blue)]/30 transition-all duration-200">
                                      {s.title || s.url} &#8599;
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Trend-level generated tweet */}
                    {activeGenerate === key && generated && (
                      <div className="space-y-3">
                        {/* Tweet card preview */}
                        <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-sm font-bold shrink-0">X</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div className="text-[11px] text-[var(--text-secondary)]">Olusturulan Tweet</div>
                                {generated.score > 0 && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${generated.score >= 80 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" : generated.score >= 60 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" : "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]"}`}>
                                    {generated.score}/100
                                  </span>
                                )}
                              </div>
                              <textarea
                                value={generated.text}
                                onChange={e => setGeneratedTexts(prev => ({ ...prev, [key]: { ...prev[key], text: e.target.value } }))}
                                rows={Math.min(8, Math.max(3, generated.text.split("\n").length + 1))}
                                className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full resize-y focus:border-[var(--accent-blue)] focus:outline-none leading-relaxed"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pl-[52px]">
                          <span>{generated.text.length} karakter</span>
                          {generated.text.length > 280 && <span className="text-[var(--accent-amber)]">Thread olarak paylasmayi dusunun</span>}
                        </div>
                        {/* Action buttons with primary/secondary distinction */}
                        <div className="flex flex-wrap gap-2 pl-[52px]">
                          <button onClick={() => openInX(generated.text)} className="btn-primary text-xs px-4">X&apos;te Paylas</button>
                          <button onClick={() => copyText(generated.text, key)} className="btn-secondary text-xs">Kopyala</button>
                          <button onClick={() => handleSaveDraft(key)} className="btn-secondary text-xs">Taslak</button>
                          <button onClick={() => setShowSchedule(showSchedule === key ? null : key)} className="btn-secondary text-xs">Zamanla</button>
                        </div>
                        {showSchedule === key && (
                          <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)]">
                            <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]" />
                            <button onClick={() => handleSchedule(key)} disabled={!scheduleTime} className="btn-primary text-xs">Onayla</button>
                          </div>
                        )}
                        {actionMsg[key] && <div className="text-xs text-[var(--accent-green)]">{actionMsg[key]}</div>}
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
