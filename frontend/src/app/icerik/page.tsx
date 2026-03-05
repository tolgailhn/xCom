"use client";

import { useState } from "react";
import { generateTweet, researchTopic } from "@/lib/api";

export default function IcerikPage() {
  const [topic, setTopic] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchData, setResearchData] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleResearch = async () => {
    if (!topic.trim()) return;
    setResearching(true);
    setError(null);
    try {
      const result = (await researchTopic(topic, "deep")) as {
        summary: string;
        key_points: string[];
        sources: { title: string; url: string }[];
      };
      const text = `${result.summary}\n\nKey Points:\n${result.key_points.join("\n")}`;
      setResearchData(text);
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
        style: "analytical",
        length: "long",
        thread: true,
        research_context: researchData,
      })) as { text: string; thread_parts: string[] };
      setGeneratedContent(result.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uretim hatasi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Icerik Uret</h2>

      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Konu
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Detayli icerik konusu..."
            rows={3}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm resize-none focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleResearch}
            disabled={researching || !topic.trim()}
            className="btn-secondary text-sm"
          >
            {researching ? "Arastiriliyor..." : "Derin Arastir"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="btn-primary"
          >
            {loading ? "Uretiliyor..." : "Icerik Uret"}
          </button>
        </div>
      </div>

      {researchData && (
        <div className="glass-card">
          <h4 className="text-sm font-semibold text-[var(--accent-cyan)] mb-2">
            Arastirma Sonucu
          </h4>
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line max-h-64 overflow-y-auto">
            {researchData}
          </p>
        </div>
      )}

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {generatedContent && (
        <div className="glass-card space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Uretilen Icerik</h4>
            <button
              onClick={() => navigator.clipboard.writeText(generatedContent)}
              className="text-xs text-[var(--accent-blue)] hover:underline"
            >
              Kopyala
            </button>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm whitespace-pre-line max-h-96 overflow-y-auto">
            {generatedContent}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {generatedContent.length} karakter
          </div>
        </div>
      )}
    </div>
  );
}
