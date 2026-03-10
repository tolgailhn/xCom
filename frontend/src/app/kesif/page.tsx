"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getDiscoveryConfig,
  updateDiscoveryConfig,
  getDiscoveryTweets,
  triggerDiscoveryScan,
  getDiscoveryStatus,
  clearDiscoveryCache,
  addDiscoveryAccount,
  removeDiscoveryAccount,
  researchTopicStream,
  generateQuoteTweet,
  findMedia,
  generateInfographic,
  addDraft,
  extractTweet,
  type DiscoveryConfig,
  type DiscoveryTweet,
  type DiscoveryStatus,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────

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

const importanceBadge: Record<string, { label: string; cls: string }> = {
  yuksek: { label: "Yuksek", cls: "bg-[var(--accent-red)]/20 text-[var(--accent-red)] border-[var(--accent-red)]/30" },
  orta: { label: "Orta", cls: "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] border-[var(--accent-amber)]/30" },
  dusuk: { label: "Dusuk", cls: "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)] border-[var(--text-secondary)]/30" },
};

const STYLES = [
  { value: "bilgilendirici", label: "Bilgilendirici" },
  { value: "samimi", label: "Samimi" },
  { value: "provoke_edici", label: "Provoke Edici" },
  { value: "teknik", label: "Teknik" },
  { value: "ilham_verici", label: "Ilham Verici" },
  { value: "quote_tweet", label: "Quote Tweet" },
];

const LENGTHS = [
  { value: "spark", label: "Kisa (1-2 cumle)" },
  { value: "punch", label: "Orta (3-4 cumle)" },
  { value: "story", label: "Uzun (5+ cumle)" },
];

// ── Main Component ─────────────────────────────────────

