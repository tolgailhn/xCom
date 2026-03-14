"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getStyles } from "@/lib/api";
import ErrorMessage from "@/components/ui/ErrorMessage";

import TabQuoteTweet from "./TabQuoteTweet";
import TabQuickReply from "./TabQuickReply";
import TabLinkReply from "./TabLinkReply";
import TabSelfReply from "./TabSelfReply";

/* ── Types ─────────────────────────────────────────────── */

interface StyleOption {
  id: string;
  name: string;
  desc: string;
}

interface FormatOption {
  id: string;
  name: string;
  desc: string;
}

/* ── Main ──────────────────────────────────────────────── */

export default function YazPage() {
  return (
    <Suspense
      fallback={
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      }
    >
      <YazContent />
    </Suspense>
  );
}

function YazContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "quote" | "reply" | "linkreply" | "selfreply"
  >("quote");

  /* ── Shared State ───────────────── */
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    getStyles()
      .then((r: { styles: StyleOption[]; formats: FormatOption[] }) => {
        setStyles(r.styles);
        setFormats(r.formats);
      })
      .catch((e) => setPageError(e instanceof Error ? e.message : "Stiller yuklenemedi — backend calisiyor mu?"));
  }, []);

  // Pre-fill from search params
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const quoteUrl = searchParams.get("quote_url");
    if (tabParam === "reply") {
      setActiveTab("reply");
    } else if (tabParam === "linkreply") {
      setActiveTab("linkreply");
    } else if (tabParam === "selfreply") {
      setActiveTab("selfreply");
    } else if (quoteUrl) {
      setActiveTab("quote");
    }
  }, [searchParams]);

  const tabs = [
    { id: "quote" as const, label: "Arastirmali Quote" },
    { id: "reply" as const, label: "Hizli Reply" },
    { id: "linkreply" as const, label: "Linkle Reply" },
    { id: "selfreply" as const, label: "Self-Reply" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Tweet Yazici</h2>

      <ErrorMessage message={pageError} />

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? "bg-[var(--accent-blue)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "quote" && (
        <TabQuoteTweet
          styles={styles}
          formats={formats}
          providers={[]}
          initialUrl={searchParams.get("quote_url") || ""}
        />
      )}
      {activeTab === "reply" && <TabQuickReply styles={styles} providers={[]} />}
      {activeTab === "linkreply" && <TabLinkReply styles={styles} providers={[]} />}
      {activeTab === "selfreply" && <TabSelfReply styles={styles} providers={[]} />}
    </div>
  );
}
