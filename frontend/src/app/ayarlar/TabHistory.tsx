"use client";

import { useEffect, useState } from "react";
import { getPostHistory, clearPostHistory } from "@/lib/api";

interface PostHistoryEntry {
  text: string;
  type: string;
  style: string;
  posted_at: string;
  url?: string;
}

export default function TabHistory() {
  const [history, setHistory] = useState<PostHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    getPostHistory().then((d) => {
      const data = d as { history: PostHistoryEntry[]; count: number };
      setHistory(data.history);
      setTotal(data.count);
    });
  }, []);

  const handleClear = async () => {
    if (!confirm("Tum paylasim gecmisini silmek istediginize emin misiniz?")) return;
    await clearPostHistory();
    setHistory([]);
    setTotal(0);
  };

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">
            Paylasim Gecmisi ({total})
          </h3>
          {history.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Gecmisi Temizle
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <div className="space-y-3">
            {history.map((entry, i) => (
              <div
                key={i}
                className="bg-zinc-900/30 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-400 uppercase">
                    {entry.type || "tweet"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {entry.posted_at?.slice(0, 16)}
                  </span>
                </div>
                <p className="text-sm text-zinc-300">
                  {entry.text?.slice(0, 200)}
                  {(entry.text?.length || 0) > 200 ? "..." : ""}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    Tarz: {entry.style || "N/A"}
                  </span>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      X&apos;te Goruntule
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Henuz paylasim gecmisi yok.</p>
        )}
      </div>
    </div>
  );
}
