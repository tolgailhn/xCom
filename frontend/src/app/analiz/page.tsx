"use client";

import { useState, useEffect } from "react";
import {
  analyzeMulti,
  getSavedAnalyses,
  deleteAnalysis,
  getTrainingContext,
  exportAnalyses,
  importAnalyses,
  fetchFollowers,
  listFollowers,
  deleteFollowers,
  getPoolAccounts,
  savePoolAccounts,
  getPoolStats,
  fetchPoolTweets,
  importAnalysesToPool,
  getPoolDna,
  regeneratePoolDna,
  getPoolPreview,
} from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */

interface TopTweet {
  text: string;
  engagement_score: number;
  like_count: number;
  retweet_count: number;
  reply_count?: number;
}

interface AnalysisResult {
  username: string;
  tweets_analyzed: number;
  original_count: number;
  retweet_count: number;
  avg_engagement: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  top_tweets: TopTweet[];
  top_keywords: { keyword: string; avg_score: number }[];
  length_analysis: Record<string, { count: number; avg_score: number }>;
  question_analysis?: Record<string, { count: number; avg_score: number }>;
  best_hours: { hour: number; avg_score: number; tweet_count: number }[];
  top_hashtags: { tag: string; count: number; avg_score: number }[];
  style_dna: {
    ortalama_uzunluk?: number;
    emoji_yuzde?: number;
    kucuk_harf_yuzde?: number;
    tweet_sayisi?: number;
    hook_ornekleri?: string[];
    imza_kelimeleri?: Record<string, number>;
    imza_kaliplari?: Record<string, number>;
    kapanis_tercihi?: Record<string, number>;
  };
  ai_report: string;
  analyzed_at?: string;
  error?: string;
}

interface Follower {
  name: string;
  username: string;
  bio: string;
  followers_count: number;
  is_blue_verified: boolean;
}

/* ── Analysis Display Component ────────────────────────── */

