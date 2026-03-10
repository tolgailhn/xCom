"use client";

import { useState, useEffect } from "react";
import {
  getAutoReplyConfig,
  updateAutoReplyConfig,
  getAutoReplyLogs,
  clearAutoReplyLogs,
  deleteAutoReplyLog,
  triggerAutoReplyCheck,
  getAutoReplyStatus,
  getStyles,
  markAutoReplyLogPosted,
  type AutoReplyConfig,
  type AutoReplyLog,
  type AutoReplyStatus,
} from "@/lib/api";

type LogFilter = "all" | "ready" | "manually_posted" | "failed";

export default function OtomatikYanitPage() {
  const [tab, setTab] = useState<"config" | "logs">("config");
  const [config, setConfig] = useState<AutoReplyConfig>({
    enabled: false,
    accounts: [],
    check_interval_minutes: 5,
    reply_delay_seconds: 60,
    style: "reply",
    additional_context: "",
    max_replies_per_hour: 5,
    min_likes_to_reply: 0,
    only_original_tweets: true,
    language: "tr",
    draft_only: true,
  });
  const [logs, setLogs] = useState<AutoReplyLog[]>([]);
  const [status, setStatus] = useState<AutoReplyStatus | null>(null);
  const [styles, setStyles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [accountInput, setAccountInput] = useState("");
  const [message, setMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [configRes, logsRes, statusRes, stylesRes] = await Promise.all([
        getAutoReplyConfig(),
        getAutoReplyLogs(200),
        getAutoReplyStatus(),
        getStyles().catch(() => ({ styles: [] })),
      ]);
      setConfig(configRes.config);
      setLogs(logsRes.logs);
      setStatus(statusRes);
      if (stylesRes.styles) setStyles(stylesRes.styles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      await updateAutoReplyConfig(config);
      setMessage("Ayarlar kaydedildi!");
      const statusRes = await getAutoReplyStatus();
      setStatus(statusRes);
    } catch (err: unknown) {
      setMessage(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setMessage("");
    try {
      await triggerAutoReplyCheck();
      setMessage("Kontrol tamamlandi!");
      const [logsRes, statusRes] = await Promise.all([
        getAutoReplyLogs(200),
        getAutoReplyStatus(),
      ]);
      setLogs(logsRes.logs);
      setStatus(statusRes);
    } catch (err: unknown) {
      setMessage(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTriggering(false);
    }
  }

  async function handleClearLogs() {
    if (!confirm("Tum loglari silmek istediginize emin misiniz?")) return;
    try {
      await clearAutoReplyLogs();
      setLogs([]);
      setMessage("Loglar temizlendi");
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteLog(logId: string) {
    try {
      await deleteAutoReplyLog(logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMarkPosted(logId: string) {
    setMarkingId(logId);
    try {
      await markAutoReplyLogPosted(logId);
      setLogs((prev) =>
        prev.map((l) =>
          l.id === logId ? { ...l, status: "manually_posted" as const } : l
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingId(null);
    }
  }

  function copyToClipboard(text: string, logId: string) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch {
      navigator.clipboard?.writeText(text);
    }
    setCopiedId(logId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function addAccount() {
    const accounts = accountInput
      .split(",")
      .map((a) => a.trim().replace(/^@/, ""))
      .filter((a) => a && !config.accounts.includes(a));
    if (accounts.length > 0) {
      setConfig((prev) => ({
        ...prev,
        accounts: [...prev.accounts, ...accounts],
      }));
      setAccountInput("");
    }
  }

  function removeAccount(account: string) {
    setConfig((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a !== account),
    }));
  }

  function formatTime(isoStr: string) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  }

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (logFilter === "all") return true;
    if (logFilter === "ready") return log.status === "ready";
    if (logFilter === "manually_posted") return log.status === "manually_posted" || log.status === "published";
    if (logFilter === "failed") return log.status === "generation_failed" || log.status === "publish_failed";
    return true;
  });

  // Counts
  const readyCount = logs.filter((l) => l.status === "ready").length;
  const postedCount = logs.filter((l) => l.status === "manually_posted" || l.status === "published").length;
  const failedCount = logs.filter((l) => l.status === "generation_failed" || l.status === "publish_failed").length;

  function getStatusBadge(log: AutoReplyLog) {
    switch (log.status) {
      case "ready":
        return { label: "Bekliyor", cls: "bg-yellow-500/20 text-yellow-400" };
      case "manually_posted":
        return { label: "Manuel Paylasildi", cls: "bg-green-500/20 text-green-400" };
      case "published":
        return { label: "API ile Yayinlandi", cls: "bg-green-500/20 text-green-400" };
      case "generation_failed":
        return { label: "Uretim Hatasi", cls: "bg-red-500/20 text-red-400" };
      case "publish_failed":
        return { label: "Paylasim Hatasi", cls: "bg-red-500/20 text-red-400" };
      default:
        return { label: log.status, cls: "bg-gray-500/20 text-gray-400" };
    }
  }

  function getStatusBorderColor(log: AutoReplyLog) {
    switch (log.status) {
      case "ready": return "border-l-yellow-500";
      case "manually_posted": return "border-l-green-500";
      case "published": return "border-l-green-500";
      default: return "border-l-red-500";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold gradient-text">Otomatik Yanit</h1>
        {status && (
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                status.enabled
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status.enabled ? "bg-green-400 animate-pulse" : "bg-red-400"
                }`}
              />
              {status.enabled ? (status.draft_only ? "Taslak Modu" : "Aktif") : "Pasif"}
            </span>
          </div>
        )}
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--accent-blue)]">
              {status.accounts_count}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Takip Edilen</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {status.total_ready}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Bekleyen</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-green-400">
              {status.total_manually_posted}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Paylasilan</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">
              {status.total_replies}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">API Yanit</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-red-400">
              {status.total_failures}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Basarisiz</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setTab("config")}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
            tab === "config"
              ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Ayarlar
        </button>
        <button
          onClick={() => {
            setTab("logs");
            getAutoReplyLogs(200).then((res) => setLogs(res.logs));
          }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-2 ${
            tab === "logs"
              ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Yanitlar
          {readyCount > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 text-xs px-1.5 py-0.5 rounded-full font-bold">
              {readyCount}
            </span>
          )}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.startsWith("Hata")
              ? "bg-red-500/20 text-red-400"
              : "bg-green-500/20 text-green-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Config Tab */}
      {tab === "config" && (
        <div className="space-y-6">
          {/* Enable Toggle + Draft Mode */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Otomatik Yanit Sistemi</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Takip ettigin hesaplarin yeni tweetlerine AI ile yanit uret
                </p>
              </div>
              <button
                onClick={() =>
                  setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  config.enabled ? "bg-green-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    config.enabled ? "left-8" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Draft Only Toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <button
                onClick={() =>
                  setConfig((prev) => ({ ...prev, draft_only: !prev.draft_only }))
                }
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                  config.draft_only ? "bg-yellow-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.draft_only ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
              <div>
                <span className="text-sm font-medium">Taslak Modu</span>
                <p className="text-xs text-[var(--text-secondary)]">
                  {config.draft_only
                    ? "Yanitlar sadece uretilir, paylasim yapilmaz. Log'dan kopyalayip manuel paylasirsin."
                    : "Yanitlar uretilir ve API ile otomatik paylasimaya calisilir."}
                </p>
              </div>
            </div>
          </div>

          {/* Accounts */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-3">Yanit Verilecek Hesaplar</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Bu hesaplarin yeni tweetlerine yanit uretilecek.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={accountInput}
                onChange={(e) => setAccountInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAccount()}
                placeholder="@kullanici1, @kullanici2"
                className="input flex-1"
              />
              <button onClick={addAccount} className="btn-primary px-4">
                Ekle
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.accounts.map((account) => (
                <span
                  key={account}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] text-sm"
                >
                  @{account}
                  <button
                    onClick={() => removeAccount(account)}
                    className="hover:text-red-400 transition-colors"
                  >
                    &times;
                  </button>
                </span>
              ))}
              {config.accounts.length === 0 && (
                <span className="text-sm text-[var(--text-secondary)]">
                  Henuz hesap eklenmedi
                </span>
              )}
            </div>
          </div>

          {/* Settings Grid */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4">Yanit Ayarlari</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Language */}
              <div>
                <label className="block text-sm font-medium mb-1">Dil</label>
                <select
                  value={config.language}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, language: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="tr">Turkce</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Style */}
              <div>
                <label className="block text-sm font-medium mb-1">Yanit Tarzi</label>
                <select
                  value={config.style}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, style: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="reply">Standart Reply</option>
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Max replies per hour */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Saatlik Maks Uretim
                </label>
                <input
                  type="number"
                  value={config.max_replies_per_hour}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      max_replies_per_hour: parseInt(e.target.value) || 1,
                    }))
                  }
                  min={1}
                  max={20}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Saatte max kac yanit uretilsin. 3-5 ideal.
                </p>
              </div>

              {/* Reply delay */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Yanitlar Arasi Bekleme (sn)
                </label>
                <input
                  type="number"
                  value={config.reply_delay_seconds}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      reply_delay_seconds: parseInt(e.target.value) || 30,
                    }))
                  }
                  min={10}
                  max={300}
                  className="input w-full"
                />
              </div>

              {/* Min likes */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Min Like (yanit icin)
                </label>
                <input
                  type="number"
                  value={config.min_likes_to_reply}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      min_likes_to_reply: parseInt(e.target.value) || 0,
                    }))
                  }
                  min={0}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  0 = tum tweetlere yanit uret
                </p>
              </div>

              {/* Check interval */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Kontrol Araligi (dk)
                </label>
                <input
                  type="number"
                  value={config.check_interval_minutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      check_interval_minutes: parseInt(e.target.value) || 5,
                    }))
                  }
                  min={2}
                  max={60}
                  className="input w-full"
                />
              </div>
            </div>

            {/* Only original tweets */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    only_original_tweets: !prev.only_original_tweets,
                  }))
                }
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  config.only_original_tweets ? "bg-green-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.only_original_tweets ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-sm">Sadece orijinal tweetlere yanit uret (reply&apos;lari atla)</span>
            </div>
          </div>

          {/* Additional Context */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-2">Ek Talimat</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              AI&apos;a yanitlar icin ek talimat ver
            </p>
            <textarea
              value={config.additional_context}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  additional_context: e.target.value,
                }))
              }
              rows={3}
              className="input w-full"
              placeholder="Ornek: Her zaman deger katan, bilgilendirici yanitlar yaz. Kendi deneyimlerinden bahset."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-6 py-2.5"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              onClick={handleTrigger}
              disabled={triggering || !config.enabled}
              className="btn-secondary px-6 py-2.5"
            >
              {triggering ? "Kontrol ediliyor..." : "Simdi Kontrol Et"}
            </button>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {tab === "logs" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              {([
                { key: "all" as LogFilter, label: "Tumu", count: logs.length },
                { key: "ready" as LogFilter, label: "Bekleyen", count: readyCount },
                { key: "manually_posted" as LogFilter, label: "Paylasilan", count: postedCount },
                { key: "failed" as LogFilter, label: "Hatali", count: failedCount },
              ]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setLogFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    logFilter === f.key
                      ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Tum Loglari Temizle
              </button>
            )}
          </div>

          {filteredLogs.length === 0 ? (
            <div className="card p-8 text-center text-[var(--text-secondary)]">
              {logFilter === "ready"
                ? "Bekleyen yanit yok"
                : logFilter === "manually_posted"
                ? "Henuz paylasilan yanit yok"
                : "Henuz yanit uretilmedi"}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLogs.map((log) => {
                const badge = getStatusBadge(log);
                const borderColor = getStatusBorderColor(log);

                return (
                  <div
                    key={log.id}
                    className={`card p-4 md:p-5 border-l-4 ${borderColor}`}
                  >
                    {/* Header */}
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`https://x.com/${log.account}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-[var(--accent-blue)] hover:underline"
                        >
                          @{log.account}
                        </a>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {log.engagement_score != null && log.engagement_score > 0 && (
                          <span className="text-xs text-[var(--text-secondary)]">
                            Score: {Math.round(log.engagement_score)}
                          </span>
                        )}
                        {(log.like_count != null && log.like_count > 0) && (
                          <span className="text-xs text-[var(--text-secondary)]">
                            {log.like_count} like
                          </span>
                        )}
                        {(log.retweet_count != null && log.retweet_count > 0) && (
                          <span className="text-xs text-[var(--text-secondary)]">
                            {log.retweet_count} RT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {formatTime(log.created_at)}
                        </span>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="text-xs text-[var(--text-secondary)] hover:text-red-400"
                        >
                          &times;
                        </button>
                      </div>
                    </div>

                    {/* Original tweet — full text */}
                    <div className="mb-3 p-3 rounded-lg bg-[var(--bg-primary)] text-sm leading-relaxed">
                      <div className="text-xs text-[var(--text-secondary)] mb-1 font-medium">Orijinal Tweet</div>
                      <div className="whitespace-pre-wrap">{log.tweet_text}</div>
                    </div>

                    {/* Generated reply — full text, prominent */}
                    {log.reply_text && (
                      <div className="mb-3 p-3 rounded-lg bg-[var(--accent-blue)]/5 border border-[var(--accent-blue)]/20 text-sm leading-relaxed">
                        <div className="text-xs text-[var(--accent-blue)] mb-1 font-medium">Uretilen Yanit</div>
                        <div className="whitespace-pre-wrap">{log.reply_text}</div>
                      </div>
                    )}

                    {/* Error */}
                    {log.error && (
                      <div className="mb-3 text-xs text-red-400 bg-red-500/5 p-2 rounded">
                        {log.error}
                      </div>
                    )}

                    {/* Action Buttons — prominent layout */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* COPY — big and prominent for ready status */}
                      {log.reply_text && (
                        <button
                          onClick={() => copyToClipboard(log.reply_text, log.id)}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            copiedId === log.id
                              ? "bg-green-500/20 text-green-400"
                              : log.status === "ready"
                              ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/80"
                              : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {copiedId === log.id ? (
                            <>&#10003; Kopyalandi</>
                          ) : (
                            <>&#128203; Yaniti Kopyala</>
                          )}
                        </button>
                      )}

                      {/* Open tweet on X */}
                      {log.tweet_id && (
                        <a
                          href={`https://x.com/${log.account}/status/${log.tweet_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            log.status === "ready"
                              ? "bg-[var(--bg-primary)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30"
                              : "bg-[var(--bg-primary)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10"
                          }`}
                        >
                          &#120143; Tweet&apos;i Ac
                        </a>
                      )}

                      {/* Mark as manually posted */}
                      {log.status === "ready" && (
                        <button
                          onClick={() => handleMarkPosted(log.id)}
                          disabled={markingId === log.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all border border-green-500/20 disabled:opacity-50"
                        >
                          {markingId === log.id ? "Isleniyor..." : "&#10003; Paylasildı Olarak Isaretle"}
                        </button>
                      )}

                      {/* Reply URL (if published via API) */}
                      {log.reply_url && (
                        <a
                          href={log.reply_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all"
                        >
                          &#10003; Yaniti Gor
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
