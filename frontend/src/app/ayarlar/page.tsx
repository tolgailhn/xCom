"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getAPIStatus,
  updateAPIKey,
  testTwitter,
  testAI,
  testGrok,
  testTelegram,
  testTwikit,
  getTwikitStatus,
  saveTwikitCookies,
  deleteTwikitCookies,
  getAccountInfo,
  getMonitoredAccounts,
  addMonitoredAccount,
  removeMonitoredAccount,
  getUserSamples,
  addUserSample,
  addBulkSamples,
  deleteUserSample,
  getPersona,
  savePersona,
  analyzeStyle,
  getPostHistory,
  clearPostHistory,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────

interface APIStatusData {
  minimax: boolean;
  groq: boolean;
  anthropic: boolean;
  openai: boolean;
  xai: boolean;
  twitter: boolean;
  twikit: boolean;
  telegram: boolean;
}

interface TwikitStatusData {
  username: string | null;
  has_env_cookies: boolean;
  has_file_cookies: boolean;
  source: string | null;
}

interface AccountInfoData {
  success: boolean;
  username?: string;
  name?: string;
  followers?: number;
  tweet_count?: number;
  bio?: string;
  error?: string;
}

interface MonitoredAccountsData {
  default_accounts: string[];
  custom_accounts: string[];
  categories: { id: string; name: string; description: string }[];
}

interface PostHistoryEntry {
  text: string;
  type: string;
  style: string;
  posted_at: string;
  url?: string;
}

// ── Tab names ──────────────────────────────────────────

