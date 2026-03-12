"use client";

import { useState, useEffect } from "react";
import {
  generateSelfReply,
  extractTweet,
  publishTweet,
  getPromptTemplates,
  addPromptTemplate,
  deletePromptTemplate,
  scheduleSelfReplyChain,
} from "@/lib/api";
import type { PublishResult } from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

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

/* ── Helpers ─────────────────────────────────────────── */

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

/* ── Component ───────────────────────────────────────── */

export default function TabSelfReply({ styles, providers }: { styles: StyleOption[]; providers: ProviderOption[] }) {
  // Input: tweet text or URL
  const [myTweetText, setMyTweetText] = useState("");
  const [myTweetUrl, setMyTweetUrl] = useState("");
  const [myTweetId, setMyTweetId] = useState("");
  const [extracting, setExtracting] = useState(false);

  // Generation
  const [replyCount, setReplyCount] = useState(1);
  const [selfReplyStyle, setSelfReplyStyle] = useState("");
  const [selfReplyProvider, setSelfReplyProvider] = useState("");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          style: selfReplyStyle || undefined,
          provider: selfReplyProvider || undefined,
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

          {/* Style selector */}
          <div>
            <label className="text-xs text-[var(--text-secondary)]">
              Reply Tarzi
            </label>
            <select
              className="w-full p-2 mt-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
              value={selfReplyStyle}
              onChange={(e) => setSelfReplyStyle(e.target.value)}
            >
              <option value="">Varsayilan</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* AI Provider */}
          {providers.length > 0 && (
            <div>
              <label className="text-xs text-[var(--text-secondary)]">
                AI Model
              </label>
              <select
                className="w-full p-2 mt-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
                value={selfReplyProvider}
                onChange={(e) => setSelfReplyProvider(e.target.value)}
              >
                <option value="">Otomatik</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
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
                    const full = generatedReplies.join("\n\n");
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
                  const full = generatedReplies.join("\n\n");
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
