"use client";

import { useEffect, useState } from "react";
import {
  updateAPIKey,
  testTwitter,
  testAI,
  testGrok,
  testGemini,
  testTelegram,
  testTwikit,
  getTwikitStatus,
  saveTwikitCookies,
  deleteTwikitCookies,
} from "@/lib/api";

export interface APIStatusData {
  minimax: boolean;
  groq: boolean;
  anthropic: boolean;
  openai: boolean;
  xai: boolean;
  gemini: boolean;
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
  { key: "gemini_api_key", label: "Google Gemini API Key", group: "Gemini (Gorsel Uretim)" },
  { key: "telegram_bot_token", label: "Telegram Bot Token", group: "Telegram" },
  { key: "telegram_chat_id", label: "Telegram Chat ID", group: "Telegram" },
];

const API_GROUPS = [
  "Twitter API",
  "Twikit (Ucretsiz Arama)",
  "AI API",
  "xAI / Grok",
  "Gemini (Gorsel Uretim)",
  "Telegram",
];

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

export default function TabAPIKeys({
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
          {group === "Gemini (Gorsel Uretim)" && (
            <p className="text-xs text-zinc-400">
              aistudio.google.com adresinden alinir. Infografik gorsel uretimi icin kullanilir.
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
            { name: "gemini", label: "Gemini", fn: testGemini, show: status?.gemini },
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
