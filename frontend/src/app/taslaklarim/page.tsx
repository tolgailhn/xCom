"use client";

import { useState, useEffect } from "react";
import { listDrafts, deleteDraft, publishTweet } from "@/lib/api";

interface Draft {
  text: string;
  topic: string;
  style: string;
  created_at: string;
}

export default function TaslaklarimPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishingIdx, setPublishingIdx] = useState<number | null>(null);
  const [publishResult, setPublishResult] = useState<{
    idx: number;
    url: string;
  } | null>(null);

  const fetchDrafts = async () => {
    try {
      const result = (await listDrafts()) as { drafts: Draft[] };
      setDrafts(result.drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const handleDelete = async (index: number) => {
    await deleteDraft(index);
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    if (publishResult?.idx === index) setPublishResult(null);
  };

  const handlePublish = async (index: number, text: string) => {
    setPublishingIdx(index);
    setPublishResult(null);
    try {
      const result = (await publishTweet({ text })) as {
        success: boolean;
        url: string;
        error: string;
      };
      if (result.success) {
        setPublishResult({ idx: index, url: result.url });
        // Taslak paylasildi, listeden cikar
        await deleteDraft(index);
        setDrafts((prev) => prev.filter((_, i) => i !== index));
      } else {
        setError(result.error || "Paylasim hatasi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paylasim hatasi");
    } finally {
      setPublishingIdx(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold gradient-text">Taslaklarim</h2>
        <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-3 py-1 rounded-full">
          {drafts.length} taslak
        </span>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {publishResult && (
        <div className="glass-card bg-[var(--accent-green)]/10 border-[var(--accent-green)]/30">
          <span className="text-sm text-[var(--accent-green)]">
            Tweet paylasildi!{" "}
            <a
              href={publishResult.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Goruntule
            </a>
          </span>
        </div>
      )}

      {drafts.length > 0 ? (
        <div className="space-y-4">
          {drafts.map((draft, i) => (
            <div key={i} className="glass-card">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-line">
                    {draft.text}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {draft.topic && (
                      <span className="text-xs bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] px-2 py-1 rounded">
                        {draft.topic.slice(0, 60)}
                      </span>
                    )}
                    {draft.style && (
                      <span className="text-xs bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] px-2 py-1 rounded">
                        {draft.style}
                      </span>
                    )}
                    <span className="text-xs text-[var(--text-secondary)]">
                      {formatDate(draft.created_at)}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {draft.text.length} karakter
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handlePublish(i, draft.text)}
                    disabled={publishingIdx === i}
                    className="btn-primary text-xs"
                  >
                    {publishingIdx === i ? "..." : "Paylas"}
                  </button>
                  <button
                    onClick={() => copyToClipboard(draft.text)}
                    className="btn-secondary text-xs"
                  >
                    Kopyala
                  </button>
                  <a
                    href={`/yaz?topic=${encodeURIComponent(draft.topic || draft.text.slice(0, 100))}`}
                    className="btn-secondary text-xs text-center"
                  >
                    Duzenle
                  </a>
                  <button
                    onClick={() => handleDelete(i)}
                    className="text-xs text-[var(--accent-red)] hover:underline px-2 py-1"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card text-center py-16">
          <div className="text-5xl mb-4">📝</div>
          <p className="text-[var(--text-secondary)]">
            Henuz taslak yok.
            <br />
            <a href="/yaz" className="text-[var(--accent-blue)] hover:underline">
              Tweet Yaz
            </a>{" "}
            sayfasindan taslak kaydedebilirsin.
          </p>
        </div>
      )}
    </div>
  );
}
