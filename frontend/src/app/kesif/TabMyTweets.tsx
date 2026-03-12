"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getMyTweets,
  fetchMyTweets,
  getMyTweetsAnalysis,
  analyzeMyTweets,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

interface MyTweet {
  tweet_id: string;
  text: string;
  created_at: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  bookmark_count: number;
  view_count: number;
  engagement_score: number;
  media_items?: any[];
  urls?: any[];
  is_retweet?: boolean;
}

interface MyTweetsAnalysis {
  topics?: string[];
  style?: string;
  engagement_patterns?: string;
  best_performing_topics?: string[];
  avoid_topics?: string[];
  posting_frequency?: string;
  content_type_distribution?: Record<string, number>;
  recommended_topics?: string[];
}

/* ── Helpers ─────────────────────────────────────────── */

function timeAgo(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    const abs = Math.abs(diffSec);
    if (abs < 60) return `${abs}sn`;
    if (abs < 3600) return `${Math.floor(abs / 60)}dk`;
    if (abs < 86400) return `${Math.floor(abs / 3600)}sa`;
    return `${Math.floor(abs / 86400)}g`;
  } catch {
    return "";
  }
}

function formatDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleDateString("tr-TR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ── Score Gauge ─────────────────────────────────────── */

function EngagementGauge({ score }: { score: number }) {
  const display = Math.round(score);
  const color = display >= 500 ? "var(--accent-green)" : display >= 100 ? "var(--accent-amber)" : "var(--accent-blue)";
  return (
    <div className="flex items-center justify-center w-12 h-12 rounded-full border-2 shrink-0" style={{ borderColor: color }}>
      <span className="text-xs font-bold" style={{ color }}>{display >= 1000 ? `${(display / 1000).toFixed(1)}K` : display}</span>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */

interface Props {
  refreshTrigger?: number;
}

export default function TabMyTweets({ refreshTrigger }: Props) {
  const [tweets, setTweets] = useState<MyTweet[]>([]);
  const [lastFetch, setLastFetch] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<MyTweetsAnalysis | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState("");
  const [sortBy, setSortBy] = useState<"engagement" | "date" | "likes" | "retweets">("engagement");
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [msg, setMsg] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [tweetsRes, analysisRes] = await Promise.all([
        getMyTweets(),
        getMyTweetsAnalysis().catch(() => ({ analysis: null, last_analyzed: "" })),
      ]);
      setTweets(tweetsRes.tweets || []);
      setLastFetch(tweetsRes.last_fetch || "");
      setUsername(tweetsRes.username || "");
      if (analysisRes.analysis) {
        setAnalysis(analysisRes.analysis);
        setLastAnalyzed(analysisRes.last_analyzed || "");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh from parent
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) loadData();
  }, [refreshTrigger, loadData]);

  // Auto-refresh every 10 min
  useEffect(() => {
    const interval = setInterval(loadData, 600_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleFetch = async () => {
    setFetching(true);
    setMsg("");
    try {
      const result = await fetchMyTweets(username || "ilhntolga");
      setMsg(`${result.total} tweet cekildi`);
      await loadData();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setFetching(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setMsg("");
    try {
      const result = await analyzeMyTweets();
      setAnalysis(result.analysis);
      setLastAnalyzed(result.last_analyzed || "");
      setMsg("Analiz tamamlandi");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Analiz hatasi");
    } finally {
      setAnalyzing(false);
    }
  };

  // Sort & filter
  const sorted = [...tweets]
    .filter(tw => !tw.is_retweet)
    .filter(tw => !filterText || tw.text.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "engagement") return b.engagement_score - a.engagement_score;
      if (sortBy === "date") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "likes") return b.like_count - a.like_count;
      if (sortBy === "retweets") return b.retweet_count - a.retweet_count;
      return 0;
    });

  if (loading) return <div className="text-center py-10 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold">
              {username ? `@${username}` : "Tolga"} Tweetleri
              {tweets.length > 0 && <span className="ml-2 text-xs text-[var(--text-secondary)]">({sorted.length} tweet)</span>}
            </h3>
            {lastFetch && (
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                Son cekme: {timeAgo(lastFetch)} once &middot; {formatDate(lastFetch)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleFetch} disabled={fetching} className="btn-primary text-xs">
              {fetching ? "Cekiliyor..." : tweets.length ? "Guncelle" : "Tweetleri Cek"}
            </button>
            <button onClick={handleAnalyze} disabled={analyzing || tweets.length === 0} className="btn-secondary text-xs">
              {analyzing ? "Analiz ediliyor..." : "MiniMax Analiz"}
            </button>
          </div>
        </div>

        {msg && (
          <div className="text-xs p-2 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 text-[var(--accent-blue)]">
            {msg}
          </div>
        )}
      </div>

      {/* AI Analysis Panel */}
      {analysis && (
        <div className="glass-card overflow-hidden">
          <button onClick={() => setShowAnalysis(!showAnalysis)} className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-secondary)]/50 transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-purple)] animate-pulse" />
              <span className="text-sm font-bold">AI Profil Analizi</span>
              {lastAnalyzed && <span className="text-[10px] text-[var(--text-secondary)]">{timeAgo(lastAnalyzed)} once</span>}
            </div>
            <span className="text-xs text-[var(--text-secondary)]">{showAnalysis ? "▲" : "▼"}</span>
          </button>
          {showAnalysis && (
            <div className="px-4 pb-4 space-y-3">
              {/* Topics */}
              {analysis.topics && analysis.topics.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Ilgilendigi Konular</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.topics.map((t, i) => (
                      <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Best performing */}
              {analysis.best_performing_topics && analysis.best_performing_topics.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">En Iyi Performans</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.best_performing_topics.map((t, i) => (
                      <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Avoid topics */}
              {analysis.avoid_topics && analysis.avoid_topics.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Paylasmadigi Konular</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.avoid_topics.map((t, i) => (
                      <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Style */}
              {analysis.style && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1">Yazim Tarzi</h4>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">{analysis.style}</p>
                </div>
              )}

              {/* Engagement patterns */}
              {analysis.engagement_patterns && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1">Etkilesim Kaliplari</h4>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">{analysis.engagement_patterns}</p>
                </div>
              )}

              {/* Recommended topics */}
              {analysis.recommended_topics && analysis.recommended_topics.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Onerilen Konular</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.recommended_topics.map((t, i) => (
                      <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Content distribution */}
              {analysis.content_type_distribution && (
                <div>
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Icerik Dagilimi</h4>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(analysis.content_type_distribution).map(([type, pct]) => (
                      <div key={type} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] text-xs">
                        <div className="w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
                        <span className="capitalize">{type.replace(/_/g, " ")}</span>
                        <span className="font-bold">{typeof pct === "number" ? `${pct}%` : pct}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {tweets.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Tweet ara..."
            className="input text-xs flex-1 min-w-[150px]"
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)]">
            <option value="engagement">Engagement</option>
            <option value="date">Tarih</option>
            <option value="likes">Like</option>
            <option value="retweets">Retweet</option>
          </select>
        </div>
      )}

      {/* Tweet List */}
      {sorted.length === 0 && !loading && (
        <div className="text-center py-10 text-[var(--text-secondary)] text-sm">
          {tweets.length === 0
            ? "Henuz tweet cekilmedi. \"Tweetleri Cek\" butonuna basin."
            : "Filtre ile eslesen tweet bulunamadi."}
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((tw, idx) => (
          <div key={tw.tweet_id || idx} className="glass-card p-4 hover:border-[var(--accent-blue)]/30 transition-colors">
            <div className="flex items-start gap-3">
              {/* Score */}
              <EngagementGauge score={tw.engagement_score} />

              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                    <span>{formatDate(tw.created_at)}</span>
                    <span>&middot;</span>
                    <span>{timeAgo(tw.created_at)} once</span>
                  </div>
                  <a
                    href={`https://x.com/${username}/status/${tw.tweet_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[var(--accent-blue)] hover:underline"
                  >
                    Tweet&apos;i Gor
                  </a>
                </div>

                {/* Text */}
                <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{tw.text}</p>

                {/* Stats */}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)]">
                    {tw.like_count} begeni
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)]">
                    {tw.retweet_count} RT
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                    {tw.reply_count} yanit
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]">
                    {tw.bookmark_count} kayit
                  </span>
                  {tw.view_count > 0 && (
                    <span className="text-[10px] text-[var(--text-secondary)]">
                      {tw.view_count >= 1000 ? `${(tw.view_count / 1000).toFixed(1)}K` : tw.view_count} goruntulenme
                    </span>
                  )}
                </div>

                {/* Media indicator */}
                {tw.media_items && tw.media_items.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--accent-purple)]">
                    <span>🖼️ {tw.media_items.length} medya</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
