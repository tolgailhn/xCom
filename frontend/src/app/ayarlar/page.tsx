"use client";

import { useEffect, useState } from "react";
import { getAPIStatus, updateAPIKey } from "@/lib/api";

interface APIStatusData {
  minimax: boolean;
  anthropic: boolean;
  openai: boolean;
  xai: boolean;
  twitter: boolean;
  telegram: boolean;
}

const apiFields = [
  { key: "minimax_api_key", label: "MiniMax API Key", group: "AI" },
  { key: "anthropic_api_key", label: "Anthropic API Key", group: "AI" },
  { key: "openai_api_key", label: "OpenAI API Key", group: "AI" },
  { key: "xai_api_key", label: "xAI (Grok) API Key", group: "AI" },
  { key: "twitter_bearer_token", label: "Twitter Bearer Token", group: "Twitter" },
  { key: "twitter_ct0", label: "Twitter ct0 Cookie", group: "Twitter" },
  { key: "twitter_auth_token", label: "Twitter Auth Token", group: "Twitter" },
  { key: "telegram_bot_token", label: "Telegram Bot Token", group: "Telegram" },
  { key: "telegram_chat_id", label: "Telegram Chat ID", group: "Telegram" },
];

export default function AyarlarPage() {
  const [status, setStatus] = useState<APIStatusData | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    getAPIStatus().then((s) => setStatus(s as APIStatusData));
  }, []);

  const handleSave = async (key: string) => {
    const value = values[key];
    if (!value?.trim()) return;
    setSaving(key);
    try {
      await updateAPIKey(key, value.trim());
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
      // Refresh status
      const s = await getAPIStatus();
      setStatus(s as APIStatusData);
    } finally {
      setSaving(null);
    }
  };

  const statusDot = (active: boolean) =>
    active ? (
      <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-green)]" />
    ) : (
      <span className="inline-block w-2 h-2 rounded-full bg-[var(--border)]" />
    );

  const groups = ["AI", "Twitter", "Telegram"];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Ayarlar</h2>

      {/* API Status overview */}
      {status && (
        <div className="glass-card">
          <h3 className="text-sm font-semibold mb-3">API Durumu</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(status).map(([key, active]) => (
              <div key={key} className="flex items-center gap-2">
                {statusDot(active)}
                <span className="text-sm capitalize">{key}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Key forms */}
      {groups.map((group) => (
        <div key={group} className="glass-card space-y-4">
          <h3 className="font-semibold">{group}</h3>
          {apiFields
            .filter((f) => f.group === group)
            .map((field) => (
              <div key={field.key} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">
                    {field.label}
                  </label>
                  <input
                    type="password"
                    value={values[field.key] || ""}
                    onChange={(e) =>
                      setValues({ ...values, [field.key]: e.target.value })
                    }
                    placeholder="Yeni deger girin..."
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => handleSave(field.key)}
                  disabled={saving === field.key}
                  className="btn-primary text-sm px-4 py-2"
                >
                  {saving === field.key
                    ? "..."
                    : saved === field.key
                    ? "OK"
                    : "Kaydet"}
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
