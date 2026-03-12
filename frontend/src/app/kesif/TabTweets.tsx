"use client";

import { useState, useEffect } from "react";
import {
  researchTopicStream,
  generateQuoteTweet,
  findMedia,
  generateInfographic,
  addDraft,
  extractTweet,
  getStyles,
  summarizeDiscoveryTweets,
  getDiscoveryTweets,
  type DiscoveryTweet,
  type DiscoveryStatus,
} from "@/lib/api";

/* ── Helpers ─────────────────────────────────────────── */

function timeAgo(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}sn`;
    if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
    return `${Math.floor(diff / 86400)}g`;
  } catch {
    return "";
  }
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateLabel(dateStr: string): string {
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

const importanceBadge: Record<string, { label: string; cls: string }> = {
  yuksek: { label: "Yuksek", cls: "bg-[var(--accent-red)]/20 text-[var(--accent-red)] border-[var(--accent-red)]/30" },
  orta: { label: "Orta", cls: "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/30" },
  dusuk: { label: "Dusuk", cls: "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)] border-[var(--text-secondary)]/30" },
};

interface StyleOption {
  id: string;
  name: string;
  desc: string;
}

interface FormatOption {
  id: string;
  name: string;
  desc: string;
}

/* ── Props ───────────────────────────────────────────── */

interface TabTweetsProps {
  tweets: DiscoveryTweet[];
  setTweets: React.Dispatch<React.SetStateAction<DiscoveryTweet[]>>;
  status: DiscoveryStatus | null;
}

/* ── Main ────────────────────────────────────────────── */

export default function TabTweets({ tweets, setTweets }: TabTweetsProps) {
  // Expanded states
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [activeResearch, setActiveResearch] = useState<string | null>(null);
  const [activeGenerate, setActiveGenerate] = useState<string | null>(null);

  // Per-tweet research & generation state
  const [researchData, setResearchData] = useState<Record<string, { summary: string; key_points: string[]; sources: { title: string; url?: string }[]; progress: string }>>({});
  const [generatedTexts, setGeneratedTexts] = useState<Record<string, { text: string; score: number }>>({});
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // Style & length per tweet
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Media
  const [mediaResults, setMediaResults] = useState<Record<string, Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; media_type?: string; type?: string; source?: string; author?: string }>>>({});
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);

  // Infographic
  const [infographicData, setInfographicData] = useState<Record<string, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<string | null>(null);

  // Filter
  const [filterAccount, setFilterAccount] = useState("");
  const [filterImportance, setFilterImportance] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(formatDateStr(new Date()));

  // Accordion: hesap bazli gruplama
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [groupByAccount, setGroupByAccount] = useState(true);

  // TR Ceviri
  const [summarizing, setSummarizing] = useState(false);
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [translatingAll, setTranslatingAll] = useState(false);

  // Arka planda Turkce ceviri uret
  useEffect(() => {
    if (tweets.length === 0 || summarizing) return;
    const needsTranslation = tweets.filter(t => {
      const s = t.summary_tr || "";
      if (!s) return true;
      const textClean = t.text.replace(/https?:\/\/\S+/g, "[link]").trim();
      const sClean = s.replace(/https?:\/\/\S+/g, "[link]").trim();
      return sClean === textClean.slice(0, sClean.length) || s === t.text.slice(0, 200);
    });
    if (needsTranslation.length === 0) return;
    setSummarizing(true);
    const ids = needsTranslation.map(t => t.tweet_id);
    summarizeDiscoveryTweets(ids, true)
      .then(res => {
        if (res.updated > 0) {
          getDiscoveryTweets().then(r => setTweets(r.tweets)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setSummarizing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweets.length]);

  // Fetch styles & formats
  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => {
        setStyles(r.styles);
        setFormats(r.formats);
      })
      .catch(() => {});
  }, []);

  /* ── Handlers ──────────────────────────────────────── */

  const handleResearch = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setResearchingId(id);
    setActiveResearch(id);
    setResearchData(prev => ({ ...prev, [id]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." } }));

    try {
      let fullText = tweet.text;
      try {
        const extracted = await extractTweet(tweet.tweet_url);
        if (extracted?.full_thread_text) {
          fullText = extracted.full_thread_text;
        } else if (extracted?.text) {
          fullText = extracted.text;
        }
      } catch {
        // extract basarisiz olursa orijinal text kullan
      }

      const result = await researchTopicStream(
        { topic: fullText, engine: "default", tweet_id: tweet.tweet_id, tweet_author: tweet.account },
        (progress) => {
          setResearchData(prev => ({
            ...prev,
            [id]: { ...prev[id], progress },
          }));
        },
      );
      setResearchData(prev => ({
        ...prev,
        [id]: {
          summary: result.summary,
          key_points: result.key_points,
          sources: result.sources,
          progress: "",
        },
      }));
    } catch (e) {
      setResearchData(prev => ({
        ...prev,
        [id]: { ...prev[id], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` },
      }));
    } finally {
      setResearchingId(null);
    }
  };

  const handleGenerate = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setGeneratingId(id);
    setActiveGenerate(id);

    try {
      const research = researchData[id];
      const researchSummary = research
        ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}`
        : "";

      const result = await generateQuoteTweet({
        original_tweet: tweet.text,
        original_author: tweet.account,
        style: tweetStyle,
        research_summary: researchSummary,
        length_preference: tweetLength,
        provider: provider || undefined,
      });

      setGeneratedTexts(prev => ({
        ...prev,
        [id]: { text: result.text, score: result.score?.overall || 0 },
      }));
    } catch (e) {
      setGeneratedTexts(prev => ({
        ...prev,
        [id]: { text: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`, score: 0 },
      }));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleFindMedia = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setMediaLoading(id);
    try {
      const result = await findMedia(tweet.text.slice(0, 100), "both");
      setMediaResults(prev => ({ ...prev, [id]: result.results || [] }));
    } catch {
      // ignore
    } finally {
      setMediaLoading(null);
    }
  };

  const handleTranslate = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setTranslatingIds(prev => new Set(prev).add(id));
    try {
      const res = await summarizeDiscoveryTweets([id], true);
      if (res.updated > 0) {
        const r = await getDiscoveryTweets();
        setTweets(r.tweets);
      }
    } catch { /* ignore */ }
    setTranslatingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleInfographic = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setInfographicLoading(id);
    try {
      const research = researchData[id];
      const result = await generateInfographic({
        topic: tweet.text.slice(0, 200),
        research_summary: research?.summary || "",
        key_points: research?.key_points || [],
      });
      if (result.success) {
        setInfographicData(prev => ({ ...prev, [id]: { image: result.image_base64, format: result.image_format } }));
      }
    } catch {
      // ignore
    } finally {
      setInfographicLoading(null);
    }
  };

  const openInX = (text: string) => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const openQuoteInX = (tweetUrl: string) => {
    window.open(tweetUrl, "_blank");
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleThread = (id: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ── Computed ──────────────────────────────────────── */

  const todayStr = formatDateStr(new Date());
  const minDateStr = formatDateStr(new Date(Date.now() - 7 * 86400000));

  const goToDate = (offset: number) => {
    if (selectedDate === "all") {
      setSelectedDate(todayStr);
      return;
    }
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    const newDate = formatDateStr(d);
    if (newDate > todayStr || newDate < minDateStr) return;
    setSelectedDate(newDate);
  };

  const goToToday = () => setSelectedDate(todayStr);

  const tweetCountByDate: Record<string, number> = {};
  for (const t of tweets) {
    try {
      const ds = formatDateStr(new Date(t.created_at));
      tweetCountByDate[ds] = (tweetCountByDate[ds] || 0) + 1;
    } catch { /* skip */ }
  }

  const filteredTweets = tweets.filter(t => {
    if (filterAccount && t.account.toLowerCase() !== filterAccount.toLowerCase()) return false;
    if (filterImportance && t.importance !== filterImportance) return false;
    if (selectedDate !== "all") {
      try {
        const tweetDate = new Date(t.created_at);
        const tweetDateStr = formatDateStr(tweetDate);
        if (tweetDateStr !== selectedDate) return false;
      } catch { /* keep */ }
    }
    return true;
  });

  const uniqueAccounts = [...new Set(tweets.map(t => t.account))].sort();

  /* ── Render ────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Date Navigation Bar */}
      <div className="glass-card p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => goToDate(-1)}
            disabled={selectedDate === "all" || selectedDate <= minDateStr}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30"
          >
            &larr; Onceki Gun
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedDate === "all" ? "bg-[var(--accent-blue)] text-white" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              Tumunu ({tweets.length})
            </button>
            <button
              onClick={goToToday}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedDate === todayStr ? "bg-[var(--accent-blue)] text-white" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              Bugun
            </button>
            {selectedDate !== "all" && (
              <span className="text-xs font-semibold">
                {formatDateLabel(selectedDate)} &middot; {selectedDate}
                {tweetCountByDate[selectedDate] != null && (
                  <span className="ml-1 text-[var(--text-secondary)]">({tweetCountByDate[selectedDate]})</span>
                )}
              </span>
            )}
          </div>
          <button
            onClick={() => goToDate(1)}
            disabled={selectedDate === "all" || selectedDate >= todayStr}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30"
          >
            Sonraki Gun &rarr;
          </button>
        </div>
      </div>

      {/* Other Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filterAccount}
          onChange={e => setFilterAccount(e.target.value)}
          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Tum Hesaplar</option>
          {uniqueAccounts.map(a => (
            <option key={a} value={a}>@{a}</option>
          ))}
        </select>
        <select
          value={filterImportance}
          onChange={e => setFilterImportance(e.target.value)}
          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Tum Onem</option>
          <option value="yuksek">Yuksek</option>
          <option value="orta">Orta</option>
          <option value="dusuk">Dusuk</option>
        </select>
        <button
          onClick={() => setGroupByAccount(!groupByAccount)}
          className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${groupByAccount ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}
        >
          {groupByAccount ? "Hesap Grubu: Acik" : "Hesap Grubu: Kapali"}
        </button>
        <button
          onClick={async () => {
            setTranslatingAll(true);
            try {
              const ids = filteredTweets.map(t => t.tweet_id);
              const res = await summarizeDiscoveryTweets(ids, true);
              if (res.updated > 0) {
                const r = await getDiscoveryTweets();
                setTweets(r.tweets);
              }
            } catch { /* ignore */ }
            setTranslatingAll(false);
          }}
          disabled={translatingAll || summarizing || filteredTweets.length === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/30 transition-colors disabled:opacity-50"
        >
          {translatingAll ? "Cevriliyor..." : `Tumunu Cevir (${filteredTweets.length})`}
        </button>
        {(summarizing || translatingAll) && (
          <span className="text-[10px] text-[var(--accent-amber)] animate-pulse">TR ceviri uretiliyor...</span>
        )}
        <span className="text-xs text-[var(--text-secondary)]">
          {filteredTweets.length} tweet gosteriliyor
        </span>
      </div>

      {/* Tweet cards */}
      {filteredTweets.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-[var(--text-secondary)]">
            {tweets.length === 0 ? "Henuz tweet taranmadi. \"Simdi Tara\" butonuna basin." : "Filtreye uygun tweet bulunamadi."}
          </p>
        </div>
      ) : groupByAccount && !filterAccount ? (
        /* Hesap bazli accordion gruplama */
        <div className="space-y-2">
          {(() => {
            const groups: Record<string, DiscoveryTweet[]> = {};
            for (const t of filteredTweets) {
              if (!groups[t.account]) groups[t.account] = [];
              groups[t.account].push(t);
            }
            const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => {
              const aPriority = a[0]?.is_priority ? 1 : 0;
              const bPriority = b[0]?.is_priority ? 1 : 0;
              if (aPriority !== bPriority) return bPriority - aPriority;
              const aMax = Math.max(...a.map(t => t.display_score));
              const bMax = Math.max(...b.map(t => t.display_score));
              return bMax - aMax;
            });
            let globalIdx = 0;
            return sortedGroups.map(([account, accountTweets]) => {
              const isExpanded = expandedAccounts.has(account);
              const maxScore = Math.max(...accountTweets.map(t => t.display_score));
              const isPriority = accountTweets[0]?.is_priority;
              const latestTime = accountTweets.reduce((latest, t) => {
                const tc = t.created_at || t.scanned_at;
                return tc > latest ? tc : latest;
              }, "");
              const startIdx = globalIdx;
              globalIdx += accountTweets.length;
              return (
                <div key={account} className="glass-card overflow-hidden">
                  <button
                    onClick={() => {
                      setExpandedAccounts(prev => {
                        const next = new Set(prev);
                        if (next.has(account)) next.delete(account); else next.add(account);
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between gap-3 p-3 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg font-bold" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>&#9654;</span>
                      <a
                        href={`https://x.com/${account}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[var(--accent-blue)] hover:underline text-sm"
                        onClick={e => e.stopPropagation()}
                      >
                        @{account}
                      </a>
                      <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">
                        {accountTweets.length} tweet
                      </span>
                      {isPriority && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">
                          Oncelikli
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-[var(--text-secondary)]">{timeAgo(latestTime)}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold">{Math.round(maxScore)}</span>
                        <span className="text-[10px] text-[var(--text-secondary)] ml-1">max</span>
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="space-y-3 p-3 pt-0 border-t border-[var(--border)]">
                      {accountTweets.map((tweet, idx) => (
                        <TweetCard
                          key={tweet.tweet_id}
                          tweet={tweet}
                          index={startIdx + idx + 1}
                          isThreadExpanded={expandedThreads.has(tweet.tweet_id)}
                          onToggleThread={() => toggleThread(tweet.tweet_id)}
                          isResearchActive={activeResearch === tweet.tweet_id}
                          isGenerateActive={activeGenerate === tweet.tweet_id}
                          researchResult={researchData[tweet.tweet_id]}
                          generatedResult={generatedTexts[tweet.tweet_id]}
                          isResearching={researchingId === tweet.tweet_id}
                          isGenerating={generatingId === tweet.tweet_id}
                          onResearch={() => handleResearch(tweet)}
                          onGenerate={() => handleGenerate(tweet)}
                          onOpenInX={openInX}
                          onOpenQuoteInX={() => openQuoteInX(tweet.tweet_url)}
                          onCopy={copyText}
                          onFindMedia={() => handleFindMedia(tweet)}
                          onInfographic={() => handleInfographic(tweet)}
                          mediaResults={mediaResults[tweet.tweet_id]}
                          mediaLoading={mediaLoading === tweet.tweet_id}
                          infographicData={infographicData[tweet.tweet_id]}
                          infographicLoading={infographicLoading === tweet.tweet_id}
                          styles={styles}
                          formats={formats}
                          tweetStyle={tweetStyle}
                          setTweetStyle={setTweetStyle}
                          tweetLength={tweetLength}
                          setTweetLength={setTweetLength}
                          provider={provider}
                          setProvider={setProvider}
                          onSaveDraft={async (text: string) => {
                            await addDraft({ text, topic: tweet.tweet_url, style: tweetStyle });
                          }}
                          onSetActiveResearch={() => setActiveResearch(activeResearch === tweet.tweet_id ? null : tweet.tweet_id)}
                          onSetActiveGenerate={() => setActiveGenerate(activeGenerate === tweet.tweet_id ? null : tweet.tweet_id)}
                          onTranslate={() => handleTranslate(tweet)}
                          isTranslating={translatingIds.has(tweet.tweet_id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      ) : (
        /* Normal duz liste */
        <div className="space-y-3">
          {filteredTweets.map((tweet, idx) => (
            <TweetCard
              key={tweet.tweet_id}
              tweet={tweet}
              index={idx + 1}
              isThreadExpanded={expandedThreads.has(tweet.tweet_id)}
              onToggleThread={() => toggleThread(tweet.tweet_id)}
              isResearchActive={activeResearch === tweet.tweet_id}
              isGenerateActive={activeGenerate === tweet.tweet_id}
              researchResult={researchData[tweet.tweet_id]}
              generatedResult={generatedTexts[tweet.tweet_id]}
              isResearching={researchingId === tweet.tweet_id}
              isGenerating={generatingId === tweet.tweet_id}
              onResearch={() => handleResearch(tweet)}
              onGenerate={() => handleGenerate(tweet)}
              onOpenInX={openInX}
              onOpenQuoteInX={() => openQuoteInX(tweet.tweet_url)}
              onCopy={copyText}
              onFindMedia={() => handleFindMedia(tweet)}
              onInfographic={() => handleInfographic(tweet)}
              mediaResults={mediaResults[tweet.tweet_id]}
              mediaLoading={mediaLoading === tweet.tweet_id}
              infographicData={infographicData[tweet.tweet_id]}
              infographicLoading={infographicLoading === tweet.tweet_id}
              styles={styles}
              formats={formats}
              tweetStyle={tweetStyle}
              setTweetStyle={setTweetStyle}
              tweetLength={tweetLength}
              setTweetLength={setTweetLength}
              provider={provider}
              setProvider={setProvider}
              onSaveDraft={async (text: string) => {
                await addDraft({ text, topic: tweet.tweet_url, style: tweetStyle });
              }}
              onSetActiveResearch={() => setActiveResearch(activeResearch === tweet.tweet_id ? null : tweet.tweet_id)}
              onSetActiveGenerate={() => setActiveGenerate(activeGenerate === tweet.tweet_id ? null : tweet.tweet_id)}
              onTranslate={() => handleTranslate(tweet)}
              isTranslating={translatingIds.has(tweet.tweet_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TweetCard Component ─────────────────────────────── */

function TweetCard({
  tweet,
  index,
  isThreadExpanded,
  onToggleThread,
  isResearchActive,
  isGenerateActive,
  researchResult,
  generatedResult,
  isResearching,
  isGenerating,
  onResearch,
  onGenerate,
  onOpenInX,
  onOpenQuoteInX,
  onCopy,
  onFindMedia,
  onInfographic,
  mediaResults,
  mediaLoading,
  infographicData,
  infographicLoading,
  styles,
  formats,
  tweetStyle,
  setTweetStyle,
  tweetLength,
  setTweetLength,
  provider,
  setProvider,
  onSaveDraft,
  onSetActiveResearch,
  onSetActiveGenerate,
  onTranslate,
  isTranslating,
}: {
  tweet: DiscoveryTweet;
  index: number;
  isThreadExpanded: boolean;
  onToggleThread: () => void;
  isResearchActive: boolean;
  isGenerateActive: boolean;
  researchResult?: { summary: string; key_points: string[]; sources: { title: string; url?: string }[]; progress: string };
  generatedResult?: { text: string; score: number };
  isResearching: boolean;
  isGenerating: boolean;
  onResearch: () => void;
  onGenerate: () => void;
  onOpenInX: (text: string) => void;
  onOpenQuoteInX: () => void;
  onCopy: (text: string) => void;
  onFindMedia: () => void;
  onInfographic: () => void;
  mediaResults?: Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; media_type?: string; type?: string; source?: string; author?: string }>;
  mediaLoading: boolean;
  infographicData?: { image: string; format: string };
  infographicLoading: boolean;
  styles: StyleOption[];
  formats: FormatOption[];
  tweetStyle: string;
  setTweetStyle: (s: string) => void;
  tweetLength: string;
  setTweetLength: (s: string) => void;
  provider: string;
  setProvider: (s: string) => void;
  onSaveDraft: (text: string) => Promise<void>;
  onSetActiveResearch: () => void;
  onSetActiveGenerate: () => void;
  onTranslate: () => void;
  isTranslating: boolean;
}) {
  const badge = importanceBadge[tweet.importance] || importanceBadge.dusuk;
  const [draftSaved, setDraftSaved] = useState(false);
  const [editedText, setEditedText] = useState("");

  useEffect(() => {
    if (generatedResult?.text) setEditedText(generatedResult.text);
  }, [generatedResult?.text]);

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg font-bold text-[var(--text-secondary)] shrink-0">#{index}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://x.com/${tweet.account}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--accent-blue)] hover:underline text-sm"
              >
                @{tweet.account}
              </a>
              {tweet.is_priority && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">
                  Oncelikli
                </span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>
                {badge.label}
              </span>
              {tweet.is_thread && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30">
                  Thread ({tweet.thread_parts.length})
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              {timeAgo(tweet.created_at)} once &middot; {(() => { try { return new Date(tweet.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })()}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold">{Math.round(tweet.display_score)}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">skor</div>
        </div>
      </div>

      {/* Engagement stats */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20" title="Begeni">{formatNumber(tweet.like_count)} begeni</span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20" title="Repost">{formatNumber(tweet.retweet_count)} RT</span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20" title="Yanit">{formatNumber(tweet.reply_count)} yanit</span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20" title="Yer Isareti">{formatNumber(tweet.bookmark_count)} kayit</span>
      </div>

      {/* Turkish summary as main text */}
      {tweet.summary_tr && tweet.summary_tr !== tweet.text.slice(0, 200) ? (
        <>
          <div className="text-sm leading-relaxed font-medium text-[var(--text-primary)]">
            &#127481;&#127479; {tweet.summary_tr}
          </div>
          <details className="group">
            <summary className="text-[11px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent-purple)]">
              Orijinal tweet&apos;i gor
            </summary>
            <div className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)] opacity-70">{tweet.text}</div>
          </details>
        </>
      ) : (
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{tweet.text}</div>
      )}

      {/* Thread accordion */}
      {tweet.is_thread && tweet.thread_parts.length > 1 && (
        <div>
          <button
            onClick={onToggleThread}
            className="text-xs text-[var(--accent-purple)] hover:underline"
          >
            {isThreadExpanded ? "Thread'i Gizle" : `Thread'i Gor (${tweet.thread_parts.length} tweet)`}
          </button>
          {isThreadExpanded && (
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-[var(--accent-purple)]/30">
              {tweet.thread_parts.map((part, i) => (
                <div key={i} className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                  <span className="font-semibold text-[var(--accent-purple)]">{i + 1}.</span> {part.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--border)]">
        <button
          onClick={onResearch}
          disabled={isResearching}
          className="btn-primary text-xs"
        >
          {isResearching ? "Arastiriliyor..." : "Arastir"}
        </button>
        <a
          href={tweet.tweet_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs inline-flex items-center"
        >
          Tweet&apos;i Gor
        </a>
        <button onClick={onOpenQuoteInX} className="btn-secondary text-xs">
          X Quote Ac
        </button>
        <button
          onClick={onTranslate}
          disabled={isTranslating}
          className="text-xs px-2 py-1 rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/30 transition-colors disabled:opacity-50"
        >
          {isTranslating ? "Cevriliyor..." : "&#127481;&#127479; Cevir"}
        </button>
      </div>

      {/* Research progress */}
      {researchResult?.progress && (
        <div className="text-xs text-[var(--accent-blue)] animate-pulse">
          {researchResult.progress}
        </div>
      )}

      {/* Research results */}
      {researchResult && researchResult.summary && (
        <div className="space-y-3 bg-[var(--bg-secondary)] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[var(--accent-green)]">Arastirma Sonuclari</h4>
            <button onClick={onSetActiveResearch} className="text-[10px] text-[var(--text-secondary)] hover:underline">
              {isResearchActive ? "Gizle" : "Goster"}
            </button>
          </div>
          {isResearchActive && (
            <>
              <p className="text-xs leading-relaxed">
                {researchResult.summary.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}
              </p>
              {researchResult.key_points.length > 0 && (
                <ul className="text-xs space-y-1 list-disc pl-4 text-[var(--text-secondary)]">
                  {researchResult.key_points.map((kp, i) => (
                    <li key={i}>{kp}</li>
                  ))}
                </ul>
              )}
              {researchResult.sources.length > 0 && (
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-[var(--text-secondary)]">
                    Kaynaklar ({researchResult.sources.length})
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {researchResult.sources.slice(0, 5).map((s, i) => (
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

          {/* Generate section */}
          <div className="pt-2 border-t border-[var(--border)] space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select value={tweetStyle} onChange={e => setTweetStyle(e.target.value)} className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs">
                {styles.length > 0 ? styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : (
                  <option value="quote_tweet">Quote Tweet</option>
                )}
              </select>
              <select value={tweetLength} onChange={e => setTweetLength(e.target.value)} className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs">
                {formats.length > 0 ? formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : (
                  <option value="spark">Spark</option>
                )}
              </select>
              <select value={provider} onChange={e => setProvider(e.target.value)} className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs">
                <option value="">Otomatik</option>
                <option value="anthropic">Claude</option>
                <option value="openai">GPT</option>
                <option value="minimax">MiniMax</option>
                <option value="groq">Groq</option>
              </select>
              <button
                onClick={onGenerate}
                disabled={isGenerating}
                className="btn-primary text-xs"
              >
                {isGenerating ? "Uretiliyor..." : "Tweet Uret"}
              </button>
            </div>
          </div>

          {/* Generated tweet */}
          {generatedResult && (
            <div className="space-y-3 bg-[var(--bg-primary)] rounded-lg p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--accent-amber)]">Uretilen Tweet</h4>
                {generatedResult.score > 0 && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${generatedResult.score >= 80 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" : generatedResult.score >= 60 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" : "bg-[var(--accent-red)]/20 text-[var(--accent-red)]"}`}>
                    {generatedResult.score}/100
                  </span>
                )}
              </div>

              <textarea
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full min-h-[80px] resize-y"
                rows={3}
              />
              <div className="text-[10px] text-[var(--text-secondary)] text-right">
                {editedText.length} karakter
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onOpenInX(editedText)}
                  className="btn-primary text-xs"
                >
                  X&apos;te Ac
                </button>
                <button
                  onClick={() => {
                    window.open(tweet.tweet_url, "_blank");
                  }}
                  className="btn-secondary text-xs"
                >
                  X Quote Ac
                </button>
                <button onClick={() => onCopy(editedText)} className="btn-secondary text-xs">
                  Kopyala
                </button>
                <button
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="btn-secondary text-xs"
                >
                  Yeniden Uret
                </button>
                <button
                  onClick={async () => {
                    await onSaveDraft(editedText);
                    setDraftSaved(true);
                    setTimeout(() => setDraftSaved(false), 3000);
                  }}
                  className="btn-secondary text-xs"
                >
                  {draftSaved ? "Kaydedildi!" : "Taslak Kaydet"}
                </button>
              </div>

              {/* Media finder */}
              <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--border)]">
                <button
                  onClick={onFindMedia}
                  disabled={mediaLoading}
                  className="btn-secondary text-xs"
                >
                  {mediaLoading ? "Araniyor..." : "Gorsel/Video Bul"}
                </button>
                <button
                  onClick={onInfographic}
                  disabled={infographicLoading}
                  className="btn-secondary text-xs"
                >
                  {infographicLoading ? "Uretiliyor..." : "Gemini Infografik"}
                </button>
              </div>

              {/* Media results */}
              {mediaResults && mediaResults.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-[var(--accent-cyan)]">
                    Bulunan Medya ({mediaResults.length})
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {mediaResults.slice(0, 6).map((m, i) => {
                      const thumb = m.thumbnail_url || m.preview || m.url;
                      return (
                        <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block bg-[var(--bg-secondary)] rounded p-1.5 hover:ring-2 ring-[var(--accent-blue)] transition-all">
                          {thumb ? (
                            <img src={thumb} alt={m.title || ""} className="w-full h-24 object-cover rounded" loading="lazy" />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] rounded">Gorsel</div>
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
                    className="w-full rounded-lg border border-[var(--border)]"
                  />
                  <a
                    href={`data:image/${infographicData.format};base64,${infographicData.image}`}
                    download={`infographic_${Date.now()}.${infographicData.format}`}
                    className="btn-primary text-xs inline-block"
                  >
                    Gorseli Indir
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
