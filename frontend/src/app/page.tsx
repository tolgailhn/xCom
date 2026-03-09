"use client";

import { useEffect, useState } from "react";
import StatBox from "@/components/StatBox";
import ScheduleCard from "@/components/ScheduleCard";
import ActionCard from "@/components/ActionCard";
import { getDashboardStats } from "@/lib/api";

interface DashboardData {
  today_posts: number;
  total_drafts: number;
  week_posts: number;
  has_twitter: boolean;
  has_ai: boolean;
  slots: { time: string; icon: string; posted: boolean }[];
  next_slot: string | null;
  recent_posts: {
    text: string;
    url: string;
    posted_at: string;
    style: string;
  }[];
}

function HowToUse() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-[var(--accent-blue)] hover:underline"
      >
        {open ? "▾ Nasil Kullanilir?" : "▸ Nasil Kullanilir?"}
      </button>
      {open && (
        <div className="glass-card mt-2 text-sm space-y-3">
          <div>
            <h4 className="font-semibold">1. API Anahtarlarini Ayarla</h4>
            <p className="text-xs text-[var(--text-secondary)]">
              <a href="/ayarlar" className="text-[var(--accent-blue)] hover:underline">Ayarlar</a> sayfasindan AI API anahtarini (MiniMax, Anthropic veya OpenAI) ve X cerezlerini girin.
            </p>
          </div>
          <div>
            <h4 className="font-semibold">2. Tweet / Icerik Yaz</h4>
            <p className="text-xs text-[var(--text-secondary)]">
              <a href="/yaz" className="text-[var(--accent-blue)] hover:underline">Yaz</a> veya <a href="/icerik" className="text-[var(--accent-blue)] hover:underline">Icerik</a> sayfasindan konu girin, tarzi secin, AI uretsin. Begendiyseniz paylasin.
            </p>
          </div>
          <div>
            <h4 className="font-semibold">3. Tweet Analizi</h4>
            <p className="text-xs text-[var(--text-secondary)]">
              <a href="/analiz" className="text-[var(--accent-blue)] hover:underline">Analiz</a> sayfasindan hesap tweet'lerini analiz edin. AI bu verilerle daha iyi tweet yazar.
            </p>
          </div>
          <div>
            <h4 className="font-semibold">4. Takipci Kesfi</h4>
            <p className="text-xs text-[var(--text-secondary)]">
              <a href="/analiz" className="text-[var(--accent-blue)] hover:underline">Analiz &gt; Takipci Kesfi</a> tab'indan nisinizdeki hesaplarin takipcilerini kesfedin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardStats()
      .then((d) => setData(d as DashboardData))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-secondary)]">Yukleniyor...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-[var(--text-secondary)]">
            Backend baglantisi kurulamadi. FastAPI sunucusunun calistigindan emin olun.
          </p>
          <p className="text-xs text-[var(--accent-red)] mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const apiStatus = data.has_twitter && data.has_ai ? "Aktif" : "Kurulum Gerekli";
  const apiColor =
    data.has_twitter && data.has_ai
      ? "var(--accent-green)"
      : "var(--accent-amber)";

  return (
    <div className="max-w-6xl mx-auto space-y-8 mt-4 md:mt-0">
      {/* Hero */}
      <div className="text-center py-8">
        <div className="text-5xl mb-3">🤖</div>
        <h1 className="text-3xl font-bold gradient-text">X AI Otomasyon</h1>
        <p className="text-[var(--text-secondary)] mt-2">
          Yaz &middot; Uret &middot; Paylas
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox value={`${data.today_posts}/4`} label="Bugun" />
        <StatBox value={String(data.total_drafts)} label="Taslak" />
        <StatBox value={`${data.week_posts}/28`} label="Bu Hafta" />
        <StatBox value={apiStatus} label="API" color={apiColor} />
      </div>

      {/* Schedule */}
      <ScheduleCard
        slots={data.slots}
        nextSlot={data.next_slot}
        todayPosts={data.today_posts}
      />

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Hizli Islemler</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <ActionCard
            href="/yaz"
            icon="✍️"
            title="Tweet Yaz"
            description="AI ile dogal tweet uret"
          />
          <ActionCard
            href="/icerik"
            icon="💡"
            title="Icerik Uret"
            description="Konu kesfet, uzun icerik yaz"
          />
          <ActionCard
            href="/analiz"
            icon="📊"
            title="Tweet Analizi"
            description="Analiz et, AI'yi egit"
          />
          <ActionCard
            href="/takvim"
            icon="📅"
            title="Takvim"
            description="Gunluk posting takvimi"
          />
          <ActionCard
            href="/ayarlar"
            icon="⚙️"
            title="Ayarlar"
            description="API ve yazim tarzi"
          />
        </div>
      </div>

      {/* Recent Posts */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Son Aktiviteler</h3>
          <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-3 py-1 rounded-full">
            {data.recent_posts.length} toplam
          </span>
        </div>

        {data.recent_posts.length > 0 ? (
          <div className="space-y-1">
            {data.recent_posts.map((post, i) => (
              <div key={i} className="activity-item">
                <div className="activity-dot" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">
                    {post.text}
                  </p>
                  <div className="flex gap-3 mt-1">
                    {post.posted_at && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {post.posted_at.slice(0, 16)}
                      </span>
                    )}
                    {post.style && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {post.style}
                      </span>
                    )}
                    {post.url && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--accent-blue)] hover:underline"
                      >
                        Goruntule →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card text-center py-12">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-[var(--text-secondary)]">
              Henuz paylasim yapilmamis.
              <br />
              <strong>Yaz</strong> sayfasindan baslayarak ilk tweet&apos;ini
              olustur!
            </p>
          </div>
        )}
      </div>

      {/* How to Use Guide */}
      <HowToUse />

      {/* Setup warning */}
      {(!data.has_twitter || !data.has_ai) && (
        <div className="glass-card border-[var(--accent-amber)]/50 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-sm text-[var(--accent-amber)] font-semibold">
              API anahtarlari yapilandirilmamis
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {!data.has_ai && "AI API anahtari (MiniMax, Anthropic veya OpenAI) gerekli. "}
              {!data.has_twitter && "Twitter Bearer Token gerekli. "}
              <a
                href="/ayarlar"
                className="text-[var(--accent-blue)] hover:underline"
              >
                Ayarlar sayfasina git →
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
