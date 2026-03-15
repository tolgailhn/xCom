"use client";

import { useState, useEffect } from "react";
import {
  getPoolAccounts,
  savePoolAccounts,
  getPoolStats,
  fetchPoolTweets,
  importAnalysesToPool,
  getPoolDna,
  regeneratePoolDna,
  getPoolPreview,
} from "@/lib/api";

/* ── Main Tab Component ──────────────────────────────────── */

export default function TabPool() {
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
