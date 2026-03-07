"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  generateTweet,
  generateQuoteTweet,
  generateReply,
  extractTweet,
  researchTopic,
  researchTopicStream,
  publishTweet,
  addDraft,
  scoreTweet,
  findMedia,
  factCheck,
  getStyles,
  getProviders,
} from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */

interface ScoreResult {
  score: number;
  length: number;
  has_hook: boolean;
  has_cta: boolean;
}

interface MediaItem {
  url: string;
  thumbnail_url?: string;
  source: string;
  media_type?: string;
  title?: string;
  source_url?: string;
  author?: string;
  // legacy aliases
  type?: string;
  preview?: string;
}

interface FactClaim {
  claim: string;
  verified: boolean;
  source?: string;
  detail?: string;
}

interface StyleOption {
  id: string;
  name: string;
  desc: string;
}

interface ProviderOption {
  id: string;
  name: string;
  available: boolean;
}

interface FormatOption {
  id: string;
  name: string;
  desc: string;
}

/* ── Score Bar ─────────────────────────────────────────── */

function ScoreBar({ score }: { score: ScoreResult | null }) {
  if (!score) return null;
  const pct = score.score;
  const color =
    pct >= 80
      ? "var(--accent-green)"
      : pct >= 60
        ? "var(--accent-yellow)"
        : "var(--accent-red)";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">
          Kalite: {pct}/100 | {score.length} kar
          {score.has_hook ? " | Hook" : ""}
          {score.has_cta ? " | CTA" : ""}
        </span>
      </div>
      <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────── */

export default function YazPage() {
  return (
    <Suspense
      fallback={
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      }
    >
      <YazContent />
    </Suspense>
  );
}

function YazContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "tweet" | "quote" | "reply"
  >("tweet");

  /* ── Shared State ───────────────── */
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => {
        setStyles(r.styles);
        setFormats(r.formats);
      })
      .catch(() => {});
    getProviders()
      .then((r: { providers: ProviderOption[] }) => setProviders(r.providers))
      .catch(() => {});
  }, []);

  // Pre-fill from search params (from Tara page)
  useEffect(() => {
    const topicParam = searchParams.get("topic");
    const quoteUrl = searchParams.get("quote_url");
    if (quoteUrl) {
      setActiveTab("quote");
    }
    if (topicParam) {
      // will be picked up by TabTweetYaz via shared state
    }
  }, [searchParams]);

  const tabs = [
    { id: "tweet" as const, label: "Tweet Yaz" },
    { id: "quote" as const, label: "Arastirmali Quote Tweet" },
    { id: "reply" as const, label: "Hizli Reply" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Tweet Yazici</h2>

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

      {activeTab === "tweet" && (
        <TabTweetYaz
          styles={styles}
          formats={formats}
          providers={providers}
          initialTopic={searchParams.get("topic") || ""}
        />
      )}
      {activeTab === "quote" && (
        <TabQuoteTweet
          styles={styles}
          formats={formats}
          providers={providers}
          initialUrl={searchParams.get("quote_url") || ""}
        />
      )}
      {activeTab === "reply" && <TabQuickReply styles={styles} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 1: TWEET YAZ
   ══════════════════════════════════════════════════════════ */

function TabTweetYaz({
  styles,
  formats,
  providers,
  initialTopic,
}: {
  styles: StyleOption[];
  formats: FormatOption[];
  providers: ProviderOption[];
  initialTopic: string;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [style, setStyle] = useState("samimi");
  const [contentFormat, setContentFormat] = useState("");
  const [isThread, setIsThread] = useState(false);
  const [engine, setEngine] = useState("default");
  const [agentic, setAgentic] = useState(false);
  const [provider, setProvider] = useState("");

  const [researchContext, setResearchContext] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [threadParts, setThreadParts] = useState<string[]>([]);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);

  /* Media */
  const [mediaResults, setMediaResults] = useState<MediaItem[]>([]);
  const [mediaSource, setMediaSource] = useState("x");
  const [mediaLoading, setMediaLoading] = useState(false);

  /* Fact check */
  const [factResult, setFactResult] = useState<{
    verified: boolean;
    claims: FactClaim[];
    context: string;
  } | null>(null);
  const [factLoading, setFactLoading] = useState(false);

  const [researchSources, setResearchSources] = useState<{ title: string; url?: string; body?: string }[]>([]);

  const handleResearch = async () => {
    if (!topic.trim()) return;
    setResearching(true);
    setError(null);
    setProgressMessages([]);
    setResearchSources([]);
    try {
      const result = await researchTopicStream(
        { topic, engine, agentic },
        (msg) => setProgressMessages((prev) => [...prev, msg]),
      );
      const parts = [result.summary];
      if (result.key_points?.length) {
        parts.push("\n\nTemel Bulgular:\n" + result.key_points.map((p: string) => `• ${p}`).join("\n"));
      }
      setResearchContext(parts.join(""));
      setResearchSources(result.sources || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arastirma hatasi");
    } finally {
      setResearching(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setFactResult(null);
    setMediaResults([]);
    try {
      const result = (await generateTweet({
        topic,
        style,
        length: contentFormat || undefined,
        thread: isThread,
        research_context: researchContext,
        content_format: contentFormat || undefined,
        provider: provider || undefined,
      })) as {
        text: string;
        thread_parts: string[];
        score: ScoreResult | null;
      };
      setGeneratedText(result.text);
      setThreadParts(result.thread_parts || []);
      setScoreResult(result.score || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uretim hatasi");
    } finally {
      setLoading(false);
    }
  };

  const handleFindMedia = async () => {
    setMediaLoading(true);
    try {
      const res = (await findMedia(topic, mediaSource)) as {
        media: MediaItem[];
      };
      setMediaResults(res.media || []);
    } catch {
      /* ignore */
    } finally {
      setMediaLoading(false);
    }
  };

  const handleFactCheck = async () => {
    if (!generatedText) return;
    setFactLoading(true);
    try {
      const res = (await factCheck(generatedText, topic)) as {
        verified: boolean;
        claims: FactClaim[];
        context: string;
      };
      setFactResult(res);
    } catch {
      /* ignore */
    } finally {
      setFactLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!generatedText) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const result = (await publishTweet({
        text: generatedText,
        thread_parts: threadParts.length > 0 ? threadParts : undefined,
      })) as { success: boolean; url: string; error: string };
      if (result.success) {
        setPublishResult(result.url);
      } else {
        setError(result.error || "Paylasim hatasi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paylasim hatasi");
    } finally {
      setPublishing(false);
    }
  };

  const handleReScore = async () => {
    if (!generatedText) return;
    try {
      const s = (await scoreTweet(generatedText)) as ScoreResult;
      setScoreResult(s);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-5">
      {/* Topic & options */}
      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Konu / AI Gelismesi
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Tweet yazmak istediginiz konuyu yazin..."
            rows={3}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm resize-none focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          {/* Style */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Yazim Tarzi
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              {styles.length > 0
                ? styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                : ["Samimi", "Profesyonel", "Analitik", "Esprili"].map(
                    (s) => (
                      <option key={s.toLowerCase()} value={s.toLowerCase()}>
                        {s}
                      </option>
                    )
                  )}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Format
            </label>
            <select
              value={contentFormat}
              onChange={(e) => setContentFormat(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Otomatik</option>
              {formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} - {f.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Engine */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Arama Motoru
            </label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="default">DuckDuckGo</option>
              <option value="grok">Grok (xAI)</option>
            </select>
          </div>

          {/* AI Provider */}
          {providers.length > 0 && (
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">
                AI Model
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Otomatik</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Thread toggle */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isThread}
                onChange={(e) => setIsThread(e.target.checked)}
                className="rounded"
              />
              Thread
            </label>
          </div>

          {/* Agentic toggle */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
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

        <div className="flex gap-3">
          <button
            onClick={handleResearch}
            disabled={researching || !topic.trim()}
            className="btn-secondary text-sm"
          >
            {researching ? "Arastiriliyor..." : "Once Arastir"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="btn-primary"
          >
            {loading ? "Uretiliyor..." : "Tweet Uret"}
          </button>
        </div>
      </div>

      {/* Live progress for Tweet Yaz research */}
      {researching && progressMessages.length > 0 && (
        <div className="glass-card border-[var(--accent-cyan)]/30">
          <h4 className="text-sm font-semibold text-[var(--accent-cyan)] mb-2">
            Arastirma Asamalari
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {progressMessages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs flex items-start gap-2 ${
                  i === progressMessages.length - 1
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] opacity-60"
                }`}
              >
                {i === progressMessages.length - 1 ? (
                  <span className="inline-block w-2 h-2 mt-1 rounded-full bg-[var(--accent-cyan)] animate-pulse flex-shrink-0" />
                ) : (
                  <span className="inline-block w-2 h-2 mt-1 rounded-full bg-[var(--text-secondary)]/30 flex-shrink-0" />
                )}
                <span>{msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research context */}
      {researchContext && (
        <div className="glass-card space-y-3">
          <h4 className="text-sm font-semibold text-[var(--accent-cyan)]">
            Arastirma Sonucu
          </h4>
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">
            {researchContext}
          </p>
          {researchSources.length > 0 && (
            <div className="border-t border-[var(--border)] pt-3">
              <h5 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                Kaynaklar ({researchSources.length})
              </h5>
              <div className="space-y-2">
                {researchSources.map((src, i) => (
                  <div key={i} className="bg-[var(--bg-primary)] rounded-lg p-2.5 text-xs">
                    <div className="font-medium text-[var(--text-primary)]">{src.title}</div>
                    {src.url && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent-blue)] hover:underline break-all"
                      >
                        {src.url}
                      </a>
                    )}
                    {src.body && (
                      <p className="text-[var(--text-secondary)] mt-1">{src.body}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Generated tweet */}
      {generatedText && (
        <div className="glass-card space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Uretilen Tweet</h4>
            <button
              onClick={() => navigator.clipboard.writeText(generatedText)}
              className="text-xs text-[var(--accent-blue)] hover:underline"
            >
              Kopyala
            </button>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm whitespace-pre-line">
            {generatedText}
          </div>

          {/* Score bar */}
          <ScoreBar score={scoreResult} />

          {/* Thread parts */}
          {threadParts.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Thread Parcalari</h4>
              {threadParts.map((part, i) => (
                <div
                  key={i}
                  className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm"
                >
                  <span className="text-[var(--accent-blue)] font-bold mr-2">
                    {i + 1}/{threadParts.length}
                  </span>
                  <span className="whitespace-pre-line">{part}</span>
                </div>
              ))}
            </div>
          )}

          {publishResult && (
            <div className="bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded-lg p-3">
              <span className="text-sm text-[var(--accent-green)]">
                Paylasildi!{" "}
                <a
                  href={publishResult}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Goruntule
                </a>
              </span>
            </div>
          )}

          {/* Tools: Media + Fact check */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <select
                value={mediaSource}
                onChange={(e) => setMediaSource(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="x">X</option>
                <option value="web">Web</option>
                <option value="both">Her ikisi</option>
              </select>
              <button
                onClick={handleFindMedia}
                disabled={mediaLoading}
                className="btn-secondary text-xs"
              >
                {mediaLoading ? "Araniyor..." : "Gorsel/Video Bul"}
              </button>
            </div>
            <button
              onClick={handleFactCheck}
              disabled={factLoading}
              className="btn-secondary text-xs"
            >
              {factLoading ? "Dogrulaniyor..." : "Fact Check"}
            </button>
            <button onClick={handleReScore} className="btn-secondary text-xs">
              Yeniden Puanla
            </button>
          </div>

          {/* Media results */}
          {mediaResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[var(--accent-cyan)]">
                Bulunan Medya ({mediaResults.length}) — tiklayinca yeni sekmede acilir
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mediaResults.map((m, i) => {
                  const thumb = m.thumbnail_url || m.preview || m.url;
                  const isVideo = (m.media_type || m.type) === "video";
                  return (
                    <a
                      key={i}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-[var(--bg-primary)] rounded-lg p-2 hover:ring-2 ring-[var(--accent-blue)] transition-all"
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={m.title || ""}
                          className="w-full h-32 object-cover rounded"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded">
                          {isVideo ? "Video" : "Gorsel"}
                        </div>
                      )}
                      <div className="text-[10px] text-[var(--text-secondary)] mt-1 truncate">
                        {isVideo && "[Video] "}{m.title || m.source || ""}
                        {m.author ? ` @${m.author}` : ""}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fact check results */}
          {factResult && (
            <div className="space-y-2">
              <h4
                className={`text-sm font-semibold ${factResult.verified ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}
              >
                {factResult.verified
                  ? "Dogrulandi"
                  : "Dogrulanamayan iddialar var"}
              </h4>
              {factResult.claims.length > 0 ? (
                <div className="space-y-1">
                  {factResult.claims.map((c, i) => (
                    <div
                      key={i}
                      className={`text-xs p-2 rounded ${c.verified ? "bg-[var(--accent-green)]/10" : "bg-[var(--accent-red)]/10"}`}
                    >
                      <span className="font-medium">
                        {c.verified ? "+" : "-"} {c.claim}
                      </span>
                      {c.detail && (
                        <p className="text-[var(--text-secondary)] mt-0.5">
                          {c.detail}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  {factResult.context}
                </p>
              )}
            </div>
          )}

          {/* Regenerate with different style */}
          <div className="border-t border-[var(--border)] pt-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">
                  Yazim Tarzi
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  {styles.length > 0
                    ? styles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))
                    : ["Samimi", "Profesyonel", "Analitik"].map((s) => (
                        <option key={s.toLowerCase()} value={s.toLowerCase()}>
                          {s}
                        </option>
                      ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">
                  Format
                </label>
                <select
                  value={contentFormat}
                  onChange={(e) => setContentFormat(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">Otomatik</option>
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="btn-secondary text-sm"
              >
                {loading ? "Uretiliyor..." : "Yeniden Uret"}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setDraftSaved(false);
                  await addDraft({ text: generatedText, topic, style });
                  setDraftSaved(true);
                  setTimeout(() => setDraftSaved(false), 3000);
                }}
                className="btn-secondary text-sm"
              >
                {draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="btn-primary text-sm"
              >
                {publishing ? "Paylasiliyor..." : "X'e Paylas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 2: ARASTIRMALI QUOTE TWEET
   ══════════════════════════════════════════════════════════ */

function TabQuoteTweet({
  styles,
  formats,
  providers,
  initialUrl,
}: {
  styles: StyleOption[];
  formats: FormatOption[];
  providers: ProviderOption[];
  initialUrl: string;
}) {
  const [quoteUrl, setQuoteUrl] = useState(initialUrl);
  const [style, setStyle] = useState("quote_tweet");
  const [contentFormat, setContentFormat] = useState("spark");
  const [engine, setEngine] = useState("default");
  const [agentic, setAgentic] = useState(false);
  const [deepVerify, setDeepVerify] = useState(false);
  const [provider, setProvider] = useState("");

  /* Research sources */
  const [srcX, setSrcX] = useState(true);
  const [srcWeb, setSrcWeb] = useState(true);
  const [srcReddit, setSrcReddit] = useState(false);
  const [srcNews, setSrcNews] = useState(true);

  /* Original tweet info */
  const [tweetId, setTweetId] = useState("");
  const [originalTweet, setOriginalTweet] = useState<{
    text: string;
    author: string;
    author_name: string;
    like_count: number;
    retweet_count: number;
    reply_count: number;
  } | null>(null);
  const [extracting, setExtracting] = useState(false);

  const [researchResult, setResearchResult] = useState<{
    summary: string;
    key_points: string[];
    sources: { title: string; body?: string }[];
  } | null>(null);
  const [generatedText, setGeneratedText] = useState("");
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);

  const [researching, setResearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);

  /* Fact check */
  const [factResult, setFactResult] = useState<{
    verified: boolean;
    claims: FactClaim[];
    context: string;
  } | null>(null);
  const [factLoading, setFactLoading] = useState(false);

  /* Media */
  const [mediaResults, setMediaResults] = useState<MediaItem[]>([]);
  const [mediaSource, setMediaSource] = useState("x");
  const [mediaLoading, setMediaLoading] = useState(false);

  /* Extract tweet when URL changes (debounced) */
  useEffect(() => {
    const url = quoteUrl.trim();
    if (!url || (!url.includes("twitter.com/") && !url.includes("x.com/"))) {
      setOriginalTweet(null);
      setTweetId("");
      return;
    }
    const timer = setTimeout(async () => {
      setExtracting(true);
      try {
        const res = await extractTweet(url) as {
          success: boolean;
          tweet_id?: string;
          text?: string;
          author?: string;
          author_name?: string;
          like_count?: number;
          retweet_count?: number;
          reply_count?: number;
          error?: string;
        };
        if (res.success && res.tweet_id) {
          setTweetId(res.tweet_id);
          if (res.text) {
            setOriginalTweet({
              text: res.text,
              author: res.author || "",
              author_name: res.author_name || "",
              like_count: res.like_count || 0,
              retweet_count: res.retweet_count || 0,
              reply_count: res.reply_count || 0,
            });
          } else {
            setOriginalTweet(null);
          }
        } else {
          setTweetId("");
          setOriginalTweet(null);
          if (res.error) setError(res.error);
        }
      } catch {
        setTweetId("");
        setOriginalTweet(null);
      } finally {
        setExtracting(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [quoteUrl]);

  const handleResearch = async () => {
    if (!quoteUrl.trim()) return;
    setResearching(true);
    setError(null);
    setGeneratedText("");
    setFactResult(null);
    setScoreResult(null);
    setProgressMessages([]);

    try {
      const researchTopic = originalTweet?.text || quoteUrl;
      // Build research_sources from checkboxes
      const sources: string[] = [];
      if (srcX) sources.push("x");
      if (srcWeb) sources.push("web");
      if (srcReddit) sources.push("reddit");
      if (srcNews) sources.push("news");
      // If nothing selected, default to all
      const researchSources = sources.length > 0 ? sources : undefined;

      const research = await researchTopicStream(
        {
          topic: researchTopic,
          engine,
          agentic,
          research_sources: researchSources,
          tweet_id: tweetId || undefined,
          tweet_author: originalTweet?.author || undefined,
        },
        (msg) => setProgressMessages((prev) => [...prev, msg]),
      );
      setResearchResult(research);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arastirma hatasi");
    } finally {
      setResearching(false);
    }
  };

  const handleGenerate = async () => {
    if (!researchResult) return;
    setGenerating(true);
    setError(null);

    try {
      const researchSummary = `${researchResult.summary}\n\nKey Points:\n${researchResult.key_points.join("\n")}`;
      const tweetText = originalTweet?.text || quoteUrl;
      const tweetAuthor = originalTweet?.author || "";

      const result = (await generateQuoteTweet({
        original_tweet: tweetText,
        original_author: tweetAuthor,
        style,
        research_summary: researchSummary,
        length_preference: contentFormat,
        deep_verify: deepVerify,
      })) as { text: string; score: ScoreResult | null };
      setGeneratedText(result.text);
      setScoreResult(result.score || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tweet uretim hatasi");
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenInX = () => {
    if (!generatedText) return;
    let intentUrl: string;
    if (tweetId) {
      // Quote tweet — attach original tweet
      const quoteUrlForX = `https://x.com/i/status/${tweetId}`;
      const cleanText = generatedText.replace(new RegExp(`status/${tweetId}\\S*`, "g"), "").trim();
      intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(cleanText)}&attachment_url=${encodeURIComponent(quoteUrlForX)}`;
    } else {
      // Normal tweet
      intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(generatedText)}`;
    }
    window.open(intentUrl, "_blank");
  };

  const handleFindMedia = async () => {
    setMediaLoading(true);
    try {
      const searchTopic = originalTweet?.text || quoteUrl;
      const res = (await findMedia(searchTopic, mediaSource)) as {
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
          Tweet URL girin &rarr; Tweet cekilir &rarr; Arastir &rarr; Sonuclari incele &rarr; Tarz sec &rarr; Tweet uret &rarr; Paylas
        </p>
      </div>

      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Tweet URL
          </label>
          <input
            type="text"
            value={quoteUrl}
            onChange={(e) => setQuoteUrl(e.target.value)}
            placeholder="https://x.com/kullanici/status/123456789..."
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
          {extracting && (
            <p className="text-xs text-[var(--text-secondary)] mt-1">Tweet bilgileri aliniyor...</p>
          )}
        </div>

        {/* Original tweet card */}
        {originalTweet && originalTweet.text && (
          <div className="bg-[var(--bg-primary)] rounded-lg p-4 border-l-4 border-[var(--accent-blue)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold">{originalTweet.author_name || originalTweet.author}</span>
              {originalTweet.author && (
                <span className="text-xs text-[var(--text-secondary)]">@{originalTweet.author}</span>
              )}
            </div>
            <p className="text-sm whitespace-pre-line mb-2">{originalTweet.text}</p>
            <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
              <span>Like {originalTweet.like_count}</span>
              <span>RT {originalTweet.retweet_count}</span>
              <span>Reply {originalTweet.reply_count}</span>
            </div>
          </div>
        )}

        {/* No bearer token — manual input */}
        {tweetId && !originalTweet?.text && !extracting && (
          <div className="bg-[var(--bg-primary)] rounded-lg p-3">
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              Tweet ID: {tweetId} (Tweet icerigi cekilemedi — Bearer token gerekli)
            </p>
            <textarea
              placeholder="Orijinal tweet metnini buraya yapistirabilirsiniz (opsiyonel)..."
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs resize-none"
              onChange={(e) => {
                if (e.target.value.trim()) {
                  setOriginalTweet({
                    text: e.target.value.trim(),
                    author: "",
                    author_name: "",
                    like_count: 0,
                    retweet_count: 0,
                    reply_count: 0,
                  });
                }
              }}
            />
          </div>
        )}

        {/* Step 1: Research settings + button */}
        <div className="bg-[var(--bg-primary)] rounded-lg p-3 space-y-3">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            Adim 1: Arastirma
          </p>

          {/* Sources */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={srcX} onChange={(e) => setSrcX(e.target.checked)} className="rounded" />
              X
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={srcWeb} onChange={(e) => setSrcWeb(e.target.checked)} className="rounded" />
              Web
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={srcReddit} onChange={(e) => setSrcReddit(e.target.checked)} className="rounded" />
              Reddit
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={srcNews} onChange={(e) => setSrcNews(e.target.checked)} className="rounded" />
              Haber
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            {/* Engine */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Motor</label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="default">DuckDuckGo</option>
                <option value="grok">Grok</option>
              </select>
            </div>

            <div className="flex items-end gap-4">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={agentic} onChange={(e) => setAgentic(e.target.checked)} className="rounded" />
                Agentic
              </label>
            </div>
          </div>

          <button
            onClick={handleResearch}
            disabled={researching || !quoteUrl.trim()}
            className="btn-primary w-full"
          >
            {researching ? "Arastiriliyor..." : "Arastir"}
          </button>
        </div>
      </div>

      {/* Live progress messages */}
      {researching && progressMessages.length > 0 && (
        <div className="glass-card border-[var(--accent-purple)]/30">
          <h4 className="text-sm font-semibold text-[var(--accent-purple)] mb-2">
            Arastirma Asamalari
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {progressMessages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs flex items-start gap-2 ${
                  i === progressMessages.length - 1
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] opacity-60"
                }`}
              >
                {i === progressMessages.length - 1 ? (
                  <span className="inline-block w-2 h-2 mt-1 rounded-full bg-[var(--accent-purple)] animate-pulse flex-shrink-0" />
                ) : (
                  <span className="inline-block w-2 h-2 mt-1 rounded-full bg-[var(--text-secondary)]/30 flex-shrink-0" />
                )}
                <span>{msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Research results */}
      {researchResult && (
        <div className="glass-card">
          <h4 className="text-sm font-semibold text-[var(--accent-purple)] mb-2">
            Arastirma Sonuclari
          </h4>
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line mb-2">
            {researchResult.summary}
          </p>
          {researchResult.key_points.length > 0 && (
            <ul className="text-xs text-[var(--text-secondary)] space-y-1">
              {researchResult.key_points.map((kp, i) => (
                <li key={i}>- {kp}</li>
              ))}
            </ul>
          )}
          {researchResult.sources.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Kaynaklar ({researchResult.sources.length})
              </p>
              {researchResult.sources.slice(0, 5).map((s, i) => (
                <p key={i} className="text-xs text-[var(--text-secondary)]">- {s.title}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Style/Format selection + Generate button (shown after research) */}
      {researchResult && (
        <div className="glass-card space-y-4">
          <p className="text-xs font-medium text-[var(--accent-blue)]">
            {generatedText ? "Farkli tarz ile yeniden uret" : "Adim 2: Tarz ve Format Sec, Tweet Uret"}
          </p>

          <div className="flex flex-wrap gap-4">
            {/* Style */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Tarz</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Format */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Format</label>
              <select
                value={contentFormat}
                onChange={(e) => setContentFormat(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
              >
                {formats.length > 0 ? formats.filter(f => f.id !== "thread").map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                )) : (
                  <>
                    <option value="micro">Micro (0-140)</option>
                    <option value="punch">Punch (140-280)</option>
                    <option value="spark">Spark (400-600)</option>
                    <option value="storm">Storm (700-1000)</option>
                    <option value="thunder">Thunder (1200-1500)</option>
                  </>
                )}
              </select>
            </div>

            {/* AI Provider */}
            {providers.length > 0 && (
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">AI Model</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">Otomatik</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-end">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={deepVerify} onChange={(e) => setDeepVerify(e.target.checked)} className="rounded" />
                Dogrulama
              </label>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary w-full"
          >
            {generating ? "Tweet yaziliyor..." : generatedText ? "Yeniden Uret" : "Quote Tweet Uret"}
          </button>
        </div>
      )}

      {/* Generated quote tweet */}
      {generatedText && (
        <div className="glass-card space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Quote Tweet</h4>
            <button
              onClick={() => navigator.clipboard.writeText(generatedText)}
              className="text-xs text-[var(--accent-blue)] hover:underline"
            >
              Kopyala
            </button>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm whitespace-pre-line">
            {generatedText}
          </div>

          <ScoreBar score={scoreResult} />

          {/* Fact check results */}
          {factResult && (
            <div className="space-y-2">
              <h4
                className={`text-sm font-semibold ${factResult.verified ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}
              >
                {factResult.verified ? "Iddialar dogrulandi" : "Dogrulanamayan iddialar var"}
              </h4>
              {factResult.claims.map((c, i) => (
                <div
                  key={i}
                  className={`text-xs p-2 rounded ${c.verified ? "bg-[var(--accent-green)]/10" : "bg-[var(--accent-red)]/10"}`}
                >
                  <span className="font-medium">{c.verified ? "+" : "-"} {c.claim}</span>
                  {c.detail && <p className="text-[var(--text-secondary)] mt-0.5">{c.detail}</p>}
                </div>
              ))}
            </div>
          )}
          {factLoading && (
            <p className="text-xs text-[var(--text-secondary)]">Dogrulama yapiliyor...</p>
          )}

          {/* Media finder */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mediaSource}
              onChange={(e) => setMediaSource(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="x">X</option>
              <option value="web">Web</option>
              <option value="both">Her ikisi</option>
            </select>
            <button
              onClick={handleFindMedia}
              disabled={mediaLoading}
              className="btn-secondary text-xs"
            >
              {mediaLoading ? "Araniyor..." : "Gorsel/Video Bul"}
            </button>
          </div>

          {/* Media results */}
          {mediaResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[var(--accent-cyan)]">
                Bulunan Medya ({mediaResults.length}) — tiklayinca yeni sekmede acilir
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mediaResults.map((m, i) => {
                  const thumb = m.thumbnail_url || m.preview || m.url;
                  const isVideo = (m.media_type || m.type) === "video";
                  return (
                    <a
                      key={i}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-[var(--bg-primary)] rounded-lg p-2 hover:ring-2 ring-[var(--accent-blue)] transition-all"
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={m.title || ""}
                          className="w-full h-32 object-cover rounded"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded">
                          {isVideo ? "Video" : "Gorsel"}
                        </div>
                      )}
                      <div className="text-[10px] text-[var(--text-secondary)] mt-1 truncate">
                        {isVideo && "[Video] "}{m.title || m.source || ""}
                        {m.author ? ` @${m.author}` : ""}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={handleOpenInX} className="btn-primary text-sm">
              X&apos;te Paylas
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(generatedText)}
              className="btn-secondary text-sm"
            >
              Kopyala
            </button>
            <button
              onClick={async () => {
                setDraftSaved(false);
                await addDraft({ text: generatedText, topic: quoteUrl, style });
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 3000);
              }}
              className="btn-secondary text-sm"
            >
              {draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 3: HIZLI REPLY
   ══════════════════════════════════════════════════════════ */

function TabQuickReply({ styles }: { styles: StyleOption[] }) {
  const [timeHours, setTimeHours] = useState(12);
  const [maxPerAccount, setMaxPerAccount] = useState(5);
  const [minEngagement, setMinEngagement] = useState(50);

  const [scanResults, setScanResults] = useState<
    {
      id: string;
      text: string;
      author: string;
      author_name: string;
      likes: number;
      retweets: number;
      replies: number;
      engagement: number;
      url: string;
    }[]
  >([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Selected tweet for reply */
  const [selectedTweet, setSelectedTweet] = useState<(typeof scanResults)[0] | null>(null);
  const [replyExtra, setReplyExtra] = useState("");
  const [generatedReply, setGeneratedReply] = useState("");
  const [replyStyle, setReplyStyle] = useState("samimi");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setScanResults([]);
    try {
      // Use scanner API to find recent tweets from monitored accounts
      const { scanTopics } = await import("@/lib/api");
      const result = (await scanTopics({
        time_range: `${timeHours}h`,
        max_results: maxPerAccount * 10,
        min_likes: minEngagement > 0 ? minEngagement : undefined,
      })) as {
        topics: {
          id?: string;
          text: string;
          author_username?: string;
          author_name?: string;
          like_count?: number;
          retweet_count?: number;
          reply_count?: number;
          engagement_score?: number;
          url?: string;
        }[];
      };

      const mapped = (result.topics || []).map((t) => ({
        id: t.id || "",
        text: t.text || "",
        author: t.author_username || "",
        author_name: t.author_name || "",
        likes: t.like_count || 0,
        retweets: t.retweet_count || 0,
        replies: t.reply_count || 0,
        engagement: t.engagement_score || 0,
        url: t.url || "",
      }));

      setScanResults(mapped);
      if (mapped.length === 0) {
        setError(
          `Son ${timeHours} saatte tweet bulunamadi. Zaman araligini artirmayi deneyin.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tarama hatasi");
    } finally {
      setScanning(false);
    }
  };

  const handleGenerateReply = async () => {
    if (!selectedTweet) return;
    setGenerating(true);
    try {
      const result = (await generateReply({
        original_tweet: selectedTweet.text,
        original_author: selectedTweet.author,
        style: replyStyle,
        additional_context: replyExtra || "",
      })) as { text: string };
      setGeneratedReply(result.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply uretim hatasi");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublishReply = async () => {
    if (!generatedReply || !selectedTweet) return;
    setPublishing(true);
    try {
      const result = (await publishTweet({
        text: generatedReply,
        reply_to_id: selectedTweet.id,
      })) as {
        success: boolean;
        url: string;
        error: string;
      };
      if (result.success) {
        setPublishResult(result.url);
      } else {
        setError(result.error || "Gonderim hatasi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gonderim hatasi");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-green)]">
        <p className="text-sm text-[var(--text-secondary)]">
          AI hesaplarini tara &rarr; En iyi tweetleri bul &rarr; AI ile reply
          yaz &rarr; Direkt gonder
        </p>
      </div>

      {/* Scan settings */}
      <div className="glass-card space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Zaman Araligi
            </label>
            <select
              value={timeHours}
              onChange={(e) => setTimeHours(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={6}>Son 6 saat</option>
              <option value={12}>Son 12 saat</option>
              <option value={24}>Son 24 saat</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Hesap Basi Max
            </label>
            <select
              value={maxPerAccount}
              onChange={(e) => setMaxPerAccount(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={3}>3 tweet</option>
              <option value={5}>5 tweet</option>
              <option value={10}>10 tweet</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Min. Engagement
            </label>
            <select
              value={minEngagement}
              onChange={(e) => setMinEngagement(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={0}>Filtre yok</option>
              <option value={50}>50+</option>
              <option value={100}>100+</option>
              <option value={500}>500+</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn-primary w-full"
        >
          {scanning ? "Taraniyor..." : "X'te Tara"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Scan results */}
      {scanResults.length > 0 && (
        <div className="glass-card space-y-3">
          <h4 className="text-sm font-semibold text-[var(--accent-green)]">
            {scanResults.length} tweet bulundu
          </h4>

          {scanResults.slice(0, 30).map((tw, i) => (
            <div
              key={i}
              className="bg-[var(--bg-primary)] rounded-lg p-3 border-l-3 border-[var(--accent-green)]"
            >
              <div className="flex justify-between items-start mb-1">
                <div>
                  <span className="text-sm font-medium text-[var(--accent-green)]">
                    @{tw.author}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] ml-2">
                    {tw.author_name}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {tw.likes} likes | {tw.retweets} RT | {tw.replies} replies
                </span>
              </div>
              <p className="text-sm text-[var(--text-primary)] mb-2">
                {tw.text.length > 400
                  ? tw.text.slice(0, 400) + "..."
                  : tw.text}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedTweet(tw);
                    setGeneratedReply("");
                    setPublishResult(null);
                  }}
                  className="btn-secondary text-xs"
                >
                  Reply Yaz
                </button>
                {tw.url && (
                  <a
                    href={tw.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-xs"
                  >
                    X&apos;te Ac
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected tweet: generate reply */}
      {selectedTweet && (
        <div className="glass-card space-y-4">
          <div className="bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30 rounded-lg p-3">
            <p className="text-xs font-medium text-[var(--accent-purple)] mb-1">
              Reply yazilacak tweet - @{selectedTweet.author}
            </p>
            <p className="text-sm">{selectedTweet.text}</p>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">
                Reply Tarzi
              </label>
              <select
                value={replyStyle}
                onChange={(e) => setReplyStyle(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-[var(--text-secondary)] block mb-1">
                Ek Talimat (opsiyonel)
              </label>
              <input
                type="text"
                value={replyExtra}
                onChange={(e) => setReplyExtra(e.target.value)}
                placeholder="Ornek: espirili yaz, karsi gorus belirt..."
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:border-[var(--accent-blue)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleGenerateReply}
              disabled={generating}
              className="btn-primary text-sm"
            >
              {generating ? "Uretiliyor..." : "Reply Uret"}
            </button>
            <button
              onClick={() => {
                setSelectedTweet(null);
                setGeneratedReply("");
              }}
              className="btn-secondary text-sm"
            >
              Secimi Kaldir
            </button>
          </div>

          {/* Generated reply */}
          {generatedReply && (
            <div className="space-y-3">
              <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm whitespace-pre-line">
                {generatedReply}
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {generatedReply.length} karakter
              </p>

              {publishResult && (
                <div className="bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded-lg p-3">
                  <span className="text-sm text-[var(--accent-green)]">
                    Gonderildi!{" "}
                    <a
                      href={publishResult}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Goruntule
                    </a>
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handlePublishReply}
                  disabled={publishing}
                  className="btn-primary text-sm"
                >
                  {publishing ? "Gonderiliyor..." : "Reply Gonder"}
                </button>
                <button
                  onClick={handleGenerateReply}
                  className="btn-secondary text-sm"
                >
                  Yeniden Uret
                </button>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(generatedReply)
                  }
                  className="btn-secondary text-sm"
                >
                  Kopyala
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!scanResults.length && !scanning && !selectedTweet && (
        <div className="glass-card text-center py-8">
          <p className="text-sm text-[var(--text-secondary)]">
            Yukaridaki &quot;X&apos;te Tara&quot; butonuna basarak AI
            hesaplarinin son tweetlerini tarayin.
          </p>
        </div>
      )}
    </div>
  );
}
