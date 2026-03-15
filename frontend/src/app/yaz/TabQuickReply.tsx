"use client";

import { useState, useEffect, useRef } from "react";
import {
  generateReply,
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
   TAB: QUICK REPLY (Tara → Sec → Reply Uret → X'te Paylas)
   ══════════════════════════════════════════════════════════ */

export default function TabQuickReply({ styles, providers }: { styles: StyleOption[]; providers: ProviderOption[] }) {
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
  const [replyProvider, setReplyProvider] = useState("");
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
        provider: replyProvider || undefined,
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
