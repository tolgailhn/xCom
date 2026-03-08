"use client";

import { useState, useEffect } from "react";
import {
  getStyles,
  discoverContentTopics,
  researchTopic,
  generateLongContent,
  scoreTweet,
  findMedia,
  addDraft,
} from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */

interface ContentStyle {
  id: string;
  name: string;
  desc: string;
}

interface FormatOption {
  id: string;
  name: string;
  desc: string;
}

interface DiscoveredTopic {
  title: string;
  description: string;
  angle: string;
  potential: string;
}

interface ScoreResult {
  score: number;
  length: number;
  has_hook: boolean;
  has_cta: boolean;
  overall?: number;
  hook_score?: number;
  data_score?: number;
  naturalness_score?: number;
  depth_score?: number;
  format_score?: number;
  char_count?: number;
  suggestions?: string[];
  quality_label?: string;
}

interface MediaItem {
  url: string;
  type: string;
  source: string;
  preview?: string;
  author?: string;
}

/* ── Score Bar ─────────────────────────────────────────── */

function ScoreBar({ score }: { score: ScoreResult | null }) {
  if (!score) return null;
  const pct = score.overall ?? score.score;
  const color =
    pct >= 80
      ? "var(--accent-green)"
      : pct >= 60
        ? "var(--accent-yellow)"
        : "var(--accent-red)";

  const hasDetails = score.hook_score !== undefined;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">
          {score.quality_label || "Kalite"}: {pct}/100 | {score.char_count ?? score.length} kar
        </span>
      </div>
      <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {hasDetails && (
        <div className="flex gap-3 text-[10px] text-[var(--text-secondary)] mt-1">
          <span>Hook:{score.hook_score}/20</span>
          <span>Veri:{score.data_score}/20</span>
          <span>Dogallik:{score.naturalness_score}/20</span>
          <span>Derinlik:{score.depth_score}/20</span>
          <span>Format:{score.format_score}/20</span>
        </div>
      )}
      {score.suggestions && score.suggestions.length > 0 && pct < 70 && (
        <div className="text-[10px] text-[var(--accent-yellow)] mt-1">
          {score.suggestions[0]}
        </div>
      )}
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────── */

export default function IcerikPage() {
  const [activeTab, setActiveTab] = useState<"discover" | "generate">("discover");
  const [contentStyles, setContentStyles] = useState<ContentStyle[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);

  useEffect(() => {
    getStyles()
      .then(
        (r: {
          content_styles?: ContentStyle[];
          formats: FormatOption[];
        }) => {
          setContentStyles(
            r.content_styles || [
              { id: "deneyim", name: "Kisisel Deneyim", desc: "" },
              { id: "egitici", name: "Egitici", desc: "" },
              { id: "karsilastirma", name: "Karsilastirma", desc: "" },
              { id: "analiz", name: "Analiz", desc: "" },
              { id: "hikaye", name: "Hikaye Anlatimi", desc: "" },
            ]
          );
          setFormats(r.formats);
        }
      )
      .catch(() => {});
  }, []);

  const tabs = [
    { id: "discover" as const, label: "Konu Kesfet" },
    { id: "generate" as const, label: "Icerik Uret" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Icerik Uretici</h2>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? "bg-[var(--accent-blue)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "discover" && (
        <TabDiscover contentStyles={contentStyles} formats={formats} />
      )}
      {activeTab === "generate" && (
        <TabGenerate contentStyles={contentStyles} formats={formats} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 1: KONU KESFET
   ══════════════════════════════════════════════════════════ */

function TabDiscover({
  contentStyles,
  formats,
}: {
  contentStyles: ContentStyle[];
  formats: FormatOption[];
}) {
  const [focusArea, setFocusArea] = useState("");
  const [engine, setEngine] = useState("default");
  const [discovering, setDiscovering] = useState(false);
  const [topics, setTopics] = useState<DiscoveredTopic[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* Selected topic for generation */
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [genStyle, setGenStyle] = useState("deneyim");
  const [genFormat, setGenFormat] = useState("storm");
  const [genExtra, setGenExtra] = useState("");
  const [researchMode, setResearchMode] = useState("x_and_web");
  const [genEngine, setGenEngine] = useState("default");
  const [genAgentic, setGenAgentic] = useState(false);

  /* Generated content */
  const [generatedContent, setGeneratedContent] = useState("");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  /* Media */
  const [mediaResults, setMediaResults] = useState<MediaItem[]>([]);
  const [mediaSource, setMediaSource] = useState("x");
  const [mediaLoading, setMediaLoading] = useState(false);

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    setTopics([]);
    setSelectedIdx(null);
    setGeneratedContent("");
    try {
      const res = (await discoverContentTopics(focusArea, engine)) as {
        topics: DiscoveredTopic[];
      };
      setTopics(res.topics);
      if (!res.topics.length) {
        setError("Konu onerisi bulunamadi. Tekrar deneyin veya farkli bir odak alani yazin.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kesif hatasi");
    } finally {
      setDiscovering(false);
    }
  };

  const handleGenerate = async () => {
    if (selectedIdx === null) return;
    const topic = topics[selectedIdx];
    setGenerating(true);
    setError(null);
    setGeneratedContent("");
    setScoreResult(null);
    setMediaResults([]);

    try {
      // Step 1: Research
      let researchContext = "";
      try {
        const research = (await researchTopic({
          topic: topic.title,
          engine: genEngine,
          agentic: genAgentic,
        })) as { summary: string; key_points: string[] };
        researchContext = `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}`;
      } catch {
        // Research optional, continue
      }

      // Step 2: Generate
      const result = (await generateLongContent({
        topic: topic.title,
        style: genStyle,
        length: genFormat,
        research_context: researchContext,
        content_format: genFormat,
      })) as { text: string; score: ScoreResult | null };

      setGeneratedContent(result.text);
      setScoreResult(result.score || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Icerik uretim hatasi");
    } finally {
      setGenerating(false);
    }
  };

  const handleFindMedia = async () => {
    if (selectedIdx === null) return;
    setMediaLoading(true);
    try {
      const res = (await findMedia(topics[selectedIdx].title, mediaSource)) as {
        media: MediaItem[];
      };
      setMediaResults(res.media || []);
    } catch {
      /* ignore */
    } finally {
      setMediaLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-purple)]">
        <p className="text-sm text-[var(--text-secondary)]">
          AI, X&apos;te trend konulari ve guncel haberleri tarayip sana icerik onerileri sunar
        </p>
      </div>

      {/* Discovery input */}
      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Odak Alani (opsiyonel)
          </label>
          <input
            type="text"
            value={focusArea}
            onChange={(e) => setFocusArea(e.target.value)}
            placeholder="Bos birakirsan genel AI/teknoloji gelismeleri bulunur"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Motor</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="default">DuckDuckGo</option>
              <option value="grok">Grok (xAI)</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleDiscover}
          disabled={discovering}
          className="btn-primary w-full"
        >
          {discovering ? "Konular arastiriliyor..." : "Konulari Kesfet"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Discovered topics */}
      {topics.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
            {topics.length} konu onerisi bulundu
          </h3>

          {topics.map((topic, i) => (
            <div
              key={i}
              className={`glass-card cursor-pointer transition-all ${
                selectedIdx === i
                  ? "ring-2 ring-[var(--accent-blue)]"
                  : "hover:ring-1 ring-[var(--border)]"
              }`}
              onClick={() => {
                setSelectedIdx(selectedIdx === i ? null : i);
                setGenExtra(topic.description);
                setGeneratedContent("");
                setScoreResult(null);
                setMediaResults([]);
              }}
            >
              <h4 className="font-semibold text-sm">{i + 1}. {topic.title}</h4>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{topic.description}</p>
              {topic.angle && (
                <p className="text-xs mt-1">
                  <span className="text-[var(--accent-cyan)] font-medium">Aci:</span>{" "}
                  <span className="text-[var(--text-secondary)]">{topic.angle}</span>
                </p>
              )}
              {topic.potential && (
                <p className="text-xs mt-0.5">
                  <span className="text-[var(--accent-green)] font-medium">Potansiyel:</span>{" "}
                  <span className="text-[var(--text-secondary)]">{topic.potential}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generation options for selected topic */}
      {selectedIdx !== null && (
        <div className="glass-card space-y-4 border-t-2 border-[var(--accent-blue)]">
          <h4 className="text-sm font-semibold text-[var(--accent-blue)]">
            Secilen Konu: {topics[selectedIdx].title}
          </h4>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Icerik Tarzi</label>
              <select
                value={genStyle}
                onChange={(e) => setGenStyle(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                {contentStyles.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Format</label>
              <select
                value={genFormat}
                onChange={(e) => setGenFormat(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} - {f.desc}</option>
                ))}
              </select>
            </div>
          </div>

          <textarea
            value={genExtra}
            onChange={(e) => setGenExtra(e.target.value)}
            placeholder="Ek talimatlar..."
            rows={2}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:border-[var(--accent-blue)] focus:outline-none"
          />

          {/* Research settings */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-secondary)] font-medium">
              Arastirma Ayarlari
            </summary>
            <div className="mt-2 flex flex-wrap gap-4">
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">Mod</label>
                <select
                  value={researchMode}
                  onChange={(e) => setResearchMode(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="x_and_web">X + Web</option>
                  <option value="x_only">Sadece X</option>
                  <option value="x_deep">Derin X</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">Motor</label>
                <select
                  value={genEngine}
                  onChange={(e) => setGenEngine(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="default">DuckDuckGo</option>
                  <option value="grok">Grok</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={genAgentic}
                    onChange={(e) => setGenAgentic(e.target.checked)}
                    className="rounded"
                  />
                  Agentic
                </label>
              </div>
            </div>
          </details>

          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-primary flex-1"
            >
              {generating ? "Arastiriliyor & uretiliyor..." : "Arastir & Icerik Uret"}
            </button>
            <button
              onClick={() => {
                setSelectedIdx(null);
                setGeneratedContent("");
              }}
              className="btn-secondary text-sm"
            >
              Iptal
            </button>
          </div>
        </div>
      )}

      {/* Generated content from discover flow */}
      {generatedContent && (
        <ContentDisplay
          content={generatedContent}
          score={scoreResult}
          topic={selectedIdx !== null ? topics[selectedIdx].title : ""}
          mediaResults={mediaResults}
          mediaSource={mediaSource}
          mediaLoading={mediaLoading}
          draftSaved={draftSaved}
          onRegenerate={handleGenerate}
          onFindMedia={handleFindMedia}
          onMediaSourceChange={setMediaSource}
          onSaveDraft={async () => {
            setDraftSaved(false);
            await addDraft({
              text: generatedContent,
              topic: selectedIdx !== null ? topics[selectedIdx].title : "",
              style: genStyle,
            });
            setDraftSaved(true);
            setTimeout(() => setDraftSaved(false), 3000);
          }}
          onReScore={async () => {
            try {
              const s = (await scoreTweet(generatedContent)) as ScoreResult;
              setScoreResult(s);
            } catch { /* ignore */ }
          }}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 2: ICERIK URET
   ══════════════════════════════════════════════════════════ */

function TabGenerate({
  contentStyles,
  formats,
}: {
  contentStyles: ContentStyle[];
  formats: FormatOption[];
}) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("deneyim");
  const [contentFormat, setContentFormat] = useState("storm");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [doResearch, setDoResearch] = useState(true);
  const [researchMode, setResearchMode] = useState("x_and_web");
  const [engine, setEngine] = useState("default");
  const [agentic, setAgentic] = useState(false);

  const [generatedContent, setGeneratedContent] = useState("");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [researchData, setResearchData] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  /* Media */
  const [mediaResults, setMediaResults] = useState<MediaItem[]>([]);
  const [mediaSource, setMediaSource] = useState("x");
  const [mediaLoading, setMediaLoading] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setGeneratedContent("");
    setScoreResult(null);
    setMediaResults([]);
    setResearchData("");

    try {
      // Step 1: Research if requested
      let researchContext = "";
      if (doResearch) {
        try {
          const research = (await researchTopic({
            topic,
            engine,
            agentic,
          })) as { summary: string; key_points: string[] };
          researchContext = `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}`;
          setResearchData(researchContext);
        } catch {
          // Research optional
        }
      }

      // Step 2: Generate
      const result = (await generateLongContent({
        topic,
        style,
        length: contentFormat,
        research_context: researchContext,
        content_format: contentFormat,
      })) as { text: string; score: ScoreResult | null };

      setGeneratedContent(result.text);
      setScoreResult(result.score || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Icerik uretim hatasi");
    } finally {
      setLoading(false);
    }
  };

  const handleFindMedia = async () => {
    setMediaLoading(true);
    try {
      const res = (await findMedia(topic, mediaSource)) as { media: MediaItem[] };
      setMediaResults(res.media || []);
    } catch {
      /* ignore */
    } finally {
      setMediaLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-cyan)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Konu gir &rarr; AI arastirsin &rarr; Detayli, uzun-form X icerigi uretsin
        </p>
      </div>

      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">Konu</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ne hakkinda yazmak istiyorsun?"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Icerik Tarzi</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              {contentStyles.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Format</label>
            <select
              value={contentFormat}
              onChange={(e) => setContentFormat(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              {formats.map((f) => (
                <option key={f.id} value={f.id}>{f.name} - {f.desc}</option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={extraInstructions}
          onChange={(e) => setExtraInstructions(e.target.value)}
          placeholder="Ek talimatlar: ton, hedef kitle, ozel detay..."
          rows={2}
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:border-[var(--accent-blue)] focus:outline-none"
        />

        {/* Research toggle */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={doResearch}
            onChange={(e) => setDoResearch(e.target.checked)}
            className="rounded"
          />
          Once konuyu arastir
        </label>

        {doResearch && (
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-secondary)] font-medium">
              Arastirma Ayarlari
            </summary>
            <div className="mt-2 flex flex-wrap gap-4">
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">Mod</label>
                <select
                  value={researchMode}
                  onChange={(e) => setResearchMode(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="x_and_web">X + Web</option>
                  <option value="x_only">Sadece X</option>
                  <option value="x_deep">Derin X</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">Motor</label>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="default">DuckDuckGo</option>
                  <option value="grok">Grok</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agentic}
                    onChange={(e) => setAgentic(e.target.checked)}
                    className="rounded"
                  />
                  Agentic
                </label>
              </div>
            </div>
          </details>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !topic.trim()}
          className="btn-primary w-full"
        >
          {loading ? "Arastiriliyor & uretiliyor..." : "Icerik Uret"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Research data */}
      {researchData && (
        <details className="glass-card">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--accent-cyan)]">
            Arastirma Verileri
          </summary>
          <p className="mt-2 text-xs text-[var(--text-secondary)] whitespace-pre-line max-h-60 overflow-y-auto">
            {researchData}
          </p>
        </details>
      )}

      {/* Generated content */}
      {generatedContent && (
        <ContentDisplay
          content={generatedContent}
          score={scoreResult}
          topic={topic}
          mediaResults={mediaResults}
          mediaSource={mediaSource}
          mediaLoading={mediaLoading}
          draftSaved={draftSaved}
          onRegenerate={handleGenerate}
          onFindMedia={handleFindMedia}
          onMediaSourceChange={setMediaSource}
          onSaveDraft={async () => {
            setDraftSaved(false);
            await addDraft({ text: generatedContent, topic, style });
            setDraftSaved(true);
            setTimeout(() => setDraftSaved(false), 3000);
          }}
          onReScore={async () => {
            try {
              const s = (await scoreTweet(generatedContent)) as ScoreResult;
              setScoreResult(s);
            } catch { /* ignore */ }
          }}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SHARED: Content Display Component
   ══════════════════════════════════════════════════════════ */

function ContentDisplay({
  content,
  score,
  topic,
  mediaResults,
  mediaSource,
  mediaLoading,
  draftSaved,
  onRegenerate,
  onFindMedia,
  onMediaSourceChange,
  onSaveDraft,
  onReScore,
}: {
  content: string;
  score: ScoreResult | null;
  topic: string;
  mediaResults: MediaItem[];
  mediaSource: string;
  mediaLoading: boolean;
  draftSaved: boolean;
  onRegenerate: () => void;
  onFindMedia: () => void;
  onMediaSourceChange: (s: string) => void;
  onSaveDraft: () => void;
  onReScore: () => void;
}) {
  return (
    <div className="glass-card space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Uretilen Icerik</h4>
        <button
          onClick={() => navigator.clipboard.writeText(content)}
          className="text-xs text-[var(--accent-blue)] hover:underline"
        >
          Kopyala
        </button>
      </div>

      <div className="bg-[var(--bg-primary)] rounded-lg p-5 text-sm whitespace-pre-line leading-relaxed max-h-[600px] overflow-y-auto">
        {content}
      </div>

      <ScoreBar score={score} />

      {/* Tools: Media */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select
            value={mediaSource}
            onChange={(e) => onMediaSourceChange(e.target.value)}
            className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="x">X</option>
            <option value="web">Web</option>
            <option value="both">Her ikisi</option>
          </select>
          <button
            onClick={onFindMedia}
            disabled={mediaLoading}
            className="btn-secondary text-xs"
          >
            {mediaLoading ? "Araniyor..." : "Gorsel/Video Bul"}
          </button>
        </div>
        <button onClick={onReScore} className="btn-secondary text-xs">
          Yeniden Puanla
        </button>
      </div>

      {/* Media results */}
      {mediaResults.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--accent-cyan)]">
            Bulunan Medya ({mediaResults.length})
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {mediaResults.map((m, i) => (
              <a
                key={i}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-[var(--bg-primary)] rounded-lg p-2 hover:ring-1 ring-[var(--accent-blue)] transition-all"
              >
                {m.preview ? (
                  <img src={m.preview} alt="" className="w-full h-20 object-cover rounded" />
                ) : (
                  <div className="w-full h-20 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                    {m.type === "video" ? "Video" : "Gorsel"}
                  </div>
                )}
                <div className="text-[10px] text-[var(--text-secondary)] mt-1 truncate">
                  {m.source}{m.author ? ` @${m.author}` : ""}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* X'te Ac link */}
      {content.length <= 280 && (
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(content)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm inline-block"
        >
          X&apos;te Ac
        </a>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button onClick={onRegenerate} className="btn-secondary text-sm">
          Yeniden Uret
        </button>
        <button onClick={onSaveDraft} className="btn-secondary text-sm">
          {draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}
        </button>
      </div>
    </div>
  );
}
