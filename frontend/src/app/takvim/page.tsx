"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getTodaySchedule,
  logPost,
  getChecklist,
  updateChecklist,
  getWeeklySummary,
  getCalendarHistory,
  getAllScheduledPosts,
  cancelScheduledPost,
  getPerformanceStats,
  refreshAllMetrics,
  autoRegisterMetrics,
} from "@/lib/api";
import type { ScheduledPost, PerformanceStats } from "@/lib/api";

/* ── Types ─────────────────────────────────────── */

interface SlotData {
  time: string;
  label: string;
  icon: string;
  type: string;
  desc: string;
  status: "posted" | "current" | "upcoming" | "passed";
  posted: boolean;
  log?: {
    post_type: string;
    content: string;
    url: string;
    tweet_url?: string;
    has_media: boolean;
    self_reply: boolean;
  };
}

interface ScheduleData {
  date: string;
  day_name: string;
  is_weekend: boolean;
  slots: SlotData[];
  next_slot: { time: string; label: string; countdown: string } | null;
  today_posted: number;
  post_types: string[];
}

interface ChecklistItem {
  key: string;
  label: string;
  impact: string;
  checked: boolean;
}

interface WeeklySummary {
  total_posts: number;
  media_posts: number;
  media_pct: number;
  reply_posts: number;
  reply_pct: number;
  active_days: number;
  top_types: { type: string; count: number }[];
  day_breakdown: {
    date: string;
    day_name: string;
    count: number;
    media: number;
    reply: number;
  }[];
}

interface HistoryEntry {
  date: string;
  slot_time: string;
  post_type: string;
  content: string;
  has_media: boolean;
  self_reply: boolean;
  tweet_url?: string;
  url?: string;
}

/* ── Slot Icon ─────────────────────────────────── */

function SlotIcon({ icon }: { icon: string }) {
  const map: Record<string, string> = {
    sun: "☀️",
    utensils: "🍽️",
    walking: "🚶",
    moon: "🌙",
    sunset: "🌅",
  };
  return <span className="text-2xl">{map[icon] || "📌"}</span>;
}

/* ── Stat Box ──────────────────────────────────── */

function StatBox({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div className="glass-card text-center">
      <div className="text-2xl font-bold gradient-text">{value}</div>
      <div className="text-xs text-[var(--text-secondary)] mt-1">{label}</div>
    </div>
  );
}

/* ── Log Form ──────────────────────────────────── */

