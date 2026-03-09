"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  generateQuoteTweet,
  generateReply,
  generateSelfReply,
  extractTweet,
  researchTopicStream,
  addDraft,
  scoreTweet,
  findMedia,
  getMediaDownloadUrl,
  generateInfographic,
  factCheck,
  getStyles,
  getProviders,
  publishTweet,
  schedulePost,
  getTodaySchedule,
  logPost,
  getPromptTemplates,
  addPromptTemplate,
  deletePromptTemplate,
  scheduleSelfReplyChain,
} from "@/lib/api";
import type { PublishResult } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */

interface ScoreResult {
  score: number;
  length: number;
  has_hook: boolean;
  has_cta: boolean;
  // detailed scores (0-20 each)
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

/* ── "Paylaştım" Butonu — takvime kayıt ─────────────────── */

interface SlotOption {
  time: string;
  label: string;
}

function LogToCalendar({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open && slots.length === 0) {
      getTodaySchedule().then((data: { slots?: { time: string; label: string; posted: boolean }[] }) => {
        const available = (data.slots || []).filter((s: { posted: boolean }) => !s.posted);
        setSlots(available.map((s: { time: string; label: string }) => ({ time: s.time, label: s.label })));
        if (available.length > 0) setSelectedSlot(available[0].time);
      }).catch(() => {});
    }
  }, [open, slots.length]);

  const handleSave = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    try {
      await logPost({
        slot_time: selectedSlot,
        post_type: "Tweet",
        content: content.slice(0, 280),
      });
      setSaved(true);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--accent-green)]">
        Takvime kaydedildi ({selectedSlot})
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-secondary text-sm"
        >
          Paylastim
        </button>
      ) : (
        <>
          <select
            className="p-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value)}
          >
            {slots.length === 0 ? (
              <option value="">Slot yok</option>
            ) : (
              slots.map((s) => (
                <option key={s.time} value={s.time}>
                  {s.time} — {s.label}
                </option>
              ))
            )}
          </select>
          <button
            onClick={handleSave}
            disabled={saving || !selectedSlot}
            className="btn-primary text-sm"
          >
            {saving ? "..." : "Kaydet"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Iptal
          </button>
        </>
      )}
    </div>
  );
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

