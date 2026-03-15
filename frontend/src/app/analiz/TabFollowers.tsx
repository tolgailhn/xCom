"use client";

import { useState, useEffect } from "react";
import {
  fetchFollowers,
  listFollowers,
  deleteFollowers,
} from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */

interface Follower {
  name: string;
  username: string;
  bio: string;
  followers_count: number;
  is_blue_verified: boolean;
}

/* ── Follower List Sub-Component ─────────────────────────── */

function FollowerList({ followers }: { followers: Follower[] }) {
  const [sortBy, setSortBy] = useState<"followers_count" | "name">("followers_count");
  const sorted = [...followers].sort((a, b) =>
    sortBy === "followers_count"
      ? b.followers_count - a.followers_count
      : a.name.localeCompare(b.name)
  );

  const verified = followers.filter((f) => f.is_blue_verified).length;
  const totalFollowers = followers.reduce((s, f) => s + f.followers_count, 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 sm:gap-2 text-center text-xs">
        <div>
          <div className="font-bold text-[var(--accent-blue)]">{followers.length}</div>
          <div className="text-[var(--text-secondary)]">Toplam</div>
        </div>
        <div>
          <div className="font-bold text-[var(--accent-purple)]">{verified}</div>
          <div className="text-[var(--text-secondary)]">Onayli</div>
        </div>
        <div>
          <div className="font-bold text-[var(--accent-green)]">
            {Math.round(totalFollowers / Math.max(followers.length, 1)).toLocaleString()}
          </div>
          <div className="text-[var(--text-secondary)]">Ort. Takipci</div>
        </div>
      </div>

      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
      >
        <option value="followers_count">Takipci sayisina gore</option>
        <option value="name">Isme gore</option>
      </select>

      <div className="space-y-1 max-h-96 overflow-y-auto">
        {sorted.map((f, i) => (
          <a
            key={i}
            href={`https://x.com/${f.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-[var(--bg-primary)] rounded-lg px-3 py-2 hover:ring-1 ring-[var(--accent-blue)] transition-all"
          >
            <div className="flex justify-between">
              <div>
                <span className="text-sm font-medium">{f.name}</span>
                {f.is_blue_verified && <span className="text-[var(--accent-blue)] ml-1 text-xs">&#10003;</span>}
                <span className="text-xs text-[var(--text-secondary)] ml-1">@{f.username}</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{f.followers_count.toLocaleString()}</span>
            </div>
            {f.bio && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{f.bio}</p>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Main Tab Component ──────────────────────────────────── */

export default function TabFollowers() {
  const [targetUser, setTargetUser] = useState("");
  const [limit, setLimit] = useState(200);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fetchResult, setFetchResult] = useState<{
    user_info: Record<string, string | number | boolean>;
    followers: Follower[];
  } | null>(null);

  const [savedLists, setSavedLists] = useState<{
    username: string;
    fetched_at: string;
    count: number;
    followers: Follower[];
  }[]>([]);
  const [expandedSaved, setExpandedSaved] = useState<string | null>(null);

  useEffect(() => {
    loadSaved();
  }, []);

  const loadSaved = async () => {
    try {
      const res = (await listFollowers()) as { items: typeof savedLists };
      setSavedLists(res.items);
    } catch {
      /* ignore */
    }
  };

  const handleFetch = async () => {
    if (!targetUser.trim()) return;
    setLoading(true);
    setError(null);
    setFetchResult(null);
    try {
      const res = (await fetchFollowers(
        targetUser.replace("@", ""),
        limit,
        verifiedOnly
      )) as typeof fetchResult;
      setFetchResult(res);
      loadSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSaved = async (username: string) => {
    await deleteFollowers(username);
    loadSaved();
    if (expandedSaved === username) setExpandedSaved(null);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-4 border-l-4 border-[var(--accent-purple)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Hedef hesabin onayli takipcilerini cek &rarr; Profillerine tikla &rarr; Manuel takip et
          <br />
          <span className="text-xs">Otomatik takip YOK - ban riski yuzunden.</span>
        </p>
      </div>

      <div className="glass-card space-y-4">
        <div>
          <label className="text-xs text-[var(--text-secondary)] block mb-1">
            Hedef Hesap
          </label>
          <input
            type="text"
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            placeholder="ornek: AnthropicAI (@ olmadan)"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Max Takipci</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="rounded"
              />
              Sadece onayli
            </label>
          </div>
        </div>

        <button
          onClick={handleFetch}
          disabled={loading || !targetUser.trim()}
          className="btn-primary w-full"
        >
          {loading ? "Cekiliyor..." : "Takipci Cek"}
        </button>
      </div>

      {error && (
        <div className="glass-card border-[var(--accent-red)]/50">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Fetch result */}
      {fetchResult && (
        <div className="glass-card">
          {/* User info */}
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 mb-3">
            <span className="font-semibold">{fetchResult.user_info.name as string}</span>
            <span className="text-sm text-[var(--accent-blue)] ml-2">@{fetchResult.user_info.username as string}</span>
            {fetchResult.user_info.is_blue_verified && (
              <span className="text-[var(--accent-blue)] ml-1">&#10003;</span>
            )}
            <div className="text-xs text-[var(--text-secondary)] mt-1">
              {(fetchResult.user_info.followers_count as number).toLocaleString()} takipci |
              {" "}{(fetchResult.user_info.following_count as number).toLocaleString()} takip
            </div>
          </div>

          <h4 className="text-sm font-semibold text-[var(--accent-green)] mb-2">
            {fetchResult.followers.length} takipci bulundu
          </h4>
          <FollowerList followers={fetchResult.followers} />
        </div>
      )}

      {/* Saved lists */}
      <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Kayitli Takipci Listeleri</h3>
      {savedLists.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">Henuz kayitli liste yok.</p>
      ) : (
        savedLists.map((sl) => (
          <div key={sl.username} className="glass-card">
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => setExpandedSaved(expandedSaved === sl.username ? null : sl.username)}
            >
              <span className="font-semibold">
                @{sl.username} — {sl.count} takipci
                <span className="text-xs text-[var(--text-secondary)] ml-2">{sl.fetched_at?.slice(0, 16)}</span>
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {expandedSaved === sl.username ? "Kapat" : "Ac"}
              </span>
            </div>
            {expandedSaved === sl.username && (
              <div className="mt-3 space-y-2">
                <FollowerList followers={sl.followers} />
                <button
                  onClick={() => handleDeleteSaved(sl.username)}
                  className="btn-secondary text-xs text-[var(--accent-red)]"
                >
                  Listeyi Sil
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
