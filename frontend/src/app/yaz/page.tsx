"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { generateTweet, researchTopic, publishTweet, addDraft } from "@/lib/api";

export default function YazPage() {
  return (
    <Suspense fallback={<div className="text-[var(--text-secondary)]">Yukleniyor...</div>}>
      <YazContent />
    </Suspense>
  );
}

function YazContent() {
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("default");
  const [length, setLength] = useState("medium");
  const [isThread, setIsThread] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [threadParts, setThreadParts] = useState<string[]>([]);
  const [researchContext, setResearchContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const topicParam = searchParams.get("topic");
    if (topicParam) setTopic(topicParam);
  }, [searchParams]);

  const handleResearch = async () => {
    if (!topic.trim()) return;
    setResearching(true);
    try {
      const result = (await researchTopic(topic)) as {
        summary: string;
        key_points: string[];
      };
      setResearchContext(
        `${result.summary}\n\nKey Points:\n${result.key_points.join("\n")}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arastirma hatasi");
    } finally {
      setResearching(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = (await generateTweet({
        topic,
        style,
        length,
        thread: isThread,
        research_context: researchContext,
      })) as { text: string; thread_parts: string[] };
      setGeneratedText(result.text);
      setThreadParts(result.thread_parts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uretim hatasi");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handlePublish = async () => {
    if (!generatedText) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const result = (await publishTweet({
        text: generatedText,
        thread_parts: threadParts.length > 0 ? threadParts : undefined,
      })) as { success: boolean; url: string; error: string };
      if (result.success) {
        setPublishResult(result.url);
      } else {
        setError(result.error || "Paylasim hatasi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paylasim hatasi");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Tweet Yaz</h2>

      {/* Topic input */}
      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Konu
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Tweet konusunu yazin..."
            rows={3}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm resize-none focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Yazim Tarzi
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="default">Varsayilan</option>
              <option value="casual">Gunluk</option>
              <option value="professional">Profesyonel</option>
              <option value="analytical">Analitik</option>
              <option value="witty">Esprili</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Uzunluk
            </label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="short">Kisa</option>
              <option value="medium">Orta</option>
              <option value="long">Uzun</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isThread}
                onChange={(e) => setIsThread(e.target.checked)}
                className="rounded"
              />
              Thread
            </label>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleResearch}
            disabled={researching || !topic.trim()}
            className="btn-secondary text-sm"
          >
            {researching ? "Arastiriliyor..." : "Once Arastir"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="btn-primary"
          >
            {loading ? "Uretiliyor..." : "Tweet Uret"}
          </button>
        </div>
      </div>

      {/* Research context */}
      {researchContext && (
        <div className="glass-card">
          <h4 className="text-sm font-semibold text-[var(--accent-cyan)] mb-2">
            Arastirma Sonucu
          </h4>
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">
            {researchContext}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Generated tweet */}
      {generatedText && (
        <div className="glass-card space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Uretilen Tweet</h4>
            <button
              onClick={() => copyToClipboard(generatedText)}
              className="text-xs text-[var(--accent-blue)] hover:underline"
            >
              Kopyala
            </button>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm whitespace-pre-line">
            {generatedText}
          </div>

          <div className="text-xs text-[var(--text-secondary)]">
            {generatedText.length} karakter
          </div>

          {/* Thread parts */}
          {threadParts.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Thread Parcalari</h4>
              {threadParts.map((part, i) => (
                <div
                  key={i}
                  className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm"
                >
                  <span className="text-[var(--accent-blue)] font-bold mr-2">
                    {i + 1}/{threadParts.length}
                  </span>
                  <span className="whitespace-pre-line">{part}</span>
                </div>
              ))}
            </div>
          )}

          {publishResult && (
            <div className="bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 rounded-lg p-3">
              <span className="text-sm text-[var(--accent-green)]">
                Paylasildi!{" "}
                <a
                  href={publishResult}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Goruntule →
                </a>
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleGenerate} className="btn-secondary text-sm">
              Yeniden Uret
            </button>
            <button
              onClick={async () => {
                setDraftSaved(false);
                await addDraft({ text: generatedText, topic, style });
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 3000);
              }}
              className="btn-secondary text-sm"
            >
              {draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="btn-primary text-sm"
            >
              {publishing ? "Paylasiliyor..." : "Paylas"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
