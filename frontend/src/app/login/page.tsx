"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const success = await login(password);
    if (success) {
      router.push("/");
    } else {
      setError("Yanlis sifre");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🤖</div>
        <h1 className="text-2xl font-bold gradient-text mb-2">X AI Otomasyon</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Dashboard&apos;a erisim icin sifre girin
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sifre"
            autoFocus
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-center focus:border-[var(--accent-blue)] focus:outline-none"
          />

          {error && (
            <p className="text-sm text-[var(--accent-red)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="btn-primary w-full"
          >
            {loading ? "Giris yapiliyor..." : "Giris Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
