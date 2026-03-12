"use client";

import { useState } from "react";
import type { TweetUrl } from "@/lib/api";

interface LinksBoxProps {
  links: TweetUrl[];
}

export default function LinksBox({ links }: LinksBoxProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  if (links.length === 0) return null;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div
      className="backdrop-blur-sm bg-[var(--bg-primary)]/40 rounded-lg p-3 border border-[var(--border-primary)]/30"
      style={{ borderLeft: "3px solid var(--accent-blue)" }}
    >
      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-1.5">Baglantilar</h5>
      <p className="text-[10px] text-[var(--text-secondary)] mb-2">Bu linkleri 2. tweetinize ekleyebilirsiniz</p>
      <div className="space-y-1.5">
        {links.map((link, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs bg-[var(--bg-secondary)]/60 rounded-lg px-2.5 py-1.5">
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline truncate min-w-0">
              {link.display_url || link.url}
            </a>
            <button
              onClick={() => handleCopy(link.url)}
              className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]/30 transition-all duration-200 shrink-0"
            >
              {copiedUrl === link.url ? "Kopyalandi!" : "Kopyala"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
