"use client";

import { useState } from "react";

/* ── Strategy Cards Data ─────────────────────────────── */

interface Strategy {
  id: string;
  title: string;
  time: string;
  impact: string;
  icon: string;
  summary: string;
  sections: {
    heading: string;
    content: string[];
  }[];
}

const strategies: Strategy[] = [
  {
    id: "self-reply",
    title: "Self-Reply Taktigi",
    time: "2dk",
    impact: "3x engagement",
    icon: "🔄",
    summary:
      "Kendi tweet'ine reply atarak engagement'i 3x'le. X algoritmasi 'devam eden konusma' sinyali alir = Phoenix ranking boost.",
    sections: [
      {
        heading: "Neden onemli?",
        content: [
          "Self-reply = 'devam eden konusma' = daha fazla gosterim",
          "Yorum kismi dolu gorunur = social proof",
          "Her reply farkli deger ekler → okuma suresi artar",
        ],
      },
      {
        heading: "Nasil yapilir?",
        content: [
          "1. Tweet'i at, 2-3 dk bekle",
          "2. Ilk reply: Ek bilgi, baglamı genislet",
          "3. Ikinci reply: Kisisel deneyim, somut sonuc",
          "4. Son reply: CTA — soru sor veya aksiyon oner",
          "Max 3-4 reply yeterli, daha fazlasi spam algılanir",
        ],
      },
      {
        heading: "Ornekler",
        content: [
          '✗ "Cok dogru soylemis"',
          '✓ "Ana tweet: Icerik pazarlamasinda 3 yildir yaptigim en buyuk hata..."',
          '✓ "Reply 1: Bu hatayi fark ettikten sonra yaptigim degisiklik..."',
          '✓ "Reply 2: Sonuclar: [metrikler]"',
          '✓ "Reply 3: Sen de ayni hatayi yapiyor olabilirsin. Kontrol et: [CTA]"',
        ],
      },
    ],
  },
  {
    id: "quote-tweet",
    title: "Quote Tweet Gucu",
    time: "3dk",
    impact: "%40 daha fazla gosterim",
    icon: "💬",
    summary:
      "2025'te X algoritmasi quote tweet'leri %40 daha fazla gosteriyor. Kendi yorumunu eklemen 'deger katiyor' sinyali veriyor.",
    sections: [
      {
        heading: "Neden onemli?",
        content: [
          "X, quote tweet'leri 'orijinal dusunce' olarak degerlendiriyor",
          "Kendi yorumunu eklemen 'deger katiyor' sinyali",
          "Trend tweet'lere ilk 2 saatte quote at",
        ],
      },
      {
        heading: "Ipuclari",
        content: [
          "Deger ekle, sadece onaylama",
          "Niche'ine cek — kendi alanina bagla",
          "Gorsel eklersen 2x etkilesim",
          "Cesur ol ama saygili kal",
        ],
      },
      {
        heading: "Ornekler",
        content: [
          '✗ "Cok dogru soylemis"',
          '✓ "3 yildir bunu yapiyorum. Sonuc: gelirimi 4x\'ledim. Iste nasil..."',
          '✗ "Kesinlikle katiliyorum!"',
          '✓ "Bu tam olarak X firmasinin cokus sebebi. Ben oradayken sunu gordum..."',
        ],
      },
    ],
  },
  {
    id: "first-hour",
    title: "Ilk 1 Saat Kurali",
    time: "2dk",
    impact: "Tweet omru belirlenir",
    icon: "⏱️",
    summary:
      "Tweet'inin kaderi ilk 60 dakikada belirleniyor. X algoritmasi tweet'ini ilk 1 saatte test eder.",
    sections: [
      {
        heading: "Neden onemli?",
        content: [
          "Algoritma ilk 1 saatte etkilesim oranini olcer",
          "Bu oran tweet'in geri kalan omrunu belirler",
          "Tweet atip uygulamayi kapatirsan 'bu icerik onemli degil' mesaji verirsin",
        ],
      },
      {
        heading: "6 Adim",
        content: [
          "1. En aktif saatte at",
          "2. Ilk yorumu kendin at (self-reply)",
          "3. 15 dk platformda kal",
          "4. 5 dk icinde gelen yorumlara yanit ver",
          "5. 30. dk'da story'e at",
          "6. 1 saat sonunda analiz et",
        ],
      },
    ],
  },
  {
    id: "engagement-farm",
    title: "Etkilesim Ciftligi",
    time: "20dk",
    impact: "Topluluk bonusu",
    icon: "🌱",
    summary:
      "Tweet atmadan once 20 dakika baska hesaplarla etkilesime gec. Algoritma 'sadece kendi icerigini paylasan' hesaplari cezalandiriyor.",
    sections: [
      {
        heading: "Neden onemli?",
        content: [
          "Algoritma 'sadece post atan' hesaplari cezalandiriyor",
          "Once etkilesim = topluluk uyesi bonusu",
          "Niche'indeki hesaplarla etkilesim = daha iyi gosterim",
        ],
      },
      {
        heading: "Ne yapilmali?",
        content: [
          "Her tweet'ten 20 dk once niche'indeki 5-10 hesaba yorum yap",
          "Begen, kaydet, paylas",
          "Anlamli yorum yaz — 'guzel' degil, icerik ekle",
          "Sonra kendi tweet'ini at",
        ],
      },
    ],
  },
  {
    id: "optimal-length",
    title: "400-600 Karakter Kurali",
    time: "1dk",
    impact: "En iyi format",
    icon: "📏",
    summary:
      "400-600 karakter su an X'te en iyi performans gosteren format. Algoritma okuma suresini olcuyor — uzun dwell time = fazla gosterim.",
    sections: [
      {
        heading: "Neden onemli?",
        content: [
          "Algoritma okuma suresini olcuyor",
          "400+ karakter = uzun dwell time = fazla gosterim",
          "Cok kisa: yeterli bilgi yok. Cok uzun: okuma terk edilir",
        ],
      },
      {
        heading: "Ipuclari",
        content: [
          "Generator'da 'Spark' formatini sec (400-600 kar)",
          "Hook + Build + Punch yapisi kullan",
          "Quote tweet'te Spark tercih et",
          "Gorsel ekle → daha da guclenir",
          "Tek Spark bazen thread'i gecer",
        ],
      },
    ],
  },
  {
    id: "article-share",
    title: "Makale/Link Paylasimi",
    time: "3dk",
    impact: "%30 daha fazla reach",
    icon: "📎",
    summary:
      "X artik dis linkleri cezalandirmiyor! Makale paylasimlari %30 daha fazla reach aliyor.",
    sections: [
      {
        heading: "Neden onemli?",
        content: [
          "Elon'un guncellemesiyle X kaliteli makale paylarimlarini odullendiriyor",
          "'Read more' tiklamalari guclu sinyal",
          "Newsletter'lar da sayılır",
        ],
      },
      {
        heading: "Ipuclari",
        content: [
          "Okumadan paylasma — ozet cikar",
          "1-2 key insight ver",
          "Kendi deneyimini ekle",
          "Guncel konular daha iyi performans gosterir",
        ],
      },
    ],
  },
  {
    id: "posting-strategy",
    title: "Paylasim Stratejisi",
    time: "Gunluk",
    impact: "Tutarli buyume",
    icon: "📅",
    summary:
      "Gunde 2-4 tweet ideal siklik. Sabah kisa format, aksam uzun format. Ayni konuyu farkli acilardan isle.",
    sections: [
      {
        heading: "Gunluk Plan",
        content: [
          "Gunde 2-4 tweet — daha fazlasi spam algilanabilir",
          "Sabah: Kisa format (Punch) ile gune basla",
          "Aksam: Uzun format (Storm/Thunder) paylas",
          "Ayni konuyu farkli acilardan isle — AI her seferinde farkli icerik uretir",
        ],
      },
      {
        heading: "Format Stratejisi",
        content: [
          "Thread formati takipci kazanimi icin en etkili",
          "Bilgi veren seriler ilgi gorur",
          "Hashtag kullanma — algoritma dogal kelimeleri tercih ediyor",
          "External linkleri 1. reply'a koy (link penalty'den kac)",
        ],
      },
    ],
  },
  {
    id: "prompt-tips",
    title: "Iyi Prompt Nasil Yazilir?",
    time: "1dk",
    impact: "Daha iyi output",
    icon: "✨",
    summary:
      "Prompt ne kadar spesifik olursa, cikti o kadar iyi olur. AI'a sadece konu degil, bakis acisi ve ton da verin.",
    sections: [
      {
        heading: "Zayif vs Iyi Prompt",
        content: [
          '✗ "yapay zeka hakkinda yaz" — Cok genis, AI ne acidan yazmali bilemez',
          '✓ "claude mars\'ta rover kullanmaya basladi, bu ne anlama geliyor insanlik icin" — Spesifik olay + bakis acisi',
          '✓ "bill gates da vinci\'nin defterini neden satin aldi, bilginin sahipligi uzerine bir hikaye" — Ozel olay + felsefi aci',
        ],
      },
      {
        heading: "Ipuclari",
        content: [
          "Genel konular yerine spesifik olaylar, rakamlar veya isimler kullanin",
          '"... hakkinda viral bir hikaye yaz" seklinde ton belirtin',
          "Turkce veya Ingilizce yazin — AI dilinizi otomatik algilar",
          "Link yapistirdiginizda prompt yazmaniza gerek yok — AI icerigi kendisi cikarir",
        ],
      },
    ],
  },
  {
    id: "link-generation",
    title: "Link ile Uretim",
    time: "1dk",
    impact: "Otomatik icerik",
    icon: "🔗",
    summary:
      "Apex Mode'a link yapistirdiginizda prompt yazmaniza gerek yok. AI linki otomatik algilar.",
    sections: [
      {
        heading: "Desteklenen Link Turleri",
        content: [
          "Tweet Linki: AI tweeti okur, arkasindaki baglami arastirir",
          "Web URL: Blog, haber veya herhangi bir sayfa. AI icerigi ceker ve yorumlar",
          "ArXiv / Akademik: Makaleyi herkesin anlayacagi dile cevirir",
        ],
      },
      {
        heading: "Nasil Kullanilir?",
        content: [
          "Arastirmali Quote tab'ina git",
          "Linki yapistir — otomatik cekilir",
          "Arastirma tamamlaninca tweet uretilir",
          "Stil ve format secebilirsin",
        ],
      },
    ],
  },
];

