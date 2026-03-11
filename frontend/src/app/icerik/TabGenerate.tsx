"use client";

import { useState } from "react";
import {
  researchTopicStream,
  generateLongContent,
  scoreTweet,
  findMedia,
  generateInfographic,
  addDraft,
} from "@/lib/api";
import {
  ContentStyle,
  FormatOption,
  ProviderOption,
  ScoreResult,
  MediaItem,
  ContentDisplay,
} from "./shared";

/* ══════════════════════════════════════════════════════════
   TAB 2: ICERIK URET
   ══════════════════════════════════════════════════════════ */

export default function TabGenerate({
  contentStyles,
  formats,
  providers,
}: {
  contentStyles: ContentStyle[];
  formats: FormatOption[];
  providers: ProviderOption[];
}) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("deneyim");
  const [contentFormat, setContentFormat] = useState("storm");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [doResearch, setDoResearch] = useState(true);
  const [researchMode, setResearchMode] = useState("x_and_web");
  const [engine, setEngine] = useState("default");
  const [provider, setProvider] = useState("");

  const [generatedContent, setGeneratedContent] = useState("");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [researchData, setResearchData] = useState("");
  const [researchProgress, setResearchProgress] = useState<string[]>([]);
  const [researchMediaUrls, setResearchMediaUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  /* Media */
  const [mediaResults, setMediaResults] = useState<MediaItem[]>([]);
  const [mediaSource, setMediaSource] = useState("x");
  const [mediaLoading, setMediaLoading] = useState(false);

  /* Infographic */
  const [infographicImage, setInfographicImage] = useState<string | null>(null);
  const [infographicFormat, setInfographicFormat] = useState("png");
  const [infographicLoading, setInfographicLoading] = useState(false);
  const [infographicError, setInfographicError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setGeneratedContent("");
    setScoreResult(null);
    setMediaResults([]);
    setResearchData("");

    try {
      // Step 1: Research if requested (streaming for progress feedback)
      let researchContext = "";
      setResearchProgress([]);
      if (doResearch) {
        try {
          const researchSources = researchMode === "x_only" ? ["x"] : researchMode === "web_only" ? ["web", "news"] : ["x", "web", "news"];
          const research = await researchTopicStream(
            { topic, engine, research_sources: researchSources },
            (msg) => setResearchProgress((prev) => [...prev, msg])
          );
          researchContext = `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}`;
          setResearchData(researchContext);
          if (research.media_urls?.length) {
            setResearchMediaUrls(research.media_urls);
            setMediaResults(research.media_urls.map((url: string) => ({ url, source: "research", type: "image" })));
          }
        } catch {
          // Research optional
        }
      }

      // Step 2: Generate
      const result = (await generateLongContent({
        topic,
        style,
        research_context: researchContext,
        content_format: contentFormat,
        additional_instructions: extraInstructions || undefined,
        provider: provider || undefined,
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

  const handleGenerateInfographic = async () => {
    setInfographicLoading(true);
    setInfographicError(null);
    setInfographicImage(null);
    try {
      const res = await generateInfographic({
        topic,
        research_summary: researchData || generatedContent,
        key_points: [],
      });
      if (res.success) {
        setInfographicImage(res.image_base64);
        setInfographicFormat(res.image_format || "png");
      } else {
        setInfographicError(res.error || "Gorsel uretilemedi");
      }
    } catch (e) {
      setInfographicError(e instanceof Error ? e.message : "Infografik hatasi");
    } finally {
      setInfographicLoading(false);
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
          {providers.length > 0 && (
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">AI Model</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Otomatik</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
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
                  <option value="claude_code">Claude Code (Max)</option>
                </select>
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

        {/* Research progress messages */}
        {loading && researchProgress.length > 0 && (
          <div className="mt-3 p-3 bg-[var(--bg-secondary)] rounded-lg max-h-32 overflow-y-auto">
            {researchProgress.map((msg, i) => (
              <p key={i} className="text-xs text-[var(--text-secondary)]">{msg}</p>
            ))}
          </div>
        )}
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
          infographicImage={infographicImage}
          infographicFormat={infographicFormat}
          infographicLoading={infographicLoading}
          infographicError={infographicError}
          onGenerateInfographic={handleGenerateInfographic}
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
