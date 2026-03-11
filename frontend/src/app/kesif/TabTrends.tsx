"use client";

import { useState, useEffect } from "react";
import { getTrends, triggerTrendAnalysis } from "@/lib/api";

interface Trend {
  keyword: string;
  account_count: number;
  accounts: string[];
  total_engagement: number;
  trend_score: number;
  tweet_count: number;
  top_tweets: { text: string; account: string; engagement: number }[];
  is_strong_trend: boolean;
  detected_at: string;
}

export default function TabTrends() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [totalAnalyzed, setTotalAnalyzed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadTrends = async () => {
    try {
      const data = await getTrends();
      setTrends(data.trends || []);
      setLastUpdated(data.last_updated || "");
      setTotalAnalyzed(data.total_tweets_analyzed || 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTrends(); }, []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await triggerTrendAnalysis();
      await loadTrends();
    } catch {
      // ignore
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {totalAnalyzed > 0 && `${totalAnalyzed} tweet analiz edildi`}
          {lastUpdated && ` · Son: ${new Date(lastUpdated).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="btn-primary text-sm"
        >
          {analyzing ? "Analiz ediliyor..." : "Trend Analiz Et"}
        </button>
      </div>

      {trends.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-secondary)]">
          Henuz trend tespit edilmedi. Kesfet ve otomatik tarama verileri biriktikce trendler burada gorunecek.
        </div>
      ) : (
        <div className="space-y-3">
          {trends.map((trend) => (
            <div
              key={trend.keyword}
              className={`card p-4 cursor-pointer transition-colors hover:border-[var(--accent-blue)]/30 ${
                trend.is_strong_trend ? "border-l-4 border-l-[var(--accent-amber)]" : ""
              }`}
              onClick={() => setExpanded(expanded === trend.keyword ? null : trend.keyword)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{trend.keyword}</span>
                  {trend.is_strong_trend && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]">
                      TREND
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                  <span title="Hesap sayisi">{trend.account_count} hesap</span>
                  <span title="Tweet sayisi">{trend.tweet_count} tweet</span>
                  <span title="Toplam engagement">{trend.total_engagement.toFixed(0)} eng.</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {trend.accounts.map((acc) => (
                  <span key={acc} className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[10px] font-medium">
                    @{acc}
                  </span>
                ))}
              </div>

              {expanded === trend.keyword && trend.top_tweets.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                  <div className="text-xs font-medium text-[var(--text-secondary)]">En iyi tweet&apos;ler:</div>
                  {trend.top_tweets.map((tw, i) => (
                    <div key={i} className="p-2 rounded bg-[var(--bg-secondary)] text-sm">
                      <span className="text-[var(--accent-blue)] text-xs">@{tw.account}</span>
                      <p className="mt-1">{tw.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
