"use client";

import { useState, useEffect, useCallback } from "react";
import {
  researchTopicStream,
  generateQuoteTweet,
  generateTweet,
  findMedia,
  generateInfographic,
  addDraft,
  extractTweet,
  getStyles,
  publishTweet,
  schedulePost,
  type TweetMediaItem,
  type TweetUrl,
} from "@/lib/api";

import type {
  StyleOption,
  FormatOption,
  ResearchData,
  GeneratedData,
  MediaItem,
} from "@/components/discovery";

/* ── Types ───────────────────────────────────────────── */

export interface ExtractedMedia {
  media_items: TweetMediaItem[];
  urls: TweetUrl[];
}

export interface ResearchWorkflow {
  // Styles/formats (loaded once on mount)
  styles: StyleOption[];
  formats: FormatOption[];
  selectedStyle: string;
  setSelectedStyle: (s: string) => void;
  selectedFormat: string;
  setSelectedFormat: (s: string) => void;
  selectedProvider: string;
  setSelectedProvider: (s: string) => void;

  // Per-key research data
  researchData: Record<string, ResearchData>;
  researchingKey: string | null;
  researchExpanded: Set<string>;
  toggleResearchExpanded: (key: string) => void;

  // Per-key generated data
  generatedTexts: Record<string, GeneratedData>;
  generatingKey: string | null;
  editedTexts: Record<string, string>;
  setEditedText: (key: string, text: string) => void;

  // Per-key media
  mediaResults: Record<string, MediaItem[]>;
  mediaLoading: string | null;
  infographicData: Record<string, { image: string; format: string }>;
  infographicLoading: string | null;
  extractedMedia: Record<string, ExtractedMedia>;

  // Actions
  research: (key: string, topic: string, opts?: {
    tweetUrl?: string;
    account?: string;
    tweetId?: string;
    extraContext?: string;
  }) => Promise<void>;
  generateQuote: (key: string, opts: {
    originalTweet: string;
    originalAuthor: string;
  }) => Promise<void>;
  generateFromTopic: (key: string, opts: {
    topic: string;
    researchContext?: string;
  }) => Promise<void>;
  searchMedia: (key: string, query: string) => Promise<void>;
  createInfographic: (key: string, topic: string, keyPoints: string[]) => Promise<void>;
  publish: (key: string) => Promise<{ success: boolean; url?: string }>;
  saveDraft: (key: string, topic: string) => Promise<void>;
  schedule: (key: string, scheduledTime: string) => Promise<void>;
}

/* ── Hook ────────────────────────────────────────────── */

interface UseResearchWorkflowOptions {
  defaultStyle?: string;
  defaultFormat?: string;
  defaultProvider?: string;
}

