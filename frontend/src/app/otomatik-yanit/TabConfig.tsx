"use client";

import { AutoReplyConfig } from "@/lib/api";

interface TabConfigProps {
  config: AutoReplyConfig;
  setConfig: React.Dispatch<React.SetStateAction<AutoReplyConfig>>;
  styles: { id: string; name: string }[];
  accountInput: string;
  setAccountInput: (v: string) => void;
  saving: boolean;
  triggering: boolean;
  message: string;
  onSave: () => void;
  onTrigger: () => void;
}

export default function TabConfig({
  config,
  setConfig,
  styles,
  accountInput,
  setAccountInput,
  saving,
  triggering,
  message,
  onSave,
  onTrigger,
}: TabConfigProps) {
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

  return (
    <div className="space-y-6">
      {/* Enable Toggle + Draft Mode */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Otomatik Yanit Sistemi</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Takip ettigin hesaplarin yeni tweetlerine AI ile yanit uret
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

        {/* Gonderim Bilgisi */}
        <div className="p-3 rounded-lg bg-[var(--accent-blue)]/5 border border-[var(--accent-blue)]/20">
          <p className="text-sm text-[var(--text-secondary)]">
            Yanitlar otomatik uretilir. Loglar sekmesinden &quot;Yaniti Kopyala&quot; ile kopyalayip
            &quot;Tweet&apos;i Ac&quot; ile X&apos;te manuel paylasabilirsiniz.
          </p>
        </div>
      </div>

      {/* Accounts */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-3">Yanit Verilecek Hesaplar</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Bu hesaplarin yeni tweetlerine yanit uretilecek.
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
              Saatlik Maks Uretim
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
              Saatte max kac yanit uretilsin. 3-5 ideal.
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
              0 = tum tweetlere yanit uret
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
          <span className="text-sm">Sadece orijinal tweetlere yanit uret (reply&apos;lari atla)</span>
        </div>
      </div>

      {/* Additional Context */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-2">Ek Talimat</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          AI&apos;a yanitlar icin ek talimat ver
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
          onClick={onSave}
          disabled={saving}
          className="btn-primary px-6 py-2.5"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
        <button
          onClick={onTrigger}
          disabled={triggering || !config.enabled}
          className="btn-secondary px-6 py-2.5"
        >
          {triggering ? "Kontrol ediliyor..." : "Simdi Kontrol Et"}
        </button>
      </div>
    </div>
  );
}
