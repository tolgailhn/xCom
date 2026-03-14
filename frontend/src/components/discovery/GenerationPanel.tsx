"use client";

import { useState, useEffect } from "react";
import CircularGauge from "./CircularGauge";

export interface GeneratedData {
  text: string;
  score: number;
  thread_parts?: string[];
}

interface GenerationPanelProps {
  generated: GeneratedData | undefined;
  editedText: string;
  setEditedText: (t: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  onPublish?: (text: string, threadParts?: string[]) => void;
  onOpenInX: (text: string) => void;
  onOpenQuote?: () => void;
  onCopy: (text: string) => void;
  onSaveDraft: (text: string) => Promise<void>;
  tweetUrl?: string;
}

export default function GenerationPanel({
  generated, editedText, setEditedText,
  isGenerating, onGenerate,
  onPublish, onOpenInX, onOpenQuote, onCopy, onSaveDraft,
  tweetUrl,
}: GenerationPanelProps) {
  const [draftSaved, setDraftSaved] = useState(false);

  useEffect(() => {
    if (generated?.text) setEditedText(generated.text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated?.text]);

  if (!generated) return null;

  const isThread = generated.thread_parts && generated.thread_parts.length > 1;

  const handleSaveDraft = async () => {
    await onSaveDraft(editedText);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 3000);
  };

  const btnCls = "px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50 transition-all duration-300";

  return (
    <div className="space-y-3 backdrop-blur-sm bg-[var(--bg-primary)]/60 rounded-xl p-4 border border-[var(--border-primary)]/30">
      {/* Header with score */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--accent-amber)] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)]" />
          Uretilen Tweet
        </h4>
        {generated.score > 0 && (
          <CircularGauge
            value={generated.score}
            size={28}
            strokeWidth={2.5}
            colorFn={s => s >= 80 ? "var(--accent-green)" : s >= 60 ? "var(--accent-amber)" : "var(--accent-red)"}
          />
        )}
      </div>

      {/* Thread view */}
      {isThread ? (
        <>
          <div className="bg-[var(--bg-secondary)]/60 rounded-lg p-3 border border-[var(--accent-purple)]/30 space-y-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] font-medium">
              Thread ({generated.thread_parts!.length} tweet)
            </span>
            {generated.thread_parts!.map((part, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-[10px] text-[var(--accent-purple)] font-bold mt-0.5 shrink-0">
                  {i + 1}/{generated.thread_parts!.length}
                </span>
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">{part.replace(/^\d+\/\s*/, "")}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {onPublish && (
              <button
                onClick={() => onPublish(generated.thread_parts![0], generated.thread_parts!)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                style={{ background: "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))" }}
              >
                Thread Paylas
              </button>
            )}
            <button onClick={() => onOpenInX(generated.thread_parts![0].replace(/^\d+\/\s*/, ""))}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
              style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
              X&apos;te Ac
            </button>
            <button onClick={() => {
              const full = generated.thread_parts!.map((p, i) => `${i + 1}/${generated.thread_parts!.length} ${p.replace(/^\d+\/\s*/, "")}`).join("\n\n");
              onCopy(full);
            }} className={btnCls}>Kopyala</button>
            <button onClick={onGenerate} disabled={isGenerating} className={`${btnCls} disabled:opacity-50`}>Yeniden Uret</button>
            <button onClick={handleSaveDraft} className={btnCls}>{draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}</button>
          </div>
        </>
      ) : (
        /* Single tweet view */
        <>
          <div className="bg-[var(--bg-secondary)]/60 rounded-lg p-3 border border-[var(--border-primary)]/20">
            <textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              className="bg-transparent text-[var(--text-primary)] text-sm w-full min-h-[80px] resize-y outline-none"
              rows={4}
            />
            <div className="text-[10px] text-[var(--text-secondary)] text-right mt-1">{editedText.length} karakter</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onPublish && (
              <button
                onClick={() => onPublish(editedText)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                style={{ background: "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))" }}
              >
                API ile Paylas
              </button>
            )}
            <button onClick={() => onOpenInX(editedText)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
              style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
              X&apos;te Ac
            </button>
            {onOpenQuote && tweetUrl && (
              <button onClick={onOpenQuote} className={btnCls}>X Quote Ac</button>
            )}
            <button onClick={() => onCopy(editedText)} className={btnCls}>Kopyala</button>
            <button onClick={onGenerate} disabled={isGenerating} className={`${btnCls} disabled:opacity-50`}>Yeniden Uret</button>
            <button onClick={handleSaveDraft} className={btnCls}>{draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}</button>
          </div>
        </>
      )}
    </div>
  );
}
