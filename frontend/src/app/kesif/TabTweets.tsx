"use client";

import { useState, useEffect, useCallback } from "react";
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
  markTweetShared,
  unmarkTweetShared,
  getSharedTweets,
  aiScoreDiscoveryTweets,
  publishTweet,
  type DiscoveryTweet,
  type DiscoveryStatus,
  type TweetMediaItem,
  type TweetUrl,
} from "@/lib/api";

import {
  AIScoreBadge,
  CircularGauge,
  StyleFormatBar,
  ResearchPanel,
  GenerationPanel,
  MediaSection,
  LinksBox,
  timeAgo,
  formatNumber,
  formatDateStr,
  formatDateLabel,
  getScoreColor,
  getImportanceColor,
  isLowQualityTweet,
  openInX,
  copyToClipboard,
  IMPORTANCE_BADGE,
  type StyleOption,
  type FormatOption,
  type ResearchData,
  type GeneratedData,
  type MediaItem,
} from "@/components/discovery";

/* ── Types ──────────────────────────────────────────── */

interface ExtractedMedia {
  media_items: TweetMediaItem[];
  urls: TweetUrl[];
  thread_urls: TweetUrl[];
  thread_media: TweetMediaItem[];
}

interface TabTweetsProps {
  tweets: DiscoveryTweet[];
  setTweets: React.Dispatch<React.SetStateAction<DiscoveryTweet[]>>;
  status: DiscoveryStatus | null;
  allAccounts?: string[];
}

/* ── Main Component ─────────────────────────────────── */

