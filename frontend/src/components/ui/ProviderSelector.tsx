"use client";

interface Provider {
  id: string;
  name: string;
}

interface ProviderSelectorProps {
  provider: string;
  setProvider: (value: string) => void;
  providers: Provider[];
  className?: string;
}

export default function ProviderSelector({
  provider,
  setProvider,
  providers,
  className = "",
}: ProviderSelectorProps) {
  if (!providers.length) return null;

  return (
    <div className={className}>
      <label className="text-xs text-[var(--text-secondary)] block mb-1">
        AI Model
      </label>
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs"
      >
        <option value="">Otomatik</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
