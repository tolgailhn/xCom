/* ── Discovery Shared Helpers ──────────────────────────── */

export function timeAgo(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    const abs = Math.abs(diff);
    if (abs < 60) return `${abs}sn`;
    if (abs < 3600) return `${Math.floor(abs / 60)}dk`;
    if (abs < 86400) return `${Math.floor(abs / 3600)}sa`;
    return `${Math.floor(abs / 86400)}g`;
  } catch {
    return "";
  }
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    const today = formatDateStr(new Date());
    const yesterday = formatDateStr(new Date(Date.now() - 86400000));
    if (dateStr === today) return "Bugun";
    if (dateStr === yesterday) return "Dun";
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
  } catch {
    return dateStr;
  }
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "var(--accent-green)";
  if (score >= 50) return "var(--accent-amber)";
  if (score >= 20) return "var(--accent-blue)";
  return "var(--text-secondary)";
}

export function getImportanceColor(importance: string): string {
  switch (importance) {
    case "yuksek": return "var(--accent-green)";
    case "orta": return "var(--accent-amber)";
    default: return "var(--text-secondary)";
  }
}

const GM_REGEX = /^(GM|GN|Good\s*morning|Good\s*night)\b/i;
const GM_REGEX2 = /how\s+is\s+your\s+(week|day)/i;

export function isLowQualityTweet(text: string): boolean {
  return GM_REGEX.test(text.trim()) || GM_REGEX2.test(text);
}

export function openInX(text: string): void {
  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text);
}

export const IMPORTANCE_BADGE: Record<string, { label: string; cls: string }> = {
  yuksek: { label: "Yuksek", cls: "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/30" },
  orta: { label: "Orta", cls: "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/30" },
  dusuk: { label: "Dusuk", cls: "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)] border-[var(--text-secondary)]/30" },
};

export interface StyleOption { id: string; name: string; desc: string }
export interface FormatOption { id: string; name: string; desc: string }
