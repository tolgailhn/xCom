"use client";

import { useState } from "react";

import TabNew from "./TabNew";
import TabSaved from "./TabSaved";
import TabFollowers from "./TabFollowers";
import TabPool from "./TabPool";
import TabExport from "./TabExport";
import TabMyTweets from "./TabMyTweets";

export default function AnalizPage() {
  const [activeTab, setActiveTab] = useState<"new" | "saved" | "followers" | "pool" | "export" | "mytweetler">("new");

  const tabs = [
    { id: "new" as const, label: "Yeni Analiz" },
    { id: "saved" as const, label: "Kayitli Analizler" },
    { id: "followers" as const, label: "Takipci Kesfi" },
    { id: "pool" as const, label: "Tweet Havuzu" },
    { id: "export" as const, label: "Disa/Iceri Aktar" },
    { id: "mytweetler" as const, label: "Tweetlerim" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Analiz & Kesif</h2>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === t.id
                ? "bg-[var(--accent-blue)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "new" && <TabNew />}
      {activeTab === "saved" && <TabSaved />}
      {activeTab === "followers" && <TabFollowers />}
      {activeTab === "pool" && <TabPool />}
      {activeTab === "export" && <TabExport />}
      {activeTab === "mytweetler" && <TabMyTweets refreshTrigger={0} />}
    </div>
  );
}
