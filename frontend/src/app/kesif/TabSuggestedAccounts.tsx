"use client";

import { useState, useEffect, useMemo } from "react";
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

type SortKey = "score" | "avg_engagement" | "followers" | "appearances";

/* ── Helpers ────────────────────────────────────────── */

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}dk once`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}sa once`;
  const days = Math.floor(hrs / 24);
  return `${days} gun once`;
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

/* ── Component ──────────────────────────────────────── */

export default function TabSuggestedAccounts() {
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // Sort & filter
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [filterText, setFilterText] = useState("");

  // Active search
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

  // Sorted + filtered accounts
  const displayAccounts = useMemo(() => {
    let list = [...accounts];

    // Filter by username
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter(a => a.username.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case "score": return b.score - a.score;
        case "avg_engagement": return b.avg_engagement - a.avg_engagement;
        case "followers": return b.followers - a.followers;
        case "appearances": return b.appearances - a.appearances;
        default: return 0;
      }
    });

    return list;
  }, [accounts, sortBy, filterText]);

  const maxScore = useMemo(() => Math.max(...accounts.map(a => a.score), 1), [accounts]);

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-[var(--text-secondary)]">
          {accounts.length} onerilen hesap
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="btn-secondary text-sm"
          >
            {showSearch ? "Aramayi Kapat" : "X&apos;te Ara"}
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

      {/* Active Search */}
      {showSearch && (
        <div className="glass-card p-4 space-y-3">
          <div className="text-xs font-medium text-[var(--text-secondary)]">X&apos;te Hesap Ara</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Anahtar kelime veya kullanici adi..."
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
            <div className="space-y-3 border-t border-[var(--border)] pt-3">
              <div className="text-xs text-[var(--text-secondary)]">{searchResults.length} sonuc</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchResults.map((user) => (
                  <div key={user.username} className="glass-card p-4 flex flex-col gap-3">
                    {/* Profile header */}
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[var(--accent-blue)]/20 flex items-center justify-center text-[var(--accent-blue)] font-bold text-sm shrink-0">
                        {user.username[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-[var(--text-primary)] truncate">@{user.username}</span>
                          {user.verified && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] shrink-0">✓</span>
                          )}
                        </div>
                        {user.display_name && (
                          <div className="text-[11px] text-[var(--text-secondary)] truncate">{user.display_name}</div>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-3 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20">
                        {formatFollowers(user.followers)} takipci
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                        {formatFollowers(user.following)} takip
                      </span>
                    </div>

                    {/* Bio */}
                    {user.bio && (
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{user.bio}</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-auto pt-2 border-t border-[var(--border)]">
                      <button
                        onClick={() => handleAccept(user.username, true)}
                        className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/30 border border-[var(--accent-amber)]/20 transition-colors"
                      >
                        Oncelikli
                      </button>
                      <button
                        onClick={() => handleAccept(user.username, false)}
                        className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30 border border-[var(--accent-blue)]/20 transition-colors"
                      >
                        Ekle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter & Sort bar */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Hesap filtrele..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="input-field text-sm flex-1 min-w-[150px]"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="input-field text-sm w-auto"
          >
            <option value="score">Skor</option>
            <option value="avg_engagement">Engagement</option>
            <option value="followers">Takipci</option>
            <option value="appearances">Gorulme</option>
          </select>
        </div>
      )}

      {/* Account Grid */}
      {displayAccounts.length === 0 && !showSearch ? (
        <div className="glass-card p-8 text-center text-[var(--text-secondary)]">
          {accounts.length === 0
            ? "Henuz onerilen hesap yok. Otomatik tarama verileri biriktikce yeni hesap onerileri burada gorunecek."
            : "Filtreye uyan hesap bulunamadi."}
          <br />
          <button onClick={() => setShowSearch(true)} className="text-[var(--accent-blue)] hover:underline mt-2 text-sm">
            X&apos;te ara ile hesap bul
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayAccounts.map((acc) => {
            const scoreRatio = acc.score / maxScore;
            const scoreColor = scoreRatio >= 0.7
              ? "var(--accent-green)"
              : scoreRatio >= 0.4
                ? "var(--accent-amber)"
                : "var(--accent-red)";

            return (
              <div key={acc.username} className="glass-card p-4 flex flex-col gap-3 group">
                {/* Username + Score */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[var(--accent-blue)]/20 flex items-center justify-center text-[var(--accent-blue)] font-bold text-sm shrink-0">
                      {acc.username[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-[var(--text-primary)] truncate block">@{acc.username}</span>
                      {acc.discovered_at && (
                        <span className="text-[10px] text-[var(--text-secondary)]">{relativeTime(acc.discovered_at)}</span>
                      )}
                    </div>
                  </div>
                  <div
                    className="text-lg font-bold shrink-0"
                    style={{ color: scoreColor }}
                    title={`Skor: ${acc.score.toFixed(0)}`}
                  >
                    {acc.score.toFixed(0)}
                  </div>
                </div>

                {/* Score bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(scoreRatio * 100, 100)}%`,
                      backgroundColor: scoreColor,
                    }}
                  />
                </div>

                {/* Stats badges */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20">
                    {acc.appearances}x goruldu
                  </span>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20">
                    Eng: {acc.avg_engagement.toFixed(0)}
                  </span>
                  {acc.followers > 0 && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20">
                      {formatFollowers(acc.followers)} takipci
                    </span>
                  )}
                </div>

                {/* Sample tweet */}
                {acc.sample_tweet && (
                  <div className="px-3 py-2 rounded bg-[var(--bg-secondary)] border-l-2 border-[var(--accent-blue)]/40">
                    <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 italic leading-relaxed">
                      &quot;{acc.sample_tweet}&quot;
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2 border-t border-[var(--border)]">
                  <button
                    onClick={() => handleAccept(acc.username, true)}
                    className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/30 border border-[var(--accent-amber)]/20 transition-colors"
                  >
                    Oncelikli
                  </button>
                  <button
                    onClick={() => handleAccept(acc.username, false)}
                    className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30 border border-[var(--accent-blue)]/20 transition-colors"
                  >
                    Ekle
                  </button>
                  <button
                    onClick={() => handleDismiss(acc.username)}
                    className="px-2 py-1.5 text-[11px] font-medium rounded bg-[var(--accent-red)]/20 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30 border border-[var(--accent-red)]/20 transition-colors"
                  >
                    Gec
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