/* ── Component ────────────────────────────────────────── */

export default function StratejiPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">X Strateji Rehberi</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          X algoritmasini anla, etkilesimini katla
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card text-center py-3">
          <div className="text-lg font-bold text-[var(--accent-green)]">3x</div>
          <div className="text-xs text-[var(--text-secondary)]">Self-Reply Boost</div>
        </div>
        <div className="glass-card text-center py-3">
          <div className="text-lg font-bold text-[var(--accent-cyan)]">%40</div>
          <div className="text-xs text-[var(--text-secondary)]">Quote Tweet Artisi</div>
        </div>
        <div className="glass-card text-center py-3">
          <div className="text-lg font-bold text-[var(--accent-amber)]">400-600</div>
          <div className="text-xs text-[var(--text-secondary)]">Ideal Karakter</div>
        </div>
      </div>

      {/* Strategy Cards */}
      <div className="space-y-3">
        {strategies.map((s) => {
          const isOpen = expandedId === s.id;
          return (
            <div
              key={s.id}
              className="glass-card cursor-pointer"
              onClick={() => toggle(s.id)}
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <span className="text-2xl">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {s.title}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                      {s.time}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)]">
                      {s.impact}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {s.summary}
                  </p>
                </div>
                <span className="text-[var(--text-secondary)] text-sm mt-1">
                  {isOpen ? "▾" : "▸"}
                </span>
              </div>

              {/* Expanded content */}
              {isOpen && (
                <div
                  className="mt-4 space-y-4 border-t border-[var(--border)] pt-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.sections.map((sec, idx) => (
                    <div key={idx}>
                      <h4 className="text-xs font-semibold text-[var(--accent-cyan)] mb-2">
                        {sec.heading}
                      </h4>
                      <ul className="space-y-1">
                        {sec.content.map((item, i) => (
                          <li
                            key={i}
                            className={`text-xs ${
                              item.startsWith("✗")
                                ? "text-[var(--accent-red)]"
                                : item.startsWith("✓")
                                  ? "text-[var(--accent-green)]"
                                  : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {item.startsWith("✗") || item.startsWith("✓") ? (
                              item
                            ) : (
                              <span>• {item}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="glass-card text-center border-[var(--accent-blue)]/30">
        <p className="text-sm text-[var(--text-primary)] font-medium">
          Bu stratejileri uygulamak icin
        </p>
        <div className="flex gap-3 justify-center mt-3 flex-wrap">
          <a href="/yaz" className="btn-primary text-sm py-2 px-4">
            Tweet Yaz
          </a>
          <a href="/yaz?tab=selfreply" className="btn-secondary text-sm py-2 px-4">
            Self-Reply At
          </a>
          <a href="/takvim" className="btn-secondary text-sm py-2 px-4">
            Takvimi Gor
          </a>
        </div>
      </div>
    </div>
  );
}