function LogForm({
  slot,
  postTypes,
  defaultTypeIdx,
  onSaved,
}: {
  slot: SlotData;
  postTypes: string[];
  defaultTypeIdx: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(slot.status === "current");
  const [postType, setPostType] = useState(
    postTypes[Math.min(defaultTypeIdx, postTypes.length - 1)] || ""
  );
  const [hasMedia, setHasMedia] = useState(true);
  const [selfReply, setSelfReply] = useState(false);
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await logPost({
        slot_time: slot.time,
        post_type: postType,
        has_media: hasMedia,
        has_self_reply: selfReply,
        url,
        content,
      });
      onSaved();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-[var(--accent-blue)] hover:underline"
      >
        {open ? "▾ Kayit Formunu Gizle" : "▸ Paylasim Kaydet"}
      </button>
      {open && (
        <div className="mt-3 space-y-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">
                Post Turu
              </label>
              <select
                className="w-full p-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
                value={postType}
                onChange={(e) => setPostType(e.target.value)}
              >
                {postTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4 pt-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasMedia}
                  onChange={(e) => setHasMedia(e.target.checked)}
                  className="accent-[var(--accent-blue)]"
                />
                Medya var
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selfReply}
                  onChange={(e) => setSelfReply(e.target.checked)}
                  className="accent-[var(--accent-blue)]"
                />
                Self-reply
              </label>
            </div>
          </div>

          <textarea
            className="w-full p-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
            rows={3}
            placeholder="Tweet icerigini yapistir (opsiyonel)..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <input
            type="text"
            className="w-full p-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm"
            placeholder="Tweet URL (opsiyonel) — https://x.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full text-sm"
          >
            {saving ? "Kaydediliyor..." : `${slot.time} Paylasimini Kaydet`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────── */

export default function TakvimPage() {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [showStrategy, setShowStrategy] = useState(false);

  /* Scheduled posts */
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [scheduledFilter, setScheduledFilter] = useState<"all" | "pending">("pending");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadScheduledPosts = useCallback(async () => {
    try {
      const res = await getAllScheduledPosts();
      setScheduledPosts(res.posts || []);
    } catch { /* ignore */ }
  }, []);

  const handleCancelScheduled = async (postId: string) => {
    setCancellingId(postId);
    try {
      await cancelScheduledPost(postId);
      await loadScheduledPosts();
    } catch { /* ignore */ }
    finally { setCancellingId(null); }
  };

  /* Performance */
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
  const [perfRefreshing, setPerfRefreshing] = useState(false);
  const [perfRegistering, setPerfRegistering] = useState(false);

  const loadPerformance = useCallback(async () => {
    try {
      const stats = await getPerformanceStats();
      setPerfStats(stats);
    } catch { /* ignore */ }
  }, []);

  const handleRefreshMetrics = async () => {
    setPerfRefreshing(true);
    try {
      await refreshAllMetrics();
      await loadPerformance();
    } catch { /* ignore */ }
    finally { setPerfRefreshing(false); }
  };

  const handleAutoRegister = async () => {
    setPerfRegistering(true);
    try {
      await autoRegisterMetrics();
      await loadPerformance();
    } catch { /* ignore */ }
    finally { setPerfRegistering(false); }
  };

  const loadAll = useCallback(async () => {
    try {
      const [sched, sum, hist] = await Promise.all([
        getTodaySchedule(),
        getWeeklySummary(),
        getCalendarHistory(30),
      ]);
      setSchedule(sched as ScheduleData);
      setSummary(sum as WeeklySummary);
      setHistory((hist as { entries: HistoryEntry[] }).entries || []);

      // Load checklist for today
      const todayStr = (sched as ScheduleData).date;
      const cl = await getChecklist(todayStr);
      setChecklist((cl as { items: ChecklistItem[] }).items || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadScheduledPosts();
    loadPerformance();
  }, [loadAll, loadScheduledPosts, loadPerformance]);

  const handleChecklistToggle = async (key: string, checked: boolean) => {
    if (!schedule) return;
    const newChecklist = checklist.map((item) =>
      item.key === key ? { ...item, checked } : item
    );
    setChecklist(newChecklist);

    const items: Record<string, boolean> = {};
    newChecklist.forEach((item) => {
      items[item.key] = item.checked;
    });
    await updateChecklist(schedule.date, items);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      </div>
    );
  }

  const checklistDone = checklist.filter((i) => i.checked).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">Posting Takvimi</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Gunluk 4 Post &middot; Algoritma Optimizasyonu
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox
          value={`${schedule?.today_posted || 0}/4`}
          label="Bugun Paylasilan"
        />
        <StatBox
          value={
            schedule?.next_slot
              ? schedule.next_slot.countdown
              : "Tamam"
          }
          label={
            schedule?.next_slot
              ? `Sonraki: ${schedule.next_slot.time}`
              : "Bugun Tamamlandi"
          }
        />
        <StatBox
          value={`${summary?.total_posts || 0}/28`}
          label="Bu Hafta"
        />
        <StatBox
          value={`${checklistDone}/${checklist.length}`}
          label="Checklist"
        />
      </div>

      {/* Today's Schedule */}
      {schedule && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">
              Bugunun Plani &mdash; {schedule.day_name}{" "}
              <span className="text-sm font-normal text-[var(--text-secondary)]">
                ({schedule.is_weekend ? "Hafta Sonu" : "Hafta Ici"})
              </span>
            </h3>
            <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">
              3.5-4 saat arayla
            </span>
          </div>

          <div className="space-y-3">
            {schedule.slots.map((slot, idx) => {
              const borderColor =
                slot.status === "posted"
                  ? "var(--accent-green)"
                  : slot.status === "current"
                  ? "#f59e0b"
                  : "var(--border)";

              return (
                <div
                  key={slot.time}
                  className="glass-card"
                  style={{ borderLeft: `4px solid ${borderColor}` }}
                >
                  {/* Header row */}
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <SlotIcon icon={slot.icon} />
                      <div>
                        <span className="font-semibold text-lg">
                          {slot.time}
                        </span>
                        <span className="text-[var(--text-secondary)] ml-2">
                          &mdash; {slot.label}
                        </span>
                      </div>
                    </div>
                    <div>
                      {slot.status === "posted" && (
                        <span className="text-[var(--accent-green)] font-semibold text-sm">
                          Paylasildi
                        </span>
                      )}
                      {slot.status === "current" && (
                        <span className="text-[#f59e0b] font-semibold text-sm animate-pulse">
                          SIMDI PAYLAS!
                        </span>
                      )}
                      {slot.status === "upcoming" && (
                        <span className="text-[var(--text-secondary)] text-sm">
                          {schedule.next_slot?.time === slot.time
                            ? `${schedule.next_slot.countdown} kaldi`
                            : "Bekliyor"}
                        </span>
                      )}
                      {slot.status === "passed" && (
                        <span className="text-[var(--text-secondary)] text-sm opacity-50">
                          Gecti
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Recommended type */}
                  <div className="mt-2">
                    <span className="inline-block bg-[rgba(99,102,241,0.15)] text-[#a5b4fc] text-xs px-3 py-1 rounded-full">
                      Onerilen tur: {slot.type}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {slot.desc}
                  </p>

                  {/* Posted details */}
                  {slot.posted && slot.log && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                      {slot.log.post_type && (
                        <span className="bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
                          {slot.log.post_type}
                        </span>
                      )}
                      {slot.log.has_media && (
                        <span className="bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
                          Medya
                        </span>
                      )}
                      {slot.log.self_reply && (
                        <span className="bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
                          Self-reply
                        </span>
                      )}
                      {slot.log.content && (
                        <p className="w-full text-xs mt-1 line-clamp-2">
                          {slot.log.content}
                        </p>
                      )}
                      {(slot.log.url || slot.log.tweet_url) && (
                        <a
                          href={slot.log.url || slot.log.tweet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent-blue)] hover:underline"
                        >
                          Tweet'i gor →
                        </a>
                      )}
                    </div>
                  )}

                  {/* Log form for unposted slots */}
                  {!slot.posted && (
                    <LogForm
                      slot={slot}
                      postTypes={schedule.post_types}
                      defaultTypeIdx={idx}
                      onSaved={loadAll}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Scheduled Posts */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Zamanlanmis Postlar</h3>
          <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
            <button
              onClick={() => setScheduledFilter("pending")}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${scheduledFilter === "pending" ? "bg-[var(--accent-blue)] text-white" : "text-[var(--text-secondary)]"}`}
            >
              Bekleyen
            </button>
            <button
              onClick={() => setScheduledFilter("all")}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${scheduledFilter === "all" ? "bg-[var(--accent-blue)] text-white" : "text-[var(--text-secondary)]"}`}
            >
              Tumu
            </button>
          </div>
        </div>

        {(() => {
          const filtered = scheduledFilter === "pending"
            ? scheduledPosts.filter((p) => p.status === "pending")
            : scheduledPosts;
          if (filtered.length === 0) {
            return (
              <div className="glass-card text-center text-[var(--text-secondary)] text-sm py-6">
                {scheduledFilter === "pending"
                  ? "Bekleyen zamanlanmis post yok. Yaz sayfasindan 'Zamanla' butonuyla ekleyebilirsin."
                  : "Henuz zamanlanmis post yok."}
              </div>
            );
          }
          return (
            <div className="space-y-2">
              {filtered.map((post) => {
                const statusColor =
                  post.status === "published"
                    ? "var(--accent-green)"
                    : post.status === "failed"
                      ? "var(--accent-red)"
                      : "#f59e0b";
                const statusLabel =
                  post.status === "published"
                    ? "Paylasild"
                    : post.status === "failed"
                      ? "Basarisiz"
                      : "Bekliyor";
                const dt = new Date(post.scheduled_time);
                const dateStr = dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const timeStr = dt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

                return (
                  <div
                    key={post.id}
                    className="glass-card"
                    style={{ borderLeft: `4px solid ${statusColor}` }}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color: statusColor }}>
                            {statusLabel}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {dateStr} {timeStr}
                          </span>
                          {post.thread_parts && post.thread_parts.length > 0 && (
                            <span className="text-xs bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
                              Thread ({post.thread_parts.length})
                            </span>
                          )}
                        </div>
                        <p className="text-sm line-clamp-2">{post.text}</p>
                        {post.error && (
                          <p className="text-xs text-[var(--accent-red)] mt-1">{post.error}</p>
                        )}
                        {post.tweet_url && (
                          <a
                            href={post.tweet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--accent-blue)] hover:underline mt-1 inline-block"
                          >
                            Tweet&apos;i gor
                          </a>
                        )}
                      </div>
                      {post.status === "pending" && (
                        <button
                          onClick={() => handleCancelScheduled(post.id)}
                          disabled={cancellingId === post.id}
                          className="text-xs text-[var(--accent-red)] hover:underline whitespace-nowrap"
                        >
                          {cancellingId === post.id ? "..." : "Iptal"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Performance Tracking */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Performans Takibi</h3>
          <div className="flex gap-2">
            <button
              onClick={handleAutoRegister}
              disabled={perfRegistering}
              className="text-xs text-[var(--accent-blue)] hover:underline"
            >
              {perfRegistering ? "..." : "Gecmisten Ekle"}
            </button>
            <button
              onClick={handleRefreshMetrics}
              disabled={perfRefreshing}
              className="text-xs text-[var(--accent-blue)] hover:underline"
            >
              {perfRefreshing ? "Guncelleniyor..." : "Metrikleri Guncelle"}
            </button>
          </div>
        </div>

        {perfStats && perfStats.summary.tracked_count > 0 ? (
          <div className="space-y-3">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox value={perfStats.summary.tracked_count} label="Takip Edilen" />
              <StatBox value={perfStats.summary.total_likes} label="Toplam Like" />
              <StatBox value={perfStats.summary.total_retweets} label="Toplam RT" />
              <StatBox value={perfStats.summary.total_impressions} label="Toplam Goruntulenme" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatBox value={perfStats.summary.avg_likes} label="Ort. Like" />
              <StatBox value={perfStats.summary.avg_retweets} label="Ort. RT" />
            </div>

            {/* Best tweet */}
            {perfStats.best_tweet && (
              <div className="glass-card" style={{ borderLeft: "4px solid var(--accent-green)" }}>
                <div className="text-xs text-[var(--text-secondary)] mb-1 font-semibold">En Iyi Tweet</div>
                <p className="text-sm mb-2">{perfStats.best_tweet.text}</p>
                <div className="flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                  <span>{perfStats.best_tweet.metrics.likes} like</span>
                  <span>{perfStats.best_tweet.metrics.retweets} RT</span>
                  <span>{perfStats.best_tweet.metrics.replies} reply</span>
                  <span>{perfStats.best_tweet.metrics.impressions} goruntulenme</span>
                  {perfStats.best_tweet.url && (
                    <a href={perfStats.best_tweet.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:underline">
                      Gor
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Recent tweets metrics */}
            <div className="glass-card">
              <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Son Tweetler</div>
              <div className="space-y-2">
                {perfStats.tweets.slice(0, 10).map((tw) => (
                  <div key={tw.tweet_id} className="flex justify-between items-start gap-3 text-xs border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{tw.text || tw.tweet_id}</p>
                    </div>
                    <div className="flex gap-2 text-[var(--text-secondary)] whitespace-nowrap">
                      <span>{tw.metrics?.likes || 0} L</span>
                      <span>{tw.metrics?.retweets || 0} RT</span>
                      <span>{tw.metrics?.replies || 0} R</span>
                      {tw.url && (
                        <a href={tw.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)]">
                          🔗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card text-center text-[var(--text-secondary)] text-sm py-6">
            Henuz takip edilen tweet yok. Tweet paylasinca otomatik eklenir veya &quot;Gecmisten Ekle&quot; ile mevcut tweetleri iceri aktar.
          </div>
        )}
      </div>

      {/* Algorithm Checklist */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Gunluk Algoritma Checklist</h3>
          <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">
            Her gun uygula
          </span>
        </div>
        <div className="glass-card">
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Bu maddeleri her gun uygulamak reach'ini 2-4x artirir. X Premium'san
            etkisi daha da fazla.
          </p>
          <div className="space-y-2">
            {checklist.map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) =>
                    handleChecklistToggle(item.key, e.target.checked)
                  }
                  className="accent-[var(--accent-green)] mt-0.5"
                />
                <div className="flex-1">
                  <span
                    className={`text-sm ${
                      item.checked
                        ? "line-through text-[var(--text-secondary)]"
                        : ""
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="text-xs text-[var(--accent-blue)] ml-2">
                    {item.impact}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly Summary */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Haftalik Ozet</h3>
        {summary && summary.total_posts > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBox value={summary.total_posts} label="Toplam Post" />
              <StatBox value={`%${summary.media_pct}`} label="Medya Orani" />
              <StatBox
                value={`%${summary.reply_pct}`}
                label="Self-Reply Orani"
              />
              <StatBox value={`${summary.active_days}/7`} label="Aktif Gun" />
            </div>

            {summary.top_types.length > 0 && (
              <div className="glass-card mb-3">
                <h4 className="text-sm font-semibold mb-2">En Cok Tur</h4>
                <div className="flex flex-wrap gap-2">
                  {summary.top_types.map((t) => (
                    <span
                      key={t.type}
                      className="text-xs bg-[var(--bg-secondary)] px-2 py-1 rounded"
                    >
                      {t.type}: {t.count}x
                    </span>
                  ))}
                </div>
              </div>
            )}

            {summary.day_breakdown.length > 0 && (
              <div className="glass-card">
                <h4 className="text-sm font-semibold mb-2">Gunluk Dagilim</h4>
                <div className="space-y-1">
                  {summary.day_breakdown.map((day) => {
                    const dots =
                      "🟢".repeat(day.count) +
                      "⚫".repeat(Math.max(0, 4 - day.count));
                    return (
                      <div
                        key={day.date}
                        className="text-xs text-[var(--text-secondary)]"
                      >
                        <span className="font-medium">{day.date}</span>{" "}
                        <span>({day.day_name})</span>: {dots} &mdash;{" "}
                        {day.count}/4 post, {day.media} medya, {day.reply} reply
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="glass-card text-center text-[var(--text-secondary)] text-sm py-8">
            Henuz bu hafta paylasim kaydi yok. Yukaridan ilk paylasimini kaydet!
          </div>
        )}
      </div>

      {/* Post History */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Son Paylasim Kayitlari</h3>
          {history.length > 10 && (
            <select
              className="text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1"
              value={historyLimit}
              onChange={(e) => setHistoryLimit(Number(e.target.value))}
            >
              <option value={10}>10 kayit</option>
              <option value={20}>20 kayit</option>
              <option value={30}>30 kayit</option>
            </select>
          )}
        </div>
        {history.length > 0 ? (
          <div className="glass-card">
            <div className="space-y-2">
              {history.slice(0, historyLimit).map((entry, i) => {
                const entryUrl = entry.tweet_url || entry.url;
                return (
                  <div
                    key={i}
                    className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-1 items-baseline"
                  >
                    <span className="font-medium">
                      {entry.date} {entry.slot_time}
                    </span>
                    <span>|</span>
                    <span>{entry.post_type || "?"}</span>
                    {entry.has_media && <span>🖼️</span>}
                    {entry.self_reply && <span>💬</span>}
                    {entry.content && (
                      <span className="truncate max-w-[300px]">
                        &mdash; {entry.content.slice(0, 80)}
                        {entry.content.length > 80 ? "..." : ""}
                      </span>
                    )}
                    {entryUrl && (
                      <a
                        href={entryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent-blue)] hover:underline"
                      >
                        🔗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="glass-card text-center text-[var(--text-secondary)] text-sm py-4">
            Henuz kayit yok.
          </div>
        )}
      </div>

      {/* Strategy Tips */}
      <div>
        <button
          onClick={() => setShowStrategy(!showStrategy)}
          className="text-sm text-[var(--accent-blue)] hover:underline"
        >
          {showStrategy
            ? "▾ Posting Stratejisi Detaylari"
            : "▸ Posting Stratejisi Detaylari"}
        </button>
        {showStrategy && (
          <div className="glass-card mt-2 text-sm space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Neden Bu Saatler?</h4>
              <p className="text-[var(--text-secondary)] text-xs mb-2">
                Her post arasi 3.5-4 saat → Her biri kendi &quot;ilk 30-60dk
                erken engagement&quot; penceresini alir. Recency decay&apos;e
                takilmaz, diversity cezasi yemez.
              </p>
              <div className="text-xs space-y-1 text-[var(--text-secondary)]">
                <div>
                  <strong>09:00 (HI) / 10:00 (HS)</strong> — Ilk post reach'i
                  en yuksek. Grok ranking ilk 60dk'yi agir tartar.
                </div>
                <div>
                  <strong>13:00 (HI) / 13:30 (HS)</strong> — Turk lunch + global
                  overlap.
                </div>
                <div>
                  <strong>17:00 (HI) / 17:30 (HS)</strong> — Is cikisi commute.
                  Reply orani +%40.
                </div>
                <div>
                  <strong>21:00 (HI) / 21:30 (HS)</strong> — Aksam en yuksek
                  scroll sureleri.
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Algoritma Takviyesi</h4>
              <ol className="text-xs text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
                <li>
                  Native medya koy (foto/GIF/video/poll) → reach +%50-90
                </li>
                <li>
                  Self-reply: Kendi postuna soruyla reply at → Phoenix ranking
                  boost
                </li>
                <li>
                  Ilk 5-10 yorumu 30dk icinde cevapla → Erken engagement sinyali
                </li>
                <li>
                  Post turlerini cesitlendir → Diversity bonus
                </li>
                <li>
                  External link varsa 1. reply&apos;e koy → Link cezasi onleme
                </li>
                <li>
                  X Analytics kontrolu → Zamanlama optimizasyonu
                </li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Post Tur Rotasyonu</h4>
              <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
                <div>Post 1 → Deger/meme/egitim</div>
                <div>Post 2 → Soru/poll</div>
                <div>Post 3 → Opinion (kisa ve punchy)</div>
                <div>Post 4 → Conversation starter veya kisa video</div>
              </div>
              <p className="text-xs text-[var(--accent-blue)] mt-2">
                X Premium&apos;san bu saatlerde 2-4x daha fazla kisi gorur.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