export default function TabTweets({ tweets, setTweets, allAccounts = [] }: TabTweetsProps) {
  // Expansion: level 2 = card expanded, level 3 = workflow panel open
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [workflowCard, setWorkflowCard] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  // Research & Generation per tweet
  const [researchData, setResearchData] = useState<Record<string, ResearchData>>({});
  const [generatedTexts, setGeneratedTexts] = useState<Record<string, GeneratedData>>({});
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [researchExpanded, setResearchExpanded] = useState<Set<string>>(new Set(["__all__"]));

  // Extracted media per tweet
  const [extractedMedia, setExtractedMedia] = useState<Record<string, ExtractedMedia>>({});

  // Style & provider (global)
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Media search results
  const [mediaResults, setMediaResults] = useState<Record<string, MediaItem[]>>({});
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);

  // Infographic
  const [infographicData, setInfographicData] = useState<Record<string, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<string | null>(null);

  // Filters
  const [filterAccount, setFilterAccount] = useState("");
  const [filterImportance, setFilterImportance] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(formatDateStr(new Date()));
  const [hideGM, setHideGM] = useState(true);
  const [hideShared, setHideShared] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Account accordion
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [groupByAccount, setGroupByAccount] = useState(true);

  // Shared tweets
  const [sharedTweetIds, setSharedTweetIds] = useState<Set<string>>(new Set());

  // AI Scoring & Sort
  const [aiScoring, setAiScoring] = useState(false);
  const [aiScoredCount, setAiScoredCount] = useState(0);
  const [sortBy, setSortBy] = useState<"default" | "ai" | "newest">("ai");

  // Translation
  const [summarizing, setSummarizing] = useState(false);
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [translatingAll, setTranslatingAll] = useState(false);

  /* ── Effects ──────────────────────────────────────── */

  // Background Turkish translation
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
    summarizeDiscoveryTweets(needsTranslation.map(t => t.tweet_id), true)
      .then(res => { if (res.updated > 0) getDiscoveryTweets().then(r => setTweets(r.tweets)).catch(() => {}); })
      .catch(() => {})
      .finally(() => setSummarizing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweets.length]);

  // Load styles, shared tweets, AI scoring
  useEffect(() => {
    getStyles().then((r: { styles: StyleOption[]; formats: FormatOption[] }) => { setStyles(r.styles); setFormats(r.formats); }).catch(() => {});
    getSharedTweets().then(d => setSharedTweetIds(new Set(d.tweet_ids || []))).catch(() => {});
    aiScoreDiscoveryTweets().then(r => setAiScoredCount(r.scored || 0)).catch(() => {});
  }, []);

  /* ── Handlers ─────────────────────────────────────── */

  const handleResearch = useCallback(async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setResearchingId(id);
    setWorkflowCard(id);
    setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [id]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." } }));

    try {
      let fullText = tweet.text;
      try {
        const extracted = await extractTweet(tweet.tweet_url);
        if (extracted?.full_thread_text) fullText = extracted.full_thread_text;
        else if (extracted?.text) fullText = extracted.text;
        const mi = extracted?.media_items || [];
        const u = extracted?.urls || [];
        const tu = extracted?.thread_urls || [];
        const tm = extracted?.thread_media || [];
        if (mi.length > 0 || u.length > 0 || tu.length > 0 || tm.length > 0) {
          setExtractedMedia((prev: Record<string, ExtractedMedia>) => ({ ...prev, [id]: { media_items: mi, urls: u, thread_urls: tu, thread_media: tm } }));
        }
      } catch { /* use original text */ }

      const result = await researchTopicStream(
        { topic: fullText, engine: "default", tweet_id: tweet.tweet_id, tweet_author: tweet.account },
        (progress: string) => setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [id]: { ...prev[id], progress } })),
      );
      setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [id]: { summary: result.summary, key_points: result.key_points, sources: result.sources, progress: "" } }));
    } catch (e) {
      setResearchData((prev: Record<string, ResearchData>) => ({ ...prev, [id]: { ...prev[id], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` } }));
    } finally {
      setResearchingId(null);
    }
  }, []);

  const handleGenerate = useCallback(async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setGeneratingId(id);
    try {
      const research = researchData[id];
      const researchSummary = research ? `${research.summary}\n\nKey Points:\n${research.key_points.join("\n")}` : "";
      const result = await generateQuoteTweet({
        original_tweet: tweet.text, original_author: tweet.account,
        style: tweetStyle, research_summary: researchSummary,
        length_preference: tweetLength, provider: provider || undefined,
      });
      setGeneratedTexts((prev: Record<string, GeneratedData>) => ({ ...prev, [id]: { text: result.text, score: result.score?.overall || 0, thread_parts: result.thread_parts } }));
    } catch (e) {
      setGeneratedTexts((prev: Record<string, GeneratedData>) => ({ ...prev, [id]: { text: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`, score: 0 } }));
    } finally { setGeneratingId(null); }
  }, [researchData, tweetStyle, tweetLength, provider]);

  const handleFindMedia = useCallback(async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setMediaLoading(id);
    try { const r = await findMedia(tweet.text.slice(0, 100), "both"); setMediaResults((prev: Record<string, MediaItem[]>) => ({ ...prev, [id]: r.results || [] })); }
    catch { /* ignore */ }
    finally { setMediaLoading(null); }
  }, []);

  const handleInfographic = useCallback(async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setInfographicLoading(id);
    try {
      const research = researchData[id];
      const result = await generateInfographic({ topic: tweet.text.slice(0, 200), research_summary: research?.summary || "", key_points: research?.key_points || [] });
      if (result.success) setInfographicData((prev: Record<string, { image: string; format: string }>) => ({ ...prev, [id]: { image: result.image_base64, format: result.image_format } }));
    } catch { /* ignore */ }
    finally { setInfographicLoading(null); }
  }, [researchData]);

  const handleTranslate = useCallback(async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setTranslatingIds((prev: Set<string>) => new Set(prev).add(id));
    try {
      const res = await summarizeDiscoveryTweets([id], true);
      if (res.updated > 0) { const r = await getDiscoveryTweets(); setTweets(r.tweets); }
    } catch { /* ignore */ }
    setTranslatingIds((prev: Set<string>) => { const n = new Set(prev); n.delete(id); return n; });
  }, [setTweets]);

  const handleToggleShared = useCallback(async (tweetId: string) => {
    try {
      const result = sharedTweetIds.has(tweetId) ? await unmarkTweetShared(tweetId) : await markTweetShared(tweetId);
      setSharedTweetIds(new Set(result.shared_tweets || []));
    } catch { /* ignore */ }
  }, [sharedTweetIds]);

  /* ── Computed ──────────────────────────────────────── */

  const todayStr = formatDateStr(new Date());
  const minDateStr = formatDateStr(new Date(Date.now() - 7 * 86400000));

  const goToDate = (offset: number) => {
    if (selectedDate === "all") { setSelectedDate(todayStr); return; }
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    const newDate = formatDateStr(d);
    if (newDate > todayStr || newDate < minDateStr) return;
    setSelectedDate(newDate);
  };

  const tweetCountByDate: Record<string, number> = {};
  for (const t of tweets) { try { const ds = formatDateStr(new Date(t.created_at)); tweetCountByDate[ds] = (tweetCountByDate[ds] || 0) + 1; } catch { /* skip */ } }

  const filteredTweets = tweets.filter(t => {
    if (filterAccount && t.account.toLowerCase() !== filterAccount.toLowerCase()) return false;
    if (filterImportance && t.importance !== filterImportance) return false;
    if (hideShared && sharedTweetIds.has(t.tweet_id)) return false;
    if (hideGM && isLowQualityTweet(t.text)) return false;
    if (selectedDate !== "all") {
      try { if (formatDateStr(new Date(t.created_at)) !== selectedDate) return false; } catch { /* keep */ }
    }
    return true;
  });

  if (sortBy === "ai") filteredTweets.sort((a, b) => (b.ai_relevance_score || 0) - (a.ai_relevance_score || 0));
  else if (sortBy === "newest") filteredTweets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Tüm hesapları birleştir: API'den gelen tam liste + tweet'lerdeki hesaplar
  const uniqueAccounts = [...new Set([
    ...allAccounts,
    ...tweets.map(t => t.account.toLowerCase()),
  ])].sort();

  // Active filter count for badge
  const activeFilterCount = [filterImportance, hideShared, hideGM].filter(Boolean).length;

  // When AI sort is active, force flat list
  const showAccordion = groupByAccount && !filterAccount && sortBy !== "ai" && sortBy !== "newest";

  // Collect links for a tweet
  const collectLinks = (tweet: DiscoveryTweet, extracted?: ExtractedMedia): TweetUrl[] => {
    const links: TweetUrl[] = [];
    const seen = new Set<string>();
    const add = (u: TweetUrl) => { if (!seen.has(u.url)) { seen.add(u.url); links.push(u); } };
    if (tweet.urls) tweet.urls.forEach(add);
    if (tweet.thread_parts) tweet.thread_parts.forEach(p => { if (p.urls) p.urls.forEach(add); });
    if (extracted) { extracted.urls.forEach(add); extracted.thread_urls.forEach(add); }
    return links;
  };

  // Collect all tweet media
  const collectTweetMedia = (tweet: DiscoveryTweet, extracted?: ExtractedMedia): TweetMediaItem[] => {
    const items: TweetMediaItem[] = [];
    const seen = new Set<string>();
    const add = (m: TweetMediaItem) => { if (!seen.has(m.url)) { seen.add(m.url); items.push(m); } };
    if (tweet.media_items) tweet.media_items.forEach(add);
    if (tweet.thread_parts) tweet.thread_parts.forEach(p => { if (p.media_items) p.media_items.forEach(add); });
    if (extracted) { extracted.media_items.forEach(add); extracted.thread_media.forEach(add); }
    return items;
  };

  /* ── Card renderer (progressive disclosure) ────────── */

  const renderCard = (tweet: DiscoveryTweet, idx: number) => {
    const id = tweet.tweet_id;
    const isExpanded = expandedCard === id;
    const isWorkflow = workflowCard === id;
    const badge = IMPORTANCE_BADGE[tweet.importance] || IMPORTANCE_BADGE.dusuk;
    const scoreColor = getScoreColor(tweet.display_score);
    const importanceColor = getImportanceColor(tweet.importance);
    const allLinks = collectLinks(tweet, extractedMedia[id]);
    const allMedia = collectTweetMedia(tweet, extractedMedia[id]);
    const hasResearch = researchData[id]?.summary;

    return (
      <div
        key={id}
        className={`backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/5${sharedTweetIds.has(id) ? " opacity-50" : ""}`}
        style={{ borderLeft: tweet.ai_relevance_score != null && tweet.ai_relevance_score >= 8 ? "3px solid var(--accent-green)" : `3px solid ${importanceColor}` }}
      >
        {/* LEVEL 1: Collapsed — always visible */}
        <button
          onClick={() => { setExpandedCard(isExpanded ? null : id); if (isExpanded) setWorkflowCard((wc: string | null) => wc === id ? null : wc); }}
          className="w-full text-left p-3 sm:p-4 hover:bg-[var(--bg-primary)]/20 transition-colors"
        >
          <div className="flex items-start gap-3">
            {/* Left: avatar + info */}
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}>
              {tweet.account.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[var(--accent-blue)] text-sm">@{tweet.account}</span>
                <span className="text-[10px] text-[var(--text-secondary)]">{timeAgo(tweet.created_at)} once</span>
                <AIScoreBadge score={tweet.ai_relevance_score} reason={tweet.ai_relevance_reason} />
                {tweet.is_priority && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">Oncelikli</span>
                )}
              </div>
              {/* Preview text (truncated) */}
              {!isExpanded && (
                <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                  {tweet.summary_tr && tweet.summary_tr !== tweet.text.slice(0, 200) ? tweet.summary_tr : tweet.text}
                </p>
              )}
              {/* Engagement pills — always visible */}
              <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent-red)]/10 text-[var(--accent-red)]">{formatNumber(tweet.like_count)} begeni</span>
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)]">{formatNumber(tweet.retweet_count)} RT</span>
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">{formatNumber(tweet.reply_count)} yanit</span>
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]">{formatNumber(tweet.bookmark_count)} kayit</span>
                {tweet.is_thread && <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">Thread ({tweet.thread_parts.length})</span>}
              </div>
            </div>
            {/* Right: gauge + chevron */}
            <div className="shrink-0 flex items-center gap-2">
              <CircularGauge value={tweet.display_score} />
              <span className="text-sm text-[var(--text-secondary)]" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>&#9654;</span>
            </div>
          </div>
        </button>

        {/* LEVEL 2: Expanded — full text + action buttons */}
        {isExpanded && (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3 border-t border-[var(--border-primary)]/20">
            {/* Full tweet text */}
            <div className="pt-3">
              {tweet.summary_tr && tweet.summary_tr !== tweet.text.slice(0, 200) ? (
                <>
                  <div className="text-sm leading-relaxed font-medium text-[var(--text-primary)]">&#127481;&#127479; {tweet.summary_tr}</div>
                  <details className="group mt-1">
                    <summary className="text-[11px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent-purple)] transition-colors">Orijinal tweet&apos;i gor</summary>
                    <div className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)] opacity-70">{tweet.text}</div>
                  </details>
                </>
              ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{tweet.text}</div>
              )}
            </div>

            {/* Thread expansion */}
            {tweet.is_thread && tweet.thread_parts.length > 1 && (
              <div>
                <button onClick={() => setExpandedThreads(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                  className="text-xs text-[var(--accent-purple)] hover:underline transition-colors">
                  {expandedThreads.has(id) ? "Thread'i Gizle" : `Thread'i Gor (${tweet.thread_parts.length} tweet)`}
                </button>
                {expandedThreads.has(id) && (
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

            {/* 3 main action buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border-primary)]/20">
              <button
                onClick={(e) => { e.stopPropagation(); handleResearch(tweet); }}
                disabled={researchingId === id}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))" }}
              >
                {researchingId === id ? "Arastiriliyor..." : (hasResearch ? "Tekrar Arastir" : "Arastir")}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setWorkflowCard(isWorkflow ? null : id); if (!hasResearch) handleResearch(tweet); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300"
                style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}
              >
                Tweet Uret
              </button>
              <a href={tweet.tweet_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-primary)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50 transition-all duration-300 inline-flex items-center">
                X&apos;te Ac
              </a>
              <button onClick={(e) => { e.stopPropagation(); handleTranslate(tweet); }}
                disabled={translatingIds.has(id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/30 transition-all duration-300 disabled:opacity-50">
                {translatingIds.has(id) ? "Cevriliyor..." : "&#127481;&#127479; Cevir"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleShared(id); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-300 ${sharedTweetIds.has(id) ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/30" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50 hover:border-[var(--accent-green)]/50"}`}>
                {sharedTweetIds.has(id) ? "\u2713 Paylasild" : "Paylasild"}
              </button>
            </div>

            {/* LEVEL 3: Workflow panel — research + generate + media */}
            {isWorkflow && (
              <div className="space-y-3 pt-2">
                {/* Research results */}
                <ResearchPanel
                  research={researchData[id]}
                  isResearching={researchingId === id}
                  isExpanded={researchExpanded.has(id) || researchExpanded.has("__all__")}
                  onToggleExpand={() => setResearchExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                />

                {/* Style/Format/Provider + Generate */}
                {researchData[id]?.summary && (
                  <div className="space-y-3 pt-2 border-t border-[var(--border-primary)]/20">
                    <StyleFormatBar
                      styles={styles} formats={formats}
                      selectedStyle={tweetStyle} setSelectedStyle={setTweetStyle}
                      selectedFormat={tweetLength} setSelectedFormat={setTweetLength}
                      selectedProvider={provider} setSelectedProvider={setProvider}
                    />
                    <button
                      onClick={() => handleGenerate(tweet)}
                      disabled={generatingId === id}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-300 disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))" }}
                    >
                      {generatingId === id ? "Uretiliyor..." : "Tweet Uret"}
                    </button>
                  </div>
                )}

                {/* Generated tweet */}
                <GenerationPanel
                  generated={generatedTexts[id]}
                  editedText={editedTexts[id] || generatedTexts[id]?.text || ""}
                  setEditedText={(t) => setEditedTexts(prev => ({ ...prev, [id]: t }))}
                  isGenerating={generatingId === id}
                  onGenerate={() => handleGenerate(tweet)}
                  onPublish={async (text, parts) => { try { await publishTweet({ text, thread_parts: parts || [] }); } catch { /* ignore */ } }}
                  onOpenInX={openInX}
                  onOpenQuote={() => window.open(tweet.tweet_url, "_blank")}
                  onCopy={copyToClipboard}
                  onSaveDraft={async (text) => { await addDraft({ text, topic: tweet.tweet_url, style: tweetStyle }); }}
                  tweetUrl={tweet.tweet_url}
                />

                {/* Links box */}
                {generatedTexts[id] && <LinksBox links={allLinks} />}

                {/* Media section */}
                {generatedTexts[id] && (
                  <MediaSection
                    mediaResults={mediaResults[id]}
                    mediaLoading={mediaLoading === id}
                    onFindMedia={() => handleFindMedia(tweet)}
                    infographicData={infographicData[id]}
                    infographicLoading={infographicLoading === id}
                    onGenerateInfographic={() => handleInfographic(tweet)}
                    tweetMedia={allMedia}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <div className="backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <button onClick={() => goToDate(-1)} disabled={selectedDate === "all" || selectedDate <= minDateStr}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-all duration-300 disabled:opacity-30">
            &larr; Onceki Gun
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedDate("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${selectedDate === "all" ? "bg-[var(--accent-blue)] text-white shadow-md" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              Tumunu ({tweets.length})
            </button>
            <button onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${selectedDate === todayStr ? "bg-[var(--accent-blue)] text-white shadow-md" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              Bugun
            </button>
            {selectedDate !== "all" && (
              <span className="text-xs font-semibold">
                {formatDateLabel(selectedDate)} &middot; {selectedDate}
                {tweetCountByDate[selectedDate] != null && <span className="ml-1 text-[var(--text-secondary)]">({tweetCountByDate[selectedDate]})</span>}
              </span>
            )}
          </div>
          <button onClick={() => goToDate(1)} disabled={selectedDate === "all" || selectedDate >= todayStr}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-all duration-300 disabled:opacity-30">
            Sonraki Gun &rarr;
          </button>
        </div>
      </div>

      {/* Filter Bar — 2 tiers */}
      <div className="space-y-2">
        {/* Tier 1: Always visible */}
        <div className="flex flex-wrap gap-2 items-center">
          <select value={sortBy} onChange={e => setSortBy(e.target.value as "default" | "ai" | "newest")}
            className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-full px-3 py-1.5 text-xs backdrop-blur-sm focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all">
            <option value="ai">AI Onerisi</option>
            <option value="newest">Yeniden Eskiye</option>
            <option value="default">Varsayilan</option>
          </select>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-full px-3 py-1.5 text-xs backdrop-blur-sm focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all">
            <option value="">Tum Hesaplar ({uniqueAccounts.length})</option>
            {uniqueAccounts.map(a => {
              const count = tweets.filter(t => t.account.toLowerCase() === a.toLowerCase()).length;
              return <option key={a} value={a}>@{a}{count > 0 ? ` (${count})` : " (0)"}</option>;
            })}
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${showFilters ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50"}`}>
            Filtreler{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          {sortBy !== "ai" && (
            <button onClick={() => setGroupByAccount(!groupByAccount)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border ${groupByAccount ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50"}`}>
              {groupByAccount ? "Hesap Grubu: Acik" : "Hesap Grubu: Kapali"}
            </button>
          )}
          {(summarizing || translatingAll) && <span className="text-[10px] text-[var(--accent-amber)] animate-pulse">TR ceviri uretiliyor...</span>}
          <span className="text-xs text-[var(--text-secondary)] ml-auto">{filteredTweets.length} tweet</span>
        </div>

        {/* Tier 2: Collapsible filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center p-2.5 rounded-lg bg-[var(--bg-secondary)]/60 border border-[var(--border-primary)]/30">
            <select value={filterImportance} onChange={e => setFilterImportance(e.target.value)}
              className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-primary)]/50 rounded-full px-3 py-1.5 text-xs backdrop-blur-sm focus:ring-2 focus:ring-[var(--accent-blue)]/30 transition-all">
              <option value="">Tum Onem</option>
              <option value="yuksek">Yuksek</option>
              <option value="orta">Orta</option>
              <option value="dusuk">Dusuk</option>
            </select>
            <button onClick={() => setHideShared(!hideShared)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${hideShared ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border-[var(--accent-green)]/30" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50"}`}>
              {hideShared ? "Paylasilanlari Gizle \u2713" : "Paylasilanlari Gizle"}{sharedTweetIds.size > 0 ? ` (${sharedTweetIds.size})` : ""}
            </button>
            <button onClick={() => setHideGM(!hideGM)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${hideGM ? "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30" : "bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border-[var(--border-primary)]/50"}`}>
              {hideGM ? "GM/GN Gizle \u2713" : "GM/GN Goster"}
            </button>
            <button onClick={async () => {
              setAiScoring(true);
              try { const res = await aiScoreDiscoveryTweets(); setAiScoredCount(res.scored || 0); const r = await getDiscoveryTweets(); setTweets(r.tweets); }
              catch (e) { console.error("AI tweet scoring failed:", e); }
              setAiScoring(false);
            }} disabled={aiScoring}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/30 disabled:opacity-50">
              {aiScoring ? "Skorlaniyor..." : `AI Skorla${aiScoredCount > 0 ? ` (${aiScoredCount})` : ""}`}
            </button>
            <button onClick={async () => {
              setTranslatingAll(true);
              try { const res = await summarizeDiscoveryTweets(filteredTweets.map(t => t.tweet_id), true); if (res.updated > 0) { const r = await getDiscoveryTweets(); setTweets(r.tweets); } }
              catch { /* ignore */ }
              setTranslatingAll(false);
            }} disabled={translatingAll || summarizing || filteredTweets.length === 0}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30 hover:bg-[var(--accent-amber)]/30 transition-all duration-300 disabled:opacity-50">
              {translatingAll ? "Cevriliyor..." : `Tumunu Cevir (${filteredTweets.length})`}
            </button>
          </div>
        )}
      </div>

      {/* Tweet List */}
      {filteredTweets.length === 0 ? (
        <div className="backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl p-12 text-center">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mx-auto mb-4 opacity-30">
            <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M8 24h48" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="36" r="3" fill="currentColor" opacity="0.3" />
            <rect x="24" y="33" width="24" height="2" rx="1" fill="currentColor" opacity="0.3" />
            <rect x="24" y="38" width="16" height="2" rx="1" fill="currentColor" opacity="0.2" />
          </svg>
          <p className="text-[var(--text-secondary)] text-sm">
            {tweets.length === 0 ? "Henuz tweet taranmadi. \"Simdi Tara\" butonuna basin." : "Filtreye uygun tweet bulunamadi."}
          </p>
          {tweets.length > 0 && hideGM && <p className="text-[var(--text-secondary)]/60 text-xs mt-1">GM/GN filtresi aktif. Kaldirmak icin Filtreler butonuna basin.</p>}
        </div>
      ) : showAccordion ? (
        /* Account-based accordion */
        <div className="space-y-3">
          {(() => {
            const groups: Record<string, DiscoveryTweet[]> = {};
            for (const t of filteredTweets) { if (!groups[t.account]) groups[t.account] = []; groups[t.account].push(t); }
            return Object.entries(groups)
              .sort(([, a], [, b]) => {
                const ap = a[0]?.is_priority ? 1 : 0;
                const bp = b[0]?.is_priority ? 1 : 0;
                if (ap !== bp) return bp - ap;
                return Math.max(...b.map(t => t.display_score)) - Math.max(...a.map(t => t.display_score));
              })
              .map(([account, accountTweets]) => {
                const isExp = expandedAccounts.has(account);
                const maxScore = Math.max(...accountTweets.map(t => t.display_score));
                const isPriority = accountTweets[0]?.is_priority;
                const latestTime = accountTweets.reduce((l, t) => { const tc = t.created_at || t.scanned_at; return tc > l ? tc : l; }, "");
                const topAI = accountTweets.reduce((best, t) => (t.ai_relevance_score || 0) > (best.ai_relevance_score || 0) ? t : best, accountTweets[0]);
                const sColor = getScoreColor(maxScore);

                return (
                  <div key={account} className="backdrop-blur-sm bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)]/50 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent-blue)]/5">
                    <button
                      onClick={() => setExpandedAccounts(prev => { const n = new Set(prev); n.has(account) ? n.delete(account) : n.add(account); return n; })}
                      className="w-full flex items-center justify-between gap-3 p-4 hover:bg-[var(--bg-primary)]/30 transition-all duration-300"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ background: `linear-gradient(135deg, ${sColor}, ${sColor}80)` }}>
                          {account.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <a href={`https://x.com/${account}`} target="_blank" rel="noopener noreferrer"
                              className="font-semibold text-[var(--accent-blue)] hover:underline text-sm" onClick={e => e.stopPropagation()}>
                              @{account}
                            </a>
                            <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-primary)]/60 px-2 py-0.5 rounded-full">{accountTweets.length} tweet</span>
                            {isPriority && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">Oncelikli</span>}
                            <AIScoreBadge score={topAI.ai_relevance_score} reason={topAI.ai_relevance_reason} />
                          </div>
                          {/* Best AI pick preview */}
                          {topAI.ai_relevance_score != null && topAI.ai_relevance_score >= 6 && !isExp && (
                            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                              {topAI.summary_tr || topAI.text.slice(0, 80)}...
                            </p>
                          )}
                          <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{timeAgo(latestTime)} once</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <CircularGauge value={maxScore} />
                        <span className="text-lg" style={{ transform: isExp ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>&#9654;</span>
                      </div>
                    </button>
                    {isExp && (
                      <div className="space-y-3 p-4 pt-0 border-t border-[var(--border-primary)]/30">
                        {accountTweets.map((tweet, idx) => renderCard(tweet, idx))}
                      </div>
                    )}
                  </div>
                );
              });
          })()}
        </div>
      ) : (
        /* Flat list (AI sort or no grouping) */
        <div className="space-y-3">
          {filteredTweets.map((tweet, idx) => renderCard(tweet, idx))}
        </div>
      )}
    </div>
  );
}
