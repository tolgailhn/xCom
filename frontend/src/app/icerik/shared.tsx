"use client";

import { scoreTweet } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */

export interface ContentStyle {
  id: string;
  name: string;
  desc: string;
}

export interface FormatOption {
  id: string;
  name: string;
  desc: string;
}

export interface ProviderOption {
  id: string;
  name: string;
}

export interface DiscoveredTopic {
  title: string;
  description: string;
  angle: string;
  potential: string;
}

export interface ScoreResult {
  score: number;
  length: number;
  has_hook: boolean;
  has_cta: boolean;
  overall?: number;
  hook_score?: number;
  data_score?: number;
  naturalness_score?: number;
  depth_score?: number;
  format_score?: number;
  char_count?: number;
  suggestions?: string[];
  quality_label?: string;
}

export interface MediaItem {
  url: string;
  type: string;
  source: string;
  preview?: string;
  author?: string;
}

/* ── Score Bar ─────────────────────────────────────────── */

export function ScoreBar({ score }: { score: ScoreResult | null }) {
  if (!score) return null;
  const pct = score.overall ?? score.score;
  const color =
    pct >= 80
      ? "var(--accent-green)"
      : pct >= 60
        ? "var(--accent-yellow)"
        : "var(--accent-red)";

  const hasDetails = score.hook_score !== undefined;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">
          {score.quality_label || "Kalite"}: {pct}/100 | {score.char_count ?? score.length} kar
        </span>
      </div>
      <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {hasDetails && (
        <div className="flex gap-3 text-[10px] text-[var(--text-secondary)] mt-1">
          <span>Hook:{score.hook_score}/20</span>
          <span>Veri:{score.data_score}/20</span>
          <span>Dogallik:{score.naturalness_score}/20</span>
          <span>Derinlik:{score.depth_score}/20</span>
          <span>Format:{score.format_score}/20</span>
        </div>
      )}
      {score.suggestions && score.suggestions.length > 0 && pct < 70 && (
        <div className="text-[10px] text-[var(--accent-yellow)] mt-1">
          {score.suggestions[0]}
        </div>
      )}
    </div>
  );
}

/* ── Content Display ───────────────────────────────────── */

export function ContentDisplay({
  content,
  score,
  topic,
  mediaResults,
  mediaSource,
  mediaLoading,
  draftSaved,
  infographicImage,
  infographicFormat,
  infographicLoading,
  infographicError,
  onGenerateInfographic,
  onRegenerate,
  onFindMedia,
  onMediaSourceChange,
  onSaveDraft,
  onReScore,
}: {
  content: string;
  score: ScoreResult | null;
  topic: string;
  mediaResults: MediaItem[];
  mediaSource: string;
  mediaLoading: boolean;
  draftSaved: boolean;
  infographicImage: string | null;
  infographicFormat: string;
  infographicLoading: boolean;
  infographicError: string | null;
  onGenerateInfographic: () => void;
  onRegenerate: () => void;
  onFindMedia: () => void;
  onMediaSourceChange: (s: string) => void;
  onSaveDraft: () => void;
  onReScore: () => void;
}) {
  return (
    <div className="glass-card space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Uretilen Icerik</h4>
        <button
          onClick={() => navigator.clipboard.writeText(content)}
          className="text-xs text-[var(--accent-blue)] hover:underline"
        >
          Kopyala
        </button>
      </div>

      <div className="bg-[var(--bg-primary)] rounded-lg p-5 text-sm whitespace-pre-line leading-relaxed max-h-[600px] overflow-y-auto">
        {content}
      </div>

      <ScoreBar score={score} />

      {/* Tools: Media */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select
            value={mediaSource}
            onChange={(e) => onMediaSourceChange(e.target.value)}
            className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="x">X</option>
            <option value="web">Web</option>
            <option value="both">Her ikisi</option>
          </select>
          <button
            onClick={onFindMedia}
            disabled={mediaLoading}
            className="btn-secondary text-xs"
          >
            {mediaLoading ? "Araniyor..." : "Gorsel/Video Bul"}
          </button>
        </div>
        <button onClick={onReScore} className="btn-secondary text-xs">
          Yeniden Puanla
        </button>
      </div>

      {/* Media results */}
      {mediaResults.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--accent-cyan)]">
            Bulunan Medya ({mediaResults.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {mediaResults.map((m, i) => (
              <a
                key={i}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-[var(--bg-primary)] rounded-lg p-2 hover:ring-1 ring-[var(--accent-blue)] transition-all"
              >
                {m.preview ? (
                  <img src={m.preview} alt="" className="w-full h-20 object-cover rounded" />
                ) : (
                  <div className="w-full h-20 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                    {m.type === "video" ? "Video" : "Gorsel"}
                  </div>
                )}
                <div className="text-[10px] text-[var(--text-secondary)] mt-1 truncate">
                  {m.source}{m.author ? ` @${m.author}` : ""}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Infographic Generation */}
      <div className="space-y-3 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onGenerateInfographic}
            disabled={infographicLoading}
            className="btn-secondary text-xs"
          >
            {infographicLoading ? "Infografik Uretiliyor..." : "Gemini ile Infografik Uret"}
          </button>
          <span className="text-[10px] text-[var(--text-secondary)]">16:9 landscape</span>
        </div>
        {infographicError && (
          <p className="text-xs text-[var(--accent-red)]">{infographicError}</p>
        )}
        {infographicImage && (
          <div className="space-y-2">
            <img
              src={`data:image/${infographicFormat};base64,${infographicImage}`}
              alt="Infografik"
              className="w-full rounded-lg border border-[var(--border)]"
            />
            <a
              href={`data:image/${infographicFormat};base64,${infographicImage}`}
              download={`infographic_${Date.now()}.${infographicFormat}`}
              className="btn-primary text-xs inline-block"
            >
              Gorseli Indir
            </a>
          </div>
        )}
      </div>

      {/* X'te Ac link */}
      {content.length <= 280 && (
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(content)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm inline-block"
        >
          X&apos;te Ac
        </a>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button onClick={onRegenerate} className="btn-secondary text-sm">
          Yeniden Uret
        </button>
        <button onClick={onSaveDraft} className="btn-secondary text-sm">
          {draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}
        </button>
      </div>
    </div>
  );
}
