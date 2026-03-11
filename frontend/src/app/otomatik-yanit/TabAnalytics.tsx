"use client";

import { type AutoReplyLog, type SelfReplyLog } from "@/lib/api";

interface TabAnalyticsProps {
  logs: AutoReplyLog[];
  selfLogs: SelfReplyLog[];
}

export default function TabAnalytics({ logs, selfLogs }: TabAnalyticsProps) {
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

  // Hourly heatmap
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
