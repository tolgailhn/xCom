const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";

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
export function scanTopics(timeRange: string, category: string) {
  return apiFetch("/api/scanner/scan", {
    method: "POST",
    body: JSON.stringify({ time_range: timeRange, category }),
  });
}

// Generator
export function generateTweet(params: {
  topic: string;
  style?: string;
  length?: string;
  thread?: boolean;
  research_context?: string;
}) {
  return apiFetch("/api/generator/tweet", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Research
export function researchTopic(topic: string, depth: string = "normal") {
  return apiFetch("/api/generator/research", {
    method: "POST",
    body: JSON.stringify({ topic, depth }),
  });
}

// Publish
export function publishTweet(params: {
  text: string;
  thread_parts?: string[];
}) {
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
export function analyzeAccount(username: string, tweetCount: number) {
  return apiFetch("/api/analytics/analyze", {
    method: "POST",
    body: JSON.stringify({ username, tweet_count: tweetCount }),
  });
}

// Calendar
export function getTodaySchedule() {
  return apiFetch("/api/calendar/today");
}

// Settings
export function getAPIStatus() {
  return apiFetch("/api/settings/status");
}

export function updateAPIKey(key: string, value: string) {
  return apiFetch("/api/settings/update-key", {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
}
