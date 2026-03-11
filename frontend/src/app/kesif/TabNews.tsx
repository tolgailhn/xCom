"use client";

import { useState, useEffect } from "react";
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

/* ── Component ──────────────────────────────────────── */

export default function TabNews() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Expanded / active panels
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [activeResearch, setActiveResearch] = useState<number | null>(null);
  const [activeGenerate, setActiveGenerate] = useState<number | null>(null);

  // Research state per article (by index)
  const [researchData, setResearchData] = useState<Record<number, ResearchState>>({});
  const [researchingIdx, setResearchingIdx] = useState<number | null>(null);

  // Generation state per article
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
    setResearchData(prev => ({
      ...prev,
      [idx]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." },
    }));

    try {
      const topic = `${article.title}\n\nKaynak: ${article.source}\nURL: ${article.url}\n\nOzet: ${article.body}`;

      const result = await researchTopicStream(
        { topic, engine: "default" },
        (progress) => {
          setResearchData(prev => ({
            ...prev,
            [idx]: { ...prev[idx], progress },
          }));
        },
      );

      setResearchData(prev => ({
        ...prev,
        [idx]: {
          summary: result.summary,
          key_points: result.key_points,
          sources: result.sources,
          progress: "",
        },
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
        [idx]: {
          text: result.tweet || result.text || "",
          score: result.score?.overall || result.quality_score || 0,
        },
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

  const openInX = (text: string) => {
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  /* ── Computed ───────────────────────────────────────── */

  const allSources = [...new Set(articles.map(a => a.source))].sort();

  const filteredArticles = articles.filter((a, idx) => {
    if (filterSource && a.source !== filterSource) return false;
    if (minScoreFilter > 0 && newsScores[idx] && newsScores[idx].score < minScoreFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q);
    }
    return true;
  });

  /* ── Render ─────────────────────────────────────────── */

  if (loading) return <div className="text-center py-8 text-[var(--text-secondary)]">Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          {articles.length} haber makalesi
        </div>
        <button onClick={handleScan} disabled={scanning} className="btn-primary text-sm">
          {scanning ? "Taraniyor..." : "Haber Tara"}
        </button>
      </div>

      {/* Filters + Style bar */}
      <div className="card p-3 space-y-3">
        {/* Search + source filter */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Haberlerde ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field text-sm py-1 flex-1 min-w-[200px]"
          />
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="input-field text-sm py-1"
          >
            <option value="">Tum Kaynaklar</option>
            {allSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {Object.keys(newsScores).length > 0 && (
            <select
              value={minScoreFilter}
              onChange={(e) => setMinScoreFilter(Number(e.target.value))}
              className="input-field text-sm py-1"
            >
              <option value={0}>Tum Skorlar</option>
              <option value={4}>4+ (Orta+)</option>
              <option value={7}>7+ (Onemli)</option>
            </select>
          )}
          <button
            onClick={handleScoreAll}
            disabled={scoringAll || articles.length === 0}
            className="btn-secondary text-sm py-1"
          >
            {scoringAll ? "Skorlaniyor..." : Object.keys(newsScores).length > 0 ? "Tekrar Skorla" : "AI Skorla"}
          </button>
        </div>

        {/* Style/format/provider */}
        <div className="flex flex-wrap gap-3">
          <div className="text-xs text-[var(--text-secondary)] self-center">Tweet Ayarlari:</div>
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            className="input-field text-sm py-1"
          >
            {styles.length > 0 ? styles.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            )) : (
              <>
                <option value="informative">Bilgilendirici</option>
                <option value="provocative">Provoke Edici</option>
                <option value="technical">Teknik</option>
                <option value="storytelling">Hikaye</option>
                <option value="analytical">Analitik</option>
              </>
            )}
          </select>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="input-field text-sm py-1"
          >
            {formats.length > 0 ? formats.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            )) : (
              <>
                <option value="spark">Micro Tweet</option>
                <option value="single">Tek Tweet</option>
                <option value="short_thread">Kisa Thread</option>
                <option value="thread">Thread</option>
              </>
            )}
          </select>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="input-field text-sm py-1"
          >
            <option value="">Varsayilan AI</option>
            <option value="minimax">MiniMax</option>
            <option value="anthropic">Claude</option>
            <option value="openai">GPT</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {filteredArticles.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-secondary)]">
          {articles.length === 0
            ? "Henuz haber bulunamadi. \"Haber Tara\" ile baslayabilirsin veya otomatik tarama 4 saatte bir calisir."
            : "Filtreye uyan haber bulunamadi."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredArticles.map((article, i) => {
            const isExpanded = expandedIdx === i;
            const research = researchData[i];
            const generated = generatedTexts[i];
            const isResearching = researchingIdx === i;
            const isGenerating = generatingIdx === i;

            return (
              <div key={i} className="card overflow-hidden">
                {/* Article header — clickable */}
                <div
                  className="p-4 cursor-pointer hover:bg-[var(--bg-secondary)]/50"
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{article.title}</span>
                        {newsScores[i] && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                            newsScores[i].score >= 7 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" :
                            newsScores[i].score >= 4 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" :
                            "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]"
                          }`} title={newsScores[i].reason}>
                            {newsScores[i].score}/10
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--text-secondary)]">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                      {article.body && (
                        <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{article.body}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] font-medium">{article.source}</span>
                        {article.date && <span>{new Date(article.date).toLocaleDateString("tr-TR")}</span>}
                        <span>{article.query}</span>
                      </div>
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent-blue)] hover:underline shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Kaynak
                    </a>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-4">
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResearch(article, i)}
                        disabled={isResearching}
                        className="btn-secondary text-sm"
                      >
                        {isResearching ? "Arastiriliyor..." : activeResearch === i && research?.summary ? "Tekrar Arastir" : "Arastir"}
                      </button>
                      <button
                        onClick={() => handleGenerate(article, i)}
                        disabled={isGenerating}
                        className="btn-primary text-sm"
                      >
                        {isGenerating ? "Uretiliyor..." : activeGenerate === i && generated?.text ? "Tekrar Uret" : "Tweet Uret"}
                      </button>
                    </div>

                    {/* Link warning */}
                    <div className="text-[10px] text-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-2 py-1 rounded">
                      X algoritmasi harici linkleri cezalandirir. Link&apos;i tweet&apos;e degil, reply&apos;a koymani oneririz.
                    </div>

                    {/* Research results */}
                    {activeResearch === i && research && (
                      <div className="space-y-2">
                        {research.progress && (
                          <div className="text-xs text-[var(--accent-blue)] animate-pulse">{research.progress}</div>
                        )}
                        {research.summary && (
                          <div className="p-3 rounded bg-[var(--bg-secondary)] space-y-2">
                            <div className="text-xs font-medium text-[var(--text-secondary)]">Arastirma Ozeti</div>
                            <p className="text-sm">{research.summary}</p>
                            {research.key_points.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-[var(--text-secondary)] mt-2">Anahtar Noktalar</div>
                                <ul className="list-disc list-inside text-sm space-y-1 mt-1">
                                  {research.key_points.map((kp, j) => <li key={j}>{kp}</li>)}
                                </ul>
                              </div>
                            )}
                            {research.sources.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-[var(--text-secondary)] mt-2">Kaynaklar</div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {research.sources.map((s, j) => (
                                    <a
                                      key={j}
                                      href={s.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs px-2 py-0.5 rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] hover:underline"
                                    >
                                      {s.title || s.url}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Generated tweet */}
                    {activeGenerate === i && generated && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-medium text-[var(--text-secondary)]">Uretilen Tweet</div>
                          {generated.score > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              generated.score >= 80 ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)]" :
                              generated.score >= 60 ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" :
                              "bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]"
                            }`}>
                              {generated.score}/100
                            </span>
                          )}
                        </div>
                        <textarea
                          value={generated.text}
                          onChange={(e) => setGeneratedTexts(prev => ({
                            ...prev,
                            [i]: { ...prev[i], text: e.target.value },
                          }))}
                          rows={Math.min(8, Math.max(3, generated.text.split("\n").length + 1))}
                          className="input-field text-sm w-full"
                        />
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                          <span>{generated.text.length} karakter</span>
                          {generated.text.length > 280 && (
                            <span className="text-[var(--accent-amber)]">Thread olarak paylasmayi dusunun</span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => copyText(generated.text)} className="btn-secondary text-xs">
                            Kopyala
                          </button>
                          <button onClick={() => openInX(generated.text)} className="btn-secondary text-xs">
                            X&apos;te Ac
                          </button>
                          <button onClick={() => handleSaveDraft(i, article)} className="btn-secondary text-xs">
                            Taslak Kaydet
                          </button>
                          <button
                            onClick={() => setShowSchedule(showSchedule === i ? null : i)}
                            className="btn-secondary text-xs"
                          >
                            Zamanla
                          </button>
                        </div>

                        {/* Schedule picker */}
                        {showSchedule === i && (
                          <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)]">
                            <input
                              type="datetime-local"
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                              className="input-field text-xs"
                            />
                            <button
                              onClick={() => handleSchedule(i)}
                              disabled={!scheduleTime}
                              className="btn-primary text-xs"
                            >
                              Onayla
                            </button>
                          </div>
                        )}

                        {/* Action message */}
                        {actionMsg[i] && (
                          <div className="text-xs text-[var(--accent-green)]">{actionMsg[i]}</div>
                        )}
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
