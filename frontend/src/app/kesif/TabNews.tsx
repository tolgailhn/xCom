"use client";

import { useState, useEffect } from "react";
import { getNews, triggerNewsScan } from "@/lib/api";

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  body: string;
  date: string;
  query: string;
  found_at: string;
}

export default function TabNews() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const loadNews = async () => {
    try {
      const data = await getNews();
      setArticles(data.articles || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNews(); }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerNewsScan();
      await loadNews();
    } catch {
      // ignore
    } finally {
      setScanning(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {articles.length} haber makalesi
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn-primary text-sm"
        >
          {scanning ? "Taraniyor..." : "Haber Tara"}
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-secondary)]">
          Henuz haber bulunamadi. &quot;Haber Tara&quot; ile baslayabilirsin veya otomatik tarama 4 saatte bir calisir.
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:text-[var(--accent-blue)] transition-colors"
                  >
                    {article.title}
                  </a>
                  {article.body && (
                    <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">
                      {article.body}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
                    <span className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] font-medium">
                      {article.source}
                    </span>
                    {article.date && (
                      <span>{new Date(article.date).toLocaleDateString("tr-TR")}</span>
                    )}
                    <span className="text-[var(--text-secondary)]">{article.query}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
