"use client";

export interface ResearchData {
  summary: string;
  key_points: string[];
  sources: { title: string; url?: string }[];
  progress: string;
}

interface ResearchPanelProps {
  research: ResearchData | undefined;
  isResearching: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function ResearchPanel({ research, isResearching, isExpanded, onToggleExpand }: ResearchPanelProps) {
  if (!research) return null;

  // Show progress spinner
  if (research.progress) {
    return (
      <div className="text-xs text-[var(--accent-blue)] animate-pulse flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
        {research.progress}
      </div>
    );
  }

  if (!research.summary) return null;

  return (
    <div className="space-y-3 backdrop-blur-sm bg-gradient-to-br from-[var(--accent-blue)]/5 to-transparent rounded-xl p-4 border border-[var(--accent-blue)]/20">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--accent-green)] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
          Arastirma Sonuclari
        </h4>
        <button onClick={onToggleExpand} className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          {isExpanded ? "Gizle" : "Goster"}
        </button>
      </div>

      {isExpanded && (
        <>
          <p className="text-xs leading-relaxed text-[var(--text-primary)]">
            {research.summary.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}
          </p>

          {research.key_points.length > 0 && (
            <ul className="text-xs space-y-1.5 pl-1">
              {research.key_points.map((kp, i) => (
                <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: i < 3 ? "var(--accent-green)" : i < 6 ? "var(--accent-amber)" : "var(--text-secondary)" }}
                  />
                  {kp}
                </li>
              ))}
            </ul>
          )}

          {research.sources.length > 0 && (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                Kaynaklar ({research.sources.length})
              </summary>
              <div className="mt-1 space-y-0.5">
                {research.sources.slice(0, 5).map((s, i) => (
                  <div key={i}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline">{s.title}</a>
                    ) : (
                      <span>{s.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
