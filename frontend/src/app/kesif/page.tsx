"use client";

import { useState, useEffect, useCallback } from "react";
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
import TabSmartSuggestions from "./TabSmartSuggestions";

/* ── Helpers ─────────────────────────────────────────── */

function timeAgo(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    const absDiff = Math.abs(diffSec);
    if (absDiff < 60) return `${absDiff}sn`;
    if (absDiff < 3600) return `${Math.floor(absDiff / 60)}dk`;
    if (absDiff < 86400) return `${Math.floor(absDiff / 3600)}sa`;
    return `${Math.floor(absDiff / 86400)}g`;
  } catch {
    return "";
  }
}

/* ── Main Component ──────────────────────────────────── */

export default function KesifPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"tweets" | "trendler" | "oneriler" | "akilli" | "ayarlar">("tweets");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "tweets" || t === "trendler" || t === "oneriler" || t === "akilli" || t === "ayarlar") setTab(t);
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
      setStatus(statusRes);
      setSchedulerJobs(schedRes.jobs || []);
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
        .then(res => setSchedulerJobs(res.jobs || []))
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
          <h1 className="text-2xl font-bold">Hesap Kesfi</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Takip edilen hesaplarin en iyi tweetleri &middot; Arsiv
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="btn-primary text-sm"
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

      {/* Status bar */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-3 text-center">
            <div className="text-xl font-bold">{status.total_tweets}</div>
            <div className="text-xs text-[var(--text-secondary)]">Tweet</div>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="text-xl font-bold">{status.priority_count + status.normal_count}</div>
            <div className="text-xs text-[var(--text-secondary)]">Hesap</div>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="text-xl font-bold text-[var(--accent-amber)]">{status.priority_count}</div>
            <div className="text-xs text-[var(--text-secondary)]">Oncelikli</div>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="text-xs font-medium">{status.last_scan ? timeAgo(status.last_scan) + " once" : "Henuz yok"}</div>
            <div className="text-xs text-[var(--text-secondary)]">Son Tarama</div>
            {nextScanSec != null && nextScanSec > 0 ? (
              <div className="mt-1 text-xs font-medium text-[var(--accent-green)]">
                &#9201; {Math.floor(nextScanSec / 60)}:{String(nextScanSec % 60).padStart(2, "0")} sonra
              </div>
            ) : status.enabled ? (
              <div className="mt-1 text-xs text-[var(--accent-green)]">Tarama aktif</div>
            ) : null}
          </div>
        </div>
      )}

      {/* Scheduler Worker Status */}
      {schedulerJobs.length > 0 && (() => {
        const JOB_LABELS: Record<string, string> = {
          auto_topic_scanner: "Konu Tarama",
          trend_analyzer: "Trend Analiz",
          account_discoverer: "Hesap Kesfi",
          auto_content_suggester: "Akilli Oneriler",
          discovery_checker: "Hesap Rotasyon",
        };
        const relevantJobs = schedulerJobs.filter((j: { id: string }) => JOB_LABELS[j.id]);
        if (!relevantJobs.length) return null;
        return (
          <div className="glass-card p-3">
            <div className="text-xs font-medium mb-2 text-[var(--text-secondary)]">
              Otomatik Tarama Durumlari
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {relevantJobs.map((job: { id: string; last_run: string | null; next_run: string | null }) => (
                <div key={job.id} className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded bg-[var(--bg-secondary)]">
                  <span className="text-[10px] font-medium">{JOB_LABELS[job.id]}</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {job.last_run ? `Son: ${timeAgo(job.last_run)}` : "Henuz calismadi"}
                  </span>
                  {job.next_run && (
                    <span className="text-[10px] text-[var(--accent-green)]">
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

      {/* Rotation Info */}
      {status?.last_scanned_per_account && Object.keys(status.last_scanned_per_account).length > 0 && (
        <div className="glass-card p-3">
          <div className="text-xs font-medium mb-2 text-[var(--text-secondary)]">
            Rotasyon &mdash; {status.scan_mode || "30dk batch"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(status.last_scanned_per_account)
              .sort(([, a], [, b]) => a.localeCompare(b))
              .map(([account, lastScan]) => (
                <span key={account} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[10px]">
                  <span className="font-medium">@{account}</span>
                  <span className="text-[var(--text-secondary)]">{timeAgo(lastScan)}</span>
                </span>
              ))
            }
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)] pb-2 overflow-x-auto">
        {([
          { key: "tweets", label: `Tweetler (${tweets.length})`, icon: "\uD83D\uDCDD" },
          { key: "trendler", label: "Trendler", icon: "\uD83D\uDCC8" },
          { key: "oneriler", label: "Hesaplar", icon: "\uD83D\uDC65" },
          { key: "akilli", label: "Oneriler", icon: "\uD83D\uDCA1" },
          { key: "ayarlar", label: "Ayarlar", icon: "\u2699\uFE0F" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${tab === t.key ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
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
        />
      )}

      {tab === "trendler" && <TabTrends />}

      {tab === "oneriler" && <TabSuggestedAccounts />}
      {tab === "akilli" && <TabSmartSuggestions />}
    </div>
  );
}
