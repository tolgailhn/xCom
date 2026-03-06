"use client";

import { useState } from "react";
import { scanTopics, discoverTopics } from "@/lib/api";

// ── Types ──────────────────────────────────────────────

interface Topic {
  id: string;
  text: string;
  author_name: string;
  author_username: string;
  author_followers_count: number;
  category: string;
  engagement_score: number;
  relevance_score: number;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  url: string;
  content_summary: string;
  media_urls: string[];
}

interface DiscoverData {
  ai_topics: Topic[];
  github_topics: Topic[];
  tracked_topics: Topic[];
  grok_topics: { title: string; description: string; angle?: string; potential?: string }[];
  total: number;
  errors: string[];
}

// ── Constants ──────────────────────────────────────────

const CATEGORIES = [
  "Tumu", "Yeni Model", "Model Guncelleme", "Arastirma",
  "Benchmark", "Acik Kaynak", "API/Platform", "AI Ajanlar",
  "Goruntu/Video", "Endustri",
];

const TIME_OPTIONS = [
  { value: "6h", label: "Son 6 saat" },
  { value: "12h", label: "Son 12 saat" },
  { value: "24h", label: "Son 24 saat" },
  { value: "7d", label: "Son 7 gun" },
];

// ── Topic Card Component ───────────────────────────────

