const API_BASE = "";

function getToken(): string | null {
  return localStorage.getItem("xcom_token");
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API hatasi: ${res.status}`);
  }

  return res.json();
}

// Dashboard
export function getDashboardStats() {
  return apiFetch("/api/dashboard/stats");
}

// Scanner
export function scanTopics(params: {
  time_range: string;
  category?: string;
  max_results?: number;
  custom_query?: string;
  min_likes?: number;
  min_retweets?: number;
  min_followers?: number;
  engine?: string;
}) {
  return apiFetch("/api/scanner/scan", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Generator
export function generateTweet(params: {
  topic: string;
  style?: string;
  length?: string;
  thread?: boolean;
  research_context?: string;
  content_format?: string;
  quote_url?: string;
  provider?: string;
}) {
  return apiFetch("/api/generator/tweet", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getProviders() {
  return apiFetch("/api/generator/providers");
}

// Reply Generation
export function generateReply(params: {
  original_tweet: string;
  original_author?: string;
  style?: string;
  additional_context?: string;
  provider?: string;
  is_thread?: boolean;
  thread_count?: number;
}) {
  return apiFetch("/api/generator/reply", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Self-Reply Generation
export function generateSelfReply(params: {
  my_tweet: string;
  reply_number?: number;
  total_replies?: number;
  style?: string;
  additional_context?: string;
  research_context?: string;
  provider?: string;
  previous_replies?: string[];
}) {
  return apiFetch("/api/generator/self-reply", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Image Analysis (Vision)
export function analyzeImage(url: string, context: string = "") {
  return apiFetch("/api/generator/analyze-image", {
    method: "POST",
    body: JSON.stringify({ url, context }),
  });
}

// Research
export function researchTopic(params: {
  topic: string;
  depth?: string;
  engine?: string;
}) {
  return apiFetch("/api/generator/research", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Research Stream (SSE - live progress)
export async function researchTopicStream(
  params: { topic: string; engine?: string; research_sources?: string[]; tweet_id?: string; tweet_author?: string; agentic?: boolean },
  onProgress: (message: string) => void,
): Promise<{ summary: string; key_points: string[]; sources: { title: string; url?: string; body?: string }[]; media_urls: string[] }> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/generator/research-stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API hatasi: ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let resultData: ReturnType<typeof JSON.parse> = null;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "progress") {
          onProgress(event.message);
        } else if (event.type === "result") {
          resultData = event.data;
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== line.slice(6)) throw e;
      }
    }
  }

  if (!resultData) throw new Error("Arastirma sonucu alinamadi");
  return resultData;
}

// Score
export function scoreTweet(text: string) {
  return apiFetch("/api/generator/score", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// Media Finder
export function findMedia(topic: string, source: string = "x") {
  return apiFetch("/api/generator/find-media", {
    method: "POST",
    body: JSON.stringify({ topic, source }),
  });
}

// Media Download — proxy through backend with random filename
export function getMediaDownloadUrl(url: string): string {
  return `${API_BASE}/api/generator/download-media?url=${encodeURIComponent(url)}`;
}

// Infographic Generation (Gemini)
export function generateInfographic(params: {
  topic: string;
  research_summary?: string;
  key_points?: string[];
  provider?: string;
}): Promise<{
  success: boolean;
  image_base64: string;
  image_format: string;
  brief: string;
  error: string;
}> {
  return apiFetch("/api/generator/generate-infographic", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Fact Check
export function factCheck(text: string, topic: string = "") {
  return apiFetch("/api/generator/fact-check", {
    method: "POST",
    body: JSON.stringify({ text, topic }),
  });
}

// Styles & Formats
export function getStyles() {
  return apiFetch("/api/generator/styles");
}

// Long Content
export function generateLongContent(params: {
  topic: string;
  style?: string;
  length?: string;
  research_context?: string;
  content_format?: string;
  provider?: string;
  additional_instructions?: string;
}) {
  return apiFetch("/api/generator/long-content", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Topic Discovery
export function discoverContentTopics(focusArea: string = "", engine: string = "default") {
  return apiFetch("/api/generator/discover-topics", {
    method: "POST",
    body: JSON.stringify({ focus_area: focusArea, engine }),
  });
}

// Quote Tweet Generation
export function generateQuoteTweet(params: {
  original_tweet: string;
  original_author?: string;
  style?: string;
  research_summary?: string;
  additional_context?: string;
  length_preference?: string;
  deep_verify?: boolean;
  provider?: string;
}) {
  return apiFetch("/api/generator/quote-tweet", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Extract Tweet from URL
export function extractTweet(url: string) {
  return apiFetch("/api/generator/extract-tweet", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// Publish
export interface PublishResult {
  success: boolean;
  tweet_id: string;
  url: string;
  error: string;
  thread_results: {
    index: number;
    success: boolean;
    tweet_id: string;
    url: string;
    error: string;
  }[];
}

export function publishTweet(params: {
  text: string;
  thread_parts?: string[];
  quote_tweet_id?: string;
  reply_to_id?: string;
}): Promise<PublishResult> {
  return apiFetch("/api/publish/tweet", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Drafts
export function listDrafts() {
  return apiFetch("/api/drafts/list");
}

export function addDraft(params: {
  text: string;
  topic?: string;
  style?: string;
}) {
  return apiFetch("/api/drafts/add", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function deleteDraft(index: number) {
  return apiFetch("/api/drafts/delete", {
    method: "POST",
    body: JSON.stringify({ index }),
  });
}

// Analytics
export function analyzeAccount(username: string, tweetCount: number, aiReport: boolean = true) {
  return apiFetch("/api/analytics/analyze", {
    method: "POST",
    body: JSON.stringify({ username, tweet_count: tweetCount, ai_report: aiReport }),
  });
}

export function analyzeMulti(usernames: string[], tweetCount: number = 200, aiReport: boolean = true) {
  return apiFetch("/api/analytics/analyze-multi", {
    method: "POST",
    body: JSON.stringify({ usernames, tweet_count: tweetCount, ai_report: aiReport }),
  });
}

export function getSavedAnalyses() {
  return apiFetch("/api/analytics/saved");
}

export function deleteAnalysis(username: string) {
  return apiFetch(`/api/analytics/delete/${encodeURIComponent(username)}`, { method: "DELETE" });
}

export function getTrainingContext(topic: string = "") {
  return apiFetch(`/api/analytics/training-context?topic=${encodeURIComponent(topic)}`);
}

export function exportAnalyses() {
  return apiFetch("/api/analytics/export");
}

export function importAnalyses(data: string) {
  return apiFetch("/api/analytics/import", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

// Followers
export function fetchFollowers(username: string, limit: number = 200, verifiedOnly: boolean = true) {
  return apiFetch("/api/analytics/followers/fetch", {
    method: "POST",
    body: JSON.stringify({ username, limit, verified_only: verifiedOnly }),
  });
}

export function listFollowers() {
  return apiFetch("/api/analytics/followers/list");
}

export function deleteFollowers(username: string) {
  return apiFetch(`/api/analytics/followers/${encodeURIComponent(username)}`, { method: "DELETE" });
}

// Tweet Pool
export function getPoolAccounts() {
  return apiFetch("/api/analytics/pool/accounts");
}

export function savePoolAccounts(accounts: string[]) {
  return apiFetch("/api/analytics/pool/accounts", {
    method: "POST",
    body: JSON.stringify({ accounts }),
  });
}

export function getPoolStats() {
  return apiFetch("/api/analytics/pool/stats");
}

export function fetchPoolTweets(minEngagement: number = 100, tweetCount: number = 500) {
  return apiFetch("/api/analytics/pool/fetch", {
    method: "POST",
    body: JSON.stringify({ min_engagement: minEngagement, tweet_count: tweetCount }),
  });
}

export function importAnalysesToPool(minEngagement: number = 100) {
  return apiFetch("/api/analytics/pool/import-analyses", {
    method: "POST",
    body: JSON.stringify({ min_engagement: minEngagement }),
  });
}

export function getPoolDna() {
  return apiFetch("/api/analytics/pool/dna");
}

export function regeneratePoolDna() {
  return apiFetch("/api/analytics/pool/regenerate-dna", { method: "POST" });
}

export function getPoolPreview(limit: number = 10) {
  return apiFetch(`/api/analytics/pool/preview?limit=${limit}`);
}

// Calendar
export function getTodaySchedule() {
  return apiFetch("/api/calendar/today");
}

export function getScheduleByDate(date: string) {
  return apiFetch(`/api/calendar/schedule/${encodeURIComponent(date)}`);
}

export function logPost(params: {
  slot_time: string;
  post_type?: string;
  has_media?: boolean;
  has_self_reply?: boolean;
  url?: string;
  content?: string;
}) {
  return apiFetch("/api/calendar/log", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getChecklist(date: string) {
  return apiFetch(`/api/calendar/checklist/${encodeURIComponent(date)}`);
}

export function updateChecklist(date: string, items: Record<string, boolean>) {
  return apiFetch("/api/calendar/checklist", {
    method: "POST",
    body: JSON.stringify({ date, items }),
  });
}

export function getWeeklySummary() {
  return apiFetch("/api/calendar/weekly-summary");
}

export function getCalendarHistory(limit: number = 30) {
  return apiFetch(`/api/calendar/history?limit=${limit}`);
}

// ── Scheduler ──────────────────────────────────────────

export interface ScheduledPost {
  id: string;
  text: string;
  scheduled_time: string;
  thread_parts: string[];
  quote_tweet_id: string;
  status: "pending" | "published" | "failed";
  created_at: string;
  published_at?: string;
  failed_at?: string;
  tweet_id?: string;
  tweet_url?: string;
  error?: string;
}

export function schedulePost(params: {
  text: string;
  scheduled_time: string;
  thread_parts?: string[];
  quote_tweet_id?: string;
}) {
  return apiFetch("/api/scheduler/add", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function scheduleSelfReplyChain(params: {
  original_tweet_id: string;
  replies: string[];
  interval_minutes?: number;
}): Promise<{
  success: boolean;
  chain_id: string;
  total_replies: number;
  interval_minutes: number;
  posts: { id: string; index: number; scheduled_time: string; text_preview: string }[];
}> {
  return apiFetch("/api/scheduler/self-reply-chain", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getPendingPosts(): Promise<{ posts: ScheduledPost[]; total: number }> {
  return apiFetch("/api/scheduler/pending");
}

export function getAllScheduledPosts(): Promise<{ posts: ScheduledPost[]; total: number }> {
  return apiFetch("/api/scheduler/all");
}

export function cancelScheduledPost(postId: string) {
  return apiFetch(`/api/scheduler/cancel/${encodeURIComponent(postId)}`, {
    method: "DELETE",
  });
}

// ── Performance ────────────────────────────────────────

export interface TweetMetric {
  tweet_id: string;
  text: string;
  url: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    impressions: number;
    bookmarks: number;
    quotes: number;
  };
  last_checked: string;
  first_tracked: string;
}

export interface PerformanceStats {
  summary: {
    tracked_count: number;
    total_likes: number;
    total_retweets: number;
    total_replies: number;
    total_impressions: number;
    avg_likes: number;
    avg_retweets: number;
  };
  best_tweet: {
    tweet_id: string;
    text: string;
    url: string;
    metrics: TweetMetric["metrics"];
  } | null;
  tweets: TweetMetric[];
}

export function getPerformanceStats(): Promise<PerformanceStats> {
  return apiFetch("/api/performance/stats");
}

export function refreshAllMetrics() {
  return apiFetch("/api/performance/refresh-all", { method: "POST" });
}

export function autoRegisterMetrics() {
  return apiFetch("/api/performance/auto-register", { method: "POST" });
}

export function trackTweet(tweetId: string, text: string = "") {
  return apiFetch("/api/performance/track", {
    method: "POST",
    body: JSON.stringify({ tweet_id: tweetId, text }),
  });
}

// ── Auto Reply ─────────────────────────────────────────

export interface AutoReplyConfig {
  enabled: boolean;
  accounts: string[];
  check_interval_minutes: number;
  reply_delay_seconds: number;
  style: string;
  additional_context: string;
  max_replies_per_hour: number;
  min_likes_to_reply: number;
  only_original_tweets: boolean;
  language: string;
  draft_only: boolean;
}

export interface AutoReplyLog {
  id: string;
  account: string;
  tweet_id: string;
  tweet_text: string;
  reply_text: string;
  reply_tweet_id?: string;
  reply_url?: string;
  status: "published" | "ready" | "manually_posted" | "generation_failed" | "publish_failed";
  publish_type?: string;
  error?: string;
  created_at: string;
  engagement_score?: number;
  like_count?: number;
  retweet_count?: number;
  manually_posted_at?: string;
}

export interface AutoReplyStatus {
  enabled: boolean;
  draft_only: boolean;
  accounts_count: number;
  replies_last_hour: number;
  max_per_hour: number;
  last_reply_time: string | null;
  total_replies: number;
  total_ready: number;
  total_manually_posted: number;
  total_failures: number;
}

export function getAutoReplyConfig(): Promise<{ config: AutoReplyConfig }> {
  return apiFetch("/api/auto-reply/config");
}

export function updateAutoReplyConfig(config: AutoReplyConfig) {
  return apiFetch("/api/auto-reply/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function getAutoReplyLogs(limit: number = 50): Promise<{ logs: AutoReplyLog[]; total: number }> {
  return apiFetch(`/api/auto-reply/logs?limit=${limit}`);
}

export function clearAutoReplyLogs() {
  return apiFetch("/api/auto-reply/logs", { method: "DELETE" });
}

export function deleteAutoReplyLog(logId: string) {
  return apiFetch(`/api/auto-reply/log/${encodeURIComponent(logId)}`, { method: "DELETE" });
}

export function triggerAutoReplyCheck() {
  return apiFetch("/api/auto-reply/trigger", { method: "POST" });
}

export function markAutoReplyLogPosted(logId: string) {
  return apiFetch(`/api/auto-reply/log/${encodeURIComponent(logId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "manually_posted" }),
  });
}