export default function KesifPage() {
  const [tab, setTab] = useState<"tweets" | "ayarlar">("tweets");
  const [config, setConfig] = useState<DiscoveryConfig | null>(null);
  const [tweets, setTweets] = useState<DiscoveryTweet[]>([]);
  const [status, setStatus] = useState<DiscoveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

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
  const [tweetStyle, setTweetStyle] = useState("quote_tweet");
  const [tweetLength, setTweetLength] = useState("spark");
  const [provider, setProvider] = useState("");

  // Media
  const [mediaResults, setMediaResults] = useState<Record<string, Array<{ url: string; title?: string; thumbnail_url?: string; preview?: string; media_type?: string; type?: string; source?: string; author?: string }>>>({});
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);

  // Infographic
  const [infographicData, setInfographicData] = useState<Record<string, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<string | null>(null);

  // Settings
  const [newAccount, setNewAccount] = useState("");
  const [newAccountPriority, setNewAccountPriority] = useState(false);

  // Filter
  const [filterAccount, setFilterAccount] = useState("");
  const [filterImportance, setFilterImportance] = useState("");
  const [filterDate, setFilterDate] = useState("all");

  const loadData = useCallback(async () => {
    try {
      const [configRes, tweetsRes, statusRes] = await Promise.all([
        getDiscoveryConfig(),
        getDiscoveryTweets(),
        getDiscoveryStatus(),
      ]);
      setConfig(configRes.config);
      setTweets(tweetsRes.tweets);
      setStatus(statusRes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleScan = async () => {
    setScanning(true);
    setScanMsg("");
    try {
      const result = await triggerDiscoveryScan();
      setScanMsg(result.message);
      await loadData();
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : "Tarama hatasi");
    } finally {
      setScanning(false);
    }
  };

  const handleResearch = async (tweet: DiscoveryTweet) => {
    const id = tweet.tweet_id;
    setResearchingId(id);
    setActiveResearch(id);
    setResearchData(prev => ({ ...prev, [id]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." } }));

    try {
      // Önce tweet'i extract et (thread varsa tam içerik)
      let fullText = tweet.text;
      try {
        const extracted = await extractTweet(tweet.tweet_url);
        if (extracted?.full_thread_text) {
          fullText = extracted.full_thread_text;
        } else if (extracted?.text) {
          fullText = extracted.text;
        }
      } catch {
        // extract başarısız olursa orijinal text'i kullan
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

  // Filtered tweets
  const filteredTweets = tweets.filter(t => {
    if (filterAccount && t.account.toLowerCase() !== filterAccount.toLowerCase()) return false;
    if (filterImportance && t.importance !== filterImportance) return false;
    if (filterDate !== "all") {
      try {
        const tweetDate = new Date(t.scanned_at || t.created_at);
        const now = new Date();
        const diffHours = (now.getTime() - tweetDate.getTime()) / (1000 * 60 * 60);
        if (filterDate === "today" && diffHours > 24) return false;
        if (filterDate === "2days" && diffHours > 48) return false;
        if (filterDate === "7days" && diffHours > 168) return false;
      } catch { /* keep */ }
    }
    return true;
  });

  // Unique accounts for filter
  const uniqueAccounts = [...new Set(tweets.map(t => t.account))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hesap Kesfi</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Takip edilen hesaplarin son 24 saatteki en iyi tweetleri
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="btn-primary text-sm"
          >
            {scanning ? "Taraniyor..." : "Simdi Tara"}
          </button>
        </div>
      </div>

      {scanMsg && (
        <div className="p-3 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 text-sm text-[var(--accent-blue)]">
          {scanMsg}
        </div>
      )}

      {/* Status bar */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3 text-center">
            <div className="text-xl font-bold">{status.total_tweets}</div>
            <div className="text-xs text-[var(--text-secondary)]">Tweet</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold">{status.priority_count + status.normal_count}</div>
            <div className="text-xs text-[var(--text-secondary)]">Hesap</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-[var(--accent-amber)]">{status.priority_count}</div>
            <div className="text-xs text-[var(--text-secondary)]">Oncelikli</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xs font-medium">{status.last_scan ? timeAgo(status.last_scan) + " once" : "Henuz yok"}</div>
            <div className="text-xs text-[var(--text-secondary)]">Son Tarama</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setTab("tweets")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "tweets" ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          Tweetler ({tweets.length})
        </button>
        <button
          onClick={() => setTab("ayarlar")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "ayarlar" ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          Ayarlar
        </button>
      </div>

      {tab === "ayarlar" && config && <SettingsTab config={config} setConfig={setConfig} newAccount={newAccount} setNewAccount={setNewAccount} newAccountPriority={newAccountPriority} setNewAccountPriority={setNewAccountPriority} onClear={async () => { await clearDiscoveryCache(); await loadData(); }} />}

      {tab === "tweets" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="">Tum Hesaplar</option>
              {uniqueAccounts.map(a => (
                <option key={a} value={a}>@{a}</option>
              ))}
            </select>
            <select
              value={filterImportance}
              onChange={e => setFilterImportance(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="">Tum Onem</option>
              <option value="yuksek">Yuksek</option>
              <option value="orta">Orta</option>
              <option value="dusuk">Dusuk</option>
            </select>
            <select
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="all">Tum Tarihler</option>
              <option value="today">Bugun (24 saat)</option>
              <option value="2days">Son 2 Gun</option>
              <option value="7days">Son 7 Gun</option>
            </select>
            <span className="text-xs text-[var(--text-secondary)]">
              {filteredTweets.length} tweet gosteriliyor
            </span>
          </div>

          {/* Tweet cards */}
          {filteredTweets.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-[var(--text-secondary)]">
                {tweets.length === 0 ? "Henuz tweet taranmadi. \"Simdi Tara\" butonuna basin." : "Filtreye uygun tweet bulunamadi."}
              </p>
            </div>
          ) : (
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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TweetCard Component ────────────────────────────────

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
  tweetStyle,
  setTweetStyle,
  tweetLength,
  setTweetLength,
  provider,
  setProvider,
  onSaveDraft,
  onSetActiveResearch,
  onSetActiveGenerate,
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
  tweetStyle: string;
  setTweetStyle: (s: string) => void;
  tweetLength: string;
  setTweetLength: (s: string) => void;
  provider: string;
  setProvider: (s: string) => void;
  onSaveDraft: (text: string) => Promise<void>;
  onSetActiveResearch: () => void;
  onSetActiveGenerate: () => void;
}) {
  const badge = importanceBadge[tweet.importance] || importanceBadge.dusuk;
  const [draftSaved, setDraftSaved] = useState(false);
  const [editedText, setEditedText] = useState("");

  // Sync edited text when generated
  useEffect(() => {
    if (generatedResult?.text) setEditedText(generatedResult.text);
  }, [generatedResult?.text]);

  return (
    <div className="card p-4 space-y-3">
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
      <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
        <span title="Begeni">{formatNumber(tweet.like_count)} begeni</span>
        <span title="Repost">{formatNumber(tweet.retweet_count)} RT</span>
        <span title="Yanit">{formatNumber(tweet.reply_count)} yanit</span>
        <span title="Yer Isareti">{formatNumber(tweet.bookmark_count)} kayit</span>
      </div>

      {/* Tweet text */}
      <div className="text-sm leading-relaxed whitespace-pre-wrap">{tweet.text}</div>

      {/* Turkish summary */}
      {tweet.summary_tr && (
        <div className="text-xs text-[var(--accent-cyan)] italic bg-[var(--accent-cyan)]/5 px-3 py-1.5 rounded">
          {tweet.summary_tr}
        </div>
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
              <select value={tweetStyle} onChange={e => setTweetStyle(e.target.value)} className="input-field text-xs py-1">
                {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={tweetLength} onChange={e => setTweetLength(e.target.value)} className="input-field text-xs py-1">
                {LENGTHS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <select value={provider} onChange={e => setProvider(e.target.value)} className="input-field text-xs py-1">
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
                className="input-field text-sm w-full min-h-[80px] resize-y"
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
                    // Quote olarak açmak için tweet URL'sini metin sonuna ekle
                    const quoteText = editedText + "\n" + tweet.tweet_url;
                    onOpenInX(quoteText);
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

// ── Settings Tab ───────────────────────────────────────

function SettingsTab({
  config,
  setConfig,
  newAccount,
  setNewAccount,
  newAccountPriority,
  setNewAccountPriority,
  onClear,
}: {
  config: DiscoveryConfig;
  setConfig: (c: DiscoveryConfig) => void;
  newAccount: string;
  setNewAccount: (s: string) => void;
  newAccountPriority: boolean;
  setNewAccountPriority: (b: boolean) => void;
  onClear: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDiscoveryConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const username = newAccount.trim().replace("@", "");
    if (!username) return;
    try {
      const result = await addDiscoveryAccount(username, newAccountPriority);
      setConfig(result.config);
      setNewAccount("");
    } catch {
      // ignore
    }
  };

  const handleRemove = async (username: string) => {
    try {
      const result = await removeDiscoveryAccount(username);
      setConfig(result.config);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Otomatik Tarama</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Zamanlayici aktif olduğunda her {config.check_interval_hours} saatte bir otomatik tarar
            </p>
          </div>
          <button
            onClick={() => {
              const updated = { ...config, enabled: !config.enabled };
              setConfig(updated);
              updateDiscoveryConfig(updated);
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${config.enabled ? "bg-[var(--accent-green)]" : "bg-[var(--border)]"}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${config.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Tarama Araligi (saat)</label>
            <input
              type="number"
              min={1}
              max={12}
              value={config.check_interval_hours}
              onChange={e => setConfig({ ...config, check_interval_hours: parseInt(e.target.value) || 2 })}
              className="input-field text-sm w-full mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Baslangic Saati</label>
            <input
              type="number"
              min={0}
              max={23}
              value={config.work_hour_start}
              onChange={e => setConfig({ ...config, work_hour_start: parseInt(e.target.value) || 8 })}
              className="input-field text-sm w-full mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Bitis Saati</label>
            <input
              type="number"
              min={0}
              max={23}
              value={config.work_hour_end}
              onChange={e => setConfig({ ...config, work_hour_end: parseInt(e.target.value) || 23 })}
              className="input-field text-sm w-full mt-1"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? "Kaydediliyor..." : saved ? "Kaydedildi!" : "Kaydet"}
          </button>
          <button onClick={onClear} className="btn-secondary text-sm text-[var(--accent-red)]">
            Cache Temizle
          </button>
        </div>
      </div>

      {/* Add account */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold">Hesap Ekle</h3>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newAccount}
            onChange={e => setNewAccount(e.target.value)}
            placeholder="@kullaniciadi"
            className="input-field text-sm flex-1"
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] shrink-0">
            <input
              type="checkbox"
              checked={newAccountPriority}
              onChange={e => setNewAccountPriority(e.target.checked)}
              className="rounded"
            />
            Oncelikli
          </label>
          <button onClick={handleAdd} className="btn-primary text-sm shrink-0">Ekle</button>
        </div>
      </div>

      {/* Priority accounts */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-[var(--accent-amber)]">Oncelikli Hesaplar ({config.priority_accounts.length})</h3>
        <div className="flex flex-wrap gap-2">
          {config.priority_accounts.map(a => (
            <div key={a} className="flex items-center gap-1 bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 rounded-full px-3 py-1 text-xs">
              <span>@{a}</span>
              <button onClick={() => handleRemove(a)} className="text-[var(--accent-red)] hover:opacity-75 ml-1">&times;</button>
            </div>
          ))}
          {config.priority_accounts.length === 0 && (
            <span className="text-xs text-[var(--text-secondary)]">Henuz oncelikli hesap yok</span>
          )}
        </div>
      </div>

      {/* Normal accounts */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold">Normal Hesaplar ({config.normal_accounts.length})</h3>
        <div className="flex flex-wrap gap-2">
          {config.normal_accounts.map(a => (
            <div key={a} className="flex items-center gap-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full px-3 py-1 text-xs">
              <span>@{a}</span>
              <button onClick={() => handleRemove(a)} className="text-[var(--accent-red)] hover:opacity-75 ml-1">&times;</button>
            </div>
          ))}
          {config.normal_accounts.length === 0 && (
            <span className="text-xs text-[var(--text-secondary)]">Henuz normal hesap yok</span>
          )}
        </div>
      </div>
    </div>
  );
}
