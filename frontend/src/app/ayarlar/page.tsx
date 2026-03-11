"use client";

import { useEffect, useState, useCallback } from "react";
import { getAPIStatus } from "@/lib/api";

import TabAPIKeys, { APIStatusData } from "./TabAPIKeys";
import TabAccountInfo from "./TabAccountInfo";
import TabMonitoredAccounts from "./TabMonitoredAccounts";
import TabWritingStyle from "./TabWritingStyle";
import TabHistory from "./TabHistory";

/* ── Tab names ──────────────────────────────────────── */

const TABS = [
  { id: "api", label: "API Anahtarlari" },
  { id: "account", label: "X Hesap Bilgileri" },
  { id: "accounts", label: "Izlenen Hesaplar" },
  { id: "style", label: "Yazim Tarzi" },
  { id: "history", label: "Gecmis" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ── Helpers ────────────────────────────────────────── */

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        active ? "bg-emerald-400" : "bg-zinc-600"
      }`}
    />
  );
}

/* ── Main Component ─────────────────────────────────── */

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
