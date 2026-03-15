"use client";

import { useState } from "react";
import { type AutoReplyLog } from "@/lib/api";

type LogFilter = "all" | "ready" | "manually_posted" | "failed";

interface TabLogsProps {
  logs: AutoReplyLog[];
  onClearLogs: () => void;
  onDeleteLog: (logId: string) => void;
  onMarkPosted: (logId: string) => void;
  onBulkMarkPosted: (ids: Set<string>) => Promise<void>;
  onBulkDelete: (ids: Set<string>) => Promise<void>;
  markingId: string | null;
  copiedId: string | null;
  onCopy: (text: string, logId: string) => void;
}

export default function TabLogs({
  logs,
  onClearLogs,
  onDeleteLog,
  onMarkPosted,
  onBulkMarkPosted,
  onBulkDelete,
  markingId,
  copiedId,
  onCopy,
}: TabLogsProps) {
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [logSearch, setLogSearch] = useState("");
  const [logAccountFilter, setLogAccountFilter] = useState("");
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [bulkActioning, setBulkActioning] = useState(false);

  // ── Helper functions ──────────────────────────────────

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

  // ── Selection helpers ─────────────────────────────────

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

  // ── Bulk actions ──────────────────────────────────────

  async function handleBulkMarkPosted() {
    if (selectedLogIds.size === 0) return;
    setBulkActioning(true);
    await onBulkMarkPosted(selectedLogIds);
    setSelectedLogIds(new Set());
    setBulkActioning(false);
  }

  async function handleBulkDelete() {
    if (selectedLogIds.size === 0) return;
    setBulkActioning(true);
    await onBulkDelete(selectedLogIds);
    setSelectedLogIds(new Set());
    setBulkActioning(false);
  }

  // ── Computed values ───────────────────────────────────

  const uniqueAccounts = [...new Set(logs.map((l) => l.account).filter(Boolean))].sort();

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

  // ── Render ────────────────────────────────────────────

  return (
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
              onClick={onClearLogs}
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
                      onClick={() => onDeleteLog(log.id)}
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
                      onClick={() => onCopy(log.reply_text, log.id)}
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
                      onClick={() => onMarkPosted(log.id)}
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
  );
}
