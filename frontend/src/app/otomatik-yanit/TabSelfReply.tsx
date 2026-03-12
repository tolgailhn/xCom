"use client";

import { useState } from "react";
import { type SelfReplyConfig, type SelfReplyLog, type SelfReplyStatus } from "@/lib/api";

type SelfLogFilter = "all" | "published" | "ready" | "failed";

interface TabSelfReplyProps {
  selfConfig: SelfReplyConfig;
  setSelfConfig: React.Dispatch<React.SetStateAction<SelfReplyConfig>>;
  selfStatus: SelfReplyStatus | null;
  selfLogs: SelfReplyLog[];
  styles: { id: string; name: string }[];
  selfMessage: string;
  selfSaving: boolean;
  selfTriggering: boolean;
  onSave: () => void;
  onTrigger: () => void;
  onClearLogs: () => void;
  onDeleteLog: (logId: string) => void;
  copiedId: string | null;
  onCopy: (text: string, logId: string) => void;
}

function formatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("tr-TR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

function getSelfStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "published":
      return { label: "Yayinlandi", cls: "bg-green-500/20 text-green-400" };
    case "ready":
      return { label: "Taslak", cls: "bg-yellow-500/20 text-yellow-400" };
    case "failed":
      return { label: "Hata", cls: "bg-red-500/20 text-red-400" };
    default:
      return { label: status, cls: "bg-gray-500/20 text-gray-400" };
  }
}