function AnalysisDisplay({ result }: { result: AnalysisResult }) {
  const dna = result.style_dna;
  const sigWords = dna?.imza_kelimeleri
    ? Object.entries(dna.imza_kelimeleri).slice(0, 10)
    : [];
  const sigPatterns = dna?.imza_kaliplari
    ? Object.entries(dna.imza_kaliplari).slice(0, 8)
    : [];

  return (
    <div className="space-y-4">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Tweet", value: result.tweets_analyzed, color: "var(--accent-blue)" },
          { label: "Orijinal", value: result.original_count, color: "var(--accent-cyan)" },
          { label: "Ort. Engagement", value: result.avg_engagement.toFixed(0), color: "var(--accent-green)" },
          { label: "Toplam Like", value: result.total_likes.toLocaleString(), color: "var(--accent-amber)" },
          { label: "Toplam RT", value: result.total_retweets.toLocaleString(), color: "var(--accent-purple)" },
        ].map((s) => (
          <div key={s.label} className="text-center bg-[var(--bg-primary)] rounded-lg p-3">
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Style DNA */}
      {dna && (
        <div className="bg-[var(--bg-primary)] rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold">Stil DNA</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-[var(--accent-blue)]">{dna.ortalama_uzunluk ?? "-"}</div>
              <div className="text-xs text-[var(--text-secondary)]">Ort. Uzunluk</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[var(--accent-cyan)]">%{dna.kucuk_harf_yuzde ?? 0}</div>
              <div className="text-xs text-[var(--text-secondary)]">Kucuk Harf</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[var(--accent-amber)]">%{dna.emoji_yuzde ?? 0}</div>
              <div className="text-xs text-[var(--text-secondary)]">Emoji</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[var(--accent-green)]">{dna.tweet_sayisi ?? 0}</div>
              <div className="text-xs text-[var(--text-secondary)]">Orijinal</div>
            </div>
          </div>

          {/* Hook ornekleri */}
          {dna.hook_ornekleri && dna.hook_ornekleri.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Hook Ornekleri</h5>
              <div className="space-y-1">
                {dna.hook_ornekleri.slice(0, 5).map((h, i) => (
                  <p key={i} className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded px-2 py-1">
                    &ldquo;{h.slice(0, 120)}&rdquo;
                  </p>
                ))}
              </div>
            </div>
          )}

          {sigWords.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Imza Kelimeleri</h5>
              <div className="flex flex-wrap gap-1">
                {sigWords.map(([word, count]) => (
                  <span key={word} className="text-xs bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] px-2 py-0.5 rounded-full">
                    {word} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {sigPatterns.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Imza Kaliplari</h5>
              <div className="flex flex-wrap gap-1">
                {sigPatterns.map(([pattern, count]) => (
                  <span key={pattern} className="text-xs bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] px-2 py-0.5 rounded-full">
                    &quot;{pattern}&quot; ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Kapanis tercihi */}
          {dna.kapanis_tercihi && Object.keys(dna.kapanis_tercihi).length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Kapanis Tercihi</h5>
              <div className="flex flex-wrap gap-1">
                {Object.entries(dna.kapanis_tercihi).slice(0, 6).map(([k, v]) => (
                  <span key={k} className="text-xs bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] px-2 py-0.5 rounded-full">
                    {k} ({v})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Length Analysis */}
      {Object.keys(result.length_analysis).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {[
            { key: "short", label: "Kisa (<=280)" },
            { key: "medium", label: "Orta (281-500)" },
            { key: "long", label: "Uzun (>500)" },
          ].map(({ key, label }) => {
            const d = result.length_analysis[key] || { count: 0, avg_score: 0 };
            return (
              <div key={key} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-lg font-bold text-[var(--accent-blue)]">{d.count} tweet</div>
                <div className="text-xs text-[var(--text-secondary)]">Ort. Skor: {d.avg_score.toFixed(0)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Question Analysis */}
      {result.question_analysis && Object.keys(result.question_analysis).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "question_tweets", label: "Soru Iceren" },
            { key: "statement_tweets", label: "Beyan" },
          ].map(({ key, label }) => {
            const d = result.question_analysis![key] || { count: 0, avg_score: 0 };
            return (
              <div key={key} className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-lg font-bold text-[var(--accent-blue)]">{d.count}</div>
                <div className="text-xs text-[var(--text-secondary)]">Ort. Skor: {d.avg_score.toFixed(0)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Keywords */}
      {result.top_keywords.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Etkilesim Ceken Kelimeler</h4>
          <div className="flex flex-wrap gap-1">
            {result.top_keywords.map((kw, i) => (
              <span key={i} className="text-xs bg-[var(--accent-green)]/20 text-[var(--accent-green)] px-2 py-0.5 rounded-full">
                {kw.keyword} ({kw.avg_score.toFixed(0)})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top Hashtags */}
      {result.top_hashtags.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">En Iyi Hashtag&apos;ler</h4>
          <div className="flex flex-wrap gap-1">
            {result.top_hashtags.map((tag, i) => (
              <span key={i} className="text-xs bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] px-2 py-0.5 rounded-full">
                {tag.tag} ({tag.count}x, skor:{tag.avg_score.toFixed(0)})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Best Hours */}
      {result.best_hours.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">En Iyi Saatler</h4>
          <div className="flex flex-wrap gap-2">
            {result.best_hours.slice(0, 6).map((h, i) => (
              <div key={i} className="text-center bg-[var(--bg-primary)] rounded-lg px-3 py-2">
                <div className="text-lg font-bold text-[var(--accent-amber)]">
                  {String(h.hour).padStart(2, "0")}:00
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {h.tweet_count} tweet | {h.avg_score.toFixed(0)} skor
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Tweets */}
      {result.top_tweets.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">En Iyi Tweet&apos;ler</h4>
          <div className="space-y-2">
            {result.top_tweets.slice(0, 10).map((tweet, i) => (
              <div
                key={i}
                className={`bg-[var(--bg-primary)] rounded-lg p-3 border-l-3 ${i < 3 ? "border-[var(--accent-purple)]" : "border-transparent"}`}
              >
                <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                  <span className="font-bold text-[var(--accent-blue)]">#{i + 1}</span>
                  <span>
                    Skor: {tweet.engagement_score.toFixed(0)} | {tweet.like_count} like | {tweet.retweet_count} RT
                    {tweet.reply_count !== undefined && ` | ${tweet.reply_count} reply`}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-primary)] line-clamp-3">{tweet.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Report */}
      {result.ai_report && (
        <div>
          <h4 className="text-sm font-semibold mb-2">AI Analiz Raporu</h4>
          <div className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm text-[var(--text-secondary)] whitespace-pre-line max-h-96 overflow-y-auto">
            {result.ai_report}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */

export default function AnalizPage() {
  const [activeTab, setActiveTab] = useState<"new" | "saved" | "followers" | "pool" | "export">("new");

  const tabs = [
    { id: "new" as const, label: "Yeni Analiz" },
    { id: "saved" as const, label: "Kayitli Analizler" },
    { id: "followers" as const, label: "Takipci Kesfi" },
    { id: "pool" as const, label: "Tweet Havuzu" },
    { id: "export" as const, label: "Disa/Iceri Aktar" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Analiz & Kesif</h2>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === t.id
                ? "bg-[var(--accent-blue)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "new" && <TabNewAnalysis />}
      {activeTab === "saved" && <TabSavedAnalyses />}
      {activeTab === "followers" && <TabFollowers />}
      {activeTab === "pool" && <TabTweetPool />}
      {activeTab === "export" && <TabExportImport />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 1: YENI ANALIZ
   ══════════════════════════════════════════════════════════ */

function TabNewAnalysis() {
  const [usernames, setUsernames] = useState("");
  const [tweetCount, setTweetCount] = useState(200);
  const [aiReport, setAiReport] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const names = usernames.split(",").map((u) => u.trim().replace("@", "")).filter(Boolean);
    if (!names.length) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = (await analyzeMulti(names, tweetCount, aiReport)) as {
        results: AnalysisResult[];
      };
      setResults(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz hatasi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-blue)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Hesap adlarini gir &rarr; Twikit ile tweet&apos;leri cek &rarr; Engagement analizi &rarr; AI rapor &rarr; Kaydet
        </p>
      </div>

      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Twitter kullanici adi(lari)
          </label>
          <input
            type="text"
            value={usernames}
            onChange={(e) => setUsernames(e.target.value)}
            placeholder="ornek: elonmusk, sama, AnthropicAI (virgul ile ayirin)"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">
              Tweet Sayisi
            </label>
            <select
              value={tweetCount}
              onChange={(e) => setTweetCount(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={aiReport}
                onChange={(e) => setAiReport(e.target.checked)}
                className="rounded"
              />
              AI analiz raporu
            </label>
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading || !usernames.trim()}
          className="btn-primary w-full"
        >
          {loading ? "Analiz ediliyor..." : "Analiz Baslat"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {results.map((r, i) => (
        <div key={i} className="glass-card">
          {r.error ? (
            <div>
              <h3 className="font-semibold text-[var(--accent-red)]">@{r.username} - Hata</h3>
              <p className="text-sm text-[var(--text-secondary)]">{r.error}</p>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold mb-4">@{r.username}</h3>
              <AnalysisDisplay result={r} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 2: KAYITLI ANALIZLER
   ══════════════════════════════════════════════════════════ */

function TabSavedAnalyses() {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [trainingCtx, setTrainingCtx] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [res, ctx] = await Promise.all([
        getSavedAnalyses() as Promise<{ analyses: AnalysisResult[] }>,
        getTrainingContext() as Promise<{ context: string; total_length: number }>,
      ]);
      setAnalyses(res.analyses);
      setTrainingCtx(ctx.context);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (username: string) => {
    await deleteAnalysis(username);
    loadData();
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-secondary)]">Yukleniyor...</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-secondary)]">
        Bu analizler tweet yazarken AI egitim verisi olarak otomatik kullanilir.
      </p>

      {trainingCtx && (
        <details className="glass-card">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--accent-blue)]">
            AI Egitim Verisi Onizleme
          </summary>
          <pre className="mt-2 text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-80 overflow-y-auto">
            {trainingCtx}
          </pre>
        </details>
      )}

      {analyses.length === 0 ? (
        <div className="glass-card text-center py-8">
          <p className="text-sm text-[var(--text-secondary)]">
            Henuz kayitli analiz yok. &quot;Yeni Analiz&quot; sekmesinden analiz yapin.
          </p>
        </div>
      ) : (
        analyses.map((a, i) => (
          <div key={i} className="glass-card">
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            >
              <div>
                <span className="font-semibold">@{a.username}</span>
                <span className="text-xs text-[var(--text-secondary)] ml-2">
                  {a.tweets_analyzed} tweet | {a.analyzed_at?.slice(0, 16)}
                </span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                {expandedIdx === i ? "Kapat" : "Ac"}
              </span>
            </div>

            {expandedIdx === i && (
              <div className="mt-4 space-y-4">
                <AnalysisDisplay result={a} />
                <button
                  onClick={() => handleDelete(a.username)}
                  className="btn-secondary text-xs text-[var(--accent-red)]"
                >
                  Analizi Sil
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 3: TAKIPCI KESFI
   ══════════════════════════════════════════════════════════ */

function TabFollowers() {
  const [targetUser, setTargetUser] = useState("");
  const [limit, setLimit] = useState(200);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fetchResult, setFetchResult] = useState<{
    user_info: Record<string, string | number | boolean>;
    followers: Follower[];
  } | null>(null);

  const [savedLists, setSavedLists] = useState<{
    username: string;
    fetched_at: string;
    count: number;
    followers: Follower[];
  }[]>([]);
  const [expandedSaved, setExpandedSaved] = useState<string | null>(null);

  useEffect(() => {
    loadSaved();
  }, []);

  const loadSaved = async () => {
    try {
      const res = (await listFollowers()) as { items: typeof savedLists };
      setSavedLists(res.items);
    } catch {
      /* ignore */
    }
  };

  const handleFetch = async () => {
    if (!targetUser.trim()) return;
    setLoading(true);
    setError(null);
    setFetchResult(null);
    try {
      const res = (await fetchFollowers(
        targetUser.replace("@", ""),
        limit,
        verifiedOnly
      )) as typeof fetchResult;
      setFetchResult(res);
      loadSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSaved = async (username: string) => {
    await deleteFollowers(username);
    loadSaved();
    if (expandedSaved === username) setExpandedSaved(null);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-purple)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Hedef hesabin onayli takipcilerini cek &rarr; Profillerine tikla &rarr; Manuel takip et
          <br />
          <span className="text-xs">Otomatik takip YOK - ban riski yuzunden.</span>
        </p>
      </div>

      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Hedef Hesap
          </label>
          <input
            type="text"
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            placeholder="ornek: AnthropicAI (@ olmadan)"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Max Takipci</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="rounded"
              />
              Sadece onayli
            </label>
          </div>
        </div>

        <button
          onClick={handleFetch}
          disabled={loading || !targetUser.trim()}
          className="btn-primary w-full"
        >
          {loading ? "Cekiliyor..." : "Takipci Cek"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Fetch result */}
      {fetchResult && (
        <div className="glass-card">
          {/* User info */}
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 mb-3">
            <span className="font-semibold">{fetchResult.user_info.name as string}</span>
            <span className="text-sm text-[var(--accent-blue)] ml-2">@{fetchResult.user_info.username as string}</span>
            {fetchResult.user_info.is_blue_verified && (
              <span className="text-[var(--accent-blue)] ml-1">&#10003;</span>
            )}
            <div className="text-xs text-[var(--text-secondary)] mt-1">
              {(fetchResult.user_info.followers_count as number).toLocaleString()} takipci |
              {" "}{(fetchResult.user_info.following_count as number).toLocaleString()} takip
            </div>
          </div>

          <h4 className="text-sm font-semibold text-[var(--accent-green)] mb-2">
            {fetchResult.followers.length} takipci bulundu
          </h4>
          <FollowerList followers={fetchResult.followers} />
        </div>
      )}

      {/* Saved lists */}
      <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Kayitli Takipci Listeleri</h3>
      {savedLists.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">Henuz kayitli liste yok.</p>
      ) : (
        savedLists.map((sl) => (
          <div key={sl.username} className="glass-card">
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => setExpandedSaved(expandedSaved === sl.username ? null : sl.username)}
            >
              <span className="font-semibold">
                @{sl.username} — {sl.count} takipci
                <span className="text-xs text-[var(--text-secondary)] ml-2">{sl.fetched_at?.slice(0, 16)}</span>
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {expandedSaved === sl.username ? "Kapat" : "Ac"}
              </span>
            </div>
            {expandedSaved === sl.username && (
              <div className="mt-3 space-y-2">
                <FollowerList followers={sl.followers} />
                <button
                  onClick={() => handleDeleteSaved(sl.username)}
                  className="btn-secondary text-xs text-[var(--accent-red)]"
                >
                  Listeyi Sil
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function FollowerList({ followers }: { followers: Follower[] }) {
  const [sortBy, setSortBy] = useState<"followers_count" | "name">("followers_count");
  const sorted = [...followers].sort((a, b) =>
    sortBy === "followers_count"
      ? b.followers_count - a.followers_count
      : a.name.localeCompare(b.name)
  );

  const verified = followers.filter((f) => f.is_blue_verified).length;
  const totalFollowers = followers.reduce((s, f) => s + f.followers_count, 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 sm:gap-2 text-center text-xs">
        <div>
          <div className="font-bold text-[var(--accent-blue)]">{followers.length}</div>
          <div className="text-[var(--text-secondary)]">Toplam</div>
        </div>
        <div>
          <div className="font-bold text-[var(--accent-purple)]">{verified}</div>
          <div className="text-[var(--text-secondary)]">Onayli</div>
        </div>
        <div>
          <div className="font-bold text-[var(--accent-green)]">
            {Math.round(totalFollowers / Math.max(followers.length, 1)).toLocaleString()}
          </div>
          <div className="text-[var(--text-secondary)]">Ort. Takipci</div>
        </div>
      </div>

      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
      >
        <option value="followers_count">Takipci sayisina gore</option>
        <option value="name">Isme gore</option>
      </select>

      <div className="space-y-1 max-h-96 overflow-y-auto">
        {sorted.map((f, i) => (
          <a
            key={i}
            href={`https://x.com/${f.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-[var(--bg-primary)] rounded-lg px-3 py-2 hover:ring-1 ring-[var(--accent-blue)] transition-all"
          >
            <div className="flex justify-between">
              <div>
                <span className="text-sm font-medium">{f.name}</span>
                {f.is_blue_verified && <span className="text-[var(--accent-blue)] ml-1 text-xs">&#10003;</span>}
                <span className="text-xs text-[var(--text-secondary)] ml-1">@{f.username}</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{f.followers_count.toLocaleString()}</span>
            </div>
            {f.bio && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{f.bio}</p>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 4: TWEET HAVUZU
   ══════════════════════════════════════════════════════════ */

function TabTweetPool() {
  const [accounts, setAccounts] = useState("");
  const [minEngagement, setMinEngagement] = useState(100);
  const [tweetCountPerAcc, setTweetCountPerAcc] = useState(500);

  const [stats, setStats] = useState<{
    total_tweets: number;
    accounts_count: number;
    avg_engagement: number;
    max_engagement: number;
    authors?: Record<string, number>;
    last_updated: string;
  } | null>(null);

  const [dna, setDna] = useState<Record<string, unknown> | null>(null);
  const [dnaUpdated, setDnaUpdated] = useState("");
  const [preview, setPreview] = useState<{ text: string; author: string; engagement_score: number }[]>([]);

  const [loading, setLoading] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [accRes, statsRes, dnaRes, prevRes] = await Promise.all([
        getPoolAccounts() as Promise<{ accounts: string[] }>,
        getPoolStats() as Promise<typeof stats>,
        getPoolDna() as Promise<{ dna: Record<string, unknown> | null; dna_updated: string }>,
        getPoolPreview() as Promise<{ tweets: typeof preview }>,
      ]);
      setAccounts(accRes.accounts.join(", "));
      setStats(statsRes);
      setDna(dnaRes.dna);
      setDnaUpdated(dnaRes.dna_updated);
      setPreview(prevRes.tweets);
    } catch {
      /* ignore */
    }
  };

  const handleSaveAccounts = async () => {
    const list = accounts.split(",").map((a) => a.trim()).filter(Boolean);
    await savePoolAccounts(list);
    loadData();
  };

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setFetchResult(null);
    try {
      const res = (await fetchPoolTweets(minEngagement, tweetCountPerAcc)) as {
        results: { username: string; added: number; fetched: number; skipped: number; error?: string }[];
        total_added: number;
      };
      const msgs = res.results.map((r) =>
        r.error
          ? `@${r.username}: Hata - ${r.error}`
          : `@${r.username}: ${r.fetched} cekildi, ${r.added} eklendi`
      );
      setFetchResult(`Toplam ${res.total_added} yeni tweet eklendi.\n${msgs.join("\n")}`);
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromAnalyses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await importAnalysesToPool(minEngagement)) as { total_added: number };
      setFetchResult(`Analizlerden ${res.total_added} tweet havuza eklendi.`);
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateDna = async () => {
    setLoading(true);
    try {
      const res = (await regeneratePoolDna()) as {
        success: boolean;
        tweet_count: number;
        account_count: number;
        dna: Record<string, unknown>;
      };
      if (res.success) {
        setFetchResult(`DNA yenilendi! ${res.tweet_count} tweet, ${res.account_count} hesaptan.`);
        loadData();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  };

  const poolDna = dna as {
    tweet_sayisi?: number;
    kucuk_harf_yuzde?: number;
    emoji_yuzde?: number;
    imza_kelimeleri?: Record<string, number>;
    imza_kaliplari?: Record<string, number>;
    hook_ornekleri?: string[];
  } | null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-secondary)]">
        Birden fazla hesaptan yuksek etkilesimli tweet&apos;leri otomatik cek ve biristir.
        Bu havuz, tweet yazarken AI&apos;a cesitli ornekler sunar.
      </p>

      {/* Account management */}
      <div className="glass-card space-y-3">
        <h4 className="text-sm font-semibold">Kaynak Hesaplar</h4>
        <textarea
          value={accounts}
          onChange={(e) => setAccounts(e.target.value)}
          placeholder="hrrcnes, elonmusk, hesap3 (virgul ile ayirin)"
          rows={2}
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:border-[var(--accent-blue)] focus:outline-none"
        />
        <button onClick={handleSaveAccounts} className="btn-primary text-sm">
          Hesap Listesini Kaydet
        </button>
      </div>

      {/* Fetch settings */}
      <div className="glass-card space-y-3">
        <h4 className="text-sm font-semibold">Cekme Ayarlari</h4>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Min Engagement</label>
            <input
              type="number"
              value={minEngagement}
              onChange={(e) => setMinEngagement(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-24"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Hesap Basi Tweet</label>
            <select
              value={tweetCountPerAcc}
              onChange={(e) => setTweetCountPerAcc(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={50}>50</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleFetch} disabled={loading} className="btn-primary text-sm flex-1">
            {loading ? "Cekiliyor..." : "Tweet'leri Cek ve Havuza Ekle"}
          </button>
          <button onClick={handleImportFromAnalyses} disabled={loading} className="btn-secondary text-sm">
            Analizlerden Aktar
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {fetchResult && (
        <div className="glass-card bg-[var(--accent-green)]/5 border-[var(--accent-green)]/30">
          <p className="text-sm text-[var(--accent-green)] whitespace-pre-line">{fetchResult}</p>
        </div>
      )}

      {/* Pool stats */}
      {stats && stats.total_tweets > 0 && (
        <div className="glass-card space-y-3">
          <h4 className="text-sm font-semibold">Havuz Istatistikleri</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center bg-[var(--bg-primary)] rounded-lg p-2">
              <div className="text-xl font-bold text-[var(--accent-blue)]">{stats.total_tweets.toLocaleString()}</div>
              <div className="text-xs text-[var(--text-secondary)]">Toplam Tweet</div>
            </div>
            <div className="text-center bg-[var(--bg-primary)] rounded-lg p-2">
              <div className="text-xl font-bold text-[var(--accent-cyan)]">{stats.accounts_count}</div>
              <div className="text-xs text-[var(--text-secondary)]">Hesap</div>
            </div>
            <div className="text-center bg-[var(--bg-primary)] rounded-lg p-2">
              <div className="text-xl font-bold text-[var(--accent-green)]">{stats.avg_engagement.toFixed(0)}</div>
              <div className="text-xs text-[var(--text-secondary)]">Ort. Engagement</div>
            </div>
            <div className="text-center bg-[var(--bg-primary)] rounded-lg p-2">
              <div className="text-xl font-bold text-[var(--accent-amber)]">{stats.max_engagement.toLocaleString()}</div>
              <div className="text-xs text-[var(--text-secondary)]">Max Engagement</div>
            </div>
          </div>

          {stats.authors && Object.keys(stats.authors).length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Hesap dagilimi:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(stats.authors)
                  .sort(([, a], [, b]) => b - a)
                  .map(([author, count]) => (
                    <span key={author} className="text-xs bg-[var(--bg-primary)] px-2 py-0.5 rounded-full">
                      @{author}: {count}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {stats.last_updated && (
            <p className="text-xs text-[var(--text-secondary)]">Son guncelleme: {stats.last_updated.slice(0, 19)}</p>
          )}
        </div>
      )}

      {/* Pool DNA */}
      {poolDna && (
        <div className="glass-card space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold">Havuz DNA&apos;si</h4>
            <button onClick={handleRegenerateDna} disabled={loading} className="btn-secondary text-xs">
              DNA&apos;yi Yenile
            </button>
          </div>

          {dnaUpdated && (
            <p className="text-xs text-[var(--text-secondary)]">Son guncelleme: {dnaUpdated.slice(0, 19)}</p>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="text-center bg-[var(--bg-primary)] rounded-lg p-2">
              <div className="text-lg font-bold text-[var(--accent-blue)]">{poolDna.tweet_sayisi ?? 0}</div>
              <div className="text-xs text-[var(--text-secondary)]">Tweet</div>
            </div>
            <div className="text-center bg-[var(--bg-primary)] rounded-lg p-2">
              <div className="text-lg font-bold text-[var(--accent-cyan)]">{poolDna.kucuk_harf_yuzde ?? 0}%</div>
              <div className="text-xs text-[var(--text-secondary)]">Kucuk Harf</div>
            </div>
            <div className="text-center bg-[var(--bg-primary)] rounded-lg p-2">
              <div className="text-lg font-bold text-[var(--accent-amber)]">{poolDna.emoji_yuzde ?? 0}%</div>
              <div className="text-xs text-[var(--text-secondary)]">Emoji</div>
            </div>
          </div>

          {poolDna.imza_kelimeleri && Object.keys(poolDna.imza_kelimeleri).length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Imza Kelimeleri:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(poolDna.imza_kelimeleri).slice(0, 15).map(([w, c]) => (
                  <span key={w} className="text-xs bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] px-2 py-0.5 rounded-full">
                    {w} ({c}x)
                  </span>
                ))}
              </div>
            </div>
          )}

          {poolDna.imza_kaliplari && Object.keys(poolDna.imza_kaliplari).length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Imza Kaliplari:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(poolDna.imza_kaliplari).slice(0, 10).map(([p, c]) => (
                  <span key={p} className="text-xs bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] px-2 py-0.5 rounded-full">
                    &quot;{p}&quot; ({c}x)
                  </span>
                ))}
              </div>
            </div>
          )}

          {poolDna.hook_ornekleri && poolDna.hook_ornekleri.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">En Etkili Hook&apos;lar:</p>
              <div className="space-y-1">
                {poolDna.hook_ornekleri.slice(0, 8).map((h, i) => (
                  <p key={i} className="text-xs bg-[var(--bg-primary)] rounded px-2 py-1">
                    &ldquo;{h.slice(0, 120)}&rdquo;
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pool preview */}
      {preview.length > 0 && (
        <details className="glass-card">
          <summary className="cursor-pointer text-sm font-semibold">
            Havuz Onizleme (ilk 10 tweet)
          </summary>
          <div className="mt-2 space-y-1">
            {preview.map((t, i) => (
              <div key={i} className="bg-[var(--bg-primary)] rounded-lg px-3 py-2 text-xs">
                <span className="font-bold">@{t.author}</span>
                <span className="text-[var(--text-secondary)] ml-2">Skor: {t.engagement_score.toLocaleString()}</span>
                <p className="mt-0.5 line-clamp-2">{t.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB 5: EXPORT / IMPORT
   ══════════════════════════════════════════════════════════ */

function TabExportImport() {
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = (await exportAnalyses()) as { data: string };
      // Download as file
      const blob = new Blob([res.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tweet_analyses_export.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Analiz dosyasi indirildi!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export hatasi");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const res = (await importAnalyses(importText)) as { imported: number };
      setMessage(`${res.imported} analiz iceri aktarildi!`);
      setImportText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import hatasi");
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportText(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-cyan)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Analiz verilerini JSON olarak indirin veya onceden indirdiginiz dosyayi geri yukleyin.
        </p>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {message && (
        <div className="glass-card bg-[var(--accent-green)]/5 border-[var(--accent-green)]/30">
          <p className="text-sm text-[var(--accent-green)]">{message}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Export */}
        <div className="glass-card space-y-3">
          <h4 className="text-sm font-semibold">Disa Aktar (Indir)</h4>
          <p className="text-xs text-[var(--text-secondary)]">
            Tum analiz verilerini JSON dosyasi olarak indirin.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-primary w-full text-sm"
          >
            {exporting ? "Hazirlaniyor..." : "Tumunu Indir (JSON)"}
          </button>
        </div>

        {/* Import */}
        <div className="glass-card space-y-3">
          <h4 className="text-sm font-semibold">Iceri Aktar (Yukle)</h4>

          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="text-xs"
          />

          {importText && (
            <p className="text-xs text-[var(--accent-green)]">
              Dosya yuklendi ({(importText.length / 1024).toFixed(1)} KB)
            </p>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !importText}
            className="btn-primary w-full text-sm"
          >
            {importing ? "Aktariliyor..." : "Iceri Aktar"}
          </button>
        </div>
      </div>
    </div>
  );
}
