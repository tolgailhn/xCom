"use client";

import { useState, useEffect } from "react";
import {
  generateQuoteTweet,
  extractTweet,
  researchTopicStream,
  addDraft,
  findMedia,
  getMediaDownloadUrl,
  generateInfographic,
  getTodaySchedule,
  logPost,
} from "@/lib/api";
import type { PublishResult } from "@/lib/api";
import { ScoreBar, type ScoreResult } from "@/components/ui";

/* ── Types ─────────────────────────────────────────────── */

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

interface SlotOption {
  time: string;
  label: string;
}

/* ── "Paylaştım" Butonu — takvime kayıt ─────────────────── */

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

/* ══════════════════════════════════════════════════════════
   TAB 2: ARASTIRMALI QUOTE TWEET
   ══════════════════════════════════════════════════════════ */

export default function TabQuoteTweet({
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
  const [additionalContext, setAdditionalContext] = useState("");

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
    sources: { title: string; url?: string; body?: string }[];
    media_urls: string[];
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
      if (research.media_urls?.length) {
        setMediaResults(research.media_urls.map((url: string) => ({ url, source: "research", media_type: "image" })));
      }
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
        additional_context: additionalContext || undefined,
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
    // Build the canonical quote URL from the user-provided quoteUrl or tweetId
    const canonicalQuoteUrl = quoteUrl.trim() || (tweetId ? `https://x.com/i/status/${tweetId}` : "");
    if (canonicalQuoteUrl) {
      // Quote tweet — remove any embedded tweet URL from generated text to avoid duplication
      let cleanText = generatedText;
      if (tweetId) {
        cleanText = cleanText.replace(new RegExp(`https?://(?:twitter\\.com|x\\.com)/\\S*status/${tweetId}\\S*`, "gi"), "").trim();
      }
      // Append the quote URL at the end of the text — X will render it as a quote tweet card
      const tweetText = cleanText + "\n" + canonicalQuoteUrl;
      intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
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

          {/* Additional Context */}
          <textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            rows={2}
            className="input w-full text-sm"
            placeholder="Ek talimat (opsiyonel): Ornek: 'Karsi bir gorus belirt', 'Kendi deneyimimden bahset'"
          />

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
            <button onClick={handleOpenInX} className="btn-primary text-sm">
              X&apos;te Ac
            </button>
            <button
              onClick={() => {
                // Quote tweet sayfasını aç — kullanıcı metni kopyalayıp manuel quote yapar
                const canonicalUrl = quoteUrl.trim() || (tweetId ? `https://x.com/i/status/${tweetId}` : "");
                if (canonicalUrl) {
                  copyText(generatedText);
                  window.open(canonicalUrl, "_blank");
                }
              }}
              className="btn-secondary text-sm"
            >
              X Quote Ac
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
