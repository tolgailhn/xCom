"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getSuggestedAccounts,
  acceptSuggestedAccount,
  dismissSuggestedAccount,
  triggerAccountDiscovery,
  searchAccounts,
  analyzeDiscoveryAccount,
  smartDiscover,
  batchAnalyzeAccounts,
} from "@/lib/api";
import { timeAgo, formatNumber, getScoreColor, CircularGauge } from "@/components/discovery";

/* ── Types ──────────────────────────────────────────── */

interface AccountAnalysis {
  content_relevance: number;
  content_quality: number;
  bot_probability: number;
  posting_frequency: string;
  category: string;
  topics: string[];
  recommended: boolean;
  reasoning_tr: string;
  best_tweets: string[];
  overall_score: number;
  analyzed_at: string;
}

interface AccountProfile {
  display_name?: string;
  bio?: string;
  followers_count?: number;
  following_count?: number;
  followers?: number;
  following?: number;
  verified?: boolean;
  name?: string;
}

interface SuggestedAccount {
  username: string;
  appearances: number;
  avg_engagement: number;
  total_engagement: number;
  followers: number;
  score: number;
  sample_tweet: string;
  sample_tweets?: string[];
  discovered_at: string;
  discovery_strategy?: string;
  analysis?: AccountAnalysis;
  profile?: AccountProfile;
  topics?: string[];
  grok_reason?: string;
  seed_account?: string;
  search_query?: string;
  reference_accounts?: string[];
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

type SortKey = "score" | "relevance" | "quality" | "followers" | "date";
type CategoryFilter = "all" | "Arastirmaci" | "Gelistirici" | "Gazeteci" | "Kurucu" | "Sirket" | "Icerik Uretici" | "Bot" | "Diger";

/* ── Strategy Labels ──────────────────────────────── */

const STRATEGY_LABELS: Record<string, { label: string; icon: string }> = {
  follower_mining: { label: "Takipci", icon: "👥" },
  semantic_search: { label: "Arama", icon: "🔍" },
  grok_similar: { label: "Grok", icon: "🤖" },
  manual_analysis: { label: "Manuel", icon: "🎯" },
  batch_analysis: { label: "Toplu", icon: "📋" },
  // Legacy labels for backward compatibility
  cache_based: { label: "Cache", icon: "📊" },
  grok_search: { label: "Grok", icon: "🔍" },
  trend_based: { label: "Trend", icon: "📈" },
  interaction_based: { label: "Etkilesim", icon: "🔗" },
};

const CATEGORY_COLORS: Record<string, string> = {
  Arastirmaci: "var(--accent-purple)",
  Gelistirici: "var(--accent-blue)",
  Gazeteci: "var(--accent-amber)",
  Kurucu: "var(--accent-green)",
  Sirket: "var(--accent-blue)",
  "Icerik Uretici": "var(--accent-green)",
  Bot: "var(--accent-red)",
  Diger: "var(--text-secondary)",
};

/* ── Score Bar Component ─────────────────────────── */

function ScoreBar({ value, max = 10, label }: { value: number; max?: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 7 ? "var(--accent-green)" : value >= 4 ? "var(--accent-amber)" : "var(--accent-red)";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--text-secondary)] w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-medium w-6 text-right" style={{ color }}>{value}/{max}</span>
    </div>
  );
}

/* ── Component ──────────────────────────────────────── */