export function getAutoReplyStatus(): Promise<AutoReplyStatus> {
  return apiFetch("/api/auto-reply/status");
}

// ── Self Reply ──────────────────────────────────────────

export interface SelfReplyConfig {
  enabled: boolean;
  username: string;
  max_daily_tweets: number;
  replies_per_tweet: number;
  reply_interval_minutes: number;
  min_tweet_age_minutes: number;
  max_tweet_age_days: number;
  style: string;
  draft_only: boolean;
  work_hour_start: number;
  work_hour_end: number;
}

export interface SelfReplyLog {
  id: string;
  tweet_id: string;
  tweet_text: string;
  reply_number: number;
  reply_text: string;
  reply_tweet_id?: string;
  reply_url?: string;
  status: "published" | "ready" | "generation_failed" | "publish_failed";
  error?: string;
  created_at: string;
}

export interface SelfReplyStatus {
  enabled: boolean;
  draft_only: boolean;
  username: string;
  today_replied: number;
  max_daily: number;
  total_published: number;
  total_ready: number;
  total_failed: number;
  total_tweets_with_replies: number;
  last_reply_time: string | null;
}

export function getSelfReplyConfig(): Promise<{ config: SelfReplyConfig }> {
  return apiFetch("/api/self-reply/config");
}

export function updateSelfReplyConfig(config: SelfReplyConfig) {
  return apiFetch("/api/self-reply/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function getSelfReplyLogs(limit: number = 100): Promise<{ logs: SelfReplyLog[]; total: number }> {
  return apiFetch(`/api/self-reply/logs?limit=${limit}`);
}

export function clearSelfReplyLogs() {
  return apiFetch("/api/self-reply/logs", { method: "DELETE" });
}

export function deleteSelfReplyLog(logId: string) {
  return apiFetch(`/api/self-reply/log/${encodeURIComponent(logId)}`, { method: "DELETE" });
}

export function triggerSelfReplyCheck() {
  return apiFetch("/api/self-reply/trigger", { method: "POST" });
}

export function getSelfReplyStatus(): Promise<SelfReplyStatus> {
  return apiFetch("/api/self-reply/status");
}

// ── Discovery ──────────────────────────────────────────

export interface DiscoveryConfig {
  enabled: boolean;
  priority_accounts: string[];
  normal_accounts: string[];
  check_interval_hours: number;
  work_hour_start: number;
  work_hour_end: number;
}

export interface TweetMediaItem {
  url: string;
  thumbnail?: string;
  type: "image" | "video";
}

export interface TweetUrl {
  url: string;
  display_url: string;
}

export interface DiscoveryTweet {
  tweet_id: string;
  account: string;
  text: string;
  created_at: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  bookmark_count: number;
  engagement_score: number;
  display_score: number;
  is_priority: boolean;
  importance: "yuksek" | "orta" | "dusuk";
  thread_parts: { text: string; id: string; media_items?: TweetMediaItem[]; urls?: TweetUrl[] }[];
  is_thread: boolean;
  summary_tr: string;
  tweet_url: string;
  scanned_at: string;
  media_items?: TweetMediaItem[];
  urls?: TweetUrl[];
  ai_relevance_score?: number;
  ai_relevance_reason?: string;
}

export interface DiscoveryStatus {
  enabled: boolean;
  total_tweets: number;
  priority_count: number;
  normal_count: number;
  last_scan: string | null;
  next_scan_seconds: number | null;
  current_time: string;
  account_counts: Record<string, number>;
  last_scanned_per_account: Record<string, string>;
  scan_mode: string;
}

export function getDiscoveryConfig(): Promise<{ config: DiscoveryConfig }> {
  return apiFetch("/api/discovery/config");
}

export function updateDiscoveryConfig(config: DiscoveryConfig) {
  return apiFetch("/api/discovery/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function addDiscoveryAccount(username: string, is_priority: boolean = false) {
  return apiFetch("/api/discovery/add-account", {
    method: "POST",
    body: JSON.stringify({ username, is_priority }),
  });
}

export function removeDiscoveryAccount(username: string) {
  return apiFetch("/api/discovery/remove-account", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function getDiscoveryTweets(): Promise<{ tweets: DiscoveryTweet[]; total: number; all_accounts?: string[] }> {
  return apiFetch("/api/discovery/tweets");
}

export function triggerDiscoveryScan(accounts?: string[]): Promise<{ success: boolean; message: string; total: number }> {
  return apiFetch("/api/discovery/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accounts: accounts || [] }),
  });
}

export function getDiscoveryStatus(): Promise<DiscoveryStatus> {
  return apiFetch("/api/discovery/status");
}

export function clearDiscoveryCache() {
  return apiFetch("/api/discovery/clear", { method: "DELETE" });
}

export function summarizeDiscoveryTweets(tweet_ids: string[] = [], force: boolean = false): Promise<{ success: boolean; updated: number }> {
  return apiFetch("/api/discovery/summarize", {
    method: "POST",
    body: JSON.stringify({ tweet_ids, force }),
  });
}

// ── Settings ───────────────────────────────────────────

export function getAPIStatus() {
  return apiFetch("/api/settings/status");
}

export function updateAPIKey(key: string, value: string) {
  return apiFetch("/api/settings/update-key", {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
}

// Connection Tests
export function testTwitter() {
  return apiFetch("/api/settings/test-twitter", { method: "POST" });
}

export function testAI() {
  return apiFetch("/api/settings/test-ai", { method: "POST" });
}

export function testGrok() {
  return apiFetch("/api/settings/test-grok", { method: "POST" });
}

export function testTelegram() {
  return apiFetch("/api/settings/test-telegram", { method: "POST" });
}

export function testTwikit() {
  return apiFetch("/api/settings/test-twikit", { method: "POST" });
}

export function testGemini() {
  return apiFetch("/api/settings/test-gemini", { method: "POST" });
}

// Twikit / Cookies
export function getTwikitStatus() {
  return apiFetch("/api/settings/twikit-status");
}

export function saveTwikitCookies(auth_token: string, ct0: string) {
  return apiFetch("/api/settings/twikit-cookies", {
    method: "POST",
    body: JSON.stringify({ auth_token, ct0 }),
  });
}

export function deleteTwikitCookies() {
  return apiFetch("/api/settings/twikit-cookies", { method: "DELETE" });
}

// X Account Info
export function getAccountInfo() {
  return apiFetch("/api/settings/account-info");
}

// Monitored Accounts
export function getMonitoredAccounts() {
  return apiFetch("/api/settings/monitored-accounts");
}

export function addMonitoredAccount(username: string) {
  return apiFetch("/api/settings/monitored-accounts", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function removeMonitoredAccount(username: string) {
  return apiFetch(`/api/settings/monitored-accounts/${encodeURIComponent(username)}`, {
    method: "DELETE",
  });
}

// User Samples (Writing Style)
export function getUserSamples() {
  return apiFetch("/api/settings/user-samples");
}

export function addUserSample(text: string) {
  return apiFetch("/api/settings/user-samples", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function addBulkSamples(texts: string[]) {
  return apiFetch("/api/settings/user-samples/bulk", {
    method: "POST",
    body: JSON.stringify({ texts }),
  });
}

export function deleteUserSample(index: number) {
  return apiFetch(`/api/settings/user-samples/${index}`, { method: "DELETE" });
}

// Persona
export function getPersona() {
  return apiFetch("/api/settings/persona");
}

export function savePersona(persona: string) {
  return apiFetch("/api/settings/persona", {
    method: "POST",
    body: JSON.stringify({ persona }),
  });
}

export function analyzeStyle() {
  return apiFetch("/api/settings/analyze-style", { method: "POST" });
}

// Post History
export function getPostHistory() {
  return apiFetch("/api/settings/post-history");
}

export function clearPostHistory() {
  return apiFetch("/api/settings/post-history", { method: "DELETE" });
}

// Prompt Templates
export function getPromptTemplates() {
  return apiFetch("/api/settings/prompt-templates");
}

export function addPromptTemplate(name: string, prompt: string, category: string = "genel") {
  return apiFetch("/api/settings/prompt-templates", {
    method: "POST",
    body: JSON.stringify({ name, prompt, category }),
  });
}

export function deletePromptTemplate(templateId: string) {
  return apiFetch(`/api/settings/prompt-templates/${templateId}`, { method: "DELETE" });
}

// ── Faz 1: Scheduler Status ──
export function getSchedulerStatus() {
  return apiFetch("/api/discovery/scheduler-status");
}

// ── Faz 3-9: Auto-Scan, Trends, News, Suggested Accounts ──

// Auto-Scan (Faz 3)
export function getAutoScanTopics() {
  return apiFetch("/api/discovery/auto-scan");
}

export function triggerAutoScan() {
  return apiFetch("/api/discovery/auto-scan/trigger", { method: "POST" });
}

// Trends (Faz 4)
export function getTrends() {
  return apiFetch("/api/discovery/trends");
}

export function triggerTrendAnalysis() {
  return apiFetch("/api/discovery/trends/analyze", { method: "POST" });
}

// Suggested Accounts (Faz 9)
export function getSuggestedAccounts() {
  return apiFetch("/api/discovery/suggested-accounts");
}

export function dismissSuggestedAccount(username: string) {
  return apiFetch("/api/discovery/suggested-accounts/dismiss", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function acceptSuggestedAccount(username: string, isPriority: boolean = false) {
  return apiFetch("/api/discovery/suggested-accounts/accept", {
    method: "POST",
    body: JSON.stringify({ username, is_priority: isPriority }),
  });
}

export function triggerAccountDiscovery() {
  return apiFetch("/api/discovery/suggested-accounts/discover", { method: "POST" });
}

// Faz 7: Smart Suggestions (Clustered)
export function getSmartSuggestions() {
  return apiFetch("/api/discovery/smart-suggestions");
}

export function triggerClustering() {
  return apiFetch("/api/discovery/cluster-suggestions", { method: "POST" });
}

export function generateSmartSuggestion(params: {
  topic: string;
  style?: string;
  content_format?: string;
  provider?: string;
  context?: string;
}) {
  return apiFetch("/api/discovery/smart-suggestions/generate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Trend History
export function getTrendHistory() {
  return apiFetch("/api/discovery/trend-history");
}

// Faz 6: News Value Scoring
export function scoreNewsValue(texts: string[]) {
  return apiFetch("/api/discovery/score-newsvalue", {
    method: "POST",
    body: JSON.stringify({ texts }),
  });
}

// Faz 9: Active Account Search
export function searchAccounts(query: string, maxResults: number = 10) {
  return apiFetch("/api/discovery/search-accounts", {
    method: "POST",
    body: JSON.stringify({ query, max_results: maxResults }),
  });
}

// Kapsamlı Hesap Keşfi
export function analyzeDiscoveryAccount(username: string, tweetCount: number = 20) {
  return apiFetch("/api/discovery/analyze-account", {
    method: "POST",
    body: JSON.stringify({ username, tweet_count: tweetCount }),
  });
}

export function smartDiscover() {
  return apiFetch("/api/discovery/smart-discover", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function batchAnalyzeAccounts(usernames: string[]) {
  return apiFetch("/api/discovery/batch-analyze", {
    method: "POST",
    body: JSON.stringify({ usernames }),
  });
}

// ── Shared Discovery Tweets ──────────────────────────

export function markTweetShared(tweetId: string): Promise<{ success: boolean; shared_tweets: string[] }> {
  return apiFetch("/api/discovery/mark-shared", {
    method: "POST",
    body: JSON.stringify({ tweet_id: tweetId }),
  });
}

export function unmarkTweetShared(tweetId: string): Promise<{ success: boolean; shared_tweets: string[] }> {
  return apiFetch("/api/discovery/unmark-shared", {
    method: "POST",
    body: JSON.stringify({ tweet_id: tweetId }),
  });
}

export function getSharedTweets(): Promise<{ tweet_ids: string[] }> {
  return apiFetch("/api/discovery/shared-tweets");
}

// ── My Tweets (Kullanıcının kendi tweetleri) ──────────

export function getMyTweets(): Promise<{ tweets: any[]; last_fetch: string; username: string }> {
  return apiFetch("/api/discovery/my-tweets");
}

export function fetchMyTweets(username?: string): Promise<{ success: boolean; total: number; username: string }> {
  return apiFetch("/api/discovery/my-tweets/fetch", {
    method: "POST",
    body: JSON.stringify({ username: username || "" }),
  });
}

export function getMyTweetsAnalysis(): Promise<{ analysis: any; last_analyzed: string }> {
  return apiFetch("/api/discovery/my-tweets/analysis");
}

export function analyzeMyTweets(): Promise<{ analysis: any; last_analyzed: string }> {
  return apiFetch("/api/discovery/my-tweets/analyze", { method: "POST" });
}

export function aiScoreDiscoveryTweets(): Promise<{ scored: number; message?: string }> {
  return apiFetch("/api/discovery/ai-score-tweets", { method: "POST" });
}

export function aiScoreTrends(): Promise<{ scored: number; message?: string }> {
  return apiFetch("/api/discovery/ai-score-trends", { method: "POST" });
}

export function aiScoreSuggestions(): Promise<{ scored: number; message?: string }> {
  return apiFetch("/api/discovery/ai-score-suggestions", { method: "POST" });
}
