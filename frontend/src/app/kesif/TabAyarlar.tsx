"use client";

import { useState } from "react";
import {
  updateDiscoveryConfig,
  triggerDiscoveryScan,
  addDiscoveryAccount,
  removeDiscoveryAccount,
  type DiscoveryConfig,
  type DiscoveryStatus,
} from "@/lib/api";

function timeAgo(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}sn`;
    if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
    return `${Math.floor(diff / 86400)}g`;
  } catch { return ""; }
}

export interface TabAyarlarProps {
  config: DiscoveryConfig;
  setConfig: (c: DiscoveryConfig) => void;
  newAccount: string;
  setNewAccount: (s: string) => void;
  newAccountPriority: boolean;
  setNewAccountPriority: (b: boolean) => void;
  onClear: () => Promise<void>;
  status: DiscoveryStatus | null;
  onScanDone: () => Promise<void>;
}

export default function TabAyarlar({
  config,
  setConfig,
  newAccount,
  setNewAccount,
  newAccountPriority,
  setNewAccountPriority,
  onClear,
  status,
  onScanDone,
}: TabAyarlarProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedForScan, setSelectedForScan] = useState<Set<string>>(new Set());
  const [manualScanning, setManualScanning] = useState(false);
  const [manualScanMsg, setManualScanMsg] = useState("");

  const toggleScanAccount = (account: string) => {
    setSelectedForScan(prev => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });
  };

  const selectAllForScan = () => {
    const all = [...config.priority_accounts, ...config.normal_accounts];
    setSelectedForScan(new Set(all));
  };

  const handleManualScan = async () => {
    if (selectedForScan.size === 0) return;
    setManualScanning(true);
    setManualScanMsg("");
    try {
      const result = await triggerDiscoveryScan([...selectedForScan]);
      setManualScanMsg(result.message);
      setSelectedForScan(new Set());
      await onScanDone();
    } catch (e) {
      setManualScanMsg(e instanceof Error ? e.message : "Tarama hatasi");
    } finally {
      setManualScanning(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDiscoveryConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const username = newAccount.trim().replace("@", "");
    if (!username) return;
    try {
      const result = await addDiscoveryAccount(username, newAccountPriority);
      setConfig(result.config);
      setNewAccount("");
    } catch {
      // ignore
    }
  };

  const handleRemove = async (username: string) => {
    try {
      const result = await removeDiscoveryAccount(username);
      setConfig(result.config);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Otomatik Tarama</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Her 30 dakikada 3 hesap rotasyonla taranir &middot; Gunluk ~7 tarama/hesap
            </p>
          </div>
          <button
            onClick={() => {
              const updated = { ...config, enabled: !config.enabled };
              setConfig(updated);
              updateDiscoveryConfig(updated);
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${config.enabled ? "bg-[var(--accent-green)]" : "bg-[var(--border)]"}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${config.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Baslangic Saati (Tarama bu saatten itibaren calisir)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={config.work_hour_start}
              onChange={e => setConfig({ ...config, work_hour_start: parseInt(e.target.value) || 8 })}
              className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Bitis Saati (Bu saatten sonra tarama duraklar)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={config.work_hour_end}
              onChange={e => setConfig({ ...config, work_hour_end: parseInt(e.target.value) || 23 })}
              className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full mt-1"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? "Kaydediliyor..." : saved ? "Kaydedildi!" : "Kaydet"}
          </button>
          <button onClick={onClear} className="btn-secondary text-sm text-[var(--accent-red)]">
            Cache Temizle
          </button>
        </div>
      </div>

      {/* Rotation Status + Manual Scan */}
      <div className="card p-4 space-y-4">
        <div>
          <h3 className="font-semibold">Tarama Durumu ve Manuel Tarama</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Hesaplara tiklayarak sec, &quot;Secilenleri Tara&quot; ile sadece onlari tara
          </p>
        </div>

        {/* Account grid with rotation info */}
        <div className="space-y-2">
          {[...config.priority_accounts, ...config.normal_accounts].map(account => {
            const acLower = account.toLowerCase();
            const lastScan = status?.last_scanned_per_account?.[acLower];
            const tweetCount = status?.account_counts?.[account] || status?.account_counts?.[acLower] || 0;
            const isSelected = selectedForScan.has(account);
            const isPriority = config.priority_accounts.includes(account);

            return (
              <button
                key={account}
                onClick={() => toggleScanAccount(account)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors text-left ${
                  isSelected
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                    : "border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-secondary)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                    isSelected ? "bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white" : "border-[var(--border)]"
                  }`}>
                    {isSelected && "✓"}
                  </div>
                  <span className="text-sm font-medium">@{account}</span>
                  {isPriority && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]">
                      oncelikli
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
                  <span>{tweetCount} tweet</span>
                  <span>{lastScan ? timeAgo(lastScan) + " once" : "henuz taranmadi"}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Scan actions */}
        <div className="flex gap-2 items-center">
          <button
            onClick={handleManualScan}
            disabled={selectedForScan.size === 0 || manualScanning}
            className="btn-primary text-sm disabled:opacity-40"
          >
            {manualScanning ? "Taraniyor..." : `Secilenleri Tara (${selectedForScan.size})`}
          </button>
          <button onClick={selectAllForScan} className="btn-secondary text-xs">
            Tumunu Sec
          </button>
          {selectedForScan.size > 0 && (
            <button onClick={() => setSelectedForScan(new Set())} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Temizle
            </button>
          )}
        </div>

        {manualScanMsg && (
          <div className="p-2 rounded bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 text-xs text-[var(--accent-blue)]">
            {manualScanMsg}
          </div>
        )}
      </div>

      {/* Add account */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold">Hesap Ekle</h3>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newAccount}
            onChange={e => setNewAccount(e.target.value)}
            placeholder="@kullaniciadi"
            className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm flex-1"
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] shrink-0">
            <input
              type="checkbox"
              checked={newAccountPriority}
              onChange={e => setNewAccountPriority(e.target.checked)}
              className="rounded"
            />
            Oncelikli
          </label>
          <button onClick={handleAdd} className="btn-primary text-sm shrink-0">Ekle</button>
        </div>
      </div>

      {/* Priority accounts */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-[var(--accent-amber)]">Oncelikli Hesaplar ({config.priority_accounts.length})</h3>
        <div className="flex flex-wrap gap-2">
          {config.priority_accounts.map(a => (
            <div key={a} className="flex items-center gap-1 bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 rounded-full px-3 py-1 text-xs">
              <span>@{a}</span>
              <button onClick={() => handleRemove(a)} className="text-[var(--accent-red)] hover:opacity-75 ml-1">&times;</button>
            </div>
          ))}
          {config.priority_accounts.length === 0 && (
            <span className="text-xs text-[var(--text-secondary)]">Henuz oncelikli hesap yok</span>
          )}
        </div>
      </div>

      {/* Normal accounts */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold">Normal Hesaplar ({config.normal_accounts.length})</h3>
        <div className="flex flex-wrap gap-2">
          {config.normal_accounts.map(a => (
            <div key={a} className="flex items-center gap-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full px-3 py-1 text-xs">
              <span>@{a}</span>
              <button onClick={() => handleRemove(a)} className="text-[var(--accent-red)] hover:opacity-75 ml-1">&times;</button>
            </div>
          ))}
          {config.normal_accounts.length === 0 && (
            <span className="text-xs text-[var(--text-secondary)]">Henuz normal hesap yok</span>
          )}
        </div>
      </div>
    </div>
  );
}
