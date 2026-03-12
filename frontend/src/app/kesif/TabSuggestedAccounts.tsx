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

type SortKey = "score" | "avg_engagement" | "followers" | "appearances" | "date";

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

function scoreColor(score: number): string {
  if (score >= 70) return "var(--accent-green)";
  if (score >= 40) return "var(--accent-amber)";
  return "var(--text-secondary)";
}

/* ── Circular Score Gauge ─────────────────────────── */

function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score);
  const dashArray = `${(Math.min(score, 100) / 100) * 88} 88`;
  return (
    <div
      className="relative w-11 h-11 flex items-center justify-center shrink-0"
      title={`Hesap skoru: aktiflik, engagement ve takipci kalitesine gore (${score.toFixed(0)}/100)`}
    >
      <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="14" fill="none" stroke="var(--bg-secondary)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="14" fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={dashArray}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <span
        className="absolute text-[10px] font-black"
        style={{ color }}
      >
        {score.toFixed(0)}
      </span>
    </div>
  );
}

/* ── Category Helper ───────────────────────────────── */

function getAccountCategory(account: SuggestedAccount): { label: string; color: string } {
  const bio = (account.sample_tweet || '').toLowerCase();
  if (/researcher|professor|phd|scientist|lab\b/i.test(bio)) return { label: 'Arastirmaci', color: 'var(--accent-purple)' };
  if (/founder|ceo|cto|co-founder/i.test(bio)) return { label: 'Kurucu', color: 'var(--accent-green)' };
  if (/engineer|developer|dev\b|coding|programmer/i.test(bio)) return { label: 'Gelistirici', color: 'var(--accent-blue)' };
  if (/journalist|reporter|editor|writer/i.test(bio)) return { label: 'Gazeteci', color: 'var(--accent-amber)' };
  return { label: 'AI Icerik', color: 'var(--text-secondary)' };
}

/* ── Component ──────────────────────────────────────── */

