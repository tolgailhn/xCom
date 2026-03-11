"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  getDiscoveryConfig,
  getDiscoveryTweets,
  triggerDiscoveryScan,
  getDiscoveryStatus,
  clearDiscoveryCache,
  type DiscoveryConfig,
  type DiscoveryTweet,
  type DiscoveryStatus,
} from "@/lib/api";

import TabTweets from "./TabTweets";
import TabAyarlar from "./TabAyarlar";
import TabTrends from "./TabTrends";
import TabNews from "./TabNews";
import TabSuggestedAccounts from "./TabSuggestedAccounts";

/* ── Helpers ─────────────────────────────────────────── */

function timeAgo(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}sn`;
    if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
    return `${Math.floor(diff / 86400)}g`;
  } catch {
    return "";
  }
}

/* ── Main Component ──────────────────────────────────── */

export default function KesifPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"tweets" | "trendler" | "haberler" | "oneriler" | "ayarlar">("tweets");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "tweets" || t === "trendler" || t === "haberler" || t === "oneriler" || t === "ayarlar") setTab(t);
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

  const loadData = useCallback(async () => {
    try {
      const [configRes, tweetsRes, statusRes] = await Promise.all([
        getDiscoveryConfig(),
        getDiscoveryTweets(),
        getDiscoveryStatus(),
      ]);
      setConfig(configRes.config);
      setTweets(tweetsRes.tweets);
      setStatus(statusRes);
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
          <div className="card p-3 text-center">
            <div className="text-xl font-bold">{status.total_tweets}</div>
            <div className="text-xs text-[var(--text-secondary)]">Tweet</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold">{status.priority_count + status.normal_count}</div>
            <div className="text-xs text-[var(--text-secondary)]">Hesap</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-[var(--accent-amber)]">{status.priority_count}</div>
            <div className="text-xs text-[var(--text-secondary)]">Oncelikli</div>
          </div>
          <div className="card p-3 text-center">
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

      {/* Rotation Info */}
      {status?.last_scanned_per_account && Object.keys(status.last_scanned_per_account).length > 0 && (
        <div className="card p-3">
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
          { key: "tweets", label: `Tweetler (${tweets.length})` },
          { key: "trendler", label: "Trendler" },
          { key: "haberler", label: "Haberler" },
          { key: "oneriler", label: "Onerilen Hesaplar" },
          { key: "ayarlar", label: "Ayarlar" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${tab === t.key ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
          >
            {t.label}
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
      {tab === "haberler" && <TabNews />}
      {tab === "oneriler" && <TabSuggestedAccounts />}
    </div>
  );
}
