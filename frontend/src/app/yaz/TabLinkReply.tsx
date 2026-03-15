"use client";

import { useState, useEffect, useRef } from "react";
import {
  generateReply,
  extractTweet,
  publishTweet,
  getTodaySchedule,
  logPost,
} from "@/lib/api";
import type { PublishResult } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */

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

interface SlotOption {
  time: string;
  label: string;
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

/* ══════════════════════════════════════════════════════════
   TAB 4: LINK REPLY — Tweet linkine reply üretme
   ══════════════════════════════════════════════════════════ */

export default function TabLinkReply({ styles, providers }: { styles: StyleOption[]; providers: ProviderOption[] }) {
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
  const [replyProvider, setReplyProvider] = useState("");
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
        provider: replyProvider || undefined,
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

            {providers.length > 0 && (
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">AI Model</label>
                <select
                  value={replyProvider}
                  onChange={(e) => setReplyProvider(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">Otomatik</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

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