export default function TabSuggestedAccounts({ refreshTrigger }: { refreshTrigger?: number }) {
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // Batch selection
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

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

  useEffect(() => { loadAccounts(); }, [refreshTrigger]);

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
      setSelectedAccounts(prev => { const next = new Set(prev); next.delete(username); return next; });
      await loadAccounts();
    } catch { /* ignore */ }
  };

  const toggleSelect = (username: string) => {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const handleBatchAccept = async () => {
    for (const username of selectedAccounts) {
      try { await acceptSuggestedAccount(username, false); } catch { /* ignore */ }
    }
    setSelectedAccounts(new Set());
    setActionMsg(`${selectedAccounts.size} hesap eklendi!`);
    await loadAccounts();
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleBatchDismiss = async () => {
    for (const username of selectedAccounts) {
      try { await dismissSuggestedAccount(username); } catch { /* ignore */ }
    }
    setSelectedAccounts(new Set());
    await loadAccounts();
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
        case "date": return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
        default: return 0;
      }
    });

    return list;
  }, [accounts, sortBy, filterText]);

  const highScoreCount = useMemo(() => accounts.filter(a => a.score >= 70).length, [accounts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[var(--accent-blue)]/30 border-t-[var(--accent-blue)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header with Stats ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium">
            {accounts.length} hesap
          </span>
          {highScoreCount > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-medium">
              {highScoreCount} yuksek skor
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/40 hover:bg-[var(--accent-blue)]/5 transition-all duration-200"
          >
            {showSearch ? "Aramayi Kapat" : "X'te Ara"}
          </button>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            {discovering ? "Kesfediliyor..." : "Hesap Kesfet"}
          </button>
        </div>
      </div>

      {/* ── Batch Actions ── */}
      {selectedAccounts.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30">
          <span className="text-xs font-medium text-[var(--accent-blue)]">{selectedAccounts.size} hesap secildi</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleBatchAccept}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:border-[var(--accent-green)]/60 transition-all"
            >
              Secilenleri Ekle
            </button>
            <button
              onClick={handleBatchDismiss}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 border border-[var(--border)] transition-all"
            >
              Secilenleri Gec
            </button>
            <button
              onClick={() => setSelectedAccounts(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            >
              Temizle
            </button>
          </div>
        </div>
      )}

      {/* ── Action Message ── */}
      {actionMsg && (
        <div className="p-3 rounded-lg bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-sm text-[var(--accent-green)] flex items-center gap-2">
          <span className="text-base">&#10003;</span>
          {actionMsg}
        </div>
      )}

      {/* ── Active Search Section ── */}
      {showSearch && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-blue)]/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">X&apos;te Hesap Ara</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <input
                type="text"
                placeholder="Anahtar kelime veya kullanici adi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="input-field text-sm w-full pl-9 focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-blue)] text-white hover:opacity-90 disabled:opacity-40 transition-all duration-200"
            >
              {searching ? "Araniyor..." : "Ara"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <div className="text-xs text-[var(--text-secondary)] font-medium">{searchResults.length} sonuc bulundu</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {searchResults.map((user) => (
                  <div
                    key={user.username}
                    className="glass-card overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/5"
                    style={{ borderLeft: "3px solid var(--accent-blue)" }}
                  >
                    <div className="p-4 flex flex-col gap-3">
                      {/* Profile header */}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-lg font-bold shrink-0">
                          {user.username[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-[var(--text-primary)] truncate">@{user.username}</span>
                            {user.verified && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] shrink-0 font-medium">&#10003;</span>
                            )}
                          </div>
                          {user.display_name && (
                            <div className="text-[11px] text-[var(--text-secondary)] truncate">{user.display_name}</div>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20">
                          {formatFollowers(user.followers)} takipci
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                          {formatFollowers(user.following)} takip
                        </span>
                      </div>

                      {/* Bio */}
                      {user.bio && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{user.bio}</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 mt-auto pt-3 border-t border-[var(--border)]">
                        <button
                          onClick={() => handleAccept(user.username, true)}
                          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--accent-green)]/5 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:border-[var(--accent-green)]/60 transition-all"
                        >
                          Oncelikli
                        </button>
                        <button
                          onClick={() => handleAccept(user.username, false)}
                          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20 hover:border-[var(--accent-blue)]/50 transition-all"
                        >
                          Ekle
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Filter & Sort bar ── */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[150px]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <input
              type="text"
              placeholder="Hesap filtrele..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="input-field text-sm w-full pl-8"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="input-field text-sm w-auto"
          >
            <option value="score">Skor</option>
            <option value="date">Yeniden Eskiye</option>
            <option value="avg_engagement">Engagement</option>
            <option value="followers">Takipci</option>
            <option value="appearances">Gorulme</option>
          </select>
        </div>
      )}

      {/* ── Account Grid ── */}
      {displayAccounts.length === 0 && !showSearch ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--accent-blue)]/10 flex items-center justify-center">
            <span className="text-2xl">&#128269;</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {accounts.length === 0
              ? "Henuz onerilen hesap yok."
              : "Filtreye uyan hesap bulunamadi."}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {accounts.length === 0
              ? "Otomatik kesif calismaya devam ediyor..."
              : "Farkli bir arama terimi deneyin."}
          </p>
          {accounts.length === 0 && (
            <button onClick={() => setShowSearch(true)} className="text-[var(--accent-blue)] hover:underline mt-3 text-sm font-medium">
              X&apos;te ara ile hesap bul
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayAccounts.map((acc) => {
            const color = scoreColor(acc.score);
            const category = getAccountCategory(acc);
            const isSelected = selectedAccounts.has(acc.username);

            return (
              <div
                key={acc.username}
                className={`glass-card overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/5 group ${isSelected ? "ring-2 ring-[var(--accent-blue)]/50" : ""}`}
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="p-4 flex flex-col gap-3">
                  {/* ── Top row: Checkbox + Avatar + Info + Score Gauge ── */}
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(acc.username)}
                      className="w-4 h-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent-blue)] cursor-pointer"
                    />

                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-lg font-bold shrink-0 transition-transform duration-300 group-hover:scale-105">
                      {acc.username[0]?.toUpperCase()}
                    </div>

                    {/* Username + discovered */}
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-sm text-[var(--text-primary)] truncate block">@{acc.username}</span>
                      {acc.discovered_at && (
                        <span className="text-[10px] text-[var(--text-secondary)]" title={acc.discovered_at}>
                          {relativeTime(acc.discovered_at)} kesfedildi
                        </span>
                      )}
                    </div>

                    {/* Circular Score Gauge */}
                    <ScoreGauge score={acc.score} />
                  </div>

                  {/* ── Category Badge + Stats Badges ── */}
                  <div className="flex gap-2 flex-wrap">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
                      style={{ color: category.color, borderColor: category.color + '33', backgroundColor: category.color + '1a' }}
                    >
                      {category.label}
                    </span>
                    {acc.followers > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20">
                        {formatFollowers(acc.followers)} takipci
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">
                      {acc.avg_engagement.toFixed(0)} ort. eng.
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                      {acc.appearances}x goruldu
                    </span>
                  </div>

                  {/* ── Score Breakdown ── */}
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {acc.appearances}x goruldu &bull; Ort. {Math.round(acc.avg_engagement)} etkilesim &bull; {acc.followers?.toLocaleString() || '?'} takipci
                  </p>

                  {/* ── Sample Tweet ── */}
                  {acc.sample_tweet && (
                    <div className="mt-0.5 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border-l-2 border-[var(--accent-blue)]/30">
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed italic">
                        &quot;{acc.sample_tweet}&quot;
                      </p>
                    </div>
                  )}

                  {/* ── Action Buttons ── */}
                  <div className="flex gap-2 mt-auto pt-3 border-t border-[var(--border)]">
                    <button
                      onClick={() => handleAccept(acc.username, true)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--accent-green)]/5 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:border-[var(--accent-green)]/60 transition-all duration-200"
                    >
                      Oncelikli
                    </button>
                    <button
                      onClick={() => handleAccept(acc.username, false)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20 hover:border-[var(--accent-blue)]/50 transition-all duration-200"
                    >
                      Ekle
                    </button>
                    <button
                      onClick={() => handleDismiss(acc.username)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-all duration-200"
                    >
                      Gec
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
