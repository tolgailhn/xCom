"use client";

import { useEffect, useState } from "react";
import {
  getMonitoredAccounts,
  addMonitoredAccount,
  removeMonitoredAccount,
} from "@/lib/api";

interface MonitoredAccountsData {
  default_accounts: string[];
  custom_accounts: string[];
  categories: { id: string; name: string; description: string }[];
}

export default function TabMonitoredAccounts() {
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