const TABS = [
  { id: "api", label: "API Anahtarlari" },
  { id: "account", label: "X Hesap Bilgileri" },
  { id: "accounts", label: "Izlenen Hesaplar" },
  { id: "style", label: "Yazim Tarzi" },
  { id: "history", label: "Gecmis" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── API key fields ─────────────────────────────────────

const API_FIELDS = [
  { key: "twitter_bearer_token", label: "Twitter Bearer Token", group: "Twitter API" },
  { key: "twitter_api_key", label: "API Key", group: "Twitter API" },
  { key: "twitter_api_secret", label: "API Secret", group: "Twitter API" },
  { key: "twitter_access_token", label: "Access Token", group: "Twitter API" },
  { key: "twitter_access_secret", label: "Access Secret", group: "Twitter API" },
  { key: "twikit_username", label: "Twikit Kullanici Adi", group: "Twikit (Ucretsiz Arama)" },
  { key: "twikit_password", label: "Twikit Sifre", group: "Twikit (Ucretsiz Arama)" },
  { key: "twikit_email", label: "Twikit E-posta", group: "Twikit (Ucretsiz Arama)" },
  { key: "twikit_totp_secret", label: "TOTP Secret (2FA)", group: "Twikit (Ucretsiz Arama)" },
  { key: "minimax_api_key", label: "MiniMax API Key", group: "AI API" },
  { key: "groq_api_key", label: "Groq API Key (Ucretsiz)", group: "AI API" },
  { key: "anthropic_api_key", label: "Anthropic API Key", group: "AI API" },
  { key: "openai_api_key", label: "OpenAI API Key", group: "AI API" },
  { key: "xai_api_key", label: "xAI (Grok) API Key", group: "xAI / Grok" },
  { key: "telegram_bot_token", label: "Telegram Bot Token", group: "Telegram" },
  { key: "telegram_chat_id", label: "Telegram Chat ID", group: "Telegram" },
];

const API_GROUPS = [
  "Twitter API",
  "Twikit (Ucretsiz Arama)",
  "AI API",
  "xAI / Grok",
  "Telegram",
];

// ── Helpers ────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        active ? "bg-emerald-400" : "bg-zinc-600"
      }`}
    />
  );
}

function TestResult({
  result,
}: {
  result: { success: boolean; error?: string; [k: string]: unknown } | null;
}) {
  if (!result) return null;
  return (
    <div
      className={`mt-2 p-3 rounded-lg text-sm ${
        result.success
          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
          : "bg-red-500/10 border border-red-500/20 text-red-300"
      }`}
    >
      {result.success
        ? `Basarili! ${result.username ? `@${result.username}` : ""} ${result.provider ? `(${result.provider})` : ""} ${result.bot_username ? `@${result.bot_username}` : ""} ${result.source ? `Cookie: ${result.source}` : ""}`
        : `Hata: ${result.error}`}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

export default function AyarlarPage() {
  const [activeTab, setActiveTab] = useState<TabId>("api");
  const [status, setStatus] = useState<APIStatusData | null>(null);

  const refreshStatus = useCallback(() => {
    getAPIStatus().then((s) => setStatus(s as APIStatusData));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Ayarlar</h2>

      {/* Status overview */}
      {status && (
        <div className="glass-card">
          <h3 className="text-sm font-semibold mb-3">API Durumu</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(status).map(([key, active]) => (
              <div key={key} className="flex items-center gap-2">
                <StatusDot active={active} />
                <span className="text-sm capitalize">{key}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "api" && <TabAPIKeys onStatusChange={refreshStatus} status={status} />}
      {activeTab === "account" && <TabAccountInfo />}
      {activeTab === "accounts" && <TabMonitoredAccounts />}
      {activeTab === "style" && <TabWritingStyle />}
      {activeTab === "history" && <TabHistory />}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 1: API Keys + Connection Tests
// ════════════════════════════════════════════════════════

function TabAPIKeys({
  onStatusChange,
  status,
}: {
  onStatusChange: () => void;
  status: APIStatusData | null;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string; [k: string]: unknown }>>({});
  const [testing, setTesting] = useState<string | null>(null);

  // Twikit cookie state
  const [twikitStatus, setTwikitStatus] = useState<TwikitStatusData | null>(null);
  const [cookieAuth, setCookieAuth] = useState("");
  const [cookieCt0, setCookieCt0] = useState("");
  const [cookieSaving, setCookieSaving] = useState(false);

  useEffect(() => {
    getTwikitStatus().then((s) => setTwikitStatus(s as TwikitStatusData));
  }, []);

  const handleSave = async (key: string) => {
    const value = values[key];
    if (!value?.trim()) return;
    setSaving(key);
    try {
      await updateAPIKey(key, value.trim());
      setSaved(key);
      setValues((v) => ({ ...v, [key]: "" }));
      setTimeout(() => setSaved(null), 2000);
      onStatusChange();
    } finally {
      setSaving(null);
    }
  };

  const runTest = async (name: string, fn: () => Promise<unknown>) => {
    setTesting(name);
    try {
      const result = await fn();
      setTestResults((r) => ({ ...r, [name]: result as { success: boolean } }));
    } catch (e) {
      setTestResults((r) => ({ ...r, [name]: { success: false, error: String(e) } }));
    } finally {
      setTesting(null);
    }
  };

  const handleSaveCookies = async () => {
    if (!cookieAuth.trim() || !cookieCt0.trim()) return;
    setCookieSaving(true);
    try {
      await saveTwikitCookies(cookieAuth.trim(), cookieCt0.trim());
      setCookieAuth("");
      setCookieCt0("");
      const s = await getTwikitStatus();
      setTwikitStatus(s as TwikitStatusData);
    } finally {
      setCookieSaving(false);
    }
  };

  const handleDeleteCookies = async () => {
    await deleteTwikitCookies();
    const s = await getTwikitStatus();
    setTwikitStatus(s as TwikitStatusData);
  };

  return (
    <div className="space-y-6">
      {/* API Key Groups */}
      {API_GROUPS.map((group) => (
        <div key={group} className="glass-card space-y-4">
          <h3 className="font-semibold text-white">{group}</h3>
          {group === "Twitter API" && (
            <p className="text-xs text-zinc-400">
              developer.x.com adresinden alinir. Basic plan ($100/ay) tweet okuma/yazma icin gerekli.
            </p>
          )}
          {group === "Twikit (Ucretsiz Arama)" && (
            <p className="text-xs text-zinc-400">
              Twitter API&apos;ye ucretsiz alternatif. Cookie ile tweet arama yapar, yazma islemi yapmaz.
            </p>
          )}
          {group === "AI API" && (
            <p className="text-xs text-zinc-400">
              Oncelik sirasi: MiniMax &gt; Groq &gt; Anthropic Claude &gt; OpenAI GPT. En az birini doldurun.
            </p>
          )}
          {group === "xAI / Grok" && (
            <p className="text-xs text-zinc-400">
              console.x.ai adresinden alinir. Yeni hesaplara $25 ucretsiz kredi verilir.
            </p>
          )}

          {API_FIELDS.filter((f) => f.group === group).map((field) => (
            <div key={field.key} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-zinc-400 block mb-1">
                  {field.label}
                </label>
                <input
                  type="password"
                  value={values[field.key] || ""}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  placeholder="Yeni deger girin..."
                  className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => handleSave(field.key)}
                disabled={saving === field.key || !values[field.key]?.trim()}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-40"
              >
                {saving === field.key ? "..." : saved === field.key ? "OK" : "Kaydet"}
              </button>
            </div>
          ))}
        </div>
      ))}

      {/* Cookie Section */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">Cookie Ayarlari (403 Hatasi Cozumu)</h3>
        {twikitStatus?.has_env_cookies && (
          <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            Cookie&apos;ler .env icinde kayitli (kalici)
          </div>
        )}
        {twikitStatus?.has_file_cookies && !twikitStatus?.has_env_cookies && (
          <div className="text-sm text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            Cookie dosyasi mevcut
          </div>
        )}

        <p className="text-xs text-zinc-400">
          F12 &rarr; Application &rarr; Cookies &rarr; x.com altindan auth_token ve ct0 degerlerini bulun.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">auth_token</label>
            <input
              type="password"
              value={cookieAuth}
              onChange={(e) => setCookieAuth(e.target.value)}
              placeholder="F12 → Cookies → auth_token degeri"
              className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">ct0</label>
            <input
              type="password"
              value={cookieCt0}
              onChange={(e) => setCookieCt0(e.target.value)}
              placeholder="F12 → Cookies → ct0 degeri"
              className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSaveCookies}
              disabled={cookieSaving || !cookieAuth.trim() || !cookieCt0.trim()}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-40"
            >
              {cookieSaving ? "Kaydediliyor..." : "Cookie Kaydet"}
            </button>
            <button
              onClick={handleDeleteCookies}
              className="text-sm px-4 py-2 border border-zinc-700 rounded-lg hover:border-red-500/50 hover:text-red-300 transition-colors"
            >
              Cookie Sil
            </button>
          </div>
        </div>
      </div>

      {/* Connection Tests */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">Baglanti Testleri</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { name: "twitter", label: "Twitter API", fn: testTwitter, show: status?.twitter },
            { name: "twikit", label: "Twikit", fn: testTwikit, show: status?.twikit },
            { name: "ai", label: "AI API", fn: testAI, show: status?.minimax || status?.groq || status?.anthropic || status?.openai },
            { name: "grok", label: "Grok", fn: testGrok, show: status?.xai },
            { name: "telegram", label: "Telegram", fn: testTelegram, show: status?.telegram },
          ].map((t) => (
            <button
              key={t.name}
              onClick={() => runTest(t.name, t.fn)}
              disabled={testing === t.name}
              className={`text-sm px-4 py-3 rounded-lg border transition-colors ${
                t.show
                  ? "border-zinc-600 hover:border-blue-500/50 hover:text-blue-300"
                  : "border-zinc-800 text-zinc-600 cursor-not-allowed"
              }`}
            >
              {testing === t.name ? "Test ediliyor..." : `${t.label} Test`}
            </button>
          ))}
        </div>

        {Object.entries(testResults).map(([name, result]) => (
          <TestResult key={name} result={result} />
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 2: X Account Info
// ════════════════════════════════════════════════════════

function TabAccountInfo() {
  const [info, setInfo] = useState<AccountInfoData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const data = await getAccountInfo();
      setInfo(data as AccountInfoData);
    } catch (e) {
      setInfo({ success: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">X Hesap Bilgileri</h3>
        <button
          onClick={fetchInfo}
          disabled={loading}
          className="btn-primary text-sm px-6 py-2"
        >
          {loading ? "Yukleniyor..." : "Hesap Bilgilerini Getir"}
        </button>

        {info && !info.success && (
          <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {info.error || "API anahtarlarini yapilandirin"}
          </div>
        )}

        {info?.success && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-zinc-900/50 rounded-lg p-4 text-center">
                <div className="text-lg font-bold text-white">{info.name}</div>
                <div className="text-sm text-blue-400">@{info.username}</div>
              </div>
              <div className="bg-zinc-900/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">
                  {info.followers?.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-400">Takipci</div>
              </div>
              <div className="bg-zinc-900/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">
                  {info.tweet_count?.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-400">Tweet</div>
              </div>
            </div>
            {info.bio && (
              <div className="text-sm text-zinc-300 bg-zinc-900/50 rounded-lg p-3">
                <span className="text-zinc-500">Bio: </span>
                {info.bio}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 3: Monitored Accounts
// ════════════════════════════════════════════════════════

function TabMonitoredAccounts() {
  const [data, setData] = useState<MonitoredAccountsData | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getMonitoredAccounts().then((d) => setData(d as MonitoredAccountsData));
  }, []);

  const handleAdd = async () => {
    if (!newAccount.trim()) return;
    setAdding(true);
    try {
      await addMonitoredAccount(newAccount.trim());
      setNewAccount("");
      const d = await getMonitoredAccounts();
      setData(d as MonitoredAccountsData);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (username: string) => {
    await removeMonitoredAccount(username);
    const d = await getMonitoredAccounts();
    setData(d as MonitoredAccountsData);
  };

  return (
    <div className="space-y-6">
      {/* Default accounts */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">
          Varsayilan AI Hesaplari ({data?.default_accounts.length || 0})
        </h3>
        <p className="text-xs text-zinc-400">
          Bu hesaplar tarama sirasinda otomatik kontrol edilir.
        </p>

        {data?.categories && data.categories.length > 0 ? (
          <div className="space-y-3">
            {data.categories.map((cat) => (
              <details key={cat.id} className="group">
                <summary className="cursor-pointer text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                  {cat.name} — <span className="text-zinc-500">{cat.description}</span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-2 pl-4">
                  {data.default_accounts.slice(0, 20).map((acc) => (
                    <span
                      key={acc}
                      className="text-xs bg-zinc-800 rounded px-2 py-1 text-zinc-300"
                    >
                      @{acc}
                    </span>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data?.default_accounts.slice(0, 30).map((acc) => (
              <span
                key={acc}
                className="text-xs bg-zinc-800 rounded px-2 py-1 text-zinc-300"
              >
                @{acc}
              </span>
            ))}
            {(data?.default_accounts.length || 0) > 30 && (
              <span className="text-xs text-zinc-500">
                +{(data?.default_accounts.length || 0) - 30} daha
              </span>
            )}
          </div>
        )}
      </div>

      {/* Custom accounts */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">Ozel Hesaplar</h3>

        <div className="flex gap-3">
          <input
            value={newAccount}
            onChange={(e) => setNewAccount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="@username (@ olmadan yazin)"
            className="flex-1 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newAccount.trim()}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-40"
          >
            {adding ? "..." : "Ekle"}
          </button>
        </div>

        {data?.custom_accounts && data.custom_accounts.length > 0 ? (
          <div className="space-y-2">
            {data.custom_accounts.map((acc) => (
              <div
                key={acc}
                className="flex items-center justify-between bg-zinc-900/30 rounded-lg px-4 py-2"
              >
                <span className="text-sm text-white">@{acc}</span>
                <button
                  onClick={() => handleRemove(acc)}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Kaldir
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Henuz ozel hesap eklenmemis.</p>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 4: Writing Style
// ════════════════════════════════════════════════════════

function TabWritingStyle() {
  const [samples, setSamples] = useState<string[]>([]);
  const [persona, setPersonaText] = useState("");
  const [newSample, setNewSample] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [manualPersona, setManualPersona] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const refreshData = useCallback(async () => {
    const [sData, pData] = await Promise.all([getUserSamples(), getPersona()]);
    setSamples((sData as { samples: string[] }).samples);
    const p = (pData as { persona: string }).persona;
    setPersonaText(p);
    setManualPersona(p);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleAddSample = async () => {
    if (!newSample.trim()) return;
    await addUserSample(newSample.trim());
    setNewSample("");
    refreshData();
  };

  const handleBulkAdd = async () => {
    const texts = bulkText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (texts.length === 0) return;
    await addBulkSamples(texts);
    setBulkText("");
    setShowBulk(false);
    refreshData();
  };

  const handleDeleteSample = async (index: number) => {
    await deleteUserSample(index);
    refreshData();
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const result = await analyzeStyle();
      const r = result as { success: boolean; error?: string; persona?: string };
      setAnalyzeResult(r);
      if (r.success) refreshData();
    } catch (e) {
      setAnalyzeResult({ success: false, error: String(e) });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSavePersona = async () => {
    await savePersona(manualPersona);
    refreshData();
  };

  const handleResetPersona = async () => {
    await savePersona("");
    refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Sample Tweets */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">Tweet Orneklerin</h3>
        <p className="text-xs text-zinc-400">
          AI&apos;in senin gibi yazmasi icin kendi tweet orneklerini ekle.
          Ne kadar cok ornek eklersen, tarz o kadar dogru olur.
        </p>

        <div className="flex gap-3">
          <textarea
            value={newSample}
            onChange={(e) => setNewSample(e.target.value)}
            placeholder="Kendi tarzinda yazdigin bir tweet ornegi yapistir..."
            rows={2}
            className="flex-1 bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
          />
          <button
            onClick={handleAddSample}
            disabled={!newSample.trim()}
            className="btn-primary text-sm px-4 self-end disabled:opacity-40"
          >
            Ekle
          </button>
        </div>

        <button
          onClick={() => setShowBulk(!showBulk)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showBulk ? "Kapat" : "Toplu Ornek Ekle"}
        </button>

        {showBulk && (
          <div className="space-y-2">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"Tweet 1\nTweet 2\nTweet 3"}
              rows={5}
              className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
            />
            <button
              onClick={handleBulkAdd}
              disabled={!bulkText.trim()}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-40"
            >
              Toplu Ekle
            </button>
          </div>
        )}

        {/* Existing samples */}
        {samples.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 mb-1">
              Kayitli Ornekler ({samples.length})
            </div>
            {samples.map((sample, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-zinc-900/30 rounded-lg px-4 py-3"
              >
                <p className="flex-1 text-sm text-zinc-300 whitespace-pre-wrap">
                  {sample}
                </p>
                <button
                  onClick={() => handleDeleteSample(i)}
                  className="text-xs text-zinc-600 hover:text-red-400 shrink-0"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Henuz ornek tweet eklenmemis. AI&apos;in senin gibi yazmasi icin ornekler ekle!
          </p>
        )}
      </div>

      {/* Style Analysis */}
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">Tarz Analizi</h3>

        {persona && (
          <div className="bg-zinc-900/50 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {persona}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || samples.length < 5}
            className="btn-primary text-sm px-6 py-2 disabled:opacity-40"
          >
            {analyzing ? "Analiz ediliyor..." : "Tarzimi Analiz Et"}
          </button>
          {persona && (
            <button
              onClick={handleResetPersona}
              className="text-sm px-4 py-2 border border-zinc-700 rounded-lg hover:border-red-500/50 hover:text-red-300 transition-colors"
            >
              Sifirla
            </button>
          )}
        </div>

        {samples.length < 5 && (
          <p className="text-xs text-zinc-500">
            Analiz icin en az 5 ornek gerekli. Su an: {samples.length}/5
          </p>
        )}

        {analyzeResult && (
          <TestResult result={analyzeResult} />
        )}
      </div>

      {/* Manual Persona */}
      <div className="glass-card space-y-4">
        <button
          onClick={() => setShowManual(!showManual)}
          className="font-semibold text-white text-sm flex items-center gap-2"
        >
          Manuel Persona Tanimi
          <span className="text-zinc-500">{showManual ? "▲" : "▼"}</span>
        </button>

        {showManual && (
          <div className="space-y-3">
            <textarea
              value={manualPersona}
              onChange={(e) => setManualPersona(e.target.value)}
              placeholder="Orn: Genc bir Turk yazilimciyim. Kisa ve oz yaziyorum..."
              rows={6}
              className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
            />
            <button
              onClick={handleSavePersona}
              className="btn-primary text-sm px-4 py-2"
            >
              Kaydet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 5: Post History
// ════════════════════════════════════════════════════════

function TabHistory() {
  const [history, setHistory] = useState<PostHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    getPostHistory().then((d) => {
      const data = d as { history: PostHistoryEntry[]; count: number };
      setHistory(data.history);
      setTotal(data.count);
    });
  }, []);

  const handleClear = async () => {
    if (!confirm("Tum paylasim gecmisini silmek istediginize emin misiniz?")) return;
    await clearPostHistory();
    setHistory([]);
    setTotal(0);
  };

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">
            Paylasim Gecmisi ({total})
          </h3>
          {history.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Gecmisi Temizle
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <div className="space-y-3">
            {history.map((entry, i) => (
              <div
                key={i}
                className="bg-zinc-900/30 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-400 uppercase">
                    {entry.type || "tweet"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {entry.posted_at?.slice(0, 16)}
                  </span>
                </div>
                <p className="text-sm text-zinc-300">
                  {entry.text?.slice(0, 200)}
                  {(entry.text?.length || 0) > 200 ? "..." : ""}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    Tarz: {entry.style || "N/A"}
                  </span>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      X&apos;te Goruntule
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Henuz paylasim gecmisi yok.</p>
        )}
      </div>
    </div>
  );
}
