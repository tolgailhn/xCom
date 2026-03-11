"use client";

import { useState, useEffect } from "react";
import {
  getSmartSuggestions,
  generateSmartSuggestion,
  addDraft,
  schedulePost,
  getStyles,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

interface Suggestion {
  type: "trend" | "news";
  topic: string;
  reason: string;
  engagement_potential: number;
  suggested_style: string;
  suggested_format: string;
  suggested_hour: string;
  url?: string;
  top_tweets?: { text: string; account: string; engagement: number }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source_data?: any;
}

interface StyleOption { id: string; name: string }
interface FormatOption { id: string; name: string }

const PROVIDER_OPTIONS = [
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

  // Per-card provider override (default = minimax)
  const [cardProvider, setCardProvider] = useState<Record<number, string>>({});

  // Generation state
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [generatedTweets, setGeneratedTweets] = useState<Record<number, {
    text: string;
    engagement_potential: number;
    best_time: string;
    reasoning: string;
  }>>({});

  // Actions
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});
  const [showSchedule, setShowSchedule] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

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

  const getProvider = (idx: number) => cardProvider[idx] || "minimax";

  const handleGenerate = async (suggestion: Suggestion, idx: number, styleOverride?: string, formatOverride?: string) => {
    setGeneratingIdx(idx);
    try {
      const context = suggestion.top_tweets
        ? suggestion.top_tweets.map(t => `@${t.account}: ${t.text}`).join("\n")
        : suggestion.url || "";

      const result = await generateSmartSuggestion({
        topic: suggestion.topic,
        style: styleOverride || suggestion.suggested_style,
        content_format: formatOverride || suggestion.suggested_format,
        provider: getProvider(idx),
        context,
      });

      setGeneratedTweets(prev => ({
        ...prev,
        [idx]: {
          text: result.tweet || "",
          engagement_potential: result.engagement_potential || suggestion.engagement_potential,
          best_time: result.best_time || suggestion.suggested_hour,
          reasoning: result.reasoning || "",
        },
      }));
    } catch (e) {
      setGeneratedTweets(prev => ({
        ...prev,
        [idx]: {
          text: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`,
          engagement_potential: 0,
          best_time: "",
          reasoning: "",
        },
      }));
    } finally {
      setGeneratingIdx(null);
    }
  };

  const handleSaveDraft = async (idx: number) => {
    const gen = generatedTweets[idx];
    if (!gen?.text) return;
    const s = suggestions[idx];
    try {
      await addDraft({ text: gen.text, topic: s.topic, style: s.suggested_style });
      setActionMsg(prev => ({ ...prev, [idx]: "Taslak kaydedildi!" }));
      setTimeout(() => setActionMsg(prev => ({ ...prev, [idx]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const handleScheduleAtBestTime = async (idx: number) => {
    const gen = generatedTweets[idx];
    if (!gen?.text || !gen.best_time) return;

    const now = new Date();
    const [h, m] = gen.best_time.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h || 14, m || 7, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    try {
      await schedulePost({ text: gen.text, scheduled_time: target.toISOString() });
      setActionMsg(prev => ({
        ...prev,
        [idx]: `Zamanlandi: ${target.toLocaleString("tr-TR")}`,
      }));
      setTimeout(() => setActionMsg(prev => ({ ...prev, [idx]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const handleScheduleCustom = async (idx: number) => {
    const gen = generatedTweets[idx];
    if (!gen?.text || !scheduleTime) return;
    try {
      await schedulePost({ text: gen.text, scheduled_time: scheduleTime });
      setActionMsg(prev => ({
        ...prev,
        [idx]: `Zamanlandi: ${new Date(scheduleTime).toLocaleString("tr-TR")}`,
      }));
      setShowSchedule(null);
      setScheduleTime("");
      setTimeout(() => setActionMsg(prev => ({ ...prev, [idx]: "" })), 3000);
    } catch { /* ignore */ }
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
            const gen = generatedTweets[idx];
            const isGenerating = generatingIdx === idx;

            return (
              <div key={idx} className="card p-4 space-y-3">
                {/* Header: badge + topic + dismiss */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 ${
                        suggestion.type === "trend"
                          ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]"
                          : "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]"
                      }`}>
                        {suggestion.type === "trend" ? "TREND" : "HABER"}
                      </span>
                      <span className="text-sm font-semibold">{suggestion.topic}</span>
                    </div>
                    {/* Reason — always visible */}
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">{suggestion.reason}</div>
                  </div>
                  <button
                    onClick={() => handleDismiss(idx)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-red)] shrink-0"
                    title="Gec"
                  >
                    ✕
                  </button>
                </div>

                {/* Topic context preview — always visible */}
                {suggestion.type === "trend" && suggestion.top_tweets && suggestion.top_tweets.length > 0 && (
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

                {/* Metrics row */}
                <div className="flex items-center gap-4 text-xs">
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
                </div>

                {/* Style/Format/Provider selectors + Generate button */}
                {!gen && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      defaultValue={suggestion.suggested_style}
                      id={`style-${idx}`}
                      className="input-field text-xs py-1"
                    >
                      {styles.length > 0 ? styles.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      )) : (
                        <>
                          <option value="informative">Bilgilendirici</option>
                          <option value="tolga_news">Tolga News</option>
                          <option value="hook">Hook / Viral</option>
                          <option value="analitik">Analitik</option>
                          <option value="hurricane">Hurricane</option>
                        </>
                      )}
                    </select>
                    <select
                      defaultValue={suggestion.suggested_format}
                      id={`format-${idx}`}
                      className="input-field text-xs py-1"
                    >
                      {formats.length > 0 ? formats.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      )) : (
                        <>
                          <option value="punch">Punch — Standart (140-280)</option>
                          <option value="classic">Classic — Orta (200-400)</option>
                          <option value="spark">Spark — Detayli (400-600)</option>
                          <option value="storm">Storm — Cok Detayli (700-1000)</option>
                          <option value="thread">Thread — Seri (3-5 tweet)</option>
                        </>
                      )}
                    </select>
                    <select
                      value={getProvider(idx)}
                      onChange={(e) => setCardProvider(prev => ({ ...prev, [idx]: e.target.value }))}
                      className="input-field text-xs py-1"
                    >
                      {PROVIDER_OPTIONS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const styleEl = document.getElementById(`style-${idx}`) as HTMLSelectElement | null;
                        const formatEl = document.getElementById(`format-${idx}`) as HTMLSelectElement | null;
                        handleGenerate(suggestion, idx, styleEl?.value, formatEl?.value);
                      }}
                      disabled={isGenerating}
                      className="btn-primary text-xs"
                    >
                      {isGenerating ? "Uretiliyor..." : "Tweet Uret"}
                    </button>
                  </div>
                )}

                {/* Generated tweet */}
                {gen && (
                  <div className="space-y-2 border-t border-[var(--border)] pt-3">
                    {gen.best_time && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[var(--accent-green)]">
                          Onerilen saat: {gen.best_time}
                        </span>
                        {gen.engagement_potential > 0 && (
                          <span className="text-[var(--accent-blue)]">
                            Tahmin: {gen.engagement_potential}/10
                          </span>
                        )}
                        {gen.reasoning && (
                          <span className="text-[var(--text-secondary)] truncate" title={gen.reasoning}>
                            {gen.reasoning}
                          </span>
                        )}
                      </div>
                    )}

                    <textarea
                      value={gen.text}
                      onChange={(e) => setGeneratedTweets(prev => ({
                        ...prev,
                        [idx]: { ...prev[idx], text: e.target.value },
                      }))}
                      rows={Math.min(6, Math.max(3, gen.text.split("\n").length + 1))}
                      className="input-field text-sm w-full"
                    />
                    <div className="text-xs text-[var(--text-secondary)]">{gen.text.length} karakter</div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => copyText(gen.text)} className="btn-secondary text-xs">
                        Kopyala
                      </button>
                      <button onClick={() => openInX(gen.text)} className="btn-secondary text-xs">
                        X&apos;te Ac
                      </button>
                      <button onClick={() => handleSaveDraft(idx)} className="btn-secondary text-xs">
                        Taslak
                      </button>
                      {gen.best_time && (
                        <button onClick={() => handleScheduleAtBestTime(idx)} className="btn-primary text-xs">
                          {gen.best_time}&apos;de Zamanla
                        </button>
                      )}
                      <button
                        onClick={() => setShowSchedule(showSchedule === idx ? null : idx)}
                        className="btn-secondary text-xs"
                      >
                        Ozel Saat
                      </button>
                      <button
                        onClick={() => {
                          const styleEl = document.getElementById(`style-${idx}`) as HTMLSelectElement | null;
                          const formatEl = document.getElementById(`format-${idx}`) as HTMLSelectElement | null;
                          handleGenerate(suggestion, idx, styleEl?.value, formatEl?.value);
                        }}
                        disabled={isGenerating}
                        className="btn-secondary text-xs"
                        title="Ayni ayarlarla tekrar uret"
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
                          onChange={(e) => setScheduleTime(e.target.value)}
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

                    {actionMsg[idx] && (
                      <div className="text-xs text-[var(--accent-green)]">{actionMsg[idx]}</div>
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
