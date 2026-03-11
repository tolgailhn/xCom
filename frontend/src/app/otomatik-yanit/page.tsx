"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  getSelfReplyConfig,
  updateSelfReplyConfig,
  getSelfReplyLogs,
  clearSelfReplyLogs,
  deleteSelfReplyLog,
  triggerSelfReplyCheck,
  getSelfReplyStatus,
  type AutoReplyConfig,
  type AutoReplyLog,
  type AutoReplyStatus,
  type SelfReplyConfig,
  type SelfReplyLog,
  type SelfReplyStatus,
} from "@/lib/api";

type LogFilter = "all" | "ready" | "manually_posted" | "failed";
type SelfLogFilter = "all" | "published" | "ready" | "failed";

export default function OtomatikYanitPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"config" | "logs" | "self_reply" | "analytics">("config");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "config" || t === "logs" || t === "self_reply" || t === "analytics") setTab(t);
  }, [searchParams]);

  // Auto-Reply state
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
  const [logSearch, setLogSearch] = useState("");
  const [logAccountFilter, setLogAccountFilter] = useState("");
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [bulkActioning, setBulkActioning] = useState(false);

  // Self-Reply state
  const [selfConfig, setSelfConfig] = useState<SelfReplyConfig>({
    enabled: false,
    username: "",
    max_daily_tweets: 4,
    replies_per_tweet: 3,
    reply_interval_minutes: 15,
    min_tweet_age_minutes: 30,
    max_tweet_age_days: 5,
    style: "samimi",
    draft_only: false,
    work_hour_start: 9,
    work_hour_end: 23,
  });
  const [selfLogs, setSelfLogs] = useState<SelfReplyLog[]>([]);
  const [selfStatus, setSelfStatus] = useState<SelfReplyStatus | null>(null);
  const [selfSaving, setSelfSaving] = useState(false);
  const [selfTriggering, setSelfTriggering] = useState(false);
  const [selfMessage, setSelfMessage] = useState("");
  const [selfLogFilter, setSelfLogFilter] = useState<SelfLogFilter>("all");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [configRes, logsRes, statusRes, stylesRes, selfConfigRes, selfLogsRes, selfStatusRes] = await Promise.all([
        getAutoReplyConfig(),
        getAutoReplyLogs(200),
        getAutoReplyStatus(),
        getStyles().catch(() => ({ styles: [] })),
        getSelfReplyConfig().catch(() => ({ config: selfConfig })),
        getSelfReplyLogs(200).catch(() => ({ logs: [] })),
        getSelfReplyStatus().catch(() => null),
      ]);
      setConfig(configRes.config);
      setLogs(logsRes.logs);
      setStatus(statusRes);
      if (stylesRes.styles) setStyles(stylesRes.styles);
      setSelfConfig(selfConfigRes.config);
      setSelfLogs(selfLogsRes.logs);
      if (selfStatusRes) setSelfStatus(selfStatusRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── Auto-Reply handlers ──────────────────────────────

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

  // ── Self-Reply handlers ──────────────────────────────

  async function handleSelfSave() {
    setSelfSaving(true);
    setSelfMessage("");
    try {
      await updateSelfReplyConfig(selfConfig);
      setSelfMessage("Self-reply ayarlari kaydedildi!");
      const statusRes = await getSelfReplyStatus();
      setSelfStatus(statusRes);
    } catch (err: unknown) {
      setSelfMessage(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSelfSaving(false);
    }
  }

  async function handleSelfTrigger() {
    setSelfTriggering(true);
    setSelfMessage("");
    try {
      await triggerSelfReplyCheck();
      setSelfMessage("Self-reply kontrol tamamlandi!");
      const [logsRes, statusRes] = await Promise.all([
        getSelfReplyLogs(200),
        getSelfReplyStatus(),
      ]);
      setSelfLogs(logsRes.logs);
      setSelfStatus(statusRes);
    } catch (err: unknown) {
      setSelfMessage(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSelfTriggering(false);
    }
  }

  async function handleSelfClearLogs() {
    if (!confirm("Tum self-reply loglarini silmek istediginize emin misiniz?")) return;
    try {
      await clearSelfReplyLogs();
      setSelfLogs([]);
      setSelfMessage("Loglar temizlendi");
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSelfDeleteLog(logId: string) {
    try {
      await deleteSelfReplyLog(logId);
      setSelfLogs((prev) => prev.filter((l) => l.id !== logId));
    } catch (err) {
      console.error(err);
    }
  }

  // ── Shared helpers ──────────────────────────────────

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

  // Bulk actions
  async function handleBulkMarkPosted() {
    if (selectedLogIds.size === 0) return;
    setBulkActioning(true);
    for (const id of selectedLogIds) {
      try {
        await markAutoReplyLogPosted(id);
      } catch { /* skip */ }
    }
    setSelectedLogIds(new Set());
    setBulkActioning(false);
    const logsRes = await getAutoReplyLogs(200);
    setLogs(logsRes.logs);
  }

  async function handleBulkDelete() {
    if (selectedLogIds.size === 0) return;
    setBulkActioning(true);
    for (const id of selectedLogIds) {
      try {
        await deleteAutoReplyLog(id);
      } catch { /* skip */ }
    }
    setSelectedLogIds(new Set());
    setBulkActioning(false);
    const logsRes = await getAutoReplyLogs(200);
    setLogs(logsRes.logs);
  }

  function toggleLogSelection(id: string) {
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    if (selectedLogIds.size === filteredLogs.length) {
      setSelectedLogIds(new Set());
    } else {
      setSelectedLogIds(new Set(filteredLogs.map((l) => l.id)));
    }
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

  function relativeTime(isoStr: string): string {
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "az once";
      if (diffMin < 60) return `${diffMin} dk once`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr} saat once`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 7) return `${diffDay} gun once`;
      return formatTime(isoStr);
    } catch {
      return isoStr;
    }
  }

  // Unique accounts from logs for filter dropdown
  const uniqueAccounts = [...new Set(logs.map((l) => l.account).filter(Boolean))].sort();

  // Auto-reply log filtering (status + account + text search)
  const filteredLogs = logs.filter((log) => {
    // Status filter
    if (logFilter === "ready" && log.status !== "ready") return false;
    if (logFilter === "manually_posted" && log.status !== "manually_posted" && log.status !== "published") return false;
    if (logFilter === "failed" && log.status !== "generation_failed" && log.status !== "publish_failed") return false;
    // Account filter
    if (logAccountFilter && log.account !== logAccountFilter) return false;
    // Text search
    if (logSearch) {
      const q = logSearch.toLowerCase();
      const inTweet = (log.tweet_text || "").toLowerCase().includes(q);
      const inReply = (log.reply_text || "").toLowerCase().includes(q);
      const inAccount = (log.account || "").toLowerCase().includes(q);
      if (!inTweet && !inReply && !inAccount) return false;
    }
    return true;
  });

  const readyCount = logs.filter((l) => l.status === "ready").length;
  const postedCount = logs.filter((l) => l.status === "manually_posted" || l.status === "published").length;
  const failedCount = logs.filter((l) => l.status === "generation_failed" || l.status === "publish_failed").length;

  // Self-reply log filtering
  const filteredSelfLogs = selfLogs.filter((log) => {
    if (selfLogFilter === "all") return true;
    if (selfLogFilter === "published") return log.status === "published";
    if (selfLogFilter === "ready") return log.status === "ready";
    if (selfLogFilter === "failed") return log.status === "generation_failed" || log.status === "publish_failed";
    return true;
  });

  const selfPublishedCount = selfLogs.filter((l) => l.status === "published").length;
  const selfReadyCount = selfLogs.filter((l) => l.status === "ready").length;
  const selfFailedCount = selfLogs.filter((l) => l.status === "generation_failed" || l.status === "publish_failed").length;

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

  function getSelfStatusBadge(status: string) {
    switch (status) {
      case "published":
        return { label: "Yayinlandi", cls: "bg-green-500/20 text-green-400" };
      case "ready":
        return { label: "Taslak", cls: "bg-yellow-500/20 text-yellow-400" };
      case "generation_failed":
        return { label: "Uretim Hatasi", cls: "bg-red-500/20 text-red-400" };
      case "publish_failed":
        return { label: "Paylasim Hatasi", cls: "bg-red-500/20 text-red-400" };
      default:
        return { label: status, cls: "bg-gray-500/20 text-gray-400" };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold gradient-text">Otomatik Yanit</h1>
        <div className="flex items-center gap-2">
          {status && (
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
              {status.enabled ? (status.draft_only ? "Taslak" : "Aktif") : "Pasif"}
            </span>
          )}
          {selfStatus && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                selfStatus.enabled
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-gray-500/20 text-gray-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  selfStatus.enabled ? "bg-purple-400 animate-pulse" : "bg-gray-400"
                }`}
              />
              Self {selfStatus.enabled ? (selfStatus.draft_only ? "Taslak" : "Aktif") : "Pasif"}
            </span>
          )}
        </div>
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
              {selfStatus?.total_published || 0}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Self Reply</div>
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
        <button
          onClick={() => {
            setTab("self_reply");
            getSelfReplyLogs(200).then((res) => setSelfLogs(res.logs)).catch(() => {});
            getSelfReplyStatus().then((res) => setSelfStatus(res)).catch(() => {});
          }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-2 ${
            tab === "self_reply"
              ? "bg-purple-500/20 text-purple-400 border-b-2 border-purple-400"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Self Reply
          {selfStatus && selfStatus.enabled && (
            <span className="bg-purple-500/20 text-purple-400 text-xs px-1.5 py-0.5 rounded-full font-bold">
              {selfStatus.today_replied}/{selfStatus.max_daily}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("analytics")}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
            tab === "analytics"
              ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border-b-2 border-[var(--accent-cyan)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Analitik
        </button>
      </div>

      {/* Message */}
      {tab !== "self_reply" && message && (
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

      {/* ══════════════════════════════════════════════════ */}
      {/* Config Tab (Auto-Reply) */}
      {/* ══════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════ */}
      {/* Logs Tab (Auto-Reply) */}
      {/* ══════════════════════════════════════════════════ */}
      {tab === "logs" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="space-y-3">
            {/* Status filters */}
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

            {/* Search + Account filter */}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Metin ara (tweet, reply, hesap)..."
                className="flex-1 min-w-[200px] bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:border-[var(--accent-blue)] focus:outline-none"
              />
              {uniqueAccounts.length > 1 && (
                <select
                  value={logAccountFilter}
                  onChange={(e) => setLogAccountFilter(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">Tum Hesaplar</option>
                  {uniqueAccounts.map((a) => (
                    <option key={a} value={a}>@{a}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Bulk actions toolbar */}
            {filteredLogs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={toggleSelectAllFiltered}
                  className="px-2 py-1 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {selectedLogIds.size === filteredLogs.length ? "Secimi Kaldir" : `Tumunu Sec (${filteredLogs.length})`}
                </button>
                {selectedLogIds.size > 0 && (
                  <>
                    <span className="text-[var(--text-secondary)]">{selectedLogIds.size} secili</span>
                    <button
                      onClick={handleBulkMarkPosted}
                      disabled={bulkActioning}
                      className="px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    >
                      {bulkActioning ? "Isleniyor..." : "Paylasildi Isaretle"}
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkActioning}
                      className="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {bulkActioning ? "Siliniyor..." : "Secilenleri Sil"}
                    </button>
                  </>
                )}
              </div>
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
                    className={`card p-4 md:p-5 border-l-4 ${borderColor} ${selectedLogIds.has(log.id) ? "ring-1 ring-[var(--accent-blue)]/50" : ""}`}
                  >
                    {/* Header */}
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedLogIds.has(log.id)}
                          onChange={() => toggleLogSelection(log.id)}
                          className="rounded cursor-pointer"
                        />
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
                          <span
                            className="text-xs text-[var(--text-secondary)] cursor-help"
                            title={`Score = likes x1 + RTs x20 + replies x13.5 + bookmarks x10`}
                          >
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
                        <span
                          className="text-xs text-[var(--text-secondary)] cursor-help"
                          title={formatTime(log.created_at)}
                        >
                          {relativeTime(log.created_at)}
                        </span>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="text-xs text-[var(--text-secondary)] hover:text-red-400"
                        >
                          &times;
                        </button>
                      </div>
                    </div>

                    {/* Original tweet */}
                    <div className="mb-3 p-3 rounded-lg bg-[var(--bg-primary)] text-sm leading-relaxed">
                      <div className="text-xs text-[var(--text-secondary)] mb-1 font-medium">Orijinal Tweet</div>
                      <div className="whitespace-pre-wrap">{log.tweet_text}</div>
                    </div>

                    {/* Generated reply */}
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

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
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

                      {log.status === "ready" && (
                        <button
                          onClick={() => handleMarkPosted(log.id)}
                          disabled={markingId === log.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all border border-green-500/20 disabled:opacity-50"
                        >
                          {markingId === log.id ? "Isleniyor..." : "&#10003; Paylasildı Olarak Isaretle"}
                        </button>
                      )}

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

      {/* ══════════════════════════════════════════════════ */}
      {/* Self Reply Tab */}
      {/* ══════════════════════════════════════════════════ */}
      {tab === "self_reply" && (
        <div className="space-y-6">
          {/* Self Message */}
          {selfMessage && (
            <div
              className={`p-3 rounded-lg text-sm ${
                selfMessage.startsWith("Hata")
                  ? "bg-red-500/20 text-red-400"
                  : "bg-green-500/20 text-green-400"
              }`}
            >
              {selfMessage}
            </div>
          )}

          {/* Self-Reply Status Cards */}
          {selfStatus && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {selfStatus.today_replied}/{selfStatus.max_daily}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">Bugun</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-green-400">
                  {selfStatus.total_published}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">Toplam Yayinlanan</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-[var(--accent-blue)]">
                  {selfStatus.total_tweets_with_replies}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">Tweet Kapsandi</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {selfStatus.total_ready}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">Taslak</div>
              </div>
            </div>
          )}

          {/* Enable + Config */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Self-Reply Otomasyonu</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Kendi tweetlerine otomatik self-reply at. X algoritması self-reply&apos;i &quot;devam eden konusma&quot; olarak gorur ve engagement&apos;i arttirir.
                </p>
              </div>
              <button
                onClick={() =>
                  setSelfConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  selfConfig.enabled ? "bg-purple-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    selfConfig.enabled ? "left-8" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Draft Only */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 mb-4">
              <button
                onClick={() =>
                  setSelfConfig((prev) => ({ ...prev, draft_only: !prev.draft_only }))
                }
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                  selfConfig.draft_only ? "bg-yellow-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    selfConfig.draft_only ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
              <div>
                <span className="text-sm font-medium">Taslak Modu</span>
                <p className="text-xs text-[var(--text-secondary)]">
                  {selfConfig.draft_only
                    ? "Reply&apos;lar sadece uretilir, paylasim yapilmaz."
                    : "Reply&apos;lar uretilir ve otomatik paylasilir."}
                </p>
              </div>
            </div>

            {/* Username */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">X Hesap Adi</label>
              <input
                type="text"
                value={selfConfig.username}
                onChange={(e) =>
                  setSelfConfig((prev) => ({ ...prev, username: e.target.value.replace(/^@/, "") }))
                }
                placeholder="kullaniciadi"
                className="input w-full md:w-1/2"
              />
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Self-reply atilacak kendi X hesabin
              </p>
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Gunluk Max Tweet</label>
                <input
                  type="number"
                  value={selfConfig.max_daily_tweets}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({
                      ...prev,
                      max_daily_tweets: parseInt(e.target.value) || 4,
                    }))
                  }
                  min={1}
                  max={10}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Gunde max kac tweet&apos;e self-reply atilsin
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tweet Basi Reply</label>
                <input
                  type="number"
                  value={selfConfig.replies_per_tweet}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({
                      ...prev,
                      replies_per_tweet: parseInt(e.target.value) || 3,
                    }))
                  }
                  min={1}
                  max={5}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Her tweet&apos;e kac self-reply atilsin
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Reply Araligi (dk)</label>
                <input
                  type="number"
                  value={selfConfig.reply_interval_minutes}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({
                      ...prev,
                      reply_interval_minutes: parseInt(e.target.value) || 15,
                    }))
                  }
                  min={5}
                  max={60}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Self-reply&apos;lar arasi bekleme suresi
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Min Tweet Yasi (dk)</label>
                <input
                  type="number"
                  value={selfConfig.min_tweet_age_minutes}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({
                      ...prev,
                      min_tweet_age_minutes: parseInt(e.target.value) || 30,
                    }))
                  }
                  min={5}
                  max={180}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Tweet&apos;in en az kac dk sonra reply alacagi
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Max Tweet Yasi (gun)</label>
                <input
                  type="number"
                  value={selfConfig.max_tweet_age_days}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({
                      ...prev,
                      max_tweet_age_days: parseInt(e.target.value) || 5,
                    }))
                  }
                  min={1}
                  max={14}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Son kac gunun tweetlerine reply atilsin
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Yazim Tarzi</label>
                <select
                  value={selfConfig.style}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({ ...prev, style: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="samimi">Samimi</option>
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Work hours */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Baslangic Saati</label>
                <input
                  type="number"
                  value={selfConfig.work_hour_start}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({
                      ...prev,
                      work_hour_start: parseInt(e.target.value) || 9,
                    }))
                  }
                  min={0}
                  max={23}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bitis Saati</label>
                <input
                  type="number"
                  value={selfConfig.work_hour_end}
                  onChange={(e) =>
                    setSelfConfig((prev) => ({
                      ...prev,
                      work_hour_end: parseInt(e.target.value) || 23,
                    }))
                  }
                  min={1}
                  max={24}
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="card p-5 bg-purple-500/5 border border-purple-500/20">
            <h4 className="text-sm font-semibold text-purple-400 mb-2">Nasil Calisir?</h4>
            <ul className="text-xs text-[var(--text-secondary)] space-y-1">
              <li>- Her 15 dakikada kendi tweetlerin kontrol edilir</li>
              <li>- Son {selfConfig.max_tweet_age_days} gundeki orijinal tweetlerine {selfConfig.replies_per_tweet} self-reply uretilir</li>
              <li>- Gunde max {selfConfig.max_daily_tweets} tweet&apos;e self-reply atilir</li>
              <li>- Reply&apos;lar {selfConfig.reply_interval_minutes} dk arayla paylasilir</li>
              <li>- Her reply farkli bir acidan devam eder: ek bilgi, deneyim, CTA</li>
              <li>- Zaten reply atilmis tweetlere tekrar atilmaz</li>
              <li>- Training DNA&apos;n (tolga style) kullanilarak dogal reply uretilir</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSelfSave}
              disabled={selfSaving}
              className="btn-primary px-6 py-2.5"
            >
              {selfSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              onClick={handleSelfTrigger}
              disabled={selfTriggering || !selfConfig.enabled || !selfConfig.username}
              className="px-6 py-2.5 rounded-lg font-medium text-sm transition-all bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 disabled:opacity-50"
            >
              {selfTriggering ? "Kontrol ediliyor..." : "Simdi Kontrol Et"}
            </button>
          </div>

          {/* Self-Reply Logs */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2 flex-wrap">
                {([
                  { key: "all" as SelfLogFilter, label: "Tumu", count: selfLogs.length },
                  { key: "published" as SelfLogFilter, label: "Yayinlanan", count: selfPublishedCount },
                  { key: "ready" as SelfLogFilter, label: "Taslak", count: selfReadyCount },
                  { key: "failed" as SelfLogFilter, label: "Hatali", count: selfFailedCount },
                ]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setSelfLogFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selfLogFilter === f.key
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
              {selfLogs.length > 0 && (
                <button
                  onClick={handleSelfClearLogs}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Logları Temizle
                </button>
              )}
            </div>

            {filteredSelfLogs.length === 0 ? (
              <div className="card p-8 text-center text-[var(--text-secondary)]">
                {selfLogFilter === "published"
                  ? "Henuz yayinlanan self-reply yok"
                  : selfLogFilter === "ready"
                  ? "Bekleyen taslak yok"
                  : "Henuz self-reply uretilmedi. Sistemi aktif edip beklein veya 'Simdi Kontrol Et' butonuna basin."}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSelfLogs.map((log) => {
                  const badge = getSelfStatusBadge(log.status);

                  return (
                    <div
                      key={log.id}
                      className={`card p-4 border-l-4 ${
                        log.status === "published"
                          ? "border-l-green-500"
                          : log.status === "ready"
                          ? "border-l-yellow-500"
                          : "border-l-red-500"
                      }`}
                    >
                      <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-[var(--text-secondary)]">
                            Reply #{log.reply_number}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-secondary)]">
                            {formatTime(log.created_at)}
                          </span>
                          <button
                            onClick={() => handleSelfDeleteLog(log.id)}
                            className="text-xs text-[var(--text-secondary)] hover:text-red-400"
                          >
                            &times;
                          </button>
                        </div>
                      </div>

                      {/* Original tweet */}
                      <div className="mb-2 p-2 rounded bg-[var(--bg-primary)] text-xs leading-relaxed">
                        <span className="text-[var(--text-secondary)] font-medium">Tweet: </span>
                        <span className="whitespace-pre-wrap">{log.tweet_text}</span>
                      </div>

                      {/* Self-reply text */}
                      {log.reply_text && (
                        <div className="mb-2 p-2 rounded bg-purple-500/5 border border-purple-500/20 text-sm leading-relaxed">
                          <div className="whitespace-pre-wrap">{log.reply_text}</div>
                        </div>
                      )}

                      {log.error && (
                        <div className="mb-2 text-xs text-red-400 bg-red-500/5 p-2 rounded">
                          {log.error}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {log.reply_text && (
                          <button
                            onClick={() => copyToClipboard(log.reply_text, log.id)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              copiedId === log.id
                                ? "bg-green-500/20 text-green-400"
                                : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            {copiedId === log.id ? "Kopyalandi" : "Kopyala"}
                          </button>
                        )}

                        {log.reply_url && (
                          <a
                            href={log.reply_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all"
                          >
                            Gor
                          </a>
                        )}

                        {log.tweet_id && (
                          <a
                            href={`https://x.com/i/status/${log.tweet_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-primary)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-all"
                          >
                            Tweet
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* Analytics Tab */}
      {/* ══════════════════════════════════════════════════ */}
      {tab === "analytics" && <AnalyticsTab logs={logs} selfLogs={selfLogs} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ANALYTICS TAB COMPONENT
   ══════════════════════════════════════════════════════════ */

function AnalyticsTab({ logs, selfLogs }: { logs: AutoReplyLog[]; selfLogs: SelfReplyLog[] }) {
  // --- Computed analytics from existing logs ---
  const allLogs = logs;
  const total = allLogs.length;
  const published = allLogs.filter(
    (l) => l.status === "published" || l.status === "manually_posted"
  ).length;
  const failed = allLogs.filter(
    (l) => l.status === "generation_failed" || l.status === "publish_failed"
  ).length;
  const ready = allLogs.filter((l) => l.status === "ready").length;
  const successRate = total > 0 ? Math.round(((published / (published + failed)) || 0) * 100) : 0;

  // Per-account stats
  const accountStats: Record<string, { total: number; published: number; failed: number }> = {};
  for (const log of allLogs) {
    const acc = log.account || "unknown";
    if (!accountStats[acc]) accountStats[acc] = { total: 0, published: 0, failed: 0 };
    accountStats[acc].total++;
    if (log.status === "published" || log.status === "manually_posted") accountStats[acc].published++;
    if (log.status === "generation_failed" || log.status === "publish_failed") accountStats[acc].failed++;
  }
  const accountList = Object.entries(accountStats)
    .sort(([, a], [, b]) => b.total - a.total);

  // Hourly heatmap (which hours produce most replies)
  const hourCounts = new Array(24).fill(0);
  const hourPublished = new Array(24).fill(0);
  for (const log of allLogs) {
    try {
      const h = new Date(log.created_at).getHours();
      hourCounts[h]++;
      if (log.status === "published" || log.status === "manually_posted") hourPublished[h]++;
    } catch { /* skip */ }
  }
  const maxHourCount = Math.max(...hourCounts, 1);

  // Self-reply stats
  const selfTotal = selfLogs.length;
  const selfPublished = selfLogs.filter((l) => l.status === "published").length;
  const selfFailed = selfLogs.filter(
    (l) => l.status === "generation_failed" || l.status === "publish_failed"
  ).length;

  // Daily trend (last 7 days)
  const dailyCounts: Record<string, { total: number; published: number }> = {};
  for (const log of allLogs) {
    try {
      const day = new Date(log.created_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
      if (!dailyCounts[day]) dailyCounts[day] = { total: 0, published: 0 };
      dailyCounts[day].total++;
      if (log.status === "published" || log.status === "manually_posted") dailyCounts[day].published++;
    } catch { /* skip */ }
  }
  const dailyList = Object.entries(dailyCounts).slice(-7);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-[var(--accent-blue)]">{total}</div>
          <div className="text-xs text-[var(--text-secondary)]">Toplam Reply</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{published}</div>
          <div className="text-xs text-[var(--text-secondary)]">Paylasilan</div>
        </div>
        <div className="card p-4 text-center">
          <div className={`text-2xl font-bold ${successRate >= 70 ? "text-green-400" : successRate >= 40 ? "text-yellow-400" : "text-red-400"}`}>
            %{successRate}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Basari Orani</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{selfPublished}</div>
          <div className="text-xs text-[var(--text-secondary)]">Self Reply</div>
        </div>
      </div>

      {/* Hourly Heatmap */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
          Saat Bazli Aktivite (Isi Haritasi)
        </h3>
        <div className="grid grid-cols-12 gap-1">
          {hourCounts.map((count, hour) => {
            const intensity = count / maxHourCount;
            const bg = count === 0
              ? "bg-[var(--bg-primary)]"
              : intensity > 0.7
              ? "bg-[var(--accent-blue)]"
              : intensity > 0.4
              ? "bg-[var(--accent-blue)]/60"
              : "bg-[var(--accent-blue)]/30";
            return (
              <div
                key={hour}
                className={`${bg} rounded p-1.5 text-center cursor-help transition-all`}
                title={`${String(hour).padStart(2, "0")}:00 — ${count} reply (${hourPublished[hour]} paylasilan)`}
              >
                <div className="text-[9px] text-[var(--text-secondary)]">
                  {String(hour).padStart(2, "0")}
                </div>
                <div className="text-xs font-bold">{count || ""}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-secondary)]">
          <span>Az</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded bg-[var(--bg-primary)]" />
            <div className="w-3 h-3 rounded bg-[var(--accent-blue)]/30" />
            <div className="w-3 h-3 rounded bg-[var(--accent-blue)]/60" />
            <div className="w-3 h-3 rounded bg-[var(--accent-blue)]" />
          </div>
          <span>Cok</span>
        </div>
      </div>

      {/* Account Performance */}
      {accountList.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            Hesap Bazli Performans
          </h3>
          <div className="space-y-2">
            {accountList.map(([account, stats]) => {
              const rate = stats.total > 0 ? Math.round((stats.published / stats.total) * 100) : 0;
              return (
                <div key={account} className="flex items-center gap-3">
                  <a
                    href={`https://x.com/${account}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent-blue)] hover:underline min-w-[120px]"
                  >
                    @{account}
                  </a>
                  <div className="flex-1 h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] min-w-[80px] text-right">
                    {stats.published}/{stats.total} (%{rate})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Trend */}
      {dailyList.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            Gunluk Trend
          </h3>
          <div className="flex items-end gap-2 h-32">
            {dailyList.map(([day, stats]) => {
              const maxDaily = Math.max(...dailyList.map(([, s]) => s.total), 1);
              const height = (stats.total / maxDaily) * 100;
              const pubHeight = (stats.published / maxDaily) * 100;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="relative w-full flex flex-col items-center" style={{ height: "100%" }}>
                    <div className="w-full flex flex-col justify-end h-full">
                      <div
                        className="w-full bg-[var(--accent-blue)]/20 rounded-t relative"
                        style={{ height: `${height}%`, minHeight: stats.total > 0 ? "4px" : "0" }}
                      >
                        <div
                          className="absolute bottom-0 w-full bg-green-500/60 rounded-t"
                          style={{ height: `${stats.total > 0 ? (pubHeight / height) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-[9px] text-[var(--text-secondary)]">{day}</div>
                  <div className="text-[10px] font-medium">{stats.total}</div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-secondary)]">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-[var(--accent-blue)]/20" />
              <span>Toplam</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded bg-green-500/60" />
              <span>Paylasilan</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Bekleyen Reply</div>
          <div className="text-xl font-bold text-yellow-400">{ready}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Basarisiz</div>
          <div className="text-xl font-bold text-red-400">{failed}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Self Reply Basarisiz</div>
          <div className="text-xl font-bold text-red-400">{selfFailed}</div>
        </div>
      </div>
    </div>
  );
}
