"use client";

import type { TweetMediaItem } from "@/lib/api";

export interface MediaItem {
  url: string;
  title?: string;
  thumbnail_url?: string;
  preview?: string;
  media_type?: string;
  type?: string;
  source?: string;
  author?: string;
}

interface MediaSectionProps {
  // Search results
  mediaResults?: MediaItem[];
  mediaLoading: boolean;
  onFindMedia: () => void;
  // Infographic
  infographicData?: { image: string; format: string };
  infographicLoading: boolean;
  onGenerateInfographic: () => void;
  // Extracted tweet media (optional)
  tweetMedia?: TweetMediaItem[];
}

export default function MediaSection({
  mediaResults, mediaLoading, onFindMedia,
  infographicData, infographicLoading, onGenerateInfographic,
  tweetMedia,
}: MediaSectionProps) {
  const btnCls = "px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-300 disabled:opacity-50";

  return (
    <div className="space-y-3">
      {/* Tweet media from extraction */}
      {tweetMedia && tweetMedia.length > 0 && (
        <div className="backdrop-blur-sm bg-gradient-to-br from-[var(--accent-purple)]/5 to-transparent rounded-lg p-3 border border-[var(--accent-purple)]/20">
          <h5 className="text-xs font-semibold text-[var(--accent-purple)] mb-2">Tweet Gorselleri ({tweetMedia.length})</h5>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tweetMedia.map((m, i) => (
              <div key={i} className="relative group rounded-lg overflow-hidden bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]/30">
                {m.type === "video" ? (
                  <>
                    {m.thumbnail ? (
                      <img src={m.thumbnail} alt={`Video ${i + 1}`} className="w-full max-h-48 object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center text-[var(--text-secondary)]">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      </div>
                    )}
                    <a href={m.url} target="_blank" rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent-purple)]/80">Video Indir</span>
                    </a>
                  </>
                ) : (
                  <>
                    <img src={m.thumbnail || m.url} alt={`Gorsel ${i + 1}`} className="w-full max-h-48 object-cover rounded-lg" loading="lazy" />
                    <a href={m.url} target="_blank" rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent-blue)]/80">Indir</span>
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--border-primary)]/30">
        <button onClick={onFindMedia} disabled={mediaLoading} className={`${btnCls} hover:border-[var(--accent-cyan)]/50`}>
          {mediaLoading ? "Araniyor..." : "Gorsel/Video Bul"}
        </button>
        <button onClick={onGenerateInfographic} disabled={infographicLoading} className={`${btnCls} hover:border-[var(--accent-amber)]/50`}>
          {infographicLoading ? "Uretiliyor..." : "Gemini Infografik"}
        </button>
      </div>

      {/* Found media results */}
      {mediaResults && mediaResults.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-[var(--accent-cyan)] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)]" />
            Bulunan Medya ({mediaResults.length})
          </h5>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {mediaResults.slice(0, 6).map((m, i) => {
              const thumb = m.thumbnail_url || m.preview || m.url;
              return (
                <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                  className="block bg-[var(--bg-primary)]/60 rounded-lg p-1.5 hover:ring-2 ring-[var(--accent-blue)] transition-all duration-300 border border-[var(--border-primary)]/20">
                  {thumb ? (
                    <img src={thumb} alt={m.title || ""} className="w-full h-24 object-cover rounded" loading="lazy" />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)]/60 rounded">Gorsel</div>
                  )}
                  <div className="text-[9px] text-[var(--text-secondary)] mt-1 truncate">{m.title || m.source || ""}</div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Infographic */}
      {infographicData && (
        <div className="space-y-2">
          <img
            src={`data:image/${infographicData.format};base64,${infographicData.image}`}
            alt="Infografik"
            className="w-full rounded-lg border border-[var(--border-primary)]/30"
          />
          <a
            href={`data:image/${infographicData.format};base64,${infographicData.image}`}
            download={`infographic_${Date.now()}.${infographicData.format}`}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white inline-block transition-all duration-300"
            style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}
          >
            Gorseli Indir
          </a>
        </div>
      )}
    </div>
  );
}
