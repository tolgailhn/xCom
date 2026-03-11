"use client";

/* ── Types ─────────────────────────────────────────────── */

export interface TopTweet {
  text: string;
  engagement_score: number;
  like_count: number;
  retweet_count: number;
  reply_count?: number;
}

export interface AnalysisResult {
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

/* ── Analysis Display Component ────────────────────────── */

export default function AnalysisDisplay({ result }: { result: AnalysisResult }) {
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
