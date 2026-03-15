"use client";

import { useState } from "react";
import {
  discoverContentTopics,
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
  DiscoveredTopic,
  ScoreResult,
  MediaItem,
  ContentDisplay,
} from "./shared";

/* ══════════════════════════════════════════════════════════
   TAB 1: KONU KESFET
   ══════════════════════════════════════════════════════════ */

export default function TabDiscover({
  contentStyles,
  formats,
  providers,
}: {
  contentStyles: ContentStyle[];
  formats: FormatOption[];
  providers: ProviderOption[];
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
  const [genProvider, setGenProvider] = useState("");

  /* Generated content */
  const [generatedContent, setGeneratedContent] = useState("");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [researchProgress, setResearchProgress] = useState<string[]>([]);
  const [researchMediaUrls, setResearchMediaUrls] = useState<string[]>([]);

  /* Media */
  const [mediaResults, setMediaResults] = useState<MediaItem[]>([]);
  const [mediaSource, setMediaSource] = useState("x");
  const [mediaLoading, setMediaLoading] = useState(false);

  /* Infographic */
  const [infographicImage, setInfographicImage] = useState<string | null>(null);
  const [infographicFormat, setInfographicFormat] = useState("png");
  const [infographicLoading, setInfographicLoading] = useState(false);
  const [infographicError, setInfographicError] = useState<string | null>(null);

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
      // Step 1: Research (streaming for progress feedback)
      let researchContext = "";
      setResearchProgress([]);
      try {
        const researchSources = researchMode === "x_only" ? ["x"] : researchMode === "web_only" ? ["web", "news"] : ["x", "web", "news"];
        const research = await researchTopicStream(
          { topic: topic.title, engine: genEngine, research_sources: researchSources },
          (msg) => setResearchProgress((prev) => [...prev, msg])
        );
        researchContext = `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}`;
        if (research.media_urls?.length) {
          setResearchMediaUrls(research.media_urls);
          setMediaResults(research.media_urls.map((url: string) => ({ url, source: "research", type: "image" })));
        }
      } catch {
        // Research optional, continue
      }

      // Step 2: Generate
      const result = (await generateLongContent({
        topic: topic.title,
        style: genStyle,
        research_context: researchContext,
        content_format: genFormat,
        provider: genProvider || undefined,
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

  const handleGenerateInfographic = async () => {
    if (selectedIdx === null) return;
    setInfographicLoading(true);
    setInfographicError(null);
    setInfographicImage(null);
    try {
      const res = await generateInfographic({
        topic: topics[selectedIdx].title,
        research_summary: generatedContent,
        key_points: [topics[selectedIdx].description, topics[selectedIdx].angle].filter(Boolean),
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
              <option value="claude_code">Claude Code (Max)</option>
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
                  <option value="claude_code">Claude Code (Max)</option>
                </select>
              </div>
              {providers.length > 0 && (
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">AI Model</label>
                  <select
                    value={genProvider}
                    onChange={(e) => setGenProvider(e.target.value)}
                    className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="">Otomatik</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
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

          {/* Research progress messages */}
          {generating && researchProgress.length > 0 && (
            <div className="mt-3 p-3 bg-[var(--bg-secondary)] rounded-lg max-h-32 overflow-y-auto">
              {researchProgress.map((msg, i) => (
                <p key={i} className="text-xs text-[var(--text-secondary)]">{msg}</p>
              ))}
            </div>
          )}
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
