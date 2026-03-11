"use client";

import { useState, useEffect } from "react";
import {
  getSavedAnalyses,
  deleteAnalysis,
  getTrainingContext,
} from "@/lib/api";
import AnalysisDisplay, { AnalysisResult } from "./AnalysisDisplay";

export default function TabSaved() {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [trainingCtx, setTrainingCtx] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [res, ctx] = await Promise.all([
        getSavedAnalyses() as Promise<{ analyses: AnalysisResult[] }>,
        getTrainingContext() as Promise<{ context: string; total_length: number }>,
      ]);
      setAnalyses(res.analyses);
      setTrainingCtx(ctx.context);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (username: string) => {
    await deleteAnalysis(username);
    loadData();
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-secondary)]">Yukleniyor...</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-secondary)]">
        Bu analizler tweet yazarken AI egitim verisi olarak otomatik kullanilir.
      </p>

      {trainingCtx && (
        <details className="glass-card">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--accent-blue)]">
            AI Egitim Verisi Onizleme
          </summary>
          <pre className="mt-2 text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-80 overflow-y-auto">
            {trainingCtx}
          </pre>
        </details>
      )}

      {analyses.length === 0 ? (
        <div className="glass-card text-center py-8">
          <p className="text-sm text-[var(--text-secondary)]">
            Henuz kayitli analiz yok. &quot;Yeni Analiz&quot; sekmesinden analiz yapin.
          </p>
        </div>
      ) : (
        analyses.map((a, i) => (
          <div key={i} className="glass-card">
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            >
              <div>
                <span className="font-semibold">@{a.username}</span>
                <span className="text-xs text-[var(--text-secondary)] ml-2">
                  {a.tweets_analyzed} tweet | {a.analyzed_at?.slice(0, 16)}
                </span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                {expandedIdx === i ? "Kapat" : "Ac"}
              </span>
            </div>

            {expandedIdx === i && (
              <div className="mt-4 space-y-4">
                <AnalysisDisplay result={a} />
                <button
                  onClick={() => handleDelete(a.username)}
                  className="btn-secondary text-xs text-[var(--accent-red)]"
                >
                  Analizi Sil
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
