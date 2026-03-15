"use client";

import type { StyleOption, FormatOption } from "./helpers";

interface StyleFormatBarProps {
  styles: StyleOption[];
  formats: FormatOption[];
  selectedStyle: string;
  setSelectedStyle: (s: string) => void;
  selectedFormat: string;
  setSelectedFormat: (s: string) => void;
  selectedProvider?: string;
  setSelectedProvider?: (s: string) => void;
  compact?: boolean;
}

const selectCls = "bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all";

export default function StyleFormatBar({
  styles, formats,
  selectedStyle, setSelectedStyle,
  selectedFormat, setSelectedFormat,
  compact = false,
}: StyleFormatBarProps) {
  return (
    <div className={`flex flex-wrap gap-2 items-center ${compact ? "" : "pt-2"}`}>
      <select value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)} className={selectCls}>
        {styles.length > 0 ? styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : (
          <option value="quote_tweet">Quote Tweet</option>
        )}
      </select>
      <select value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} className={selectCls}>
        {formats.length > 0 ? formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : (
          <option value="spark">Spark</option>
        )}
      </select>
    </div>
  );
}