export default function TabSuggestedAccounts({ refreshTrigger }: { refreshTrigger?: number }) {
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // Batch selection
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  // Sort, filter, category
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [filterText, setFilterText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  // Active search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Analysis
  const [analyzingAccounts, setAnalyzingAccounts] = useState<Set<string>>(new Set());
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [searchAnalysis, setSearchAnalysis] = useState<Record<string, AccountAnalysis>>({});

  const loadAccounts = async () => {
    try {
      const data = await getSuggestedAccounts();
      setAccounts(data.accounts || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAccounts(); }, [refreshTrigger]);

  // ── Actions ─────────────────────────────────────

  const handleSmartDiscover = async () => {
    setDiscovering(true);
    try {
      const data = await smartDiscover();
      setAccounts(data.accounts || []);
      const stats = data.discovery_stats || {};
      setActionMsg(`Kesfedildi: ${stats.total_found || 0} hesap (${stats.total_saved || 0} yeni, ${stats.total_analyzed || 0} analiz edildi)`);
      setTimeout(() => setActionMsg(""), 5000);
    } catch (e: unknown) {
      setActionMsg("Kesif hatasi: " + (e instanceof Error ? e.message : "bilinmeyen hata"));
      setTimeout(() => setActionMsg(""), 5000);
    }
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

  const handleBatchAnalyze = async () => {
    const usernames = Array.from(selectedAccounts);
    if (usernames.length === 0) return;
    const newAnalyzing = new Set(analyzingAccounts);
    usernames.forEach(u => newAnalyzing.add(u));
    setAnalyzingAccounts(newAnalyzing);

    try {
      await batchAnalyzeAccounts(usernames);
      await loadAccounts();
      setActionMsg(`${usernames.length} hesap analiz edildi!`);
      setTimeout(() => setActionMsg(""), 3000);
    } catch { /* ignore */ }
    finally {
      setAnalyzingAccounts(prev => {
        const next = new Set(prev);
        usernames.forEach(u => next.delete(u));
        return next;
      });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await searchAccounts(searchQuery.trim());
      setSearchResults(data.accounts || []);
      setSearchAnalysis({});
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAnalyze = async (username: string) => {
    setAnalyzingAccounts(prev => new Set(prev).add(username));
    try {
      const data = await analyzeDiscoveryAccount(username);
      if (data?.analysis) {
        // Update in search results analysis map
        setSearchAnalysis(prev => ({ ...prev, [username.toLowerCase()]: data.analysis }));
        // Reload accounts to get updated data
        await loadAccounts();
      }
    } catch (e: unknown) {
      setActionMsg("Analiz hatasi: " + (e instanceof Error ? e.message : ""));
      setTimeout(() => setActionMsg(""), 3000);
    } finally {
      setAnalyzingAccounts(prev => { const next = new Set(prev); next.delete(username); return next; });
    }
  };

  // ── Sorted + filtered accounts ──────────────────

  const displayAccounts = useMemo(() => {
    let list = [...accounts];

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter(a =>
        a.username.toLowerCase().includes(q) ||
        (a.analysis?.category || "").toLowerCase().includes(q) ||
        (a.analysis?.topics || []).some(t => t.toLowerCase().includes(q)) ||
        (a.profile?.bio || "").toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== "all") {
      list = list.filter(a => (a.analysis?.category || "Diger") === categoryFilter);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "score": return (b.analysis?.overall_score || b.score) - (a.analysis?.overall_score || a.score);
        case "relevance": return (b.analysis?.content_relevance || 0) - (a.analysis?.content_relevance || 0);
        case "quality": return (b.analysis?.content_quality || 0) - (a.analysis?.content_quality || 0);
        case "followers": return b.followers - a.followers;
        case "date": return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
        default: return 0;
      }
    });

    return list;
  }, [accounts, sortBy, filterText, categoryFilter]);

  const analyzedCount = useMemo(() => accounts.filter(a => a.analysis).length, [accounts]);
  const recommendedCount = useMemo(() => accounts.filter(a => a.analysis?.recommended).length, [accounts]);

  // ── Category counts for filter pills ────────────

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    accounts.forEach(a => {
      const cat = a.analysis?.category || "Diger";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [accounts]);

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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium">
            {accounts.length} hesap
          </span>
          {analyzedCount > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] font-medium">
              {analyzedCount} analiz edildi
            </span>
          )}
          {recommendedCount > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] font-medium">
              {recommendedCount} onerilen
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
        </div>
      </div>

      {/* ── Smart Discovery Panel ── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Benzer Hesap Kesfet</span>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Izlediginiz hesaplarin takipcilerini, konu bazli arama ve AI benzesim analizi ile sistemde olmayan yeni AI/tech hesaplari bulur.
        </p>
        <button
          onClick={handleSmartDiscover}
          disabled={discovering}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        >
          {discovering ? "Kesfediliyor..." : "Benzer Hesap Bul"}
        </button>
      </div>

      {/* ── Action Message ── */}
      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
          actionMsg.includes("hata") || actionMsg.includes("Hata")
            ? "bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30 text-[var(--accent-red)]"
            : "bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-[var(--accent-green)]"
        }`}>
          {actionMsg}
        </div>
      )}

      {/* ── Batch Actions ── */}
      {selectedAccounts.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 flex-wrap">
          <span className="text-xs font-medium text-[var(--accent-blue)]">{selectedAccounts.size} hesap secildi</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button onClick={handleBatchAnalyze}
              disabled={analyzingAccounts.size > 0}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30 hover:border-[var(--accent-purple)]/60 transition-all disabled:opacity-50">
              {analyzingAccounts.size > 0 ? "Analiz Ediliyor..." : "Toplu Analiz"}
            </button>
            <button onClick={handleBatchAccept}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:border-[var(--accent-green)]/60 transition-all">
              Secilenleri Ekle
            </button>
            <button onClick={handleBatchDismiss}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 border border-[var(--border)] transition-all">
              Secilenleri Gec
            </button>
            <button onClick={() => setSelectedAccounts(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
              Temizle
            </button>
          </div>
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
                {searchResults.map((user) => {
                  const analysis = searchAnalysis[user.username.toLowerCase()];
                  const isAnalyzing = analyzingAccounts.has(user.username);
                  return (
                    <div
                      key={user.username}
                      className="glass-card overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/5"
                      style={{ borderLeft: `3px solid ${analysis ? (analysis.recommended ? "var(--accent-green)" : "var(--accent-red)") : "var(--accent-blue)"}` }}
                    >
                      <div className="p-4 flex flex-col gap-3">
                        {/* Profile header */}
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-lg font-bold shrink-0">
                            {user.username[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
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
                          {analysis && <CircularGauge value={analysis.overall_score} maxValue={10} size={44} colorFn={(v: number) => v >= 7 ? "var(--accent-green)" : v >= 4 ? "var(--accent-amber)" : "var(--accent-red)"} />}
                        </div>

                        {/* Stats */}
                        <div className="flex gap-2 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20">
                            {formatNumber(user.followers)} takipci
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                            {formatNumber(user.following)} takip
                          </span>
                          {analysis && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
                              style={{ color: CATEGORY_COLORS[analysis.category] || "var(--text-secondary)", borderColor: (CATEGORY_COLORS[analysis.category] || "var(--text-secondary)") + "33", backgroundColor: (CATEGORY_COLORS[analysis.category] || "var(--text-secondary)") + "1a" }}>
                              {analysis.category}
                            </span>
                          )}
                        </div>

                        {/* Bio */}
                        {user.bio && (
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{user.bio}</p>
                        )}

                        {/* AI Analysis Result */}
                        {analysis && (
                          <div className="space-y-2 p-3 rounded-lg bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]/20">
                            <ScoreBar value={analysis.content_relevance} label="Ilgililik" />
                            <ScoreBar value={analysis.content_quality} label="Kalite" />
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[var(--text-secondary)] w-16 shrink-0">Bot Risk</span>
                              <span className={`text-[10px] font-medium ${analysis.bot_probability <= 20 ? "text-[var(--accent-green)]" : analysis.bot_probability <= 50 ? "text-[var(--accent-amber)]" : "text-[var(--accent-red)]"}`}>
                                %{analysis.bot_probability}
                              </span>
                            </div>
                            {analysis.topics.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {analysis.topics.map(t => (
                                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">{t}</span>
                                ))}
                              </div>
                            )}
                            {analysis.reasoning_tr && (
                              <p className="text-[11px] text-[var(--text-secondary)] italic mt-1">&quot;{analysis.reasoning_tr}&quot;</p>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 mt-auto pt-3 border-t border-[var(--border)]">
                          <button onClick={() => handleAnalyze(user.username)}
                            disabled={isAnalyzing}
                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20 hover:border-[var(--accent-purple)]/50 transition-all disabled:opacity-50">
                            {isAnalyzing ? "Analiz..." : analysis ? "Yeniden Analiz" : "AI Analiz"}
                          </button>
                          <button onClick={() => handleAccept(user.username, true)}
                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--accent-green)]/5 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:border-[var(--accent-green)]/60 transition-all">
                            Ekle
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Category Filter Pills ── */}
      {accounts.length > 0 && Object.keys(categoryCounts).length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
              categoryFilter === "all"
                ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/40"
                : "text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-blue)]/30"
            }`}
          >
            Tumu ({accounts.length})
          </button>
          {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat as CategoryFilter)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
                categoryFilter === cat
                  ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/40"
                  : "text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-blue)]/30"
              }`}
            >
              {cat} ({count})
            </button>
          ))}
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
              placeholder="Hesap, konu veya kategori ara..."
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
            <option value="relevance">Ilgililik</option>
            <option value="quality">Kalite</option>
            <option value="followers">Takipci</option>
            <option value="date">Yeniden Eskiye</option>
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
            Yukaridaki &quot;Benzer Hesap Bul&quot; butonuyla AI hesaplari bulun.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayAccounts.map((acc) => {
            const analysis = acc.analysis;
            const profile = acc.profile;
            const isAnalyzing = analyzingAccounts.has(acc.username);
            const isSelected = selectedAccounts.has(acc.username);
            const isExpanded = expandedAccount === acc.username;
            const overallScore = analysis?.overall_score || acc.score;
            const color = getScoreColor(overallScore * (analysis ? 10 : 1));
            const catColor = CATEGORY_COLORS[analysis?.category || "Diger"] || "var(--text-secondary)";
            const strategy = STRATEGY_LABELS[acc.discovery_strategy || ""] || { label: "?", icon: "📌" };

            return (
              <div
                key={acc.username}
                className={`glass-card overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/5 group ${isSelected ? "ring-2 ring-[var(--accent-blue)]/50" : ""}`}
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="p-4 flex flex-col gap-3">
                  {/* ── Top row: Checkbox + Avatar + Info + Score ── */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(acc.username)}
                      className="w-4 h-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent-blue)] cursor-pointer"
                    />
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-lg font-bold shrink-0 transition-transform duration-300 group-hover:scale-105">
                      {acc.username[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <a href={`https://x.com/${acc.username}`} target="_blank" rel="noopener noreferrer" className="font-bold text-sm text-[var(--text-primary)] truncate block hover:text-[var(--accent-blue)] transition-colors">
                        @{acc.username}
                      </a>
                      {profile?.name || profile?.display_name ? (
                        <span className="text-[10px] text-[var(--text-secondary)] block truncate">{profile.name || profile.display_name}</span>
                      ) : acc.discovered_at ? (
                        <span className="text-[10px] text-[var(--text-secondary)]">{timeAgo(acc.discovered_at)} kesfedildi</span>
                      ) : null}
                    </div>
                    <CircularGauge value={analysis ? overallScore : Math.min(overallScore / 10, 10)} maxValue={10} size={44} colorFn={(v: number) => v >= 7 ? "var(--accent-green)" : v >= 4 ? "var(--accent-amber)" : "var(--accent-red)"} />
                  </div>

                  {/* ── Badges ── */}
                  <div className="flex gap-1.5 flex-wrap">
                    {analysis?.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
                        style={{ color: catColor, borderColor: catColor + "33", backgroundColor: catColor + "1a" }}>
                        {analysis.category}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-primary)]/20">
                      {strategy.icon} {strategy.label}
                    </span>
                    {(acc.followers > 0 || profile?.followers_count) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20">
                        {formatNumber(profile?.followers_count || acc.followers)} takipci
                      </span>
                    )}
                    {acc.seed_account && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20">
                        via @{acc.seed_account}
                      </span>
                    )}
                    {acc.search_query && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20">
                        &quot;{acc.search_query}&quot;
                      </span>
                    )}
                    {analysis?.topics?.slice(0, 3).map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">{t}</span>
                    ))}
                  </div>

                  {/* ── AI Analysis (if available) ── */}
                  {analysis && (
                    <div className="space-y-2 p-3 rounded-lg bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]/20">
                      <ScoreBar value={analysis.content_relevance} label="Ilgililik" />
                      <ScoreBar value={analysis.content_quality} label="Kalite" />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-secondary)] w-16 shrink-0">Bot Risk</span>
                        <span className={`text-[10px] font-medium ${analysis.bot_probability <= 20 ? "text-[var(--accent-green)]" : analysis.bot_probability <= 50 ? "text-[var(--accent-amber)]" : "text-[var(--accent-red)]"}`}>
                          %{analysis.bot_probability}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] ml-auto">{analysis.posting_frequency}</span>
                      </div>
                      {analysis.reasoning_tr && (
                        <p className="text-[11px] text-[var(--text-secondary)] italic leading-relaxed">&quot;{analysis.reasoning_tr}&quot;</p>
                      )}
                      {analysis.recommended && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
                          <span className="text-[10px] font-medium text-[var(--accent-green)]">Takip edilmesi oneriliyor</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Bio / Grok reason / Sample tweet ── */}
                  {!analysis && (profile?.bio || acc.grok_reason || acc.sample_tweet) && (
                    <div className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border-l-2 border-[var(--accent-blue)]/30">
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed italic">
                        &quot;{profile?.bio || acc.grok_reason || acc.sample_tweet}&quot;
                      </p>
                    </div>
                  )}

                  {/* ── Best Tweets (expanded) ── */}
                  {isExpanded && analysis?.best_tweets && analysis.best_tweets.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg bg-[var(--bg-primary)]/40 border border-[var(--border-primary)]/20">
                      <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase">En Iyi Tweetler</span>
                      {analysis.best_tweets.map((tw, i) => (
                        <p key={i} className="text-[11px] text-[var(--text-secondary)] leading-relaxed pl-2 border-l-2 border-[var(--accent-green)]/30">
                          {tw}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* ── Action Buttons ── */}
                  <div className="flex gap-2 mt-auto pt-3 border-t border-[var(--border)] flex-wrap">
                    <button onClick={() => handleAnalyze(acc.username)}
                      disabled={isAnalyzing}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20 hover:border-[var(--accent-purple)]/50 transition-all disabled:opacity-50">
                      {isAnalyzing ? "Analiz..." : analysis ? "Yeniden" : "AI Analiz"}
                    </button>
                    {analysis?.best_tweets && analysis.best_tweets.length > 0 && (
                      <button onClick={() => setExpandedAccount(isExpanded ? null : acc.username)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent-blue)]/30 transition-all">
                        {isExpanded ? "Kapat" : "Tweetler"}
                      </button>
                    )}
                    <button onClick={() => handleAccept(acc.username, true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[var(--accent-green)]/20 to-[var(--accent-green)]/5 text-[var(--accent-green)] border border-[var(--accent-green)]/30 hover:border-[var(--accent-green)]/60 transition-all">
                      Oncelikli
                    </button>
                    <button onClick={() => handleAccept(acc.username, false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20 hover:border-[var(--accent-blue)]/50 transition-all">
                      Ekle
                    </button>
                    <button onClick={() => handleDismiss(acc.username)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-all">
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