export default function useResearchWorkflow(opts?: UseResearchWorkflowOptions): ResearchWorkflow {
  // Styles/formats
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [selectedStyle, setSelectedStyle] = useState(opts?.defaultStyle || "quote_tweet");
  const [selectedFormat, setSelectedFormat] = useState(opts?.defaultFormat || "spark");
  const [selectedProvider, setSelectedProvider] = useState(opts?.defaultProvider || "");

  // Per-key state
  const [researchData, setResearchData] = useState<Record<string, ResearchData>>({});
  const [researchingKey, setResearchingKey] = useState<string | null>(null);
  const [researchExpanded, setResearchExpanded] = useState<Set<string>>(new Set(["__all__"]));

  const [generatedTexts, setGeneratedTexts] = useState<Record<string, GeneratedData>>({});
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  const [mediaResults, setMediaResults] = useState<Record<string, MediaItem[]>>({});
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);
  const [infographicData, setInfographicData] = useState<Record<string, { image: string; format: string }>>({});
  const [infographicLoading, setInfographicLoading] = useState<string | null>(null);
  const [extractedMedia, setExtractedMedia] = useState<Record<string, ExtractedMedia>>({});

  // Load styles once
  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => {
        setStyles(r.styles);
        setFormats(r.formats);
      })
      .catch(() => {});
  }, []);

  // Helpers
  const toggleResearchExpanded = useCallback((key: string) => {
    setResearchExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setEditedText = useCallback((key: string, text: string) => {
    setEditedTexts(prev => ({ ...prev, [key]: text }));
  }, []);

  // Research: extract tweet if URL provided, then stream research
  const research = useCallback(async (
    key: string,
    topic: string,
    researchOpts?: { tweetUrl?: string; account?: string; tweetId?: string; extraContext?: string },
  ) => {
    setResearchingKey(key);
    setResearchData(prev => ({
      ...prev,
      [key]: { summary: "", key_points: [], sources: [], progress: "Baslatiliyor..." },
    }));

    try {
      let fullText = topic;
      // Only extract if topic is very short (URL-only) — skip if we already have tweet text
      const shouldExtract = researchOpts?.tweetUrl && topic.length < 50 && !topic.includes(" ");
      if (shouldExtract && researchOpts?.tweetUrl) {
        try {
          setResearchData(prev => ({
            ...prev,
            [key]: { ...prev[key], progress: "Tweet bilgileri cekiliyor..." },
          }));
          const extracted = await extractTweet(researchOpts.tweetUrl);
          if (extracted?.full_thread_text) fullText = extracted.full_thread_text;
          else if (extracted?.text) fullText = extracted.text;
          // Collect media/urls
          const mi = [...(extracted?.media_items || []), ...(extracted?.thread_media || [])];
          const urls = [...(extracted?.urls || []), ...(extracted?.thread_urls || [])];
          if (mi.length > 0 || urls.length > 0) {
            setExtractedMedia(prev => ({ ...prev, [key]: { media_items: mi, urls } }));
          }
        } catch {
          // Extract failed — use original text, continue with research
          setResearchData(prev => ({
            ...prev,
            [key]: { ...prev[key], progress: "Tweet cekme basarisiz, orijinal metin ile devam ediliyor..." },
          }));
        }
      }

      if (researchOpts?.extraContext) {
        fullText += `\n\n${researchOpts.extraContext}`;
      }

      setResearchData(prev => ({
        ...prev,
        [key]: { ...prev[key], progress: "Arastirma baslatiliyor..." },
      }));

      const result = await researchTopicStream(
        {
          topic: fullText,
          engine: "default",
          tweet_id: researchOpts?.tweetId || "",
          tweet_author: researchOpts?.account || "",
        },
        (progress: string) => setResearchData(prev => ({
          ...prev,
          [key]: { ...prev[key], progress },
        })),
      );
      setResearchData(prev => ({
        ...prev,
        [key]: {
          summary: result.summary,
          key_points: result.key_points,
          sources: result.sources,
          progress: "",
        },
      }));
    } catch (e) {
      setResearchData(prev => ({
        ...prev,
        [key]: { ...prev[key], progress: `Hata: ${e instanceof Error ? e.message : "Bilinmeyen hata"}` },
      }));
    } finally {
      setResearchingKey(null);
    }
  }, []);

  // Generate quote tweet (from an existing tweet)
  const generateQuoteHandler = useCallback(async (
    key: string,
    genOpts: { originalTweet: string; originalAuthor: string },
  ) => {
    setGeneratingKey(key);
    try {
      const rd = researchData[key];
      const researchSummary = rd?.summary
        ? `${rd.summary}\n\nKey Points:\n${rd.key_points.join("\n")}`
        : "";
      const result = await generateQuoteTweet({
        original_tweet: genOpts.originalTweet,
        original_author: genOpts.originalAuthor,
        style: selectedStyle,
        research_summary: researchSummary,
        length_preference: selectedFormat,
        provider: selectedProvider || undefined,
      });
      const text = result.text || "";
      setGeneratedTexts(prev => ({
        ...prev,
        [key]: { text, score: result.score?.overall || 0, thread_parts: result.thread_parts },
      }));
      setEditedTexts(prev => ({ ...prev, [key]: text }));
    } catch (e) {
      const errText = `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`;
      setGeneratedTexts(prev => ({ ...prev, [key]: { text: errText, score: 0 } }));
      setEditedTexts(prev => ({ ...prev, [key]: errText }));
    } finally {
      setGeneratingKey(null);
    }
  }, [researchData, selectedStyle, selectedFormat, selectedProvider]);

  // Generate tweet from topic (not a quote)
  const generateFromTopicHandler = useCallback(async (
    key: string,
    genOpts: { topic: string; researchContext?: string },
  ) => {
    setGeneratingKey(key);
    try {
      const rd = researchData[key];
      const researchContext = genOpts.researchContext
        || (rd?.summary
          ? `Arastirma Ozeti:\n${rd.summary}\n\nAnahtar Noktalar:\n${rd.key_points.join("\n")}`
          : "");
      const result = await generateTweet({
        topic: genOpts.topic,
        style: selectedStyle,
        length: selectedFormat,
        content_format: selectedFormat,
        research_context: researchContext,
        provider: selectedProvider || undefined,
      });
      const text = result.tweet || result.text || "";
      setGeneratedTexts(prev => ({
        ...prev,
        [key]: {
          text,
          score: result.score?.overall || result.quality_score || 0,
          thread_parts: result.thread_parts,
        },
      }));
      setEditedTexts(prev => ({ ...prev, [key]: text }));
    } catch (e) {
      const errText = `Hata: ${e instanceof Error ? e.message : "Bilinmeyen"}`;
      setGeneratedTexts(prev => ({ ...prev, [key]: { text: errText, score: 0 } }));
      setEditedTexts(prev => ({ ...prev, [key]: errText }));
    } finally {
      setGeneratingKey(null);
    }
  }, [researchData, selectedStyle, selectedFormat, selectedProvider]);

  // Media search
  const searchMedia = useCallback(async (key: string, query: string) => {
    setMediaLoading(key);
    try {
      const r = await findMedia(query.slice(0, 200), "both");
      setMediaResults(prev => ({ ...prev, [key]: r.results || [] }));
    } catch {
      setMediaResults(prev => ({ ...prev, [key]: [] }));
    } finally {
      setMediaLoading(null);
    }
  }, []);

  // Infographic
  const createInfographic = useCallback(async (key: string, topic: string, keyPoints: string[]) => {
    setInfographicLoading(key);
    try {
      const result = await generateInfographic({ topic, key_points: keyPoints });
      if (result.image_base64) {
        setInfographicData(prev => ({
          ...prev,
          [key]: { image: result.image_base64, format: result.image_format || "png" },
        }));
      }
    } catch { /* ignore */ }
    finally { setInfographicLoading(null); }
  }, []);

  // Publish using editedText (bug fix: always uses edited version)
  const publish = useCallback(async (key: string) => {
    const text = editedTexts[key] || generatedTexts[key]?.text;
    if (!text) return { success: false };
    try {
      const threadParts = generatedTexts[key]?.thread_parts;
      const result = await publishTweet({
        text,
        thread_parts: threadParts,
      });
      return { success: true, url: result.url };
    } catch {
      return { success: false };
    }
  }, [editedTexts, generatedTexts]);

  // Save draft
  const saveDraft = useCallback(async (key: string, topic: string) => {
    const text = editedTexts[key] || generatedTexts[key]?.text;
    if (!text) return;
    await addDraft({ text, topic });
  }, [editedTexts, generatedTexts]);

  // Schedule
  const schedule = useCallback(async (key: string, scheduledTime: string) => {
    const text = editedTexts[key] || generatedTexts[key]?.text;
    if (!text) return;
    await schedulePost({
      text,
      scheduled_time: scheduledTime,
      thread_parts: generatedTexts[key]?.thread_parts || [],
    });
  }, [editedTexts, generatedTexts]);

  return {
    styles,
    formats,
    selectedStyle,
    setSelectedStyle,
    selectedFormat,
    setSelectedFormat,
    selectedProvider,
    setSelectedProvider,
    researchData,
    researchingKey,
    researchExpanded,
    toggleResearchExpanded,
    generatedTexts,
    generatingKey,
    editedTexts,
    setEditedText,
    mediaResults,
    mediaLoading,
    infographicData,
    infographicLoading,
    extractedMedia,
    research,
    generateQuote: generateQuoteHandler,
    generateFromTopic: generateFromTopicHandler,
    searchMedia,
    createInfographic,
    publish,
    saveDraft,
    schedule,
  };
}
