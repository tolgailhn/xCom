"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getUserSamples,
  addUserSample,
  addBulkSamples,
  deleteUserSample,
  getPersona,
  savePersona,
  analyzeStyle,
} from "@/lib/api";

function TestResult({
  result,
}: {
  result: { success: boolean; error?: string; [k: string]: unknown } | null;
}) {
  if (!result) return null;
  return (
    <div
      className={`mt-2 p-3 rounded-lg text-sm ${
        result.success
          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
          : "bg-red-500/10 border border-red-500/20 text-red-300"
      }`}
    >
      {result.success
        ? `Basarili! ${result.username ? `@${result.username}` : ""} ${result.provider ? `(${result.provider})` : ""} ${result.bot_username ? `@${result.bot_username}` : ""} ${result.source ? `Cookie: ${result.source}` : ""}`
        : `Hata: ${result.error}`}
    </div>
  );
}

export default function TabWritingStyle() {
  const [samples, setSamples] = useState<string[]>([]);
  const [persona, setPersonaText] = useState("");
  const [newSample, setNewSample] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [manualPersona, setManualPersona] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const refreshData = useCallback(async () => {
    const [sData, pData] = await Promise.all([getUserSamples(), getPersona()]);
    setSamples((sData as { samples: string[] }).samples);
    const p = (pData as { persona: string }).persona;
    setPersonaText(p);
    setManualPersona(p);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleAddSample = async () => {
    if (!newSample.trim()) return;
    await addUserSample(newSample.trim());
    setNewSample("");
    refreshData();
  };

  const handleBulkAdd = async () => {
    const texts = bulkText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (texts.length === 0) return;
    await addBulkSamples(texts);
    setBulkText("");
    setShowBulk(false);
    refreshData();
  };

  const handleDeleteSample = async (index: number) => {
    await deleteUserSample(index);
    refreshData();
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const result = await analyzeStyle();
      const r = result as { success: boolean; error?: string; persona?: string };
      setAnalyzeResult(r);
      if (r.success) refreshData();
    } catch (e) {
      setAnalyzeResult({ success: false, error: String(e) });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSavePersona = async () => {
    await savePersona(manualPersona);
    refreshData();
  };

  const handleResetPersona = async () => {
    await savePersona("");
    refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Sample Tweets */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">Tweet Orneklerin</h3>
        <p className="text-xs text-zinc-400">
          AI&apos;in senin gibi yazmasi icin kendi tweet orneklerini ekle.
          Ne kadar cok ornek eklersen, tarz o kadar dogru olur.
        </p>

        <div className="flex gap-3">
          <textarea
            value={newSample}
            onChange={(e) => setNewSample(e.target.value)}
            placeholder="Kendi tarzinda yazdigin bir tweet ornegi yapistir..."
            rows={2}
            className="flex-1 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
          />
          <button
            onClick={handleAddSample}
            disabled={!newSample.trim()}
            className="btn-primary text-sm px-4 self-end disabled:opacity-40"
          >
            Ekle
          </button>
        </div>

        <button
          onClick={() => setShowBulk(!showBulk)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showBulk ? "Kapat" : "Toplu Ornek Ekle"}
        </button>

        {showBulk && (
          <div className="space-y-2">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"Tweet 1\nTweet 2\nTweet 3"}
              rows={5}
              className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
            />
            <button
              onClick={handleBulkAdd}
              disabled={!bulkText.trim()}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-40"
            >
              Toplu Ekle
            </button>
          </div>
        )}

        {/* Existing samples */}
        {samples.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 mb-1">
              Kayitli Ornekler ({samples.length})
            </div>
            {samples.map((sample, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-zinc-900/30 rounded-lg px-4 py-3"
              >
                <p className="flex-1 text-sm text-zinc-300 whitespace-pre-wrap">
                  {sample}
                </p>
                <button
                  onClick={() => handleDeleteSample(i)}
                  className="text-xs text-zinc-600 hover:text-red-400 shrink-0"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Henuz ornek tweet eklenmemis. AI&apos;in senin gibi yazmasi icin ornekler ekle!
          </p>
        )}
      </div>

      {/* Style Analysis */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">Tarz Analizi</h3>

        {persona && (
          <div className="bg-zinc-900/50 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {persona}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || samples.length < 5}
            className="btn-primary text-sm px-6 py-2 disabled:opacity-40"
          >
            {analyzing ? "Analiz ediliyor..." : "Tarzimi Analiz Et"}
          </button>
          {persona && (
            <button
              onClick={handleResetPersona}
              className="text-sm px-4 py-2 border border-zinc-700 rounded-lg hover:border-red-500/50 hover:text-red-300 transition-colors"
            >
              Sifirla
            </button>
          )}
        </div>

        {samples.length < 5 && (
          <p className="text-xs text-zinc-500">
            Analiz icin en az 5 ornek gerekli. Su an: {samples.length}/5
          </p>
        )}

        {analyzeResult && (
          <TestResult result={analyzeResult} />
        )}
      </div>

      {/* Manual Persona */}
      <div className="glass-card space-y-4">
        <button
          onClick={() => setShowManual(!showManual)}
          className="font-semibold text-white text-sm flex items-center gap-2"
        >
          Manuel Persona Tanimi
          <span className="text-zinc-500">{showManual ? "▲" : "▼"}</span>
        </button>

        {showManual && (
          <div className="space-y-3">
            <textarea
              value={manualPersona}
              onChange={(e) => setManualPersona(e.target.value)}
              placeholder="Orn: Genc bir Turk yazilimciyim. Kisa ve oz yaziyorum..."
              rows={6}
              className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
            />
            <button
              onClick={handleSavePersona}
              className="btn-primary text-sm px-4 py-2"
            >
              Kaydet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
