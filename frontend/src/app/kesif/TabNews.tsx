"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getNews,
  triggerNewsScan,
  researchTopicStream,
  generateTweet,
  getStyles,
  addDraft,
  schedulePost,
  scoreNewsValue,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────── */

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  body: string;
  date: string;
  query: string;
  found_at: string;
}

interface StyleOption { id: string; name: string; desc: string }
interface FormatOption { id: string; name: string; desc: string }

interface ResearchState {
  summary: string;
  key_points: string[];
  sources: { title: string; url?: string }[];
  progress: string;
}

/* ── Helpers ────────────────────────────────────────── */

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}sn`;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

/* ── Component ──────────────────────────────────────── */

export default function TabNews() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Expanded / active panels
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [activeResearch, setActiveResearch] = useState<number | null>(null);
  const [activeGenerate, setActiveGenerate] = useState<number | null>(null);

  // Research state
  const [researchData, setResearchData] = useState<Record<number, ResearchState>>({});
  const [researchingIdx, setResearchingIdx] = useState<number | null>(null);

  // Generation state
  const [generatedTexts, setGeneratedTexts] = useState<Record<number, { text: string; score: number }>>({});
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);

  // Style/format/provider
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("informative");
  const [selectedFormat, setSelectedFormat] = useState("spark");
  const [selectedProvider, setSelectedProvider] = useState("");

  // Filter
  const [filterSource, setFilterSource] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState<"all" | "24h" | "3d">("all");

  // News value scores (Faz 6)
  const [newsScores, setNewsScores] = useState<Record<number, { score: number; reason: string }>>({});
  const [scoringAll, setScoringAll] = useState(false);
  const [minScoreFilter, setMinScoreFilter] = useState(0);

  // Draft/schedule
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});
  const [showSchedule, setShowSchedule] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");

  /* ── Load data ──────────────────────────────────────── */

  const loadNews = async () => {
    try {
      const data = await getNews();
      setArticles(data.articles || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadNews(); }, []);

  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => {
        setStyles(r.styles);
        setFormats(r.formats);
      })
      .catch(() => {});
  }, []);

  /* ── Handlers ───────────────────────────────────────── */

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerNewsScan();
      await loadNews();
    } catch { /* ignore */ }
    finally { setScanning(false); }
  };

  const handleResearch = async (article: NewsArticle, idx: number) => {
    setResearchingIdx(idx);
    setActiveResearch(idx);
    setExpandedIdx(idx);
    setResearchData(prev => ({
      ...prev,
      [idx]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." },
    }));

    try {
      const topic = `${article.title}\n\nKaynak: ${article.source}\nURL: ${article.url}\n\nOzet: ${article.body}`;
      const result = await researchTopicStream(
        { topic, engine: "default" },
        (progress) => {
          setResearchData(prev => ({ ...prev, [idx]: { ...prev[idx], progress } }));
        },
      );
      setResearchData(prev => ({
        ...prev,
        [idx]: { summary: result.summary, key_points: result.key_points, sources: result.sources, progress: "" },
      }));
    } catch (e) {
      setResearchData(prev => ({
        ...prev,
        [idx]: { ...prev[idx], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` },
      }));
    } finally {
      setResearchingIdx(null);
    }
  };

  const handleGenerate = async (article: NewsArticle, idx: number) => {
    setGeneratingIdx(idx);
    setActiveGenerate(idx);

    try {
      const research = researchData[idx];
      let researchContext = "";
      if (research?.summary) {
        researchContext = `Arastirma Ozeti:\n${research.summary}\n\nAnahtar Noktalar:\n${research.key_points.join("\n")}`;
      }

      const result = await generateTweet({
        topic: `Haber: ${article.title}`,
        style: selectedStyle,
        length: selectedFormat,
        content_format: selectedFormat,
        research_context: researchContext
          ? `${researchContext}\n\nKaynak: ${article.source} — ${article.url}`
          : `Haber: ${article.title}\nKaynak: ${article.source}\nOzet: ${article.body}\nURL: ${article.url}`,
        provider: selectedProvider || undefined,
      });

      setGeneratedTexts(prev => ({
        ...prev,
        [idx]: { text: result.tweet || result.text || "", score: result.score?.overall || result.quality_score || 0 },
      }));
    } catch (e) {
      setGeneratedTexts(prev => ({
        ...prev,
        [idx]: { text: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`, score: 0 },
      }));
    } finally {
      setGeneratingIdx(null);
    }
  };

  const handleSaveDraft = async (idx: number, article: NewsArticle) => {
    const gen = generatedTexts[idx];
    if (!gen?.text) return;
    try {
      await addDraft({ text: gen.text, topic: article.title, style: selectedStyle });
      setActionMsg(prev => ({ ...prev, [idx]: "Taslak kaydedildi!" }));
      setTimeout(() => setActionMsg(prev => ({ ...prev, [idx]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const handleSchedule = async (idx: number) => {
    const gen = generatedTexts[idx];
    if (!gen?.text || !scheduleTime) return;
    try {
      await schedulePost({ text: gen.text, scheduled_time: scheduleTime });
      setActionMsg(prev => ({ ...prev, [idx]: `Zamanlandi: ${new Date(scheduleTime).toLocaleString("tr-TR")}` }));
      setShowSchedule(null);
      setScheduleTime("");
      setTimeout(() => setActionMsg(prev => ({ ...prev, [idx]: "" })), 3000);
    } catch { /* ignore */ }
  };

  const handleScoreAll = async () => {
    if (articles.length === 0) return;
    setScoringAll(true);
    try {
      const texts = articles.map(a => `${a.title} — ${a.body}`);
      const result = await scoreNewsValue(texts);
      const scores: Record<number, { score: number; reason: string }> = {};
      for (const s of result.scores || []) {
        const idx = (s.index || 1) - 1;
        scores[idx] = { score: s.score || 5, reason: s.reason || "" };
      }
      setNewsScores(scores);
    } catch { /* ignore */ }
    finally { setScoringAll(false); }
  };

  const openInX = (text: string) => window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setActionMsg(prev => ({ ...prev, [idx]: "Kopyalandi!" }));
    setTimeout(() => setActionMsg(prev => ({ ...prev, [idx]: "" })), 2000);
  };

  /* ── Computed ───────────────────────────────────────── */

  const allSources = useMemo(() => [...new Set(articles.map(a => a.source))].sort(), [articles]);
  const allCategories = useMemo(() => [...new Set(articles.map(a => a.query).filter(Boolean))].sort(), [articles]);

  const filteredArticles = useMemo(() => {
    return articles.filter((a, idx) => {
      if (filterSource && a.source !== filterSource) return false;
      if (minScoreFilter > 0 && newsScores[idx] && newsScores[idx].score < minScoreFilter) return false;
      if (filterDate !== "all") {
        const hoursAgo = filterDate === "24h" ? 24 : 72;
        const cutoff = Date.now() - hoursAgo * 3600 * 1000;
        const articleDate = new Date(a.found_at || a.date || "").getTime();
        if (articleDate < cutoff) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q) || a.source.toLowerCase().includes(q);
      }
      return true;
    });
  }, [articles, filterSource, minScoreFilter, filterDate, searchQuery, newsScores]);

  /* ── Render ─────────────────────────────────────────── */

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-[var(--text-secondary)]">
          {filteredArticles.length}/{articles.length} haber
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScoreAll}
            disabled={scoringAll || articles.length === 0}
            className="btn-secondary text-xs"
          >
            {scoringAll ? "Skorlaniyor..." : Object.keys(newsScores).length > 0 ? "Tekrar Skorla" : "AI Skorla"}
          </button>
          <button onClick={handleScan} disabled={scanning} className="btn-primary text-xs">
            {scanning ? "Taraniyor..." : "Haber Tara"}
          </button>
        </div>
      </div>

      {/* Search bar (full width) */}
      <input
        type="text"
        placeholder="Haberlerde ara..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:outline-none"
      />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date filter */}
        <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
          {(["all", "24h", "3d"] as const).map(d => (
            <button
              key={d}
              onClick={() => setFilterDate(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filterDate === d
                  ? "bg-[var(--accent-blue)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {d === "all" ? "Tumu" : d === "24h" ? "Son 24sa" : "Son 3 Gun"}
            </button>
          ))}
        </div>

        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
          <option value="">Tum Kaynaklar</option>
          {allSources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {Object.keys(newsScores).length > 0 && (
          <select value={minScoreFilter} onChange={e => setMinScoreFilter(Number(e.target.value))} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <option value={0}>Tum Skorlar</option>
            <option value={4}>4+ (Orta+)</option>
            <option value={7}>7+ (Onemli)</option>
          </select>
        )}

        {/* View mode toggle */}
        <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-0.5 ml-auto">
          <button onClick={() => setViewMode("list")} className={`px-2 py-1 rounded-md text-xs transition-all ${viewMode === "list" ? "bg-[var(--accent-blue)] text-white" : "text-[var(--text-secondary)]"}`}>
            Liste
          </button>
          <button onClick={() => setViewMode("grid")} className={`px-2 py-1 rounded-md text-xs transition-all ${viewMode === "grid" ? "bg-[var(--accent-blue)] text-white" : "text-[var(--text-secondary)]"}`}>
            Grid
          </button>
        </div>
      </div>

      {/* Style bar */}
      <div className="glass-card p-3">
        <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Tweet Ayarlari</div>
        <div className="flex flex-wrap gap-3">
          <select value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            {styles.length > 0 ? styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : (
              <>
                <option value="informative">Bilgilendirici</option>
                <option value="provocative">Provoke Edici</option>
                <option value="technical">Teknik</option>
              </>
            )}
          </select>
          <select value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            {formats.length > 0 ? formats.map(f => <option key={f.id} value={f.id}>{f.name}</option>) : (
              <><option value="spark">Micro Tweet</option><option value="single">Tek Tweet</option></>
            )}
          </select>
          <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]">
            <option value="">Varsayilan AI</option>
            <option value="minimax">MiniMax</option>
            <option value="anthropic">Claude</option>
            <option value="openai">GPT</option>
          </select>
        </div>
      </div>

      {/* Articles */}
      {filteredArticles.length === 0 ? (
        <div className="glass-card p-8 text-center text-[var(--text-secondary)]">
          {articles.length === 0
            ? "Henuz haber bulunamadi. \"Haber Tara\" ile baslayabilirsin veya otomatik tarama 4 saatte bir calisir."
            : "Filtreye uyan haber bulunamadi."}
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-3"}>
          {filteredArticles.map((article, filteredIdx) => {
            const origIdx = articles.indexOf(article);
            const isExpanded = expandedIdx === origIdx;
            const research = researchData[origIdx];
            const generated = generatedTexts[origIdx];
            const isResearching = researchingIdx === origIdx;
            const isGenerating = generatingIdx === origIdx;
            const score = newsScores[origIdx];

            return (
              <div
                key={filteredIdx}
                className={`glass-card overflow-hidden ${isExpanded && viewMode === "grid" ? "md:col-span-2" : ""}`}
              >
                {/* Article header */}
                <div
                  className="p-4 cursor-pointer hover:bg-[var(--accent-blue)]/5 transition-colors"
                  onClick={() => setExpandedIdx(isExpanded ? null : origIdx)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">{article.title}</h3>
                        {score && (
                          <span
                            className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                              score.score >= 7 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" :
                              score.score >= 4 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" :
                              "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]"
                            }`}
                            title={score.reason}
                          >
                            {score.score}/10
                          </span>
                        )}
                      </div>

                      {/* Body preview */}
                      {article.body && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-2 leading-relaxed">{article.body}</p>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] text-[10px] font-medium border border-[var(--accent-cyan)]/20">
                          {article.source}
                        </span>
                        {article.query && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-[10px]">
                            {article.query}
                          </span>
                        )}
                        {article.found_at && (
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            {timeAgo(article.found_at)} once
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-2 py-1 rounded-lg bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] text-xs hover:bg-[var(--accent-blue)]/20 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Kaynak
                    </a>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-4">
                    <div className="flex gap-2">
                      <button onClick={() => handleResearch(article, origIdx)} disabled={isResearching} className="btn-secondary text-xs">
                        {isResearching ? "Arastiriliyor..." : activeResearch === origIdx && research?.summary ? "Tekrar Arastir" : "Arastir"}
                      </button>
                      <button onClick={() => handleGenerate(article, origIdx)} disabled={isGenerating} className="btn-primary text-xs">
                        {isGenerating ? "Uretiliyor..." : activeGenerate === origIdx && generated?.text ? "Tekrar Uret" : "Tweet Uret"}
                      </button>
                    </div>

                    <div className="text-[10px] text-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-3 py-1.5 rounded-lg">
                      X algoritmasi harici linkleri cezalandirir. Link&apos;i tweet&apos;e degil, reply&apos;a koymani oneririz.
                    </div>

                    {/* Research */}
                    {activeResearch === origIdx && research && (
                      <div className="space-y-2">
                        {research.progress && <div className="text-xs text-[var(--accent-blue)] animate-pulse">{research.progress}</div>}
                        {research.summary && (
                          <div className="p-3 rounded-lg bg-[var(--bg-primary)] space-y-2">
                            <div className="text-xs font-medium text-[var(--accent-green)]">Arastirma Ozeti</div>
                            <p className="text-sm text-[var(--text-primary)]">{research.summary}</p>
                            {research.key_points.length > 0 && (
                              <ul className="list-disc list-inside text-sm space-y-1 mt-1 text-[var(--text-secondary)]">
                                {research.key_points.map((kp, j) => <li key={j}>{kp}</li>)}
                              </ul>
                            )}
                            {research.sources.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {research.sources.map((s, j) => (
                                  <a key={j} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] hover:underline">
                                    {s.title || s.url}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Generated tweet */}
                    {activeGenerate === origIdx && generated && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-medium text-[var(--accent-amber)]">Uretilen Tweet</div>
                          {generated.score > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${generated.score >= 80 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" : generated.score >= 60 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" : "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]"}`}>
                              {generated.score}/100
                            </span>
                          )}
                        </div>
                        <textarea
                          value={generated.text}
                          onChange={e => setGeneratedTexts(prev => ({ ...prev, [origIdx]: { ...prev[origIdx], text: e.target.value } }))}
                          rows={Math.min(8, Math.max(3, generated.text.split("\n").length + 1))}
                          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-full resize-y focus:border-[var(--accent-blue)] focus:outline-none"
                        />
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                          <span>{generated.text.length} karakter</span>
                          {generated.text.length > 280 && <span className="text-[var(--accent-amber)]">Thread olarak paylasmayi dusunun</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => copyText(generated.text, origIdx)} className="btn-secondary text-xs">Kopyala</button>
                          <button onClick={() => openInX(generated.text)} className="btn-secondary text-xs">X&apos;te Ac</button>
                          <button onClick={() => handleSaveDraft(origIdx, article)} className="btn-secondary text-xs">Taslak</button>
                          <button onClick={() => setShowSchedule(showSchedule === origIdx ? null : origIdx)} className="btn-secondary text-xs">Zamanla</button>
                        </div>
                        {showSchedule === origIdx && (
                          <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-primary)]">
                            <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]" />
                            <button onClick={() => handleSchedule(origIdx)} disabled={!scheduleTime} className="btn-primary text-xs">Onayla</button>
                          </div>
                        )}
                        {actionMsg[origIdx] && <div className="text-xs text-[var(--accent-green)]">{actionMsg[origIdx]}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
