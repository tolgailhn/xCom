"use client";

import { useState, useEffect } from "react";
import {
  getTrends,
  triggerTrendAnalysis,
  researchTopicStream,
  generateTweet,
  getStyles,
  addDraft,
  schedulePost,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

interface TrendTweet {
  text: string;
  account: string;
  engagement: number;
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

interface StyleOption { id: string; name: string; desc: string }
interface FormatOption { id: string; name: string; desc: string }

interface ResearchState {
  summary: string;
  key_points: string[];
  sources: { title: string; url?: string }[];
  progress: string;
}

/* ── Component ──────────────────────────────────────── */

export default function TabTrends() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [totalAnalyzed, setTotalAnalyzed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Expanded panels
  const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
  const [activeResearch, setActiveResearch] = useState<string | null>(null);
  const [activeGenerate, setActiveGenerate] = useState<string | null>(null);

  // Research state per trend
  const [researchData, setResearchData] = useState<Record<string, ResearchState>>({});
  const [researchingKey, setResearchingKey] = useState<string | null>(null);

  // Generation state per trend
  const [generatedTexts, setGeneratedTexts] = useState<Record<string, { text: string; score: number }>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

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

  /* ── Load data ──────────────────────────────────────── */

  const loadTrends = async () => {
    try {
      const data = await getTrends();
      setTrends(data.trends || []);
      setLastUpdated(data.last_updated || "");
      setTotalAnalyzed(data.total_tweets_analyzed || 0);
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
      // Build research context from top tweets
      const context = trend.top_tweets
        .map(t => `@${t.account}: ${t.text}`)
        .join("\n\n");
      const topic = `${trend.keyword} — ${trend.account_count} hesapta trend. Ornek tweetler:\n${context}`;

      const result = await researchTopicStream(
        { topic, engine: "default" },
        (progress) => {
          setResearchData(prev => ({
            ...prev,
            [key]: { ...prev[key], progress },
          }));
        },
      );

      setResearchData(prev => ({
        ...prev,
        [key]: {
          summary: result.summary,
          key_points: result.key_points,
          sources: result.sources,
          progress: "",
        },
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

      // Add top tweets as context
      const tweetContext = trend.top_tweets
        .slice(0, 3)
        .map(t => `@${t.account} (${t.engagement} eng): ${t.text}`)
        .join("\n---\n");

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
        [key]: {
          text: result.tweet || result.text || "",
          score: result.score?.overall || result.quality_score || 0,
        },
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

  const handleSaveDraft = async (key: string) => {
    const gen = generatedTexts[key];
    if (!gen?.text) return;
    try {
      await addDraft({ text: gen.text, topic: key, style: selectedStyle });
      setActionMsg(prev => ({ ...prev, [key]: "Taslak kaydedildi!" }));
      setTimeout(() => setActionMsg(prev => ({ ...prev, [key]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const handleSchedule = async (key: string) => {
    const gen = generatedTexts[key];
    if (!gen?.text || !scheduleTime) return;
    try {
      await schedulePost({ text: gen.text, scheduled_time: scheduleTime });
      setActionMsg(prev => ({ ...prev, [key]: `Zamanlandi: ${new Date(scheduleTime).toLocaleString("tr-TR")}` }));
      setShowSchedule(null);
      setScheduleTime("");
      setTimeout(() => setActionMsg(prev => ({ ...prev, [key]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const openInX = (text: string) => {
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  /* ── Render ─────────────────────────────────────────── */

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {totalAnalyzed > 0 && `${totalAnalyzed} tweet analiz edildi`}
          {lastUpdated && ` · Son: ${new Date(lastUpdated).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
        <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary text-sm">
          {analyzing ? "Analiz ediliyor..." : "Trend Analiz Et"}
        </button>
      </div>

      {/* Style/Format/Provider bar */}
      <div className="card p-3">
        <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Tweet Uretim Ayarlari</div>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            className="input-field text-sm py-1"
          >
            {styles.length > 0 ? styles.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            )) : (
              <>
                <option value="informative">Bilgilendirici</option>
                <option value="provocative">Provoke Edici</option>
                <option value="technical">Teknik</option>
                <option value="storytelling">Hikaye</option>
                <option value="analytical">Analitik</option>
              </>
            )}
          </select>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="input-field text-sm py-1"
          >
            {formats.length > 0 ? formats.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            )) : (
              <>
                <option value="spark">Micro Tweet</option>
                <option value="single">Tek Tweet</option>
                <option value="short_thread">Kisa Thread</option>
                <option value="thread">Thread</option>
              </>
            )}
          </select>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="input-field text-sm py-1"
          >
            <option value="">Varsayilan AI</option>
            <option value="minimax">MiniMax</option>
            <option value="anthropic">Claude</option>
            <option value="openai">GPT</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {trends.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-secondary)]">
          Henuz trend tespit edilmedi. Kesfet ve otomatik tarama verileri biriktikce trendler burada gorunecek.
        </div>
      ) : (
        <div className="space-y-3">
          {trends.map((trend) => {
            const key = trend.keyword;
            const isExpanded = expandedTrend === key;
            const research = researchData[key];
            const generated = generatedTexts[key];
            const isResearching = researchingKey === key;
            const isGenerating = generatingKey === key;

            return (
              <div
                key={key}
                className={`card overflow-hidden transition-colors ${
                  trend.is_strong_trend ? "border-l-4 border-l-[var(--accent-amber)]" : ""
                }`}
              >
                {/* Trend header — clickable */}
                <div
                  className="p-4 cursor-pointer hover:bg-[var(--bg-secondary)]/50"
                  onClick={() => setExpandedTrend(isExpanded ? null : key)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold">{key}</span>
                      {trend.is_strong_trend && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]">
                          TREND
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                      <span>{trend.account_count} hesap</span>
                      <span>{trend.tweet_count} tweet</span>
                      <span>{trend.total_engagement.toFixed(0)} eng.</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {trend.accounts.map((acc) => (
                      <span key={acc} className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[10px] font-medium">
                        @{acc}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-4">
                    {/* Top tweets */}
                    {trend.top_tweets.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">En iyi tweet&apos;ler:</div>
                        <div className="space-y-2">
                          {trend.top_tweets.map((tw, i) => (
                            <div key={i} className="p-2 rounded bg-[var(--bg-secondary)] text-sm">
                              <span className="text-[var(--accent-blue)] text-xs font-medium">@{tw.account}</span>
                              <span className="text-[var(--text-secondary)] text-xs ml-2">{tw.engagement.toFixed(0)} eng.</span>
                              <p className="mt-1 line-clamp-3">{tw.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResearch(trend)}
                        disabled={isResearching}
                        className="btn-secondary text-sm"
                      >
                        {isResearching ? "Arastiriliyor..." : activeResearch === key && research?.summary ? "Tekrar Arastir" : "Arastir"}
                      </button>
                      <button
                        onClick={() => handleGenerate(trend)}
                        disabled={isGenerating}
                        className="btn-primary text-sm"
                      >
                        {isGenerating ? "Uretiliyor..." : activeGenerate === key && generated?.text ? "Tekrar Uret" : "Tweet Uret"}
                      </button>
                    </div>

                    {/* Research results */}
                    {activeResearch === key && research && (
                      <div className="space-y-2">
                        {research.progress && (
                          <div className="text-xs text-[var(--accent-blue)] animate-pulse">{research.progress}</div>
                        )}
                        {research.summary && (
                          <div className="p-3 rounded bg-[var(--bg-secondary)] space-y-2">
                            <div className="text-xs font-medium text-[var(--text-secondary)]">Arastirma Ozeti</div>
                            <p className="text-sm">{research.summary}</p>
                            {research.key_points.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-[var(--text-secondary)] mt-2">Anahtar Noktalar</div>
                                <ul className="list-disc list-inside text-sm space-y-1 mt-1">
                                  {research.key_points.map((kp, i) => <li key={i}>{kp}</li>)}
                                </ul>
                              </div>
                            )}
                            {research.sources.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-[var(--text-secondary)] mt-2">Kaynaklar</div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {research.sources.map((s, i) => (
                                    <a
                                      key={i}
                                      href={s.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs px-2 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] hover:underline"
                                    >
                                      {s.title || s.url}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Generated tweet */}
                    {activeGenerate === key && generated && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-medium text-[var(--text-secondary)]">Uretilen Tweet</div>
                          {generated.score > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              generated.score >= 80 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" :
                              generated.score >= 60 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" :
                              "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]"
                            }`}>
                              {generated.score}/100
                            </span>
                          )}
                        </div>
                        <textarea
                          value={generated.text}
                          onChange={(e) => setGeneratedTexts(prev => ({
                            ...prev,
                            [key]: { ...prev[key], text: e.target.value },
                          }))}
                          rows={Math.min(8, Math.max(3, generated.text.split("\n").length + 1))}
                          className="input-field text-sm w-full"
                        />
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                          <span>{generated.text.length} karakter</span>
                          {generated.text.length > 280 && (
                            <span className="text-[var(--accent-amber)]">Thread olarak paylasmayi dusunun</span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => copyText(generated.text)} className="btn-secondary text-xs">
                            Kopyala
                          </button>
                          <button onClick={() => openInX(generated.text)} className="btn-secondary text-xs">
                            X&apos;te Ac
                          </button>
                          <button onClick={() => handleSaveDraft(key)} className="btn-secondary text-xs">
                            Taslak Kaydet
                          </button>
                          <button
                            onClick={() => setShowSchedule(showSchedule === key ? null : key)}
                            className="btn-secondary text-xs"
                          >
                            Zamanla
                          </button>
                        </div>

                        {/* Schedule picker */}
                        {showSchedule === key && (
                          <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)]">
                            <input
                              type="datetime-local"
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                              className="input-field text-xs"
                            />
                            <button
                              onClick={() => handleSchedule(key)}
                              disabled={!scheduleTime}
                              className="btn-primary text-xs"
                            >
                              Onayla
                            </button>
                          </div>
                        )}

                        {/* Action message */}
                        {actionMsg[key] && (
                          <div className="text-xs text-[var(--accent-green)]">{actionMsg[key]}</div>
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
