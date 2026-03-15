"use client";

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

interface ScoreBarProps {
  score: ScoreResult | null;
}

export default function ScoreBar({ score }: ScoreBarProps) {
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
