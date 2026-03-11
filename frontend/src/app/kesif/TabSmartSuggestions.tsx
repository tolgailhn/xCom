"use client";

import { useState, useEffect } from "react";
import {
  getSmartSuggestions,
  generateQuoteTweet,
  researchTopicStream,
  getStyles,
  addDraft,
  schedulePost,
  findMedia,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

interface TopTweet {
  text: string;
  account: string;
  engagement: number;
}

interface Suggestion {
  type: "trend" | "news";
  topic: string;
  reason: string;
  description_tr?: string;
  engagement_potential: number;
  suggested_style: string;
  suggested_format: string;
  suggested_hour: string;
  url?: string;
  top_tweets?: TopTweet[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source_data?: any;
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

/* ── Component ──────────────────────────────────────── */

export default function TabSmartSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Style/format options
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Per-suggestion state
  const [researchData, setResearchData] = useState<Record<number, ResearchResult>>({});
  const [researchingIdx, setResearchingIdx] = useState<number | null>(null);
  const [generatedTweets, setGeneratedTweets] = useState<Record<number, GeneratedTweet>>({});
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});

  // Expanded panels
  const [expandedResearch, setExpandedResearch] = useState<Set<number>>(new Set());
  const [expandedTopTweets, setExpandedTopTweets] = useState<Set<number>>(new Set());

  // Actions
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});
  const [showSchedule, setShowSchedule] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // Media
  const [mediaResults, setMediaResults] = useState<Record<number, Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; source?: string }>>>({});
  const [mediaLoading, setMediaLoading] = useState<number | null>(null);

  /* ── Load ───────────────────────────────────────────── */

  useEffect(() => {
    getSmartSuggestions()
      .then(data => setSuggestions(data.suggestions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    getStyles()
      .then((data: { styles?: StyleOption[]; formats?: FormatOption[] }) => {
        if (data.styles) setStyles(data.styles);
        if (data.formats) setFormats(data.formats);
      })
      .catch(() => {});
  }, []);

  /* ── Handlers ───────────────────────────────────────── */

  const handleResearch = async (suggestion: Suggestion, idx: number) => {
    setResearchingIdx(idx);
    setResearchData(prev => ({
      ...prev,
      [idx]: { summary: "", key_points: [], sources: [], progress: "Arastirma baslatiliyor..." },
    }));
    setExpandedResearch(prev => new Set(prev).add(idx));

    try {
      // Build research topic from suggestion topic + top tweets context
      let researchTopic = suggestion.topic;
      if (suggestion.top_tweets && suggestion.top_tweets.length > 0) {
        const context = suggestion.top_tweets
          .slice(0, 3)
          .map(t => `@${t.account}: ${t.text}`)
          .join("\n");
        researchTopic = `${suggestion.topic}\n\nIlgili tweetler:\n${context}`;
      }
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

      // Build context from top tweets
      const topTweetsContext = suggestion.top_tweets
        ? suggestion.top_tweets.map(t => `@${t.account}: ${t.text}`).join("\n")
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

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleSet = (set: Set<number>, val: number): Set<number> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  };

  /* ── Render ─────────────────────────────────────────── */

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  const visibleSuggestions = suggestions.filter((_, i) => !dismissed.has(i));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="text-sm text-[var(--text-secondary)]">
        {visibleSuggestions.length} oneri
        {dismissed.size > 0 && ` (${dismissed.size} gizlendi)`}
      </div>

      {visibleSuggestions.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-secondary)]">
          Henuz oneri yok. Trend analizi ve haber taramasi verileri biriktikce oneriler burada gorunecek.
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((suggestion, idx) => {
            if (dismissed.has(idx)) return null;
            const research = researchData[idx];
            const gen = generatedTweets[idx];
            const isResearching = researchingIdx === idx;
            const isGenerating = generatingIdx === idx;
            const isResearchExpanded = expandedResearch.has(idx);
            const isTopTweetsExpanded = expandedTopTweets.has(idx);
            const edited = editedTexts[idx] || "";

            return (
              <div key={idx} className="card p-4 space-y-3">
                {/* Header: badge + topic + dismiss */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 ${
                        suggestion.type === "trend"
                          ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]"
                          : "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]"
                      }`}>
                        {suggestion.type === "trend" ? "TREND" : "HABER"}
                      </span>
                      <span className="text-sm font-semibold">{suggestion.topic}</span>
                    </div>
                    {/* Reason */}
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">{suggestion.reason}</div>
                    {/* Turkish description from top tweets */}
                    {suggestion.description_tr && (
                      <div className="text-xs text-[var(--text-primary)] mt-1.5 leading-relaxed bg-[var(--bg-secondary)] rounded px-2 py-1.5">
                        {suggestion.description_tr}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDismiss(idx)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-red)] shrink-0"
                    title="Gec"
                  >
                    ✕
                  </button>
                </div>

                {/* Topic context preview — always visible for trends */}
                {suggestion.type === "trend" && suggestion.top_tweets && suggestion.top_tweets.length > 0 && !isTopTweetsExpanded && (
                  <div className="text-xs space-y-1 p-2 rounded bg-[var(--bg-secondary)]">
                    {suggestion.top_tweets.slice(0, 2).map((t, i) => (
                      <div key={i} className="text-[var(--text-primary)] pl-2 border-l-2 border-[var(--border)]">
                        <span className="text-[var(--accent-blue)]">@{t.account}</span>{": "}
                        {t.text.length > 200 ? t.text.slice(0, 200) + "..." : t.text}
                      </div>
                    ))}
                  </div>
                )}
                {suggestion.type === "news" && (suggestion.url || suggestion.source_data?.description || suggestion.source_data?.summary) && (
                  <div className="text-xs space-y-1 p-2 rounded bg-[var(--bg-secondary)]">
                    {(suggestion.source_data?.description || suggestion.source_data?.summary) && (
                      <div className="text-[var(--text-primary)]">
                        {(suggestion.source_data?.description || suggestion.source_data?.summary || "").slice(0, 250)}
                        {(suggestion.source_data?.description || suggestion.source_data?.summary || "").length > 250 ? "..." : ""}
                      </div>
                    )}
                    {suggestion.url && (
                      <a href={suggestion.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline break-all">
                        {suggestion.url.length > 80 ? suggestion.url.slice(0, 80) + "..." : suggestion.url}
                      </a>
                    )}
                  </div>
                )}

                {/* Metrics bar */}
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--text-secondary)]">Engagement:</span>
                    <div className="w-20 h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          suggestion.engagement_potential >= 7 ? "bg-[var(--accent-green)]" :
                          suggestion.engagement_potential >= 4 ? "bg-[var(--accent-amber)]" :
                          "bg-[var(--text-secondary)]"
                        }`}
                        style={{ width: `${suggestion.engagement_potential * 10}%` }}
                      />
                    </div>
                    <span className="font-medium">{suggestion.engagement_potential}/10</span>
                  </div>
                  <span className="text-[var(--text-secondary)]">
                    Saat: {suggestion.suggested_hour}
                  </span>
                  {suggestion.top_tweets && suggestion.top_tweets.length > 0 && (
                    <span className="text-[var(--text-secondary)]">
                      {suggestion.top_tweets.length} tweet
                    </span>
                  )}
                </div>

                {/* Top tweets toggle (full view) */}
                {suggestion.top_tweets && suggestion.top_tweets.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpandedTopTweets(prev => toggleSet(prev, idx))}
                      className="text-xs text-[var(--accent-purple)] hover:underline"
                    >
                      {isTopTweetsExpanded ? "Tweet'leri Gizle" : `Tum Tweet'leri Gor (${suggestion.top_tweets.length})`}
                    </button>
                    {isTopTweetsExpanded && (
                      <div className="mt-2 space-y-2 pl-3 border-l-2 border-[var(--accent-purple)]/30">
                        {suggestion.top_tweets.map((tt, i) => (
                          <div key={i} className="text-xs text-[var(--text-secondary)]">
                            <div className="flex items-center gap-2 mb-0.5">
                              <a
                                href={`https://x.com/${tt.account}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-[var(--accent-blue)] hover:underline"
                              >
                                @{tt.account}
                              </a>
                              <span className="text-[10px] text-[var(--text-secondary)]">
                                {tt.engagement > 0 && `${tt.engagement} eng.`}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed">{tt.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--border)]">
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
                  <div className="text-xs text-[var(--accent-blue)] animate-pulse">
                    {research.progress}
                  </div>
                )}

                {/* Research results */}
                {research && research.summary && (
                  <div className="space-y-3 bg-[var(--bg-secondary)] rounded-lg p-3">
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
                        <p className="text-xs leading-relaxed">
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
                    <div className="pt-2 border-t border-[var(--border)] space-y-3">
                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          value={tweetStyle}
                          onChange={e => setTweetStyle(e.target.value)}
                          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
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
                          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
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
                          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
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
                      <div className="space-y-3 bg-[var(--bg-primary)] rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-[var(--accent-amber)]">Uretilen Tweet</h4>
                          {gen.score > 0 && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
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
                          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full min-h-[80px] resize-y"
                          rows={Math.min(6, Math.max(3, edited.split("\n").length + 1))}
                        />
                        <div className="text-[10px] text-[var(--text-secondary)] text-right">
                          {edited.length} karakter
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openInX(edited)} className="btn-primary text-xs">
                            X&apos;te Ac
                          </button>
                          <button onClick={() => copyText(edited)} className="btn-secondary text-xs">
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
                          <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)]">
                            <input
                              type="datetime-local"
                              value={scheduleTime}
                              onChange={e => setScheduleTime(e.target.value)}
                              className="input-field text-xs"
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
                                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block bg-[var(--bg-secondary)] rounded p-1.5 hover:ring-2 ring-[var(--accent-blue)] transition-all">
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

                        {/* Action message */}
                        {actionMsg[idx] && (
                          <div className="text-xs text-[var(--accent-green)]">{actionMsg[idx]}</div>
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