/* ── Helpers ───────────────────────────────────────────── */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
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
    "quote" | "reply" | "linkreply" | "selfreply"
  >("quote");

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

  // Pre-fill from search params
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const quoteUrl = searchParams.get("quote_url");
    if (tabParam === "reply") {
      setActiveTab("reply");
    } else if (tabParam === "linkreply") {
      setActiveTab("linkreply");
    } else if (tabParam === "selfreply") {
      setActiveTab("selfreply");
    } else if (quoteUrl) {
      setActiveTab("quote");
    }
  }, [searchParams]);

  const tabs = [
    { id: "quote" as const, label: "Arastirmali Quote" },
    { id: "reply" as const, label: "Hizli Reply" },
    { id: "linkreply" as const, label: "Linkle Reply" },
    { id: "selfreply" as const, label: "Self-Reply" },
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

      {activeTab === "quote" && (
        <TabQuoteTweet
          styles={styles}
          formats={formats}
          providers={providers}
          initialUrl={searchParams.get("quote_url") || ""}
        />
      )}
      {activeTab === "reply" && <TabQuickReply styles={styles} />}
      {activeTab === "linkreply" && <TabLinkReply styles={styles} />}
      {activeTab === "selfreply" && <TabSelfReply styles={styles} />}
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
  const [style, setStyle] = useState("tolga_news");
  const [contentFormat, setContentFormat] = useState("spark");
  const [engine, setEngine] = useState("default");
  const [deepVerify, setDeepVerify] = useState(false);
  const [provider, setProvider] = useState("");

  /* Original tweet info */
  const [tweetId, setTweetId] = useState("");
  const [originalTweet, setOriginalTweet] = useState<{
    text: string;
    author: string;
    author_name: string;
    like_count: number;
    retweet_count: number;
    reply_count: number;
    is_thread?: boolean;
    thread_tweets?: string[];
    thread_count?: number;
    full_thread_text?: string;
    media_items?: { url: string; thumbnail: string; type: string }[];
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

  /* Infographic */
  const [infographicImage, setInfographicImage] = useState<string | null>(null);
  const [infographicFormat, setInfographicFormat] = useState("png");
  const [infographicLoading, setInfographicLoading] = useState(false);
  const [infographicError, setInfographicError] = useState<string | null>(null);

  /* Publish */
  const [publishingQt, setPublishingQt] = useState(false);
  const [publishResultQt, setPublishResultQt] = useState<PublishResult | null>(null);

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
          is_thread?: boolean;
          thread_tweets?: string[];
          thread_count?: number;
          full_thread_text?: string;
          media_items?: { url: string; thumbnail: string; type: string }[];
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
              is_thread: res.is_thread || false,
              thread_tweets: res.thread_tweets || [],
              thread_count: res.thread_count || 1,
              full_thread_text: res.full_thread_text || "",
              media_items: res.media_items || [],
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

  // Tweet text must be available (either extracted or manually entered)
  const hasTweetContent = !!(originalTweet?.text);

  const handleResearch = async () => {
    if (!quoteUrl.trim() || !hasTweetContent) return;
    setResearching(true);
    setError(null);
    setGeneratedText("");
    setFactResult(null);
    setScoreResult(null);
    setProgressMessages([]);

    try {
      // Use full thread text if available, otherwise single tweet text
      const researchTopic = originalTweet?.full_thread_text || originalTweet?.text || "";

      const research = await researchTopicStream(
        {
          topic: researchTopic,
          engine,
          research_sources: ["web", "news"],
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
      // Pass full thread text so the AI has complete context
      const tweetText = originalTweet?.full_thread_text || originalTweet?.text || quoteUrl;
      const tweetAuthor = originalTweet?.author || "";

      const result = (await generateQuoteTweet({
        original_tweet: tweetText,
        original_author: tweetAuthor,
        style,
        research_summary: researchSummary,
        length_preference: contentFormat,
        deep_verify: deepVerify,
        provider: provider || undefined,
      })) as { text: string; score: ScoreResult | null };
      if (!result.text || result.text.trim() === "") {
        setError("Tweet uretilemedi — AI bos yanit dondu. Farkli bir stil veya AI model deneyin.");
      } else {
        setGeneratedText(result.text);
        setScoreResult(result.score || null);
      }
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

  const handleGenerateInfographic = async () => {
    if (!researchResult) return;
    setInfographicLoading(true);
    setInfographicError(null);
    setInfographicImage(null);
    try {
      const res = await generateInfographic({
        topic: originalTweet?.text || quoteUrl,
        research_summary: researchResult.summary,
        key_points: researchResult.key_points,
        provider,
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
              {originalTweet.is_thread && (
                <span className="text-xs bg-[var(--accent-blue)] text-white px-2 py-0.5 rounded-full">
                  Thread ({originalTweet.thread_count} tweet)
                </span>
              )}
            </div>
            <p className="text-sm whitespace-pre-line mb-2">{originalTweet.text}</p>
            {/* Show thread tweets if available */}
            {originalTweet.is_thread && originalTweet.thread_tweets && originalTweet.thread_tweets.length > 1 && (
              <details className="mt-2 mb-2">
                <summary className="text-xs text-[var(--accent-blue)] cursor-pointer hover:underline">
                  Tum thread&apos;i gor ({originalTweet.thread_count} tweet)
                </summary>
                <div className="mt-2 space-y-2 pl-3 border-l-2 border-[var(--border)]">
                  {originalTweet.thread_tweets.map((tweet, i) => (
                    <p key={i} className="text-xs text-[var(--text-secondary)] whitespace-pre-line">
                      <span className="font-medium text-[var(--text-primary)]">{i + 1}/</span> {tweet}
                    </p>
                  ))}
                </div>
              </details>
            )}
            <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
              <span>Like {originalTweet.like_count}</span>
              <span>RT {originalTweet.retweet_count}</span>
              <span>Reply {originalTweet.reply_count}</span>
            </div>

            {/* Media items from original tweet — video download */}
            {originalTweet.media_items && originalTweet.media_items.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <p className="text-xs font-medium text-[var(--accent-cyan)] mb-2">
                  Tweet Medyasi ({originalTweet.media_items.length})
                </p>
                <div className="flex flex-wrap gap-3">
                  {originalTweet.media_items.map((mi, idx) => (
                    <div key={idx} className="relative group">
                      {mi.thumbnail ? (
                        <img
                          src={mi.thumbnail}
                          alt={`Media ${idx + 1}`}
                          className="w-40 h-24 object-cover rounded-lg border border-[var(--border)]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-40 h-24 flex items-center justify-center bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
                          <span className="text-xs text-[var(--text-secondary)]">
                            {mi.type === "video" ? "Video" : "Gorsel"}
                          </span>
                        </div>
                      )}
                      {mi.type === "video" && (
                        <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                          Video
                        </div>
                      )}
                      <a
                        href={getMediaDownloadUrl(mi.url)}
                        download
                        className="mt-1.5 flex items-center justify-center gap-1 w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/80 text-white text-xs py-1.5 rounded-lg transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Indir
                      </a>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1.5">
                  Indirilen dosya rastgele isimle kaydedilir (duplicate detection onlemi)
                </p>
              </div>
            )}
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
                <option value="claude_code">Claude Code (Max)</option>
              </select>
            </div>

          </div>

          <button
            onClick={handleResearch}
            disabled={researching || !quoteUrl.trim() || (!hasTweetContent && !extracting)}
            className="btn-primary w-full"
          >
            {researching ? "Arastiriliyor..." : extracting ? "Tweet cekiliyor..." : !hasTweetContent && quoteUrl.trim() ? "Tweet icerigi gerekli (asagiya yapistiriniz)" : "Arastir"}
          </button>
          {!hasTweetContent && tweetId && !extracting && (
            <p className="text-xs text-yellow-400 mt-1">
              Tweet icerigi cekilemedi. Asagidaki alana tweet metnini yapistiriniz.
            </p>
          )}
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
            {researchResult.summary.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}
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
              onClick={() => copyText(generatedText)}
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

          {/* Infographic Generation */}
          {researchResult && (
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateInfographic}
                  disabled={infographicLoading}
                  className="btn-secondary text-xs"
                >
                  {infographicLoading ? "Infografik Uretiliyor..." : "Gemini ile Infografik Uret"}
                </button>
                <span className="text-[10px] text-[var(--text-secondary)]">16:9 landscape</span>
              </div>
              {infographicError && (
                <p className="text-xs text-[var(--accent-red)]">{infographicError}</p>
              )}
              {infographicImage && (
                <div className="space-y-2">
                  <img
                    src={`data:image/${infographicFormat};base64,${infographicImage}`}
                    alt="Infografik"
                    className="w-full rounded-lg border border-[var(--border)]"
                  />
                  <a
                    href={`data:image/${infographicFormat};base64,${infographicImage}`}
                    download={`infographic_${Date.now()}.${infographicFormat}`}
                    className="btn-primary text-xs inline-block"
                  >
                    Gorseli Indir
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                setPublishingQt(true);
                setPublishResultQt(null);
                try {
                  const result = await publishTweet({
                    text: generatedText,
                    quote_tweet_id: tweetId || undefined,
                  });
                  setPublishResultQt(result);
                } catch (e) {
                  setPublishResultQt({
                    success: false,
                    tweet_id: "",
                    url: "",
                    error: e instanceof Error ? e.message : "Paylasim hatasi",
                    thread_results: [],
                  });
                } finally {
                  setPublishingQt(false);
                }
              }}
              disabled={publishingQt}
              className="btn-primary text-sm"
            >
              {publishingQt ? "Paylasiliyor..." : "API ile Paylas"}
            </button>
            <button onClick={handleOpenInX} className="btn-secondary text-sm">
              X&apos;te Ac
            </button>
            <button
              onClick={() => copyText(generatedText)}
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

          {/* Publish result */}
          {publishResultQt && (
            <div className={`rounded-lg p-3 text-sm ${publishResultQt.success ? "bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30" : "bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30"}`}>
              {publishResultQt.success ? (
                <div>
                  <p className="font-semibold text-[var(--accent-green)] text-xs">Basariyla paylasild!</p>
                  {publishResultQt.url && (
                    <a href={publishResultQt.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline text-xs">
                      Tweet&apos;i gor
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-[var(--accent-red)] text-xs">{publishResultQt.error || "Paylasim basarisiz"}</p>
              )}
            </div>
          )}

          {/* Paylaştım — takvime kayıt (her zaman görünür) */}
          <div className="pt-3 border-t border-[var(--border)]">
            <LogToCalendar content={generatedText} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 2: HIZLI REPLY (Tara → Sec → Reply uret)
   ══════════════════════════════════════════════════════════ */

function TabQuickReply({ styles }: { styles: StyleOption[] }) {
  const [timeHours, setTimeHours] = useState(24);
  const [maxPerAccount, setMaxPerAccount] = useState(5);
  const [minEngagement, setMinEngagement] = useState(0);
  const [engine, setEngine] = useState("default");
  const [maxResults, setMaxResults] = useState(30);

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
      created_at: string;
    }[]
  >([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replyRef = useRef<HTMLDivElement>(null);

  /* Selected tweet for reply */
  const [selectedTweet, setSelectedTweet] = useState<(typeof scanResults)[0] | null>(null);
  const [replyExtra, setReplyExtra] = useState("");
  const [generatedReply, setGeneratedReply] = useState("");
  const [replyStyle, setReplyStyle] = useState("reply");
  const [generating, setGenerating] = useState(false);
  const [publishingReply, setPublishingReply] = useState(false);
  const [publishReplyResult, setPublishReplyResult] = useState<PublishResult | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setScanResults([]);
    try {
      const { scanTopics } = await import("@/lib/api");
      const result = (await scanTopics({
        time_range: `${timeHours}h`,
        max_results: maxResults,
        min_likes: minEngagement > 0 ? minEngagement : undefined,
        engine,
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
          created_at?: string;
        }[];
        errors?: string[];
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
        created_at: t.created_at || "",
      }));

      setScanResults(mapped);
      if (mapped.length === 0) {
        const errs = result.errors || [];
        const has403 = errs.some((e: string) => e.includes("403") || e.includes("reddedildi"));
        if (has403) {
          setError(
            "Twikit 403 hatasi — cookie suresi dolmus olabilir. Ayarlar sayfasindan cookie'yi yenileyin veya Grok motorunu secin."
          );
        } else {
          const errMsgs = errs.length ? `\n${errs.join(", ")}` : "";
          setError(
            `Son ${timeHours} saatte tweet bulunamadi. Zaman araligini artirin veya farkli motor deneyin.${errMsgs}`
          );
        }
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
    setError(null);
    try {
      const result = (await generateReply({
        original_tweet: selectedTweet.text,
        original_author: selectedTweet.author,
        style: replyStyle,
        additional_context: replyExtra || "",
      })) as { text: string };
      if (!result.text || result.text.trim() === "") {
        setError("Reply uretilemedi — AI bos yanit dondu. Tekrar deneyin.");
      } else {
        setGeneratedReply(result.text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply uretim hatasi");
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenReplyInX = async () => {
    if (!generatedReply || !selectedTweet) return;
    const tweetUrl = selectedTweet.url || `https://x.com/i/status/${selectedTweet.id}`;
    await copyText(generatedReply);
    const w = window.open(tweetUrl, "_blank");
    if (!w) {
      window.location.href = tweetUrl;
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-green)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Motor sec &rarr; Tara &rarr; Tweet sec &rarr; Reply uret &rarr; X&apos;te ac ve yapistr
        </p>
      </div>

      {/* Scan settings */}
      <div className="glass-card space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Arama Motoru
            </label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="default">DuckDuckGo (Twikit - Ucretsiz)</option>
              <option value="grok">Grok (xAI - Ucretli)</option>
              <option value="claude_code">Claude Code (Max - Ucretsiz)</option>
            </select>
          </div>

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
              <option value={48}>Son 48 saat</option>
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

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Gosterilecek Adet
            </label>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={10}>10 tweet</option>
              <option value={20}>20 tweet</option>
              <option value={30}>30 tweet</option>
              <option value={50}>50 tweet</option>
              <option value={100}>100 tweet</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn-primary w-full"
        >
          {scanning ? "Taraniyor..." : "Tweetleri Tara"}
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
            {scanResults.length > maxResults
              ? `${maxResults} / ${scanResults.length} tweet gosteriliyor`
              : `${scanResults.length} tweet bulundu`}
          </h4>

          {scanResults.slice(0, maxResults).map((tw, i) => (
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
                <div className="text-right">
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {tw.likes} likes | {tw.retweets} RT | {tw.replies} replies
                  </span>
                  {tw.created_at && (
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      {new Date(tw.created_at).toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
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
                    setTimeout(() => {
                      replyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 100);
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
        <div ref={replyRef} className="glass-card space-y-4">
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

              <div className="bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 rounded-lg p-3">
                <p className="text-xs text-[var(--accent-blue)]">
                  &quot;X&apos;te Ac&quot; butonuna basinca reply kopyalanir ve tweet acilir. X&apos;te reply kutusuna yapistiriniz.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={async () => {
                    if (!selectedTweet || !generatedReply) return;
                    setPublishingReply(true);
                    setPublishReplyResult(null);
                    try {
                      const result = await publishTweet({
                        text: generatedReply,
                        reply_to_id: selectedTweet.id || undefined,
                      });
                      setPublishReplyResult(result);
                    } catch (e) {
                      setPublishReplyResult({
                        success: false,
                        tweet_id: "",
                        url: "",
                        error: e instanceof Error ? e.message : "Reply paylasim hatasi",
                        thread_results: [],
                      });
                    } finally {
                      setPublishingReply(false);
                    }
                  }}
                  disabled={publishingReply}
                  className="btn-primary text-sm"
                >
                  {publishingReply ? "Gonderiliyor..." : "API ile Reply Gonder"}
                </button>
                <button
                  onClick={handleOpenReplyInX}
                  className="btn-secondary text-sm"
                >
                  X&apos;te Ac (Kopyala + Ac)
                </button>
                <button
                  onClick={handleGenerateReply}
                  className="btn-secondary text-sm"
                >
                  Yeniden Uret
                </button>
                <button
                  onClick={() => copyText(generatedReply)}
                  className="btn-secondary text-sm"
                >
                  Kopyala
                </button>
              </div>

              {/* Reply publish result */}
              {publishReplyResult && (
                <div className={`rounded-lg p-3 text-sm ${publishReplyResult.success ? "bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30" : "bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30"}`}>
                  {publishReplyResult.success ? (
                    <div>
                      <p className="font-semibold text-[var(--accent-green)] text-xs">Reply basariyla gonderildi!</p>
                      {publishReplyResult.url && (
                        <a href={publishReplyResult.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline text-xs">
                          Reply&apos;i gor
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-[var(--accent-red)] text-xs">{publishReplyResult.error || "Reply gonderilemedi"}</p>
                  )}
                </div>
              )}

              {/* Paylaştım — takvime kayıt */}
              <div className="pt-3 border-t border-[var(--border)]">
                <LogToCalendar content={generatedReply} />
              </div>
            </div>
          )}
        </div>
      )}

      {!scanResults.length && !scanning && !selectedTweet && (
        <div className="glass-card text-center py-8">
          <p className="text-sm text-[var(--text-secondary)]">
            Yukaridaki &quot;Tweetleri Tara&quot; butonuna basarak AI
            hesaplarinin son tweetlerini tarayin.
          </p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 3: LINKLE REPLY (URL yapistir → reply uret)
   ══════════════════════════════════════════════════════════ */

function TabLinkReply({ styles }: { styles: StyleOption[] }) {
  /* Tweet URL input */
  const [replyUrl, setReplyUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Extracted tweet info */
  const [originalTweet, setOriginalTweet] = useState<{
    tweet_id: string;
    text: string;
    author: string;
    author_name: string;
    like_count: number;
    retweet_count: number;
    reply_count: number;
    is_thread?: boolean;
    thread_tweets?: string[];
    thread_count?: number;
    full_thread_text?: string;
  } | null>(null);
  const [showFullThread, setShowFullThread] = useState(false);

  /* Reply generation */
  const [replyExtra, setReplyExtra] = useState("");
  const [replyStyle, setReplyStyle] = useState("reply");
  const [generatedReply, setGeneratedReply] = useState("");
  const [generating, setGenerating] = useState(false);
  const [publishingReply, setPublishingReply] = useState(false);
  const [publishReplyResult, setPublishReplyResult] = useState<PublishResult | null>(null);

  const replyRef = useRef<HTMLDivElement>(null);

  /* Auto-extract when URL is pasted */
  const extractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const url = replyUrl.trim();
    const isTwitterUrl = /https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(url);
    if (!isTwitterUrl) return;

    if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
    extractTimerRef.current = setTimeout(() => {
      handleExtract(url);
    }, 500);

    return () => {
      if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyUrl]);

  const handleExtract = async (url: string) => {
    setExtracting(true);
    setError(null);
    setOriginalTweet(null);
    setGeneratedReply("");
    setPublishReplyResult(null);
    try {
      const res = (await extractTweet(url)) as {
        success: boolean;
        tweet_id?: string;
        text?: string;
        author?: string;
        author_name?: string;
        like_count?: number;
        retweet_count?: number;
        reply_count?: number;
        is_thread?: boolean;
        thread_tweets?: string[];
        thread_count?: number;
        full_thread_text?: string;
        error?: string;
      };
      if (res.success && res.text) {
        setOriginalTweet({
          tweet_id: res.tweet_id || "",
          text: res.text,
          author: res.author || "",
          author_name: res.author_name || "",
          like_count: res.like_count || 0,
          retweet_count: res.retweet_count || 0,
          reply_count: res.reply_count || 0,
          is_thread: res.is_thread || false,
          thread_tweets: res.thread_tweets || [],
          thread_count: res.thread_count || 1,
          full_thread_text: res.full_thread_text || "",
        });
      } else {
        setError(res.error || "Tweet bilgisi alinamadi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tweet bilgisi alinamadi");
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateReply = async () => {
    if (!originalTweet) return;
    setGenerating(true);
    setError(null);
    try {
      const tweetText = originalTweet.full_thread_text || originalTweet.text;
      const isThread = originalTweet.is_thread && (originalTweet.thread_count || 1) > 1;
      const result = (await generateReply({
        original_tweet: tweetText,
        original_author: originalTweet.author,
        style: replyStyle,
        additional_context: replyExtra || "",
        is_thread: isThread,
        thread_count: originalTweet.thread_count || 1,
      })) as { text: string };
      if (!result.text || result.text.trim() === "") {
        setError("Reply uretilemedi — AI bos yanit dondu. Tekrar deneyin.");
      } else {
        setGeneratedReply(result.text);
        setTimeout(() => {
          replyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply uretim hatasi");
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenReplyInX = async () => {
    if (!generatedReply || !originalTweet) return;
    const tweetUrl = replyUrl.trim() || `https://x.com/i/status/${originalTweet.tweet_id}`;
    await copyText(generatedReply);
    const w = window.open(tweetUrl, "_blank");
    if (!w) {
      window.location.href = tweetUrl;
    }
  };

  const handleReset = () => {
    setReplyUrl("");
    setOriginalTweet(null);
    setGeneratedReply("");
    setError(null);
    setPublishReplyResult(null);
    setShowFullThread(false);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-green)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Tweet linkini yapistir &rarr; Tweet bilgileri gelir &rarr; Reply uret &rarr; Paylas veya X&apos;te ac
        </p>
      </div>

      {/* URL Input */}
      <div className="glass-card space-y-3">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          Tweet URL
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={replyUrl}
            onChange={(e) => setReplyUrl(e.target.value)}
            placeholder="https://x.com/kullanici/status/123456..."
            className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
          {originalTweet && (
            <button onClick={handleReset} className="btn-secondary text-sm">
              Temizle
            </button>
          )}
        </div>
        {extracting && (
          <p className="text-xs text-[var(--accent-blue)]">Tweet bilgileri aliniyor...</p>
        )}
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Extracted tweet display */}
      {originalTweet && (
        <div className="glass-card space-y-4">
          <div className="bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30 rounded-lg p-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-sm font-medium text-[var(--accent-purple)]">
                  @{originalTweet.author}
                </span>
                {originalTweet.author_name && (
                  <span className="text-xs text-[var(--text-secondary)] ml-2">
                    {originalTweet.author_name}
                  </span>
                )}
                {originalTweet.is_thread && (
                  <span className="ml-2 text-[10px] bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] px-1.5 py-0.5 rounded">
                    Thread ({originalTweet.thread_count} tweet)
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                {originalTweet.like_count} likes | {originalTweet.retweet_count} RT | {originalTweet.reply_count} replies
              </div>
            </div>
            <p className="text-sm whitespace-pre-line">{originalTweet.text}</p>
          </div>

          {/* Thread display */}
          {originalTweet.is_thread && originalTweet.thread_tweets && originalTweet.thread_tweets.length > 1 && (
            <div>
              <button
                onClick={() => setShowFullThread(!showFullThread)}
                className="text-xs text-[var(--accent-blue)] hover:underline mb-2"
              >
                {showFullThread
                  ? "Thread&apos;i gizle"
                  : `Tum thread'i gor (${originalTweet.thread_count} tweet)`}
              </button>
              {showFullThread && (
                <div className="space-y-2 border-l-2 border-[var(--accent-blue)]/30 pl-3">
                  {originalTweet.thread_tweets.map((tweet, i) => (
                    <div key={i} className="bg-[var(--bg-primary)] rounded p-2 text-xs whitespace-pre-line">
                      <span className="text-[var(--accent-blue)] font-medium">{i + 1}/{originalTweet.thread_count}</span>{" "}
                      {tweet}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reply settings */}
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

          <button
            onClick={handleGenerateReply}
            disabled={generating}
            className="btn-primary w-full"
          >
            {generating ? "Reply Uretiliyor..." : "Reply Uret"}
          </button>
        </div>
      )}

      {/* Generated reply */}
      {generatedReply && originalTweet && (
        <div ref={replyRef} className="glass-card space-y-3">
          <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm whitespace-pre-line">
            {generatedReply}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {generatedReply.length} karakter
          </p>

          <div className="bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 rounded-lg p-3">
            <p className="text-xs text-[var(--accent-blue)]">
              &quot;X&apos;te Ac&quot; butonuna basinca reply kopyalanir ve tweet acilir. X&apos;te reply kutusuna yapistiriniz.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                if (!originalTweet || !generatedReply) return;
                setPublishingReply(true);
                setPublishReplyResult(null);
                try {
                  const result = await publishTweet({
                    text: generatedReply,
                    reply_to_id: originalTweet.tweet_id || undefined,
                  });
                  setPublishReplyResult(result);
                } catch (e) {
                  setPublishReplyResult({
                    success: false,
                    tweet_id: "",
                    url: "",
                    error: e instanceof Error ? e.message : "Reply paylasim hatasi",
                    thread_results: [],
                  });
                } finally {
                  setPublishingReply(false);
                }
              }}
              disabled={publishingReply}
              className="btn-primary text-sm"
            >
              {publishingReply ? "Gonderiliyor..." : "API ile Reply Gonder"}
            </button>
            <button
              onClick={handleOpenReplyInX}
              className="btn-secondary text-sm"
            >
              X&apos;te Ac (Kopyala + Ac)
            </button>
            <button
              onClick={handleGenerateReply}
              className="btn-secondary text-sm"
            >
              Yeniden Uret
            </button>
            <button
              onClick={() => copyText(generatedReply)}
              className="btn-secondary text-sm"
            >
              Kopyala
            </button>
          </div>

          {/* Reply publish result */}
          {publishReplyResult && (
            <div className={`rounded-lg p-3 text-sm ${publishReplyResult.success ? "bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30" : "bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30"}`}>
              {publishReplyResult.success ? (
                <div>
                  <p className="font-semibold text-[var(--accent-green)] text-xs">Reply basariyla gonderildi!</p>
                  {publishReplyResult.url && (
                    <a href={publishReplyResult.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline text-xs">
                      Reply&apos;i gor
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-[var(--accent-red)] text-xs">{publishReplyResult.error || "Reply gonderilemedi"}</p>
              )}
            </div>
          )}

          {/* Paylaştım — takvime kayıt */}
          <div className="pt-3 border-t border-[var(--border)]">
            <LogToCalendar content={generatedReply} />
          </div>
        </div>
      )}

      {!originalTweet && !extracting && (
        <div className="glass-card text-center py-8">
          <p className="text-sm text-[var(--text-secondary)]">
            Yukariya bir tweet linki yapistirin — tweet bilgileri otomatik gelecek ve reply uretebileceksiniz.
          </p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 5: SELF-REPLY — Kendi tweet'ine devam niteliğinde yanıt
   ══════════════════════════════════════════════════════════ */

function TabSelfReply({ styles }: { styles: StyleOption[] }) {
  // Input: tweet text or URL
  const [myTweetText, setMyTweetText] = useState("");
  const [myTweetUrl, setMyTweetUrl] = useState("");
  const [myTweetId, setMyTweetId] = useState("");
  const [extracting, setExtracting] = useState(false);

  // Generation
  const [replyCount, setReplyCount] = useState(3);
  const [generatedReplies, setGeneratedReplies] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [currentReplyIdx, setCurrentReplyIdx] = useState(0);

  // Publishing
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<
    { index: number; success: boolean; url: string; error: string }[]
  >([]);

  // Scheduling
  const [scheduling, setScheduling] = useState(false);
  const [intervalMin, setIntervalMin] = useState(15);
  const [scheduleResult, setScheduleResult] = useState<{
    success: boolean;
    chain_id?: string;
    total_replies?: number;
    posts?: { index: number; scheduled_time: string }[];
    error?: string;
  } | null>(null);

  // Prompt templates
  const [templates, setTemplates] = useState<
    { id: string; name: string; prompt: string; category: string }[]
  >([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplPrompt, setNewTplPrompt] = useState("");

  // Load templates
  useEffect(() => {
    getPromptTemplates()
      .then((r: { templates: typeof templates }) => setTemplates(r.templates || []))
      .catch(() => {});
  }, []);

  // Extract tweet from URL
  const handleExtract = async () => {
    if (!myTweetUrl.trim()) return;
    setExtracting(true);
    try {
      const r = await extractTweet(myTweetUrl.trim());
      if (r.success) {
        setMyTweetText(r.text || "");
        setMyTweetId(r.tweet_id || "");
      }
    } catch {}
    setExtracting(false);
  };

  // Auto-extract on URL paste
  useEffect(() => {
    if (myTweetUrl.includes("x.com/") || myTweetUrl.includes("twitter.com/")) {
      const t = setTimeout(handleExtract, 500);
      return () => clearTimeout(t);
    }
  }, [myTweetUrl]);

  // Generate self-replies
  const handleGenerate = async () => {
    if (!myTweetText.trim()) return;
    setGenerating(true);
    setGeneratedReplies([]);
    setPublishResults([]);
    setCurrentReplyIdx(0);

    const additional = selectedTemplate
      ? templates.find((t) => t.id === selectedTemplate)?.prompt || ""
      : "";

    const replies: string[] = [];
    for (let i = 1; i <= replyCount; i++) {
      setCurrentReplyIdx(i);
      try {
        const r = await generateSelfReply({
          my_tweet: myTweetText.trim(),
          reply_number: i,
          total_replies: replyCount,
          additional_context: additional,
          previous_replies: replies.filter((r) => r.trim()),
        });
        replies.push(r.text || "");
      } catch {
        replies.push("");
      }
    }
    setGeneratedReplies(replies);
    setGenerating(false);
    setCurrentReplyIdx(0);
  };

  // Publish self-replies sequentially
  const handlePublish = async () => {
    if (!myTweetId || generatedReplies.length === 0) return;
    setPublishing(true);
    setPublishResults([]);

    let replyToId = myTweetId;
    const results: typeof publishResults = [];

    for (let i = 0; i < generatedReplies.length; i++) {
      const text = generatedReplies[i];
      if (!text.trim()) {
        results.push({ index: i + 1, success: false, url: "", error: "Bos reply" });
        continue;
      }
      try {
        const r: PublishResult = await publishTweet({
          text,
          reply_to_id: replyToId,
        });
        results.push({
          index: i + 1,
          success: r.success,
          url: r.url || "",
          error: r.error || "",
        });
        if (r.success && r.tweet_id) {
          replyToId = r.tweet_id; // chain: each reply answers previous
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Hata";
        results.push({ index: i + 1, success: false, url: "", error: msg });
        break; // stop on error
      }
      // Wait 2-3 seconds between replies (natural timing)
      if (i < generatedReplies.length - 1) {
        await new Promise((res) => setTimeout(res, 2500));
      }
    }
    setPublishResults(results);
    setPublishing(false);
  };

  // Schedule self-reply chain with intervals
  const handleScheduleChain = async () => {
    if (!myTweetId || generatedReplies.length === 0) return;
    setScheduling(true);
    setScheduleResult(null);
    try {
      const r = await scheduleSelfReplyChain({
        original_tweet_id: myTweetId,
        replies: generatedReplies.filter((r) => r.trim()),
        interval_minutes: intervalMin,
      });
      setScheduleResult(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Zamanlama hatasi";
      setScheduleResult({ success: false, error: msg });
    }
    setScheduling(false);
  };

  // Add template
  const handleAddTemplate = async () => {
    if (!newTplName.trim() || !newTplPrompt.trim()) return;
    const r = await addPromptTemplate(newTplName.trim(), newTplPrompt.trim(), "self-reply");
    setTemplates(r.templates || []);
    setNewTplName("");
    setNewTplPrompt("");
    setShowAddTemplate(false);
  };

  // Delete template
  const handleDeleteTemplate = async (id: string) => {
    const r = await deletePromptTemplate(id);
    setTemplates(r.templates || []);
    if (selectedTemplate === id) setSelectedTemplate("");
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="glass-card border-[var(--accent-cyan)]/30 bg-gradient-to-r from-[var(--accent-cyan)]/5 to-transparent">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔄</span>
          <div>
            <p className="text-sm font-medium text-[var(--accent-cyan)]">
              Self-Reply = Phoenix Ranking Boost
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Kendi tweet&apos;ine 2-3dk sonra reply atarak engagement&apos;i 3x&apos;le. X algoritmasi bunu &quot;devam eden konusma&quot; olarak gorur.
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Input */}
      <div className="glass-card space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          1. Tweet&apos;ini Gir
        </h3>

        {/* URL input */}
        <div>
          <label className="text-xs text-[var(--text-secondary)]">
            Tweet URL&apos;si (varsa — otomatik cekilir)
          </label>
          <input
            className="w-full p-2 mt-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
            placeholder="https://x.com/... (opsiyonel)"
            value={myTweetUrl}
            onChange={(e) => setMyTweetUrl(e.target.value)}
          />
          {extracting && (
            <p className="text-xs text-[var(--accent-blue)] mt-1 animate-pulse">
              Tweet cekilyor...
            </p>
          )}
        </div>

        {/* Tweet text */}
        <div>
          <label className="text-xs text-[var(--text-secondary)]">
            Tweet Metni (URL yoksa buraya yapistir)
          </label>
          <textarea
            className="w-full p-2 mt-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm resize-none"
            rows={4}
            placeholder="Kendi tweet'inin metni..."
            value={myTweetText}
            onChange={(e) => setMyTweetText(e.target.value)}
          />
          <div className="text-right text-xs text-[var(--text-secondary)]">
            {myTweetText.length} karakter
          </div>
        </div>
      </div>

      {/* Step 2: Options */}
      <div className="glass-card space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          2. Ayarlar
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Reply count */}
          <div>
            <label className="text-xs text-[var(--text-secondary)]">
              Kac Self-Reply
            </label>
            <select
              className="w-full p-2 mt-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
              value={replyCount}
              onChange={(e) => setReplyCount(Number(e.target.value))}
            >
              <option value={1}>1 reply</option>
              <option value={2}>2 reply</option>
              <option value={3}>3 reply (onerilen)</option>
              <option value={4}>4 reply</option>
            </select>
          </div>

          {/* Prompt template selector */}
          <div>
            <label className="text-xs text-[var(--text-secondary)]">
              Prompt Sablonu
            </label>
            <select
              className="w-full p-2 mt-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">Sablonsuz (varsayilan)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Template management */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddTemplate(!showAddTemplate)}
            className="text-xs text-[var(--accent-blue)] hover:underline"
          >
            {showAddTemplate ? "Kapat" : "+ Yeni Sablon Ekle"}
          </button>
          {selectedTemplate && (
            <button
              onClick={() => handleDeleteTemplate(selectedTemplate)}
              className="text-xs text-[var(--accent-red)] hover:underline"
            >
              Sablonu Sil
            </button>
          )}
        </div>

        {showAddTemplate && (
          <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] space-y-2">
            <input
              className="w-full p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-sm"
              placeholder="Sablon adi (orn: CTA Kapanisi)"
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
            />
            <textarea
              className="w-full p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-sm resize-none"
              rows={3}
              placeholder="Prompt talimatı (orn: Son reply'da mutlaka bir soru sor ve takipçileri yoruma davet et)"
              value={newTplPrompt}
              onChange={(e) => setNewTplPrompt(e.target.value)}
            />
            <button onClick={handleAddTemplate} className="btn-primary text-sm py-2 px-4">
              Kaydet
            </button>
          </div>
        )}

        {/* Reply role preview */}
        <div className="space-y-1">
          <p className="text-xs text-[var(--text-secondary)] font-medium">Reply Rolleri:</p>
          {Array.from({ length: replyCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-5 h-5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] flex items-center justify-center text-[10px] font-bold">
                {i + 1}
              </span>
              <span className="text-[var(--text-secondary)]">
                {i === 0 && "Ek bilgi / baglamı genislet"}
                {i === 1 && "Kisisel deneyim / somut sonuc"}
                {i === 2 && "CTA / guclu kapanisi"}
                {i === 3 && "Bonus: soru veya tartisma baslat"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating || !myTweetText.trim()}
        className="btn-primary w-full"
      >
        {generating
          ? `Self-Reply Uretiliyor... (${currentReplyIdx}/${replyCount})`
          : `${replyCount} Self-Reply Uret`}
      </button>

      {/* Generated replies */}
      {generatedReplies.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Uretilen Self-Reply&apos;lar
          </h3>

          {/* Original tweet preview */}
          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
            <p className="text-xs text-[var(--text-secondary)] mb-1">Orijinal Tweet:</p>
            <p className="text-sm text-[var(--text-primary)]">
              {myTweetText.length > 200 ? myTweetText.slice(0, 200) + "..." : myTweetText}
            </p>
          </div>

          {/* Reply chain */}
          {generatedReplies.map((reply, idx) => (
            <div key={idx} className="glass-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {idx === 0 && "Ek Bilgi"}
                    {idx === 1 && "Deneyim / Sonuc"}
                    {idx === 2 && "CTA / Kapanisi"}
                    {idx === 3 && "Bonus"}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  {reply.length} kar
                </span>
              </div>

              {/* Editable textarea */}
              <textarea
                className="w-full p-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm resize-none"
                rows={3}
                value={reply}
                onChange={(e) => {
                  const updated = [...generatedReplies];
                  updated[idx] = e.target.value;
                  setGeneratedReplies(updated);
                }}
              />

              {/* Publish result for this reply */}
              {publishResults[idx] && (
                <div
                  className={`text-xs p-2 rounded ${
                    publishResults[idx].success
                      ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]"
                      : "bg-[var(--accent-red)]/10 text-[var(--accent-red)]"
                  }`}
                >
                  {publishResults[idx].success ? (
                    <a
                      href={publishResults[idx].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      Paylasild → {publishResults[idx].url}
                    </a>
                  ) : (
                    <span>Hata: {publishResults[idx].error}</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Action buttons */}
          {myTweetId ? (
            <div className="space-y-3">
              {/* Immediate publish */}
              <div className="flex gap-2">
                <button
                  onClick={handlePublish}
                  disabled={publishing || scheduling}
                  className="btn-primary flex-1"
                >
                  {publishing
                    ? "Paylasilyor..."
                    : `Hemen Paylas (2.5sn arayla)`}
                </button>
                <button
                  onClick={() => {
                    const full = generatedReplies.map((r, i) => `[Reply ${i + 1}]\n${r}`).join("\n\n");
                    copyText(full);
                  }}
                  className="btn-secondary px-4"
                >
                  Kopyala
                </button>
              </div>

              {/* Scheduled publish — interval selector + button */}
              <div className="p-3 rounded-lg bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/20 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[var(--accent-cyan)]">
                    Zamanli Paylasim (Onerilen)
                  </p>
                  <select
                    className="p-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs"
                    value={intervalMin}
                    onChange={(e) => setIntervalMin(Number(e.target.value))}
                  >
                    <option value={5}>5dk arayla</option>
                    <option value={10}>10dk arayla</option>
                    <option value={15}>15dk arayla (onerilen)</option>
                    <option value={20}>20dk arayla</option>
                    <option value={30}>30dk arayla</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  Sayfa kapatilsa bile backend otomatik atar. Ilk reply 5dk sonra, sonrakiler {intervalMin}dk arayla.
                </p>
                <button
                  onClick={handleScheduleChain}
                  disabled={scheduling || publishing}
                  className="btn-primary w-full"
                >
                  {scheduling
                    ? "Zamanlaniyor..."
                    : `${intervalMin}dk Arayla Zamanla`}
                </button>
              </div>

              {/* Schedule result */}
              {scheduleResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    scheduleResult.success
                      ? "bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30"
                      : "bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30"
                  }`}
                >
                  {scheduleResult.success ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-[var(--accent-green)]">
                        {scheduleResult.total_replies} reply zamanlandi!
                      </p>
                      {scheduleResult.posts?.map((p) => (
                        <div key={p.index} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="w-5 h-5 rounded-full bg-[var(--accent-green)]/20 text-[var(--accent-green)] flex items-center justify-center text-[10px] font-bold">
                            {p.index}
                          </span>
                          <span>
                            {new Date(p.scheduled_time).toLocaleTimeString("tr-TR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ))}
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        Takvim sayfasindan takip edebilirsiniz. Sayfa kapatilsa bile atilacak.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--accent-red)]">
                      Hata: {scheduleResult.error}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 text-center">
                <p className="text-xs text-[var(--accent-amber)]">
                  API ile paylasim/zamanlama icin tweet URL&apos;si gerekli (tweet ID lazim).
                  Reply&apos;lari kopyalayip manuel atabilirsiniz.
                </p>
              </div>
              <button
                onClick={() => {
                  const full = generatedReplies.map((r, i) => `[Reply ${i + 1}]\n${r}`).join("\n\n");
                  copyText(full);
                }}
                className="btn-secondary w-full"
              >
                Tumunu Kopyala
              </button>
            </div>
          )}

          {/* Tips */}
          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
            <p className="text-xs font-medium text-[var(--accent-cyan)] mb-1">Self-Reply Ipuclari:</p>
            <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside">
              <li><strong>Zamanli paylasim onerilen</strong> — 15dk arayla daha dogal ve etkili</li>
              <li>X algoritmasi &quot;devam eden konusma&quot; sinyali alir → Phoenix boost</li>
              <li>Son reply&apos;da <strong>soru veya CTA</strong> olsun — yorum cekmek icin</li>
              <li>Sayfa kapatilsa bile backend scheduler otomatik paylasiyor</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