export default function TabSelfReply({
  selfConfig,
  setSelfConfig,
  selfStatus,
  selfLogs,
  styles,
  selfMessage,
  selfSaving,
  selfTriggering,
  onSave,
  onTrigger,
  onClearLogs,
  onDeleteLog,
  copiedId,
  onCopy,
}: TabSelfReplyProps) {
  const [selfLogFilter, setSelfLogFilter] = useState<SelfLogFilter>("all");

  const filteredSelfLogs = selfLogs.filter((l) =>
    selfLogFilter === "all" ? true
      : selfLogFilter === "failed" ? (l.status === "generation_failed" || l.status === "publish_failed")
      : l.status === selfLogFilter
  );
  const selfPublishedCount = selfLogs.filter((l) => l.status === "published").length;
  const selfReadyCount = selfLogs.filter((l) => l.status === "ready").length;
  const selfFailedCount = selfLogs.filter((l) => l.status === "generation_failed" || l.status === "publish_failed").length;

  return (
    <div className="space-y-6">
      {/* Self Message */}
      {selfMessage && (
        <div
          className={`p-3 rounded-lg text-sm ${
            selfMessage.startsWith("Hata")
              ? "bg-red-500/20 text-red-400"
              : "bg-green-500/20 text-green-400"
          }`}
        >
          {selfMessage}
        </div>
      )}

      {/* Self-Reply Status Cards */}
      {selfStatus && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">
              {selfStatus.today_replied}/{selfStatus.max_daily}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Bugun</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-green-400">
              {selfStatus.total_published}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Toplam Yayinlanan</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--accent-blue)]">
              {selfStatus.total_tweets_with_replies}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Tweet Kapsandi</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {selfStatus.total_ready}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">Taslak</div>
          </div>
        </div>
      )}

      {/* Enable + Config */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Self-Reply Otomasyonu</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Kendi tweetlerine otomatik self-reply at. X algoritması self-reply&apos;i &quot;devam eden konusma&quot; olarak gorur ve engagement&apos;i arttirir.
            </p>
          </div>
          <button
            onClick={() =>
              setSelfConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
            }
            className={`relative w-14 h-7 rounded-full transition-colors ${
              selfConfig.enabled ? "bg-purple-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                selfConfig.enabled ? "left-8" : "left-1"
              }`}
            />
          </button>
        </div>

        {/* Draft Only */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 mb-4">
          <button
            onClick={() =>
              setSelfConfig((prev) => ({ ...prev, draft_only: !prev.draft_only }))
            }
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
              selfConfig.draft_only ? "bg-yellow-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                selfConfig.draft_only ? "left-5" : "left-0.5"
              }`}
            />
          </button>
          <div>
            <span className="text-sm font-medium">Taslak Modu</span>
            <p className="text-xs text-[var(--text-secondary)]">
              {selfConfig.draft_only
                ? "Reply\u0027lar sadece uretilir, paylasim yapilmaz."
                : "Reply\u0027lar uretilir ve otomatik paylasilir."}
            </p>
          </div>
        </div>

        {/* Username */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">X Hesap Adi</label>
          <input
            type="text"
            value={selfConfig.username}
            onChange={(e) =>
              setSelfConfig((prev) => ({ ...prev, username: e.target.value.replace(/^@/, "") }))
            }
            placeholder="kullaniciadi"
            className="input w-full md:w-1/2"
          />
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Self-reply atilacak kendi X hesabin
          </p>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Gunluk Max Tweet</label>
            <input
              type="number"
              value={selfConfig.max_daily_tweets}
              onChange={(e) =>
                setSelfConfig((prev) => ({
                  ...prev,
                  max_daily_tweets: parseInt(e.target.value) || 4,
                }))
              }
              min={1}
              max={10}
              className="input w-full"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Gunde max kac tweet&apos;e self-reply atilsin (her tweet&apos;e 1 reply)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Min Tweet Yasi (dk)</label>
            <input
              type="number"
              value={selfConfig.min_tweet_age_minutes}
              onChange={(e) =>
                setSelfConfig((prev) => ({
                  ...prev,
                  min_tweet_age_minutes: parseInt(e.target.value) || 30,
                }))
              }
              min={5}
              max={180}
              className="input w-full"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Tweet&apos;in en az kac dk sonra reply alacagi
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Max Tweet Yasi (gun)</label>
            <input
              type="number"
              value={selfConfig.max_tweet_age_days}
              onChange={(e) =>
                setSelfConfig((prev) => ({
                  ...prev,
                  max_tweet_age_days: parseInt(e.target.value) || 5,
                }))
              }
              min={1}
              max={14}
              className="input w-full"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Son kac gunun tweetlerine reply atilsin
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Yazim Tarzi</label>
            <select
              value={selfConfig.style}
              onChange={(e) =>
                setSelfConfig((prev) => ({ ...prev, style: e.target.value }))
              }
              className="input w-full"
            >
              <option value="samimi">Samimi</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Work hours */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Baslangic Saati</label>
            <input
              type="number"
              value={selfConfig.work_hour_start}
              onChange={(e) =>
                setSelfConfig((prev) => ({
                  ...prev,
                  work_hour_start: parseInt(e.target.value) || 9,
                }))
              }
              min={0}
              max={23}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bitis Saati</label>
            <input
              type="number"
              value={selfConfig.work_hour_end}
              onChange={(e) =>
                setSelfConfig((prev) => ({
                  ...prev,
                  work_hour_end: parseInt(e.target.value) || 23,
                }))
              }
              min={1}
              max={24}
              className="input w-full"
            />
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-5 bg-purple-500/5 border border-purple-500/20">
        <h4 className="text-sm font-semibold text-purple-400 mb-2">Nasil Calisir?</h4>
        <ul className="text-xs text-[var(--text-secondary)] space-y-1">
          <li>- Her 15 dakikada kendi tweetlerin kontrol edilir</li>
          <li>- Son {selfConfig.max_tweet_age_days} gundeki orijinal tweetlerine 1 self-reply uretilir</li>
          <li>- Gunde max {selfConfig.max_daily_tweets} tweet&apos;e self-reply atilir</li>
          <li>- Her reply farkli bir acidan devam eder: ek bilgi, deneyim, CTA</li>
          <li>- Zaten reply atilmis tweetlere tekrar atilmaz</li>
          <li>- Training DNA&apos;n (tolga style) kullanilarak dogal reply uretilir</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={selfSaving}
          className="btn-primary px-6 py-2.5"
        >
          {selfSaving ? "Kaydediliyor..." : "Kaydet"}
        </button>
        <button
          onClick={onTrigger}
          disabled={selfTriggering || !selfConfig.enabled || !selfConfig.username}
          className="px-6 py-2.5 rounded-lg font-medium text-sm transition-all bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 disabled:opacity-50"
        >
          {selfTriggering ? "Kontrol ediliyor..." : "Simdi Kontrol Et"}
        </button>
      </div>

      {/* Self-Reply Logs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 flex-wrap">
            {([
              { key: "all" as SelfLogFilter, label: "Tumu", count: selfLogs.length },
              { key: "published" as SelfLogFilter, label: "Yayinlanan", count: selfPublishedCount },
              { key: "ready" as SelfLogFilter, label: "Taslak", count: selfReadyCount },
              { key: "failed" as SelfLogFilter, label: "Hatali", count: selfFailedCount },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setSelfLogFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selfLogFilter === f.key
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          {selfLogs.length > 0 && (
            <button
              onClick={onClearLogs}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Logları Temizle
            </button>
          )}
        </div>

        {filteredSelfLogs.length === 0 ? (
          <div className="card p-8 text-center text-[var(--text-secondary)]">
            {selfLogFilter === "published"
              ? "Henuz yayinlanan self-reply yok"
              : selfLogFilter === "ready"
              ? "Bekleyen taslak yok"
              : "Henuz self-reply uretilmedi. Sistemi aktif edip beklein veya 'Simdi Kontrol Et' butonuna basin."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSelfLogs.map((log) => {
              const badge = getSelfStatusBadge(log.status);

              return (
                <div
                  key={log.id}
                  className={`card p-4 border-l-4 ${
                    log.status === "published"
                      ? "border-l-green-500"
                      : log.status === "ready"
                      ? "border-l-yellow-500"
                      : "border-l-red-500"
                  }`}
                >
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-[var(--text-secondary)]">
                        Reply #{log.reply_number}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {formatTime(log.created_at)}
                      </span>
                      <button
                        onClick={() => onDeleteLog(log.id)}
                        className="text-xs text-[var(--text-secondary)] hover:text-red-400"
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  {/* Original tweet */}
                  <div className="mb-2 p-2 rounded bg-[var(--bg-primary)] text-xs leading-relaxed">
                    <span className="text-[var(--text-secondary)] font-medium">Tweet: </span>
                    <span className="whitespace-pre-wrap">{log.tweet_text}</span>
                  </div>

                  {/* Self-reply text */}
                  {log.reply_text && (
                    <div className="mb-2 p-2 rounded bg-purple-500/5 border border-purple-500/20 text-sm leading-relaxed">
                      <div className="whitespace-pre-wrap">{log.reply_text}</div>
                    </div>
                  )}

                  {log.error && (
                    <div className="mb-2 text-xs text-red-400 bg-red-500/5 p-2 rounded">
                      {log.error}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {log.reply_text && (
                      <button
                        onClick={() => onCopy(log.reply_text, log.id)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          copiedId === log.id
                            ? "bg-green-500/20 text-green-400"
                            : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {copiedId === log.id ? "Kopyalandi" : "Kopyala"}
                      </button>
                    )}

                    {log.reply_url && (
                      <a
                        href={log.reply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all"
                      >
                        Gor
                      </a>
                    )}

                    {log.tweet_id && (
                      <a
                        href={`https://x.com/i/status/${log.tweet_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-primary)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-all"
                      >
                        Tweet
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
