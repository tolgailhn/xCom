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

import TabConfig from "./TabConfig";
import TabLogs from "./TabLogs";
import TabSelfReply from "./TabSelfReply";
import TabAnalytics from "./TabAnalytics";

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
  const [markingId, setMarkingId] = useState<string | null>(null);

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

  async function handleBulkMarkPosted(ids: Set<string>) {
    for (const id of ids) {
      try {
        await markAutoReplyLogPosted(id);
      } catch { /* skip */ }
    }
    const logsRes = await getAutoReplyLogs(200);
    setLogs(logsRes.logs);
  }

  async function handleBulkDelete(ids: Set<string>) {
    for (const id of ids) {
      try {
        await deleteAutoReplyLog(id);
      } catch { /* skip */ }
    }
    const logsRes = await getAutoReplyLogs(200);
    setLogs(logsRes.logs);
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

  const readyCount = logs.filter((l) => l.status === "ready").length;

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

      {/* Tab Content */}
      {tab === "config" && (
        <TabConfig
          config={config}
          setConfig={setConfig}
          styles={styles}
          accountInput={accountInput}
          setAccountInput={setAccountInput}
          saving={saving}
          triggering={triggering}
          message={message}
          onSave={handleSave}
          onTrigger={handleTrigger}
        />
      )}

      {tab === "logs" && (
        <TabLogs
          logs={logs}
          onClearLogs={handleClearLogs}
          onDeleteLog={handleDeleteLog}
          onMarkPosted={handleMarkPosted}
          onBulkMarkPosted={handleBulkMarkPosted}
          onBulkDelete={handleBulkDelete}
          markingId={markingId}
          copiedId={copiedId}
          onCopy={copyToClipboard}
        />
      )}

      {tab === "self_reply" && (
        <TabSelfReply
          selfConfig={selfConfig}
          setSelfConfig={setSelfConfig}
          selfStatus={selfStatus}
          selfLogs={selfLogs}
          styles={styles}
          selfMessage={selfMessage}
          selfSaving={selfSaving}
          selfTriggering={selfTriggering}
          onSave={handleSelfSave}
          onTrigger={handleSelfTrigger}
          onClearLogs={handleSelfClearLogs}
          onDeleteLog={handleSelfDeleteLog}
          copiedId={copiedId}
          onCopy={copyToClipboard}
        />
      )}

      {tab === "analytics" && <TabAnalytics logs={logs} selfLogs={selfLogs} />}
    </div>
  );
}
