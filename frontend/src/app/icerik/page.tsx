"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getStyles } from "@/lib/api";
import { ContentStyle, FormatOption } from "./shared";
import ErrorMessage from "@/components/ui/ErrorMessage";
import TabDiscover from "./TabDiscover";
import TabGenerate from "./TabGenerate";

/* ── Main ──────────────────────────────────────────────── */

export default function IcerikPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"discover" | "generate">("discover");
  const [contentStyles, setContentStyles] = useState<ContentStyle[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "discover" || t === "generate") setActiveTab(t);
  }, [searchParams]);

  useEffect(() => {
    getStyles()
      .then(
        (r: {
          content_styles?: ContentStyle[];
          formats: FormatOption[];
        }) => {
          setContentStyles(
            r.content_styles || [
              { id: "deneyim", name: "Kisisel Deneyim", desc: "" },
              { id: "egitici", name: "Egitici", desc: "" },
              { id: "karsilastirma", name: "Karsilastirma", desc: "" },
              { id: "analiz", name: "Analiz", desc: "" },
              { id: "hikaye", name: "Hikaye Anlatimi", desc: "" },
            ]
          );
          setFormats(r.formats);
        }
      )
      .catch((e) => setPageError(e instanceof Error ? e.message : "Stiller yuklenemedi — backend calisiyor mu?"));
  }, []);

  const tabs = [
    { id: "discover" as const, label: "Konu Kesfet" },
    { id: "generate" as const, label: "Icerik Uret" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold gradient-text">Icerik Uretici</h2>

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

      {activeTab === "discover" && (
        <TabDiscover contentStyles={contentStyles} formats={formats} providers={[]} />
      )}
      {activeTab === "generate" && (
        <TabGenerate contentStyles={contentStyles} formats={formats} providers={[]} />
      )}
    </div>
  );
}
