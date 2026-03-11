"use client";

import { useState } from "react";
import { getAccountInfo } from "@/lib/api";

interface AccountInfoData {
  success: boolean;
  username?: string;
  name?: string;
  followers?: number;
  tweet_count?: number;
  bio?: string;
  error?: string;
}

export default function TabAccountInfo() {
  const [info, setInfo] = useState<AccountInfoData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const data = await getAccountInfo();
      setInfo(data as AccountInfoData);
    } catch (e) {
      setInfo({ success: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-4">
        <h3 className="font-semibold text-white">X Hesap Bilgileri</h3>
        <button
          onClick={fetchInfo}
          disabled={loading}
          className="btn-primary text-sm px-6 py-2"
        >
          {loading ? "Yukleniyor..." : "Hesap Bilgilerini Getir"}
        </button>

        {info && !info.success && (
          <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {info.error || "API anahtarlarini yapilandirin"}
          </div>
        )}

        {info?.success && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-zinc-900/50 rounded-lg p-4 text-center">
                <div className="text-lg font-bold text-white">{info.name}</div>
                <div className="text-sm text-blue-400">@{info.username}</div>
              </div>
              <div className="bg-zinc-900/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">
                  {info.followers?.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-400">Takipci</div>
              </div>
              <div className="bg-zinc-900/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">
                  {info.tweet_count?.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-400">Tweet</div>
              </div>
            </div>
            {info.bio && (
              <div className="text-sm text-zinc-300 bg-zinc-900/50 rounded-lg p-3">
                <span className="text-zinc-500">Bio: </span>
                {info.bio}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
