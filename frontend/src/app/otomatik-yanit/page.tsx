"use client";

import { useState, useEffect } from "react";
import {
  getAutoReplyConfig,
  updateAutoReplyConfig,
  getAutoReplyLogs,
  clearAutoReplyLogs,
  deleteAutoReplyLog,
  triggerAutoReplyCheck,
  getAutoReplyStatus,
  getStyles,
  type AutoReplyConfig,
  type AutoReplyLog,
  type AutoReplyStatus,
} from "@/lib/api";

export default function OtomatikYanitPage() {
  const [tab, setTab] = useState<"config" | "logs">("config");
  const [config, setConfig] = useState<AutoReplyConfig>({
    enabled: false,
    accounts: [],
    check_interval_minutes: 5,
    reply_delay_seconds: 60,
    style: "reply",
    additional_context: "",
    max_replies_per_hour: 5,
    min_likes_to_reply: 0,
    only_original_tweets: true,
    language: "tr",
  });
  const [logs, setLogs] = useState<AutoReplyLog[]>([]);
  const [status, setStatus] = useState<AutoReplyStatus | null>(null);
  const [styles, setStyles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [accountInput, setAccountInput] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [configRes, logsRes, statusRes, stylesRes] = await Promise.all([
        getAutoReplyConfig(),
        getAutoReplyLogs(100),
        getAutoReplyStatus(),
        getStyles().catch(() => ({ styles: [] })),
      ]);
      setConfig(configRes.config);
      setLogs(logsRes.logs);
      setStatus(statusRes);
      if (stylesRes.styles) setStyles(stylesRes.styles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      await updateAutoReplyConfig(config);
      setMessage("Ayarlar kaydedildi!");
      const statusRes = await getAutoReplyStatus();
      setStatus(statusRes);
    } catch (err: unknown) {
      setMessage(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setMessage("");
    try {
      await triggerAutoReplyCheck();
      setMessage("Kontrol tamamlandi!");
      // Refresh logs and status
      const [logsRes, statusRes] = await Promise.all([
        getAutoReplyLogs(100),
        getAutoReplyStatus(),
      ]);
      setLogs(logsRes.logs);
      setStatus(statusRes);
    } catch (err: unknown) {
      setMessage(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTriggering(false);
    }
  }

  async function handleClearLogs() {
    if (!confirm("Tum loglari silmek istediginize emin misiniz?")) return;
    try {
      await clearAutoReplyLogs();
      setLogs([]);
      setMessage("Loglar temizlendi");
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteLog(logId: string) {
    try {
      await deleteAutoReplyLog(logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
    } catch (err) {
      console.error(err);
    }
  }

  function addAccount() {
    const accounts = accountInput
      .split(",")
      .map((a) => a.trim().replace(/^@/, ""))
      .filter((a) => a && !config.accounts.includes(a));
    if (accounts.length > 0) {
      setConfig((prev) => ({
        ...prev,
        accounts: [...prev.accounts, ...accounts],
      }));
      setAccountInput("");
    }
  }

  function removeAccount(account: string) {
    setConfig((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a !== account),
    }));
  }

  function formatTime(isoStr: string) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold gradient-text">Otomatik Yanit</h1>
        {status && (
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                status.enabled
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status.enabled ? "bg-green-400 animate-pulse" : "bg-red-400"
                }`}
              />
              {status.enabled ? "Aktif" : "Pasif"}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {status.replies_last_hour}/{status.max_per_hour} yanit/saat
            </span>
          </div>
        )}
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--accent-blue)]">
              {status.accounts_count}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Takip Edilen
            </div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-green-400">
              {status.total_replies}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Toplam Yanit
            </div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {status.replies_last_hour}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Son 1 Saat
            </div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-red-400">
              {status.total_failures}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Basarisiz
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setTab("config")}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
            tab === "config"
              ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Ayarlar
        </button>
        <button
          onClick={() => {
            setTab("logs");
            getAutoReplyLogs(100).then((res) => setLogs(res.logs));
          }}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
            tab === "logs"
              ? "bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Loglar ({logs.length})
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.startsWith("Hata")
              ? "bg-red-500/20 text-red-400"
              : "bg-green-500/20 text-green-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Config Tab */}
      {tab === "config" && (
        <div className="space-y-6">
          {/* Enable Toggle */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Otomatik Yanit Sistemi</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Takip ettigin hesaplarin yeni tweetlerine AI ile otomatik yanit ver
                </p>
              </div>
              <button
                onClick={() =>
                  setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  config.enabled ? "bg-green-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    config.enabled ? "left-8" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Accounts */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-3">Yanit Verilecek Hesaplar</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Bu hesaplarin yeni tweetlerine otomatik yanit verilecek. Turkce icerik ureten hesaplar ekle.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={accountInput}
                onChange={(e) => setAccountInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAccount()}
                placeholder="@kullanici1, @kullanici2"
                className="input flex-1"
              />
              <button onClick={addAccount} className="btn-primary px-4">
                Ekle
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.accounts.map((account) => (
                <span
                  key={account}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] text-sm"
                >
                  @{account}
                  <button
                    onClick={() => removeAccount(account)}
                    className="hover:text-red-400 transition-colors"
                  >
                    &times;
                  </button>
                </span>
              ))}
              {config.accounts.length === 0 && (
                <span className="text-sm text-[var(--text-secondary)]">
                  Henuz hesap eklenmedi
                </span>
              )}
            </div>
          </div>

          {/* Settings Grid */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4">Yanit Ayarlari</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Language */}
              <div>
                <label className="block text-sm font-medium mb-1">Dil</label>
                <select
                  value={config.language}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, language: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="tr">Turkce</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Style */}
              <div>
                <label className="block text-sm font-medium mb-1">Yanit Tarzi</label>
                <select
                  value={config.style}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, style: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="reply">Standart Reply</option>
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Max replies per hour */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Saatlik Maks Yanit
                </label>
                <input
                  type="number"
                  value={config.max_replies_per_hour}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      max_replies_per_hour: parseInt(e.target.value) || 1,
                    }))
                  }
                  min={1}
                  max={20}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Cok fazla yanit spam gibi gorunur. 3-5 ideal.
                </p>
              </div>

              {/* Reply delay */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Yanitlar Arasi Bekleme (sn)
                </label>
                <input
                  type="number"
                  value={config.reply_delay_seconds}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      reply_delay_seconds: parseInt(e.target.value) || 30,
                    }))
                  }
                  min={10}
                  max={300}
                  className="input w-full"
                />
              </div>

              {/* Min likes */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Min Like (yanit icin)
                </label>
                <input
                  type="number"
                  value={config.min_likes_to_reply}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      min_likes_to_reply: parseInt(e.target.value) || 0,
                    }))
                  }
                  min={0}
                  className="input w-full"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  0 = tum tweetlere yanit ver
                </p>
              </div>

              {/* Check interval */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Kontrol Araligi (dk)
                </label>
                <input
                  type="number"
                  value={config.check_interval_minutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      check_interval_minutes: parseInt(e.target.value) || 5,
                    }))
                  }
                  min={2}
                  max={60}
                  className="input w-full"
                />
              </div>
            </div>

            {/* Only original tweets */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    only_original_tweets: !prev.only_original_tweets,
                  }))
                }
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  config.only_original_tweets ? "bg-green-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.only_original_tweets ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-sm">Sadece orijinal tweetlere yanit ver (reply&apos;lari atla)</span>
            </div>
          </div>

          {/* Additional Context */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-2">Ek Talimat</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              AI&apos;a yanitlar icin ek talimat ver (orn: &quot;Turkce AI haberlerine odaklan&quot;, &quot;Kisa ve oz yaz&quot;)
            </p>
            <textarea
              value={config.additional_context}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  additional_context: e.target.value,
                }))
              }
              rows={3}
              className="input w-full"
              placeholder="Ornek: Her zaman deger katan, bilgilendirici yanitlar yaz. Kendi deneyimlerinden bahset."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-6 py-2.5"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              onClick={handleTrigger}
              disabled={triggering || !config.enabled}
              className="btn-secondary px-6 py-2.5"
            >
              {triggering ? "Kontrol ediliyor..." : "Simdi Kontrol Et"}
            </button>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {tab === "logs" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">
              Yanit Gecmisi ({logs.length})
            </h3>
            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Tum Loglari Temizle
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="card p-8 text-center text-[var(--text-secondary)]">
              Henuz otomatik yanit yapilmadi
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`card p-4 border-l-4 ${
                    log.status === "published"
                      ? "border-l-green-500"
                      : "border-l-red-500"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--accent-blue)]">
                        @{log.account}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          log.status === "published"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {log.status === "published"
                          ? "Yayinlandi"
                          : log.status === "generation_failed"
                          ? "Uretim Hatasi"
                          : "Paylasim Hatasi"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {formatTime(log.created_at)}
                      </span>
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-xs text-[var(--text-secondary)] hover:text-red-400"
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  {/* Original tweet */}
                  <div className="mb-2 p-2 rounded bg-[var(--bg-primary)] text-sm">
                    <span className="text-[var(--text-secondary)]">Tweet: </span>
                    {log.tweet_text}
                  </div>

                  {/* Reply */}
                  {log.reply_text && (
                    <div className="p-2 rounded bg-[var(--accent-blue)]/5 text-sm">
                      <span className="text-[var(--accent-blue)]">Yanit: </span>
                      {log.reply_text}
                    </div>
                  )}

                  {/* Error */}
                  {log.error && (
                    <div className="mt-2 text-xs text-red-400">{log.error}</div>
                  )}

                  {/* Reply URL */}
                  {log.reply_url && (
                    <a
                      href={log.reply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs text-[var(--accent-blue)] hover:underline"
                    >
                      Yaniti gor &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
