"use client";

import { useState } from "react";
import { exportAnalyses, importAnalyses } from "@/lib/api";

/* ── Main Tab Component ──────────────────────────────────── */

export default function TabExport() {
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = (await exportAnalyses()) as { data: string };
      // Download as file
      const blob = new Blob([res.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tweet_analyses_export.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Analiz dosyasi indirildi!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export hatasi");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const res = (await importAnalyses(importText)) as { imported: number };
      setMessage(`${res.imported} analiz iceri aktarildi!`);
      setImportText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import hatasi");
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportText(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-cyan)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Analiz verilerini JSON olarak indirin veya onceden indirdiginiz dosyayi geri yukleyin.
        </p>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {message && (
        <div className="glass-card bg-[var(--accent-green)]/5 border-[var(--accent-green)]/30">
          <p className="text-sm text-[var(--accent-green)]">{message}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Export */}
        <div className="glass-card space-y-3">
          <h4 className="text-sm font-semibold">Disa Aktar (Indir)</h4>
          <p className="text-xs text-[var(--text-secondary)]">
            Tum analiz verilerini JSON dosyasi olarak indirin.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-primary w-full text-sm"
          >
            {exporting ? "Hazirlaniyor..." : "Tumunu Indir (JSON)"}
          </button>
        </div>

        {/* Import */}
        <div className="glass-card space-y-3">
          <h4 className="text-sm font-semibold">Iceri Aktar (Yukle)</h4>

          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="text-xs"
          />

          {importText && (
            <p className="text-xs text-[var(--accent-green)]">
              Dosya yuklendi ({(importText.length / 1024).toFixed(1)} KB)
            </p>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !importText}
            className="btn-primary w-full text-sm"
          >
            {importing ? "Aktariliyor..." : "Iceri Aktar"}
          </button>
        </div>
      </div>
    </div>
  );
}