function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div className="glass-card">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          {/* Author */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-blue-400">
              @{topic.author_username}
            </span>
            {topic.author_name && (
              <span className="text-xs text-zinc-500">
                {topic.author_name}
              </span>
            )}
            {topic.author_followers_count > 0 && (
              <span className="text-xs text-zinc-600">
                {topic.author_followers_count.toLocaleString()} takipci
              </span>
            )}
          </div>

          {/* Text */}
          <p className="text-sm text-zinc-200 whitespace-pre-line mb-2">
            {topic.text}
          </p>

          {/* Summary */}
          {topic.content_summary && (
            <p className="text-xs text-zinc-400 italic mb-2">
              {topic.content_summary}
            </p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded">
              {topic.category}
            </span>
            <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded">
              Eng: {topic.engagement_score.toFixed(0)}
            </span>
            <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded">
              {topic.like_count} like / {topic.retweet_count} RT / {topic.reply_count} reply
            </span>
            {topic.media_urls.length > 0 && (
              <span className="text-xs bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded">
                {topic.media_urls.length} medya
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          <a
            href={`/yaz?topic=${encodeURIComponent(topic.content_summary || topic.text.slice(0, 200))}&url=${encodeURIComponent(topic.url || "")}`}
            className="btn-primary text-xs px-3 py-1.5 text-center"
          >
            Tweet Yaz
          </a>
          <a
            href={`/yaz?topic=${encodeURIComponent(topic.text.slice(0, 200))}&url=${encodeURIComponent(topic.url || "")}&mode=quote`}
            className="text-xs px-3 py-1.5 text-center border border-zinc-700 rounded-lg hover:border-blue-500/50 hover:text-blue-300 transition-colors"
          >
            Quote Tweet
          </a>
          {topic.url && (
            <a
              href={topic.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 text-center text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              X&apos;te Ac
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

export default function TaraPage() {
  const [activeTab, setActiveTab] = useState<"tara" | "kesfet">("tara");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">AI Gundem Tarayici</h2>

      {/* Tab Switch */}
      <div className="flex gap-1 border-b border-white/10">
        <button
          onClick={() => setActiveTab("tara")}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            activeTab === "tara"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Tara
        </button>
        <button
          onClick={() => setActiveTab("kesfet")}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            activeTab === "kesfet"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Kesfet
        </button>
      </div>

      {activeTab === "tara" && <TabScan />}
      {activeTab === "kesfet" && <TabDiscover />}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 1: TARA
// ════════════════════════════════════════════════════════

function TabScan() {
  const [timeRange, setTimeRange] = useState("24h");
  const [category, setCategory] = useState("Tumu");
  const [maxResults, setMaxResults] = useState(20);
  const [engine, setEngine] = useState("default");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customQuery, setCustomQuery] = useState("");
  const [minLikes, setMinLikes] = useState(10);
  const [minRetweets, setMinRetweets] = useState(5);
  const [minFollowers, setMinFollowers] = useState(500);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"relevans" | "hesap">("relevans");

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setErrors([]);
    try {
      const result = (await scanTopics({
        time_range: timeRange,
        category: category === "Tumu" ? "all" : category,
        max_results: maxResults,
        custom_query: customQuery,
        min_likes: minLikes,
        min_retweets: minRetweets,
        min_followers: minFollowers,
        engine,
      })) as { topics: Topic[]; total_scanned: number; errors: string[] };
      setTopics(result.topics);
      if (result.errors?.length) setErrors(result.errors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tarama hatasi");
    } finally {
      setLoading(false);
    }
  };

  // Group topics by account for account view
  const accountGroups = (() => {
    const map: Record<string, Topic[]> = {};
    for (const t of topics) {
      const key = t.author_username;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  })();

  // Category summary
  const categorySummary = (() => {
    const map: Record<string, number> = {};
    for (const t of topics) {
      map[t.category] = (map[t.category] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  })();

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="glass-card space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Zaman</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
            >
              {TIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Maks. Sonuc</label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              min={5}
              max={50}
              className="w-20 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Motor</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="default">DuckDuckGo</option>
              <option value="grok">Grok</option>
            </select>
          </div>

          <button
            onClick={handleScan}
            disabled={loading}
            className="btn-primary px-6"
          >
            {loading ? "Taraniyor..." : "Tara"}
          </button>
        </div>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showAdvanced ? "Gelismis Filtreleri Kapat" : "Gelismis Filtreler"}
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Ozel Arama Sorgusu</label>
              <input
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Orn: 'Qwen release' veya 'GPT-5 leak'"
                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Min. Begeni</label>
                <input
                  type="number"
                  value={minLikes}
                  onChange={(e) => setMinLikes(Number(e.target.value))}
                  min={0}
                  className="w-24 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Min. RT</label>
                <input
                  type="number"
                  value={minRetweets}
                  onChange={(e) => setMinRetweets(Number(e.target.value))}
                  min={0}
                  className="w-24 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Min. Takipci</label>
                <input
                  type="number"
                  value={minFollowers}
                  onChange={(e) => setMinFollowers(Number(e.target.value))}
                  min={0}
                  className="w-28 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Search Errors */}
      {errors.length > 0 && (
        <details className="glass-card">
          <summary className="text-sm text-amber-400 cursor-pointer">
            {errors.length} arama hatasi olustu
          </summary>
          <div className="mt-2 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-zinc-500">{e}</p>
            ))}
          </div>
        </details>
      )}

      {/* Results */}
      {topics.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-300">
              {topics.length} sonuc bulundu
            </p>
            {/* View Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("relevans")}
                className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                  viewMode === "relevans"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Relevans Sirasi
              </button>
              <button
                onClick={() => setViewMode("hesap")}
                className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                  viewMode === "hesap"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Hesap Bazli
              </button>
            </div>
          </div>

          {/* Category Summary */}
          {categorySummary.length > 1 && (
            <div className="flex flex-wrap gap-3">
              {categorySummary.map(([cat, count]) => (
                <div
                  key={cat}
                  className="bg-zinc-900/50 rounded-lg px-3 py-2 text-center"
                >
                  <div className="text-sm font-bold text-white">{count}</div>
                  <div className="text-xs text-zinc-500">{cat}</div>
                </div>
              ))}
            </div>
          )}

          {/* Relevance View */}
          {viewMode === "relevans" && (
            <div className="space-y-4">
              {topics.map((topic) => (
                <TopicCard key={topic.id || topic.text.slice(0, 30)} topic={topic} />
              ))}
            </div>
          )}

          {/* Account View */}
          {viewMode === "hesap" && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                {accountGroups.filter(([, t]) => t.length > 0).length} hesapta tweet bulundu
              </p>
              {accountGroups.map(([username, accountTopics]) => (
                <details key={username} className="glass-card">
                  <summary className="cursor-pointer flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-400">
                      @{username}
                      <span className="text-zinc-500 ml-2 font-normal">
                        {accountTopics.length} tweet
                      </span>
                    </span>
                    <span className="text-xs text-zinc-500">
                      {accountTopics.reduce((s, t) => s + t.like_count, 0).toLocaleString()} like /
                      {accountTopics.reduce((s, t) => s + t.retweet_count, 0).toLocaleString()} RT
                    </span>
                  </summary>
                  <div className="mt-4 space-y-4">
                    {accountTopics.map((topic) => (
                      <TopicCard key={topic.id || topic.text.slice(0, 30)} topic={topic} />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && topics.length === 0 && !error && (
        <div className="glass-card text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-zinc-400">
            Zaman araligi secip &quot;Tara&quot; butonuna basin
          </p>
          <p className="text-xs text-zinc-600 mt-2">
            Izlenen AI hesaplari taranacak ve son gelismeler listelenecek
          </p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 2: KESFET
// ════════════════════════════════════════════════════════

function TabDiscover() {
  const [timeRange, setTimeRange] = useState("12h");
  const [maxResults, setMaxResults] = useState(30);
  const [engine, setEngine] = useState("default");
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDiscover = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = (await discoverTopics({
        time_range: timeRange,
        max_results: maxResults,
        engine,
      })) as DiscoverData;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kesfet hatasi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-4">
        <div className="font-bold text-indigo-300">AI Kesfet</div>
        <div className="text-sm text-zinc-400 mt-1">
          Takip etmedigin hesaplardan ve trending konulardan yeni AI gelismelerini bul
        </div>
      </div>

      {/* Controls */}
      <div className="glass-card flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Zaman</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
          >
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-zinc-400 block mb-1">Maks. Sonuc</label>
          <input
            type="number"
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            min={10}
            max={100}
            className="w-20 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-400 block mb-1">Motor</label>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className="bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="default">Standart</option>
            <option value="grok">Grok</option>
          </select>
        </div>

        <button
          onClick={handleDiscover}
          disabled={loading}
          className="btn-primary px-6"
        >
          {loading ? "Kesfediliyor..." : "Kesfet"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Grok Topics */}
      {data?.grok_topics && data.grok_topics.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            Grok Trend Konulari ({data.grok_topics.length})
          </h3>
          {data.grok_topics.map((item, i) => (
            <div key={i} className="glass-card space-y-2">
              <div className="font-medium text-white">{i + 1}. {item.title}</div>
              <p className="text-sm text-zinc-300">{item.description}</p>
              {item.angle && (
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-500">Aci:</span> {item.angle}
                </p>
              )}
              {item.potential && (
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-500">Potansiyel:</span> {item.potential}
                </p>
              )}
              <a
                href={`/yaz?topic=${encodeURIComponent(`${item.title}: ${item.description}`)}`}
                className="inline-block btn-primary text-xs px-3 py-1.5 mt-1"
              >
                Bu konuda yaz
              </a>
            </div>
          ))}
        </div>
      )}

      {/* GitHub / Open Source */}
      {data?.github_topics && data.github_topics.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            GitHub / Acik Kaynak ({data.github_topics.length})
          </h3>
          <p className="text-xs text-zinc-500">AI ile ilgili GitHub repo ve acik kaynak proje paylasimlari</p>
          {data.github_topics.slice(0, 15).map((topic) => (
            <TopicCard key={topic.id || topic.text.slice(0, 30)} topic={topic} />
          ))}
        </div>
      )}

      {/* AI Developments (new accounts) */}
      {data?.ai_topics && data.ai_topics.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            AI Gelismeleri ({data.ai_topics.length} tweet)
          </h3>
          <p className="text-xs text-zinc-500">Takip etmediginiz hesaplardan AI paylasimlari</p>
          {data.ai_topics.slice(0, 20).map((topic) => (
            <TopicCard key={topic.id || topic.text.slice(0, 30)} topic={topic} />
          ))}
        </div>
      )}

      {/* Tracked accounts trending */}
      {data?.tracked_topics && data.tracked_topics.length > 0 && (
        <details className="glass-card">
          <summary className="cursor-pointer text-sm font-medium text-zinc-300">
            Izlenen hesaplardan da {data.tracked_topics.length} trend tweet bulundu
          </summary>
          <div className="mt-4 space-y-4">
            {data.tracked_topics.slice(0, 10).map((topic) => (
              <TopicCard key={topic.id || topic.text.slice(0, 30)} topic={topic} />
            ))}
          </div>
        </details>
      )}

      {/* Search Errors */}
      {data?.errors && data.errors.length > 0 && (
        <details className="glass-card">
          <summary className="text-sm text-amber-400 cursor-pointer">
            {data.errors.length} hata
          </summary>
          <div className="mt-2 space-y-1">
            {data.errors.map((e, i) => (
              <p key={i} className="text-xs text-zinc-500">{e}</p>
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="glass-card text-center py-16">
          <div className="text-5xl mb-4">🌐</div>
          <p className="text-zinc-400">
            Kesfet butonuna basarak takip etmedigin hesaplardan AI gelismelerini bul
          </p>
          <p className="text-xs text-zinc-600 mt-2">
            GitHub repo paylasimlari ayri gosterilir
          </p>
        </div>
      )}

      {/* No results */}
      {!loading && data && data.total === 0 && !data.grok_topics?.length && (
        <div className="glass-card text-center py-8">
          <p className="text-zinc-400">
            Icerik bulunamadi. Zaman araligini artirmayi deneyin.
          </p>
        </div>
      )}
    </div>
  );
}
