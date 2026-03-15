"use client";

interface AIScoreBadgeProps {
  score: number | null | undefined;
  reason?: string;
  size?: "sm" | "md";
}

export default function AIScoreBadge({ score, reason, size = "sm" }: AIScoreBadgeProps) {
  if (score == null || score <= 0) return null;

  const colorCls =
    score >= 8 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" :
    score >= 5 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" :
    "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]";

  const textSize = size === "md" ? "text-xs" : "text-[10px]";

  return (
    <div
      className={`px-1.5 py-0.5 rounded ${textSize} font-bold ${colorCls}`}
      title={reason || "AI relevance score"}
    >
      AI: {score}/10
    </div>
  );
}
