"use client";

import { useState } from "react";
import { analyzeMulti } from "@/lib/api";
import AnalysisDisplay, { AnalysisResult } from "./AnalysisDisplay";

export default function TabNew() {
  const [usernames, setUsernames] = useState("");
  const [tweetCount, setTweetCount] = useState(200);
  const [aiReport, setAiReport] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const names = usernames.split(",").map((u) => u.trim().replace("@", "")).filter(Boolean);
    if (!names.length) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = (await analyzeMulti(names, tweetCount, aiReport)) as {
        results: AnalysisResult[];
      };
      setResults(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz hatasi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-blue)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Hesap adlarini gir &rarr; Twikit ile tweet&apos;leri cek &rarr; Engagement analizi &rarr; AI rapor &rarr; Kaydet
        </p>
      </div>

      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Twitter kullanici adi(lari)
          </label>
          <input
            type="text"
            value={usernames}
            onChange={(e) => setUsernames(e.target.value)}
            placeholder="ornek: elonmusk, sama, AnthropicAI (virgul ile ayirin)"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Tweet Sayisi
            </label>
            <select
              value={tweetCount}
              onChange={(e) => setTweetCount(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={aiReport}
                onChange={(e) => setAiReport(e.target.checked)}
                className="rounded"
              />
              AI analiz raporu
            </label>
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading || !usernames.trim()}
          className="btn-primary w-full"
        >
          {loading ? "Analiz ediliyor..." : "Analiz Baslat"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {results.map((r, i) => (
        <div key={i} className="glass-card">
          {r.error ? (
            <div>
              <h3 className="font-semibold text-[var(--accent-red)]">@{r.username} - Hata</h3>
              <p className="text-sm text-[var(--text-secondary)]">{r.error}</p>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold mb-4">@{r.username}</h3>
              <AnalysisDisplay result={r} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
