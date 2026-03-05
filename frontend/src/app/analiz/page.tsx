"use client";

import { useState } from "react";
import { analyzeAccount } from "@/lib/api";

interface TopTweet {
  text: string;
  engagement_score: number;
  like_count: number;
  retweet_count: number;
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
}

export default function AnalizPage() {
  const [username, setUsername] = useState("");
  const [tweetCount, setTweetCount] = useState(50);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await analyzeAccount(
        username.replace("@", ""),
        tweetCount
      )) as AnalysisResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analiz hatasi");
    } finally {
      setLoading(false);
    }
  };

  const dna = result?.style_dna;
  const sigWords = dna?.imza_kelimeleri
    ? Object.entries(dna.imza_kelimeleri).slice(0, 10)
    : [];
  const sigPatterns = dna?.imza_kaliplari
    ? Object.entries(dna.imza_kaliplari).slice(0, 8)
    : [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Tweet Analizi</h2>

      {/* Input */}
      <div className="glass-card flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Kullanici Adi
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@kullanici"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Tweet Sayisi
          </label>
          <select
            value={tweetCount}
            onChange={(e) => setTweetCount(Number(e.target.value))}
            className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading || !username.trim()}
          className="btn-primary"
        >
          {loading ? "Analiz ediliyor..." : "Analiz Et"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Overview Stats */}
          <div className="glass-card">
            <h3 className="font-semibold mb-4">
              @{result.username} — Genel Bakis
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--accent-blue)]">
                  {result.tweets_analyzed}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Tweet Analiz
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--accent-cyan)]">
                  {result.original_count}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Orijinal
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--accent-green)]">
                  {result.avg_engagement.toFixed(1)}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Ort. Engagement
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--accent-amber)]">
                  {result.total_likes}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Toplam Like
                </div>
              </div>
            </div>
          </div>

          {/* Style DNA */}
          {dna && (
            <div className="glass-card">
              <h3 className="font-semibold mb-4">Stil DNA</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-[var(--accent-blue)]">
                    {dna.ortalama_uzunluk ?? "-"}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Ort. Uzunluk
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[var(--accent-cyan)]">
                    %{dna.kucuk_harf_yuzde ?? 0}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Kucuk Harf
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[var(--accent-amber)]">
                    %{dna.emoji_yuzde ?? 0}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Emoji Kullanimi
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-[var(--accent-green)]">
                    {dna.tweet_sayisi ?? 0}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Orijinal Tweet
                  </div>
                </div>
              </div>

              {/* Signature Words */}
              {sigWords.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                    Imza Kelimeleri
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {sigWords.map(([word, count]) => (
                      <span
                        key={word}
                        className="text-xs bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] px-2 py-1 rounded-full"
                      >
                        {word} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Signature Patterns */}
              {sigPatterns.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                    Imza Kaliplari
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {sigPatterns.map(([pattern, count]) => (
                      <span
                        key={pattern}
                        className="text-xs bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] px-2 py-1 rounded-full"
                      >
                        &quot;{pattern}&quot; ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top Keywords */}
          {result.top_keywords.length > 0 && (
            <div className="glass-card">
              <h3 className="font-semibold mb-3">En Iyi Anahtar Kelimeler</h3>
              <div className="flex flex-wrap gap-2">
                {result.top_keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="text-xs bg-[var(--accent-green)]/20 text-[var(--accent-green)] px-3 py-1 rounded-full"
                  >
                    {kw.keyword} ({kw.avg_score.toFixed(0)})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Best Hours */}
          {result.best_hours.length > 0 && (
            <div className="glass-card">
              <h3 className="font-semibold mb-3">En Iyi Saatler</h3>
              <div className="flex flex-wrap gap-3">
                {result.best_hours.map((h, i) => (
                  <div
                    key={i}
                    className="text-center bg-[var(--bg-primary)] rounded-lg px-4 py-2"
                  >
                    <div className="text-lg font-bold text-[var(--accent-amber)]">
                      {String(h.hour).padStart(2, "0")}:00
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {h.tweet_count} tweet &middot; {h.avg_score.toFixed(0)} skor
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Tweets */}
          {result.top_tweets.length > 0 && (
            <div className="glass-card">
              <h3 className="font-semibold mb-3">En Iyi Tweetler</h3>
              <div className="space-y-3">
                {result.top_tweets.slice(0, 5).map((tweet, i) => (
                  <div
                    key={i}
                    className="bg-[var(--bg-primary)] rounded-lg p-3"
                  >
                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-line line-clamp-3">
                      {tweet.text}
                    </p>
                    <div className="flex gap-3 mt-2 text-xs text-[var(--text-secondary)]">
                      <span>{tweet.like_count} like</span>
                      <span>{tweet.retweet_count} RT</span>
                      <span>Score: {tweet.engagement_score.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Report */}
          {result.ai_report && (
            <div className="glass-card">
              <h3 className="font-semibold mb-3">AI Analiz Raporu</h3>
              <div className="text-sm text-[var(--text-secondary)] whitespace-pre-line">
                {result.ai_report}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
