"use client";

import { useState, useEffect } from "react";
import {
  getSuggestedAccounts,
  acceptSuggestedAccount,
  dismissSuggestedAccount,
  triggerAccountDiscovery,
} from "@/lib/api";

interface SuggestedAccount {
  username: string;
  appearances: number;
  avg_engagement: number;
  total_engagement: number;
  followers: number;
  score: number;
  sample_tweet: string;
  discovered_at: string;
}

export default function TabSuggestedAccounts() {
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const loadAccounts = async () => {
    try {
      const data = await getSuggestedAccounts();
      setAccounts(data.accounts || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      await triggerAccountDiscovery();
      await loadAccounts();
    } catch {
      // ignore
    } finally {
      setDiscovering(false);
    }
  };

  const handleAccept = async (username: string, isPriority: boolean) => {
    try {
      await acceptSuggestedAccount(username, isPriority);
      setActionMsg(`@${username} izleme listesine eklendi!`);
      await loadAccounts();
    } catch {
      setActionMsg("Hata olustu");
    }
  };

  const handleDismiss = async (username: string) => {
    try {
      await dismissSuggestedAccount(username);
      await loadAccounts();
    } catch {
      // ignore
    }
  };

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {accounts.length} onerilen hesap
        </div>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className="btn-primary text-sm"
        >
          {discovering ? "Kesfediliyor..." : "Hesap Kesfet"}
        </button>
      </div>

      {actionMsg && (
        <div className="p-2 rounded bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-sm text-[var(--accent-green)]">
          {actionMsg}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-secondary)]">
          Henuz onerilen hesap yok. Otomatik tarama verileri biriktikce yeni hesap onerileri burada gorunecek.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <div key={acc.username} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--accent-blue)]">@{acc.username}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] font-medium">
                      Skor: {acc.score.toFixed(0)}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-[var(--text-secondary)]">
                    <span>{acc.appearances}x goruldu</span>
                    <span>Ort. eng: {acc.avg_engagement.toFixed(0)}</span>
                    {acc.followers > 0 && <span>{(acc.followers / 1000).toFixed(1)}K takipci</span>}
                  </div>
                  {acc.sample_tweet && (
                    <p className="mt-2 text-xs text-[var(--text-secondary)] line-clamp-2 italic">
                      &quot;{acc.sample_tweet}&quot;
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAccept(acc.username, true)}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/30"
                    title="Oncelikli olarak ekle"
                  >
                    Oncelikli
                  </button>
                  <button
                    onClick={() => handleAccept(acc.username, false)}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30"
                    title="Normal olarak ekle"
                  >
                    Ekle
                  </button>
                  <button
                    onClick={() => handleDismiss(acc.username)}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent-red)]/20 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30"
                    title="Reddet"
                  >
                    Gec
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
