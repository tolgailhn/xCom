"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  getDiscoveryConfig,
  getDiscoveryTweets,
  triggerDiscoveryScan,
  getDiscoveryStatus,
  clearDiscoveryCache,
  getSchedulerStatus,
  type DiscoveryConfig,
  type DiscoveryTweet,
  type DiscoveryStatus,
} from "@/lib/api";

import TabTweets from "./TabTweets";
import TabAyarlar from "./TabAyarlar";
import TabTrends from "./TabTrends";

import TabSuggestedAccounts from "./TabSuggestedAccounts";
import TabAIOnerileri from "./TabAIOnerileri";
import { timeAgo } from "@/components/discovery";

/* ── Main Component ──────────────────────────────────── */

export default function KesifPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"ai-onerileri" | "tweets" | "trendler" | "oneriler" | "ayarlar">("ai-onerileri");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "ai-onerileri" || t === "tweets" || t === "trendler" || t === "oneriler" || t === "ayarlar") setTab(t);
  }, [searchParams]);

  const [config, setConfig] = useState<DiscoveryConfig | null>(null);
  const [tweets, setTweets] = useState<DiscoveryTweet[]>([]);
  const [status, setStatus] = useState<DiscoveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [nextScanSec, setNextScanSec] = useState<number | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [newAccountPriority, setNewAccountPriority] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schedulerJobs, setSchedulerJobs] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rotationInfo, setRotationInfo] = useState<any>(null);
  const [allAccounts, setAllAccounts] = useState<string[]>([]);

  // Auto-refresh triggers per tab
  const [refreshTriggers, setRefreshTriggers] = useState<Record<string, number>>({
    "ai-onerileri": 0,
    tweets: 0,
    trendler: 0,
    oneriler: 0,
  });
  const [lastRefreshTimes, setLastRefreshTimes] = useState<Record<string, number>>({
    "ai-onerileri": Date.now(),
    tweets: Date.now(),
    trendler: Date.now(),
    oneriler: Date.now(),
  });
  const [lastRefreshLabel, setLastRefreshLabel] = useState("Simdi");
  const labelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [configRes, tweetsRes, statusRes, schedRes] = await Promise.all([
        getDiscoveryConfig(),
        getDiscoveryTweets(),
        getDiscoveryStatus(),
        getSchedulerStatus().catch(() => ({ jobs: [] })),
      ]);
      setConfig(configRes.config);
      setTweets(tweetsRes.tweets);
      if (tweetsRes.all_accounts) setAllAccounts(tweetsRes.all_accounts);
      setStatus(statusRes);
      setSchedulerJobs(schedRes.jobs || []);
      if (schedRes.rotation) setRotationInfo(schedRes.rotation);
      if (statusRes.next_scan_seconds != null) {
        setNextScanSec(statusRes.next_scan_seconds);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Periodic scheduler status refresh (every 60s)
  useEffect(() => {
    const interval = setInterval(() => {
      getSchedulerStatus()
        .then(res => {
          setSchedulerJobs(res.jobs || []);
          if (res.rotation) setRotationInfo(res.rotation);
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (nextScanSec == null || nextScanSec <= 0) return;
    const interval = setInterval(() => {
      setNextScanSec((prev) => {
        if (prev == null || prev <= 1) {
          clearInterval(interval);
          loadData();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [nextScanSec, loadData]);

  // Auto-refresh intervals per tab
  useEffect(() => {
    const INTERVALS: Record<string, number> = {
      "ai-onerileri": 600_000, // 10 min
      tweets: 300_000,    // 5 min
      trendler: 600_000,  // 10 min
      oneriler: 1_800_000, // 30 min
    };

    const timers = Object.entries(INTERVALS).map(([key, ms]) =>
      setInterval(() => {
        setRefreshTriggers(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
        setLastRefreshTimes(prev => ({ ...prev, [key]: Date.now() }));
      }, ms),
    );

    return () => timers.forEach(clearInterval);
  }, []);

  // When tweets refreshTrigger changes, reload main data (tweets come from parent)
  useEffect(() => {
    if (refreshTriggers.tweets > 0) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTriggers.tweets]);

  // Update "Son guncelleme" label every 30s
  useEffect(() => {
    const updateLabel = () => {
      // Find the most recent refresh across all tabs
      const times = Object.values(lastRefreshTimes);
      const mostRecent = Math.max(...times);
      const diffMs = Date.now() - mostRecent;
      const diffMin = Math.floor(diffMs / 60_000);
      if (diffMin < 1) setLastRefreshLabel("Simdi");
      else if (diffMin < 60) setLastRefreshLabel(`${diffMin}dk once`);
      else setLastRefreshLabel(`${Math.floor(diffMin / 60)}sa once`);
    };
    updateLabel();
    labelIntervalRef.current = setInterval(updateLabel, 30_000);
    return () => {
      if (labelIntervalRef.current) clearInterval(labelIntervalRef.current);
    };
  }, [lastRefreshTimes]);

  const handleScan = async () => {
    setScanning(true);
    setScanMsg("");
    try {
      const result = await triggerDiscoveryScan();
      setScanMsg(result.message);
      await loadData();
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : "Tarama hatasi");
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] bg-clip-text text-transparent">
            Hesap Kesfi
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Takip edilen hesaplarin en iyi tweetleri &middot; Trend analiz &middot; Akilli oneriler
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-2.5 py-1 rounded-full">
            Son guncelleme: {lastRefreshLabel}
          </span>
          <button
            onClick={handleScan}
            disabled={scanning}
            className={`btn-primary text-sm ${scanning ? "animate-pulse" : ""}`}
          >
            {scanning ? "Taraniyor..." : "Simdi Tara"}
          </button>
        </div>
      </div>

      {scanMsg && (
        <div className="p-3 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 text-sm text-[var(--accent-blue)]">
          {scanMsg}
        </div>
      )}

      {/* Status bar — Modern stat cards with gradient accents */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-3.5 text-center group hover:shadow-lg transition-all duration-300" style={{ borderTop: "2px solid var(--accent-blue)" }}>
            <div className="text-2xl font-extrabold text-[var(--text-primary)]">{status.total_tweets}</div>
            <div className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mt-0.5">Tweet</div>
          </div>
          <div className="glass-card p-3.5 text-center group hover:shadow-lg transition-all duration-300" style={{ borderTop: "2px solid var(--accent-purple)" }}>
            <div className="text-2xl font-extrabold text-[var(--text-primary)]">{status.priority_count + status.normal_count}</div>
            <div className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mt-0.5">Hesap</div>
          </div>
          <div className="glass-card p-3.5 text-center group hover:shadow-lg transition-all duration-300" style={{ borderTop: "2px solid var(--accent-amber)" }}>
            <div className="text-2xl font-extrabold text-[var(--accent-amber)]">{status.priority_count}</div>
            <div className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mt-0.5">Oncelikli</div>
          </div>
          <div className="glass-card p-3.5 text-center group hover:shadow-lg transition-all duration-300" style={{ borderTop: "2px solid var(--accent-green)" }}>
            <div className="text-sm font-bold text-[var(--text-primary)]">{status.last_scan ? timeAgo(status.last_scan) + " once" : "Henuz yok"}</div>
            <div className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mt-0.5">Son Tarama</div>
            {nextScanSec != null && nextScanSec > 0 ? (
              <div className="mt-1.5 text-xs font-bold text-[var(--accent-green)] animate-pulse">
                {Math.floor(nextScanSec / 60)}:{String(nextScanSec % 60).padStart(2, "0")} sonra
              </div>
            ) : status.enabled ? (
              <div className="mt-1.5 text-[10px] font-medium text-[var(--accent-green)]">Tarama aktif</div>
            ) : null}
          </div>
        </div>
      )}

      {/* Scheduler Worker Status */}
      {schedulerJobs.length > 0 && (() => {
        const JOB_LABELS: Record<string, string> = {
          auto_topic_scanner: "Konu Tarama (45dk)",
          trend_analyzer: "Trend Analiz (20dk)",
          account_discoverer: "Hesap Kesfi (3sa)",
          auto_content_suggester: "AI Kumeleme (15dk)",
          discovery_checker: "Hesap Rotasyon (20dk)",
          ai_scorer: "AI Skorlama (30dk)",
        };
        const relevantJobs = schedulerJobs.filter((j: { id: string }) => JOB_LABELS[j.id]);
        if (!relevantJobs.length) return null;
        return (
          <div className="glass-card p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] animate-pulse" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">Otomatik Tarama Durumlari</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {relevantJobs.map((job: { id: string; last_run: string | null; next_run: string | null }) => (
                <div key={job.id} className="flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-lg bg-[var(--bg-secondary)]/60 border border-[var(--border)]/50 hover:border-[var(--accent-blue)]/30 transition-colors">
                  <span className="text-[10px] font-semibold text-[var(--text-primary)]">{JOB_LABELS[job.id]}</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {job.last_run ? `Son: ${timeAgo(job.last_run)}` : "Henuz calismadi"}
                  </span>
                  {job.next_run && (
                    <span className="text-[10px] font-medium text-[var(--accent-green)]">
                      Sonraki: {timeAgo(job.next_run).includes("g") ? timeAgo(job.next_run) : (() => {
                        try {
                          const d = new Date(job.next_run);
                          return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
                        } catch { return ""; }
                      })()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Rotation Info — Detaylı hesap tarama durumu */}
      {rotationInfo && rotationInfo.accounts?.length > 0 && (
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Rotasyon &mdash; batch ({rotationInfo.interval_minutes}dk, {rotationInfo.batch_size} hesap/tur)
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
              <span>{rotationInfo.total_accounts} hesap</span>
              <span>Tam tur: ~{rotationInfo.full_rotation_minutes}dk</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rotationInfo.accounts
              .sort((a: { last_scanned: string | null }, b: { last_scanned: string | null }) => {
                if (!a.last_scanned && !b.last_scanned) return 0;
                if (!a.last_scanned) return 1;
                if (!b.last_scanned) return -1;
                return a.last_scanned.localeCompare(b.last_scanned);
              })
              .map((acc: { username: string; last_scanned: string | null; is_priority: boolean }) => (
                <span
                  key={acc.username}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
                    acc.is_priority
                      ? "bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30"
                      : "bg-[var(--bg-secondary)]"
                  }`}
                >
                  <span className="font-medium">@{acc.username}</span>
                  <span className="text-[var(--text-secondary)]">
                    {acc.last_scanned ? timeAgo(acc.last_scanned) : "bekliyor"}
                  </span>
                </span>
              ))
            }
          </div>
        </div>
      )}

      {/* Tabs — Modern pill-style navigation */}
      <div className="flex gap-1.5 bg-[var(--bg-secondary)]/60 backdrop-blur-sm rounded-full p-1.5 border border-[var(--border)]/50 overflow-x-auto">
        {([
          { key: "ai-onerileri", label: "AI Onerileri", icon: "\uD83E\uDD16" },
          { key: "tweets", label: `Tweetler (${tweets.length})`, icon: "\uD83D\uDCDD" },
          { key: "trendler", label: "Trendler", icon: "\uD83D\uDCC8" },
          { key: "oneriler", label: "Onerilen Hesaplar", icon: "\uD83D\uDC65" },
          { key: "ayarlar", label: "Ayarlar", icon: "\u2699\uFE0F" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold rounded-full transition-all duration-300 whitespace-nowrap ${
              tab === t.key
                ? "bg-[var(--accent-blue)] text-white shadow-[0_0_12px_var(--accent-blue)/30]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "ayarlar" && config && (
        <TabAyarlar
          config={config}
          setConfig={setConfig}
          newAccount={newAccount}
          setNewAccount={setNewAccount}
          newAccountPriority={newAccountPriority}
          setNewAccountPriority={setNewAccountPriority}
          onClear={async () => { await clearDiscoveryCache(); await loadData(); }}
          status={status}
          onScanDone={loadData}
        />
      )}

      {tab === "tweets" && (
        <TabTweets
          tweets={tweets}
          setTweets={setTweets}
          status={status}
          allAccounts={allAccounts}
        />
      )}

      {tab === "trendler" && <TabTrends refreshTrigger={refreshTriggers.trendler} />}

      {tab === "ai-onerileri" && <TabAIOnerileri refreshTrigger={refreshTriggers["ai-onerileri"]} />}
      {tab === "oneriler" && <TabSuggestedAccounts refreshTrigger={refreshTriggers.oneriler} />}
    </div>
  );
}
