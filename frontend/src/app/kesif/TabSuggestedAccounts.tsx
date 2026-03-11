"use client";

import { useState, useEffect } from "react";
import {
  getSuggestedAccounts,
  acceptSuggestedAccount,
  dismissSuggestedAccount,
  triggerAccountDiscovery,
  searchAccounts,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

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

interface SearchResult {
  username: string;
  display_name: string;
  followers: number;
  following: number;
  bio: string;
  verified: boolean;
  profile_image: string;
}

/* ── Component ──────────────────────────────────────── */

export default function TabSuggestedAccounts() {
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // Active search (Faz 9)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const loadAccounts = async () => {
    try {
      const data = await getSuggestedAccounts();
      setAccounts(data.accounts || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAccounts(); }, []);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      await triggerAccountDiscovery();
      await loadAccounts();
    } catch { /* ignore */ }
    finally { setDiscovering(false); }
  };

  const handleAccept = async (username: string, isPriority: boolean) => {
    try {
      await acceptSuggestedAccount(username, isPriority);
      setActionMsg(`@${username} izleme listesine eklendi!`);
      await loadAccounts();
      // Also remove from search results
      setSearchResults(prev => prev.filter(r => r.username.toLowerCase() !== username.toLowerCase()));
      setTimeout(() => setActionMsg(""), 3000);
    } catch {
      setActionMsg("Hata olustu");
    }
  };

  const handleDismiss = async (username: string) => {
    try {
      await dismissSuggestedAccount(username);
      await loadAccounts();
    } catch { /* ignore */ }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await searchAccounts(searchQuery.trim());
      setSearchResults(data.accounts || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {accounts.length} onerilen hesap
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="btn-secondary text-sm"
          >
            {showSearch ? "Aramayı Kapat" : "X'te Ara"}
          </button>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="btn-primary text-sm"
          >
            {discovering ? "Kesfediliyor..." : "Hesap Kesfet"}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="p-2 rounded bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-sm text-[var(--accent-green)]">
          {actionMsg}
        </div>
      )}

      {/* Active Search (Faz 9) */}
      {showSearch && (
        <div className="card p-4 space-y-3">
          <div className="text-xs font-medium text-[var(--text-secondary)]">X&apos;te Hesap Ara</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Anahtar kelime veya kullanıcı adı..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="input-field text-sm flex-1"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="btn-primary text-sm"
            >
              {searching ? "Araniyor..." : "Ara"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 border-t border-[var(--border)] pt-3">
              <div className="text-xs text-[var(--text-secondary)]">{searchResults.length} sonuc</div>
              {searchResults.map((user) => (
                <div key={user.username} className="flex items-start justify-between gap-3 p-3 rounded bg-[var(--bg-secondary)]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[var(--accent-blue)]">@{user.username}</span>
                      {user.display_name && (
                        <span className="text-xs text-[var(--text-secondary)]">{user.display_name}</span>
                      )}
                      {user.verified && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]">✓</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex gap-3 text-[10px] text-[var(--text-secondary)]">
                      <span>{(user.followers / 1000).toFixed(1)}K takipci</span>
                      <span>{(user.following / 1000).toFixed(1)}K takip</span>
                    </div>
                    {user.bio && (
                      <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{user.bio}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAccept(user.username, true)}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/30"
                    >
                      Oncelikli
                    </button>
                    <button
                      onClick={() => handleAccept(user.username, false)}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30"
                    >
                      Ekle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggested accounts (auto-discovered) */}
      {accounts.length === 0 && !showSearch ? (
        <div className="card p-8 text-center text-[var(--text-secondary)]">
          Henuz onerilen hesap yok. Otomatik tarama verileri biriktikce yeni hesap onerileri burada gorunecek.
          <br />
          <button onClick={() => setShowSearch(true)} className="text-[var(--accent-blue)] hover:underline mt-2 text-sm">
            X&apos;te ara ile hesap bul
          </button>
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
                  >
                    Oncelikli
                  </button>
                  <button
                    onClick={() => handleAccept(acc.username, false)}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30"
                  >
                    Ekle
                  </button>
                  <button
                    onClick={() => handleDismiss(acc.username)}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent-red)]/20 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30"
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
