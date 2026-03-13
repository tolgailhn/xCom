# CLAUDE.md — Proje Kuralları ve Sistem Belleği

## Geliştirme Süreci

1. **Herhangi bir kod yazmadan önce yaklaşımını açıkla ve onay bekle.** Doğrudan implementasyona geçme, önce planı sun.
2. **Önce açıklayıcı sorular sor.** Belirsiz veya eksik noktaları netleştirmeden kodlamaya başlama.
3. **Kod yazmayı bitirdikten sonra, olası edge case'leri listele ve bunları kapsayacak test senaryoları öner.**
4. **Bir görev 3'ten fazla dosyada değişiklik gerektiriyorsa, dur ve önce daha küçük görevlere böl.** Her alt görevi ayrı ayrı onayla.
5. **Bir hata olduğunda, öncelikle hatayı yeniden oluşturacak bir test yaz, ardından test başarılı olana kadar hatayı düzelt.**
6. **Her düzeltme yaptığında, neyi yanlış yaptığını düşün ve aynı hatayı bir daha asla yapmamak için bir plan geliştir.**
8. **Her git push'tan sonra kullanıcıya sunucuda `git pull` yapması gerektiğini hatırlat.** Kod GitHub'a yazılıyor, sunucuya otomatik yansımıyor.
9. **Her push'tan sonra hangi servislerin yeniden başlatılması gerektiğini MUTLAKA söyle.** Kullanıcıya sormadan, değişen dosyalara göre adım adım talimat ver:
   - **Frontend dosyası değiştiyse** (`.tsx`, `.ts`, `.css`, `next.config.ts`): Frontend yeniden başlatılmalı:
     ```powershell
     # Frontend terminalinde Ctrl+C ile durdur, sonra:
     cd C:\Users\Administrator\xCom\frontend
     Remove-Item -Recurse -Force .next
     npm run dev -- --hostname 0.0.0.0 --port 3000
     ```
   - **Backend dosyası değiştiyse** (`.py`): Backend `--reload` ile çalışıyorsa otomatik algılar, yeniden başlatmaya gerek yok. Ama yeni paket eklendiyse `pip install -r requirements.txt` gerekir.
   - **Her ikisi de değiştiyse**: Önce backend kontrol, sonra frontend yeniden başlat.
   - Bu talimatları HER SEFERINDE ver, kullanıcı sormasını BEKLEME.
7. **Bu dosyayı her önemli değişiklikten sonra güncelle.** Yeni kararlar, mimari değişiklikler, bilinen sorunlar buraya yazılmalı.
10. **Her sayfa page.tsx + ayrı Tab dosyaları yapısında.** Yeni özellik eklerken ilgili Tab dosyasını düzenle, page.tsx'e büyük kod bloğu ekleme.
11. **CLAUDE.md ZORUNLU GÜNCELLEME KURALI — Her push'tan ÖNCE bu dosyayı güncelle:**
    - Yeni dosya eklendiyse → Dosya Yapısı bölümüne ekle (hangi dosya, ne işe yarar, nereye bağlı)
    - Dosya silindiyse veya kullanılmaz hale geldiyse → `[KULLANILMIYOR]` işaretle veya kaldır
    - Dosya adı/rolü değiştiyse → Açıklamasını güncelle
    - Yeni bağımlılık eklendiyse → Modüller Arası Bağımlılıklar bölümüne ekle
    - Mimari karar alındıysa → Önemli Kararlar tablosuna ekle
    - Bilinen sorun çözüldüyse veya yeni sorun bulunduysa → Bilinen Sorunlar bölümünü güncelle
    - **Amaç**: Bir sonraki session'da hangi dosyanın ne işe yaradığı, hangisinin aktif hangisinin eski olduğu HER ZAMAN bilinmeli. Yanlış dosyayı düzenlemek zaman kaybı.

---

## Sistem Mimarisi

### Proje Nedir?
X (Twitter) AI Otomasyon Dashboard — AI gelişmelerini tarayıp, araştırıp, doğal tweet üreten Next.js + FastAPI uygulaması.

### Dosya Yapısı
```
frontend/src/app/
  page.tsx                    → Dashboard (ana sayfa)
  layout.tsx                  → Ana layout
  login/page.tsx              → Giriş sayfası
  yaz/                        → Tweet yazma
    page.tsx                  → Ana sayfa (tab yönetimi)
    TabQuoteTweet.tsx         → Quote tweet tab
    TabQuickReply.tsx         → Hızlı yanıt tab
    TabLinkReply.tsx          → Link reply tab
    TabSelfReply.tsx          → Self-reply tab
  otomatik-yanit/             → Otomatik yanıt yönetimi
    page.tsx                  → Ana sayfa (4 tab)
    TabConfig.tsx             → Yapılandırma
    TabLogs.tsx               → Loglar (filtre, arama, bulk actions)
    TabSelfReply.tsx          → Self-reply ayarları
    TabAnalytics.tsx          → Analitik (ısı haritası, performans)
  kesif/                      → Keşif & tarama
    page.tsx                  → Ana sayfa (5 tab) + scheduler durum paneli
    TabTweets.tsx             → Tweet listesi + araştırma + quote tweet
    TabTrends.tsx             → Trend analizi + araştırma + tweet üretimi + zamanlama
    TabAIOnerileri.tsx        → AI Önerileri — birleşik feed (küme+trend+tweet) ← ANA TAB (dismiss localStorage kalıcı)
    TabSuggestedAccounts.tsx  → Hesap önerileri + aktif X araması
    TabAyarlar.tsx            → Keşif ayarları
  analiz/                     → Hesap analizi
    page.tsx                  → Ana sayfa (6 tab)
    TabNew.tsx                → Yeni analiz
    TabSaved.tsx              → Kayıtlı analizler
    TabFollowers.tsx          → Takipçi keşfi
    TabPool.tsx               → Tweet havuzu
    TabExport.tsx             → Export/Import
    TabMyTweets.tsx           → Kullanıcı tweetleri (Tweetlerim) — keşif'ten taşındı
    AnalysisDisplay.tsx       → Analiz görüntüleme component
  ayarlar/                    → API anahtarları ve ayarlar
    page.tsx                  → Ana sayfa (5 tab)
    TabAPIKeys.tsx            → API anahtarları
    TabAccountInfo.tsx        → Hesap bilgisi
    TabMonitoredAccounts.tsx  → İzlenen hesaplar
    TabWritingStyle.tsx       → Yazım tarzı eğitimi
    TabHistory.tsx            → Paylaşım geçmişi
  icerik/                     → Uzun içerik üretimi
    page.tsx                  → Ana sayfa (2 tab)
    TabDiscover.tsx           → Konu keşfet
    TabGenerate.tsx           → İçerik üret
    shared.tsx                → Ortak fonksiyonlar
  takvim/page.tsx             → Günlük posting takvimi, performans
  taslaklarim/page.tsx        → Taslak yönetimi
  strateji/page.tsx           → Strateji rehberi

frontend/src/components/      → Paylaşılan UI bileşenleri
  AppShell.tsx                → Ana layout shell (sidebar + content)
  Sidebar.tsx                 → Sol menü navigasyonu
  ActionCard.tsx              → Aksiyon kartı component
  StatBox.tsx                 → İstatistik kutusu component
  ScheduleCard.tsx            → Zamanlama kartı component
  ui/                         → Genel UI bileşenleri
    ErrorMessage.tsx          → Hata mesajı gösterimi
    LoadingButton.tsx         → Yükleniyor durumlu buton
    ProviderSelector.tsx      → AI provider seçici (MiniMax/Claude/GPT)
    ScoreBar.tsx              → Kalite skoru çubuğu
    SelectInput.tsx           → Özel select input
    ToggleSwitch.tsx          → Toggle switch component
  discovery/                  → Keşif sayfası paylaşılan bileşenleri
    index.ts                  → Barrel export (tüm discovery componentleri)
    helpers.ts                → Yardımcı fonksiyonlar (openInX, timeAgo, formatNumber vb.)
    AIScoreBadge.tsx          → AI skor rozeti
    CircularGauge.tsx         → Dairesel gauge (engagement potansiyeli)
    StyleFormatBar.tsx        → Stil/format/provider seçici bar
    ResearchPanel.tsx         → Araştırma sonuçları paneli
    GenerationPanel.tsx       → Tweet üretim paneli (düzenleme + X'te Aç + paylaş)
    MediaSection.tsx          → Medya arama/infografik bölümü
    LinksBox.tsx              → Bağlantılar kutusu

frontend/src/lib/             → Paylaşılan kütüphaneler
  api.ts                      → Tüm backend API çağrıları (tek dosya, ~tüm endpointler)
  auth.tsx                    → Kimlik doğrulama context + hook

backend/
  main.py                     → FastAPI app, startup/shutdown, router kaydı
  config.py                   → Konfigürasyon
  scheduler_worker.py         → APScheduler: zamanlı post + metrik güncelleme
  auto_reply_worker.py        → Otomatik yanıt worker
  self_reply_worker.py        → Self-reply worker
  discovery_worker.py         → Keşif worker
  telegram_bot.py             → Telegram bot
  api/
    scanner.py                → Tarama endpoint'leri
    generator.py              → Tweet/içerik üretim endpoint'leri
    analytics.py              → Analiz endpoint'leri
    settings.py               → Ayarlar endpoint'leri
    calendar.py               → Takvim + checklist endpoint'leri
    discovery.py              → Keşif endpoint'leri
    auto_reply.py             → Otomatik yanıt endpoint'leri
    self_reply.py             → Self-reply endpoint'leri
    publish.py                → Tweet paylaşım endpoint'leri
    scheduler.py              → Zamanlama endpoint'leri
    performance.py            → Performans takip endpoint'leri
    dashboard.py              → Dashboard endpoint'leri
    drafts.py                 → Taslak endpoint'leri
    auth.py                   → Kimlik doğrulama
    helpers.py                → Yardımcı fonksiyonlar
  modules/
    constants.py              → Engagement ağırlıkları (tek kaynak), sabitler
    content_generator.py      → ContentGenerator, tweet/thread üretimi
    deep_research.py          → DDG arama + makale çekme + agentic research
    tweet_analyzer.py         → Hesap tweet analizi, stil DNA çıkarma
    tweet_publisher.py        → Tweet/thread/quote tweet paylaşma
    twikit_client.py          → Ücretsiz Twitter arama (cookie)
    grok_client.py            → Grok xAI API: X/web arama, otonom araştırma
    telegram_notifier.py      → Telegram bildirim gönderici
    style_manager.py          → JSON dosya yöneticisi (taslaklar, geçmiş, metrikler)
    media_finder.py           → Görsel/video arama: X + DuckDuckGo
    tweet_pool.py             → Tweet havuzu: çoklu hesap, akıllı seçim
    image_generator.py        → Görsel üretimi
    claude_code_client.py     → Claude Code entegrasyonu
    _compat.py                → Uyumluluk katmanı
```

### Modüller Arası Bağımlılıklar
```
Frontend (Next.js) → Backend (FastAPI) HTTP API
Her sayfa page.tsx → kendi Tab*.tsx dosyaları (tab-per-file pattern)
icerik/ → shared.tsx (ortak fonksiyonlar)
Tüm Tab*.tsx dosyaları → components/discovery/* (paylaşılan UI: GenerationPanel, ResearchPanel vb.)
Tüm Tab*.tsx dosyaları → lib/api.ts (backend API çağrıları)
kesif/TabAIOnerileri.tsx → suggestions + trends + discovery tweets (3 kaynak birleşik feed)
kesif/page.tsx → TabTweets, TabTrends, TabAIOnerileri, TabSuggestedAccounts, TabAyarlar
analiz/page.tsx → TabNew, TabSaved, TabFollowers, TabPool, TabExport, TabMyTweets

Backend API → modules (iş mantığı):
  scanner.py → twitter_scanner, twikit_client, grok_client
  generator.py → content_generator, deep_research, media_finder, style_manager
  analytics.py → tweet_analyzer, tweet_pool, style_manager
  publish.py → tweet_publisher
  auto_reply.py → auto_reply_worker
  discovery.py → discovery_worker

Modules arası:
  twitter_scanner → twikit_client (ücretsiz arama)
  deep_research → DDG + BeautifulSoup (web arama/makale çekme)
  grok_client → OpenAI SDK (xAI base_url ile)
  content_generator → anthropic / openai SDK (+ vision desteği)
  media_finder → twikit_client + duckduckgo_search
  tweet_pool → tweet_analyzer (engagement hesaplama)
  constants.py → tweet_analyzer, twitter_scanner, auto_reply_worker, discovery_worker
```

### AI Provider Sıralaması
MiniMax (öncelikli) → Anthropic Claude → OpenAI GPT. `get_ai_client()` bu sırayla kontrol eder.

### Engagement Score Ağırlıkları (X 2026 Phoenix Algorithm)
**Tek kaynak: `backend/modules/constants.py` → `ENGAGEMENT_WEIGHTS` dict**
- Conversation (reply + yazar geri reply) = 75x (toplam 150x like!)  ← EN ÖNEMLİ
- RT = 20x, Reply = 13.5x, Profile Visit = 12x, Bookmark = 10x
- Dwell Time (2+ dk okuma) = 10x, Like = 0.5x (baseline)
- Report = -369x (felaket)
- **Kullanan dosyalar**: tweet_analyzer.py, twitter_scanner.py, auto_reply_worker.py, discovery_worker.py
- `content_generator.py` system prompt'ta da bu ağırlıkları referans eder

### X 2026 Algoritma Kritik Bulguları
1. **Conversation multiplier EN ÖNEMLİ sinyal** — Reply atıp geri reply alınca = 150x like
2. **Premium zorunlu gibi** — Premium hesaplar 10-15x daha fazla erişim
3. **İlk 30-60 dakika kritik** — Erken engagement dağılımı belirliyor
4. **Harici link'ler %50-90 erişim düşürüyor** — Link'i reply'a koy
5. **Thread'ler 3x daha fazla toplam engagement** — Optimum 4-8 tweet
6. **Hashtag'ler gereksiz** — Grok semantik anlıyor, ilk 100 karakterde keyword önemli
7. **Negatif ton cezalandırılıyor** — Grok sentiment analizi yapıyor
8. **Community postları For You'da görünüyor** (Şubat 2026'dan beri)
9. **Asimetrik saatler** — :07, :22, :43 gibi saatlerde paylaş (botlardan ayrışma)

### Arama Motoru: DuckDuckGo
- `deep_research.py` paralel arama kullanır (ThreadPoolExecutor, 4 worker)
- Rate limit koruması: 0.3s delay, 0.15s stagger
- Fallback zinciri: `day → week → month → all-time`
- Makale çekme: paralel, max 5 makale, 15sn timeout, retry mekanizması

### Arama Motoru: Grok (xAI)
- `grok_client.py` xAI Responses API kullanır
- Server-side tools: `x_search`, `web_search` (ücretsiz)
- Model: `grok-4-1-fast`
- Cost tracking: session state'te birikir, sidebar'dan sıfırlanabilir

---

## Önemli Kararlar ve Nedenler

| Tarih | Karar | Neden |
|-------|-------|-------|
| 2026-03-04 | Auto-update varsayılan KAPALI (`ENABLE_AUTO_UPDATE` env) | Her oturumda `git pull` + `pip install` çalışması app lock riski |
| 2026-03-04 | DuckDuckGo paralel arama (ThreadPoolExecutor) | 9 sıralı arama ~15sn → paralel ~4sn |
| 2026-03-04 | Engagement weights X algorithm ile uyumlu | Scanner ve Analyzer farklı ağırlık kullanıyordu, tutarsız sıralama |
| 2026-03-04 | Grok regex non-greedy (`.*?`) | Greedy `.*` birden fazla JSON array'i varsa yanlış parse ediyordu |
| 2026-03-04 | `_DEFAULT_AI_ACCOUNTS_LOWER` frozenset | Her `calculate_relevance()` çağrısında list comprehension yerine O(1) lookup |
| 2026-03-04 | Page 6 `x_scanner` → `twitter_scanner` | `x_scanner` modülü hiç yoktu, yarım kalmış refactoring |
| 2026-03-04 | Görsel arama: varsayılan X, opsiyonel Web | X görselleri daha alakalı, DuckDuckGo ek seçenek |
| 2026-03-04 | Vision: MiniMax → Claude/OpenAI fallback | MiniMax vision desteklemiyor, görsel analizi için otomatik fallback |
| 2026-03-04 | media_urls araştırma akışında korunuyor | Daha önce AITopic→ResearchResult dönüşümünde kayboluyordu |
| 2026-03-05 | sniffio cvar wrapper (`_ensure_sniffio_asyncio`) | httpcore→sniffio `run_coroutine_threadsafe` task'larında async library algılayamıyor → wrapper cvar set eder |
| 2026-03-05 | Transport hataları re-auth tetiklemiyor | `weak reference`/`async library` hataları auth değil transport sorunu, re-auth aynı hatayı tekrarlıyordu |
| 2026-03-11 | Engagement weights → `constants.py` tek kaynak | 4+ yerde tanımlı tutarsız ağırlıklar tek dosyaya taşındı |
| 2026-03-11 | 2026 Phoenix Algorithm ağırlıkları | Conversation 75x (150x toplam), Dwell 10x, Like 0.5x eklendi |
| 2026-03-11 | Checklist 8 maddeye güncellendi | Community posting, reply-back, asimetrik saat eklendi |
| 2026-03-11 | Generator API provider eksikleri düzeltildi | icerik + yaz sayfalarında 4 tab'da provider dropdown eksikti |
| 2026-03-11 | `min_faves` operatörü kaldırıldı | Twikit (ücretsiz arama) bu operatörü desteklemiyor → 400 Bad Request. Client-side filtreleme zaten mevcut |
| 2026-03-11 | MiniMax `<tool_call>` ve `<think>` tag temizliği | MiniMax bazen tool_call/think tag'leri döndürüyor, 3 yerde regex ile temizleniyor |
| 2026-03-13 | Discovery 24 saat zaman filtresi | 7 günlük tweet saklama → 24 saat (güncel AI haberleri kaçırılmasın) |
| 2026-03-13 | TabSmartSuggestions silindi | TabAIOnerileri superset, duplicate tab gereksizdi |
| 2026-03-13 | TabMyTweets → analiz sayfası | Semantik olarak keşif değil analiz; keşif 6→5 tab, analiz 5→6 tab |
| 2026-03-13 | Dismiss localStorage kalıcılığı | Sayfa yenilenince dismiss edilen öğeler geri gelmez |
| 2026-03-13 | Duplicate kod temizliği (5 dosya) | timeAgo, gauge, formatNumber → shared components/discovery |
| 2026-03-13 | `_enforce_lowercase()` post-processing | Tüm tweet üretimlerinde küçük harf zorlaması — prompt'lara güvenmek yetersizdi |
| 2026-03-13 | Stil öncelik hiyerarşisi düzeltildi | DNA önceliği → Stil önceliği. Stil kuralları (yapı, ton, yaklaşım) DNA'dan önce gelir. 14 stildeki SES KAYNAGI + build_training_context DNA tanımı + fallback metni güncellendi |
| 2026-03-13 | Değer katma zorunluluğu | Her tweet'te kişisel görüş/analiz ZORUNLU. Sadece haber aktarımı YASAK |
| 2026-03-13 | Dinamik sorgu üretimi (haftalık) | 11 statik sorgu yerine AI ile trend-uyumlu yeni sorgular ekleniyor |
| 2026-03-13 | Breaking news algılama | 2 saat içinde 3+ hesaptan aynı konu → Telegram breaking bildirimi |
| 2026-03-13 | Kapsamlı hesap keşfi sistemi | 4 strateji (cache/grok/trend/interaction) + AI analiz + zengin UI |
| 2026-03-13 | `search-accounts` bug fix | `get_twikit_client` import hatası düzeltildi (fonksiyon yoktu) |

---

## Bilinen Sorunlar / Teknik Borç

### Aktif Sorunlar
- [x] **Engagement weights 4+ yerde tanımlı** → `constants.py` tek kaynağa taşındı (2026-03-11)
- [x] **Yazım stili büyük harf sorunu** → `_enforce_lowercase()` post-processing eklendi + tüm prompt'lar güncellendi (2026-03-13)
- [x] **Stil kuralları DNA tarafından eziliyordu** → Öncelik hiyerarşisi düzeltildi, stil kuralları artık DNA'dan önce (2026-03-13)
- [x] **Tweet'ler haber aktarımı gibi kalıyordu** → Değer katma zorunluluğu + scoring bonusu eklendi (2026-03-13)
- [x] **Keşif statik sorgular** → Dinamik sorgu üretimi + breaking news algılama eklendi (2026-03-13)
- [ ] **Kategori tanımları 2 yerde**: `twitter_scanner.py:CATEGORY_KEYWORDS` ve `telegram_notifier.py`. Tek kaynağa taşınabilir.
- [ ] **Hardcoded config**: Account listesi, API limitleri, timeout'lar ayrı bir `config.py`'ye taşınabilir.
- [ ] **Test eksikliği**: Hiçbir modülde unit test yok.
- [ ] **Session state bellek**: Grok cost ve scan sonuçları sınırsız birikebilir (cost reset eklendi ama scan cache'i hâlâ sınırsız).
- [ ] **content_generator.py** çok büyük (~1900+ satır): bölünebilir.

### Çözülmüş Sorunlar (Referans)
- [x] Page 6 `x_scanner` import hatası (2026-03-04)
- [x] Auto-update her oturumda çalışması (2026-03-04)
- [x] Engagement weights tutarsızlığı (2026-03-04)
- [x] `deep_research.py` article KeyError (2026-03-04)
- [x] `grok_client.py` greedy regex (2026-03-04)
- [x] Telegram eksik kategoriler (2026-03-04)
- [x] `twikit_client.py` datetime parse (2026-03-04)
- [x] DuckDuckGo paralel arama + sağlamlık (2026-03-04)
- [x] sniffio AsyncLibraryNotFoundError — background loop'ta httpcore sniffio cvar göremiyordu (2026-03-05)
- [x] "weak reference to NoneType" — transport hataları gereksiz re-auth tetikliyordu (2026-03-05)

---

## SUNUCU KURULUM VE GUNLUK KULLANIM REHBERI

### ADIM 1: Sunucuda Kodu Guncelle
Her degisiklikten sonra sunucuya baglanip kodu cek:
```powershell
cd C:\Users\Administrator\xCom
git pull origin claude/fix-generator-api-endpoints-Oi1Pa
```

### ADIM 2: Backend Baslat
```powershell
cd C:\Users\Administrator\xCom\backend
pip install -r ..\requirements.txt   # sadece ilk sefer veya yeni paket eklendiginde
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Backend http://localhost:8000 adresinde calisir. `--reload` ile dosya degisikliklerini otomatik algilar.

### ADIM 3: Frontend Baslat
```powershell
cd C:\Users\Administrator\xCom\frontend
npm install         # sadece ilk sefer veya yeni paket eklendiginde
Remove-Item -Recurse -Force .next        # stale cache temizligi (hata alirsan yap)
npm run dev -- --hostname 0.0.0.0 --port 3000
```
Frontend http://sunucu-ip:3000 adresinde calisir.

### ADIM 4: Ilk Kurulumda API Anahtarlarini Gir
Tarayicidan `http://sunucu-ip:3000/ayarlar` sayfasina git ve sirayla:
1. **Twitter API** - API Key, API Secret, Access Token, Access Secret
2. **Twikit Cookie** - Twitter cookie (ucretsiz arama icin)
3. **AI Anahtarlari** - MiniMax / Anthropic (Claude) / OpenAI anahtarindan en az birini gir
4. **Grok (xAI)** - Opsiyonel: X arama ve web arama icin xAI API key
5. **Telegram** - Opsiyonel: Bot token + Chat ID (bildirim icin)
6. Her anahtari girdikten sonra "Test" butonuna basip calistigini dogrula

### ADIM 5: Stil Egitimi Yap (Onemli!)
Ayarlar sayfasinda "Yazim Tarzi" bolumune git:
1. **Ornek Tweetler** - Kendi tarzinda yazdigin 5-10 ornek tweet ekle
2. **Persona** - Kendini 2-3 cumleyle tanimla (orn: "AI ve teknoloji uzerine yazan yazilimci")
3. Bu bilgiler tweet uretiminde kullanilir, ne kadar iyi egitirsen o kadar dogal tweet cikar

### ADIM 6: Hesap Analizi ve Tweet Havuzu (Opsiyonel ama Onerilen)
`/analiz` sayfasina git:
1. **Yeni Analiz** tab'inda begendigin 3-5 X hesabini analiz et (orn: `@kaboragames,@ai_for_success`)
2. Analizleri kaydet - stil DNA'si tweet uretiminde kullanilacak
3. **Tweet Havuzu** tab'inda bu hesaplarin tweetlerini cek - daha iyi egitim icin

---

## GUNLUK KULLANIM AKISI (ADIM ADIM)

### Her Gun Yapilacaklar

#### 1. Dashboard'u Kontrol Et (`/`)
- Gunun takvimini gor (4 post slotu)
- Hangi slotun ne zaman oldugunu kontrol et
- Eksik API anahtari uyarisi varsa tamamla

#### 2. Konu Tara (`/tara`)
- "Tara" butonuna bas - AI haberleri otomatik taranir
- Filtreler: kategori (LLM, Vision, Robotics vb.), min like/RT
- Arama motoru: DuckDuckGo (ucretsiz) veya Grok (daha kapsamli)
- **Kesfet** tab'i: AI gelismeleri, GitHub repos, trending konulari kesfet
- Ilginc bir konu buldugunda "Tweet Yaz" butonuna tikla → Yaz sayfasina gider

#### 3. Tweet Yaz (`/yaz`)
3 tab var:

**Tab 1: Tweet Yaz**
- Konu gir (veya Tara'dan gelen konu otomatik gelir)
- Stil sec (8 secenek: bilgilendirici, provoke edici, teknik, vb.)
- Format sec (6 secenek: micro tweet'ten mega thread'e)
- Arastirma modu: Standard (hizli) veya Deep (kapsamli)
- Agentic toggle: Grok ile derin arastirma
- "Uret" butonuna bas
- Uretilen tweet'i oku, begendiysen "Paylas" butonuna bas
- Kalite skoru 70+ ise iyi, 80+ mukemmel
- Gorsel/Video Bul: Tweet'e medya eklemek istersen

**Tab 2: Quote Tweet**
- Alintilamak istedigin tweet URL'sini yapistir
- Arastirma + dogrulama yapilir
- Quote tweet uretilir

**Tab 3: Hizli Reply**
- Bir tweet'e hizli yanit uret

#### 4. Uzun Icerik Uret (`/icerik`)
Thread veya uzun post icin:

**Tab 1: Konu Kesfet**
- Odak alani gir (orn: "AI agents", "LLM benchmarks")
- Konu onerileri gelir, birini sec

**Tab 2: Icerik Uret**
- 5 icerik tarzi: Deneyim, Egitici, Karsilastirma, Analiz, Hikaye
- 6 format: Micro (1 tweet) → Mega (10+ tweet thread)
- Arastirma ayarlarini sec
- "Uret" butonuna bas
- Cikan icerigi oku, paylas

#### 5. Takvimi Takip Et (`/takvim`)
- Her post sonrasi takvimde ilgili slotu kaydet
- Gunluk checklist'i tamamla (6 madde):
  - [ ] 15+ dakika timeline'da gezin, begeni/RT yapin
  - [ ] 3-5 tweet'e anlamli yanit yazip etkilesin
  - [ ] 1 quote tweet atilsin
  - [ ] Trend konularda en az 1 tweet yazilsin
  - [ ] DM'lere ve mention'lara yanit verilsin
  - [ ] En iyi performans gosteren tweet'e self-reply atilsin
- Haftalik ozeti kontrol et

#### 6. Taslak Kaydet (`/taslaklarim`)
- Simdi paylasmak istemedigin tweet'leri taslak olarak kaydet
- Daha sonra duzenle ve paylas

---

## HATA DURUMUNDA YAPILACAKLAR

### "Failed to find Server Action" Hatasi
```bash
cd /home/user/xCom/frontend
rm -rf .next
npm run dev -- --hostname 0.0.0.0 --port 3000
```

### Backend Baslamisor / Port Mesgul
```bash
lsof -i :8000          # portu kullanan process'i bul
kill -9 <PID>           # process'i kapat
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Baslamisor / Port Mesgul
```bash
lsof -i :3000
kill -9 <PID>
cd /home/user/xCom/frontend && npm run dev -- --hostname 0.0.0.0 --port 3000
```

### DuckDuckGo Rate Limit
Otomatik olarak fallback zinciri calisir (day→week→month). Cok fazla arama yaparsan 1-2 dk bekle.

### Grok 502 Bad Gateway
xAI sunucu hatasi - bizim tarafimizda yapilacak bir sey yok. Birkaç dakika sonra tekrar dene veya DuckDuckGo'ya gec.

### Cookie / Twikit Hatasi
Ayarlar sayfasindan Twikit cookie'yi yeniden gir. Cookie suresi dolmus olabilir.

---

## Değişiklik Günlüğü

### 2026-03-13 (Kapsamlı Hesap Keşfi Sistemi)
- **feat**: `account_discoverer.py` — TAM YENİDEN YAZIM: 4 keşif stratejisi (cache_based, grok_search, trend_based, interaction_based)
- **feat**: `account_discoverer.py` — `analyze_account_with_ai()`: MiniMax/Claude/OpenAI ile hesap içerik analizi (content_relevance, quality, bot_probability, category, topics)
- **feat**: `account_discoverer.py` — `discover_accounts_smart()`: Çoklu strateji ile toplu keşif
- **feat**: `account_discoverer.py` — `analyze_single_account()`: Twikit tweet çekme + AI değerlendirme
- **feat**: `api/discovery.py` — 3 yeni endpoint: `POST /analyze-account`, `POST /smart-discover`, `POST /batch-analyze`
- **fix**: `api/discovery.py` — `search-accounts` endpoint'i kırık import düzeltildi (`get_twikit_client` fonksiyonu yoktu)
- **fix**: `api/discovery.py` — `_get_twikit_client()` helper fonksiyonu eklendi (tüm hesap endpoint'leri için)
- **feat**: `api.ts` — 3 yeni API fonksiyonu: `analyzeAccount()`, `smartDiscover()`, `batchAnalyzeAccounts()`
- **feat**: `TabSuggestedAccounts.tsx` — TAM YENİDEN YAZIM: Strateji seçici, AI analiz paneli, kategori filtreleme, ScoreBar component, genişletilebilir kartlar
- **feat**: `TabSuggestedAccounts.tsx` — Arama sonuçlarında "AI Analiz" butonu (hesabı analiz edip skor gösterir)
- **feat**: `TabSuggestedAccounts.tsx` — Toplu analiz: seçilen hesapları tek tıkla analiz et
- **feat**: `TabSuggestedAccounts.tsx` — Kategori pill filtreleri (Araştırmacı, Geliştirici, Gazeteci, vb.)
- **fix**: `scheduler_worker.py` — `_discover_new_accounts()` artık `discover_accounts_smart()` kullanıyor (3 strateji)
- **fix**: `GenerationPanel.tsx` — Sonsuz re-render döngüsü düzeltildi (`setEditedText` dependency kaldırıldı)

### 2026-03-13 (Türkçe Özet Tutarlılığı)
- **fix**: `auto_topic_scanner.py` — Auto-scan tweetlerine de `summary_tr` (Türkçe özet) üretimi eklendi (daha önce hiç üretilmiyordu)
- **fix**: `trend_analyzer.py` — Eksik `summary_tr` olan tweetler için toplu AI çeviri backfill eklendi + auto_scan cache'e geri yazma
- **fix**: `api/discovery.py` — `/summarize` endpoint'i artık hem discovery hem auto_scan cache'ini kapsıyor
- **fix**: `TabTrends.tsx` — Trendler yüklendiğinde eksik Türkçe özetli tweetler için otomatik çeviri tetikleniyor

### 2026-03-13 (Tweet Kalitesi + Yazım Stili + Keşif Sistemi İyileştirme)
- **feat**: `content_generator.py` — `_enforce_lowercase()` post-processing: tüm üretimlerde küçük harf zorlaması (proper noun whitelist ile)
- **fix**: `content_generator.py` — Reply/self-reply/long-content prompt'larına eksik "küçük harfle yaz" kuralı eklendi
- **fix**: `content_generator.py` — Provider guardrails'e (MiniMax/Claude/OpenAI/Groq) lowercase kuralı eklendi
- **fix**: `content_generator.py` — Stil öncelik hiyerarşisi düzeltildi: DNA "ses kaynağı" → Stil "yapı+ton+yaklaşım kaynağı"
- **feat**: `content_generator.py` — BASE_SYSTEM_PROMPT'a "değer katma zorunluluğu" eklendi (haber aktarımı YASAK, kişisel görüş ZORUNLU)
- **feat**: `content_generator.py` — X_ALGORITHM_RULES'a 2 yeni kural: "değer kat" + "conversation hook"
- **feat**: `content_generator.py` — `score_tweet()` scoring: kişisel perspektif bonus (+4), büyük harf cezası (-3)
- **feat**: `auto_topic_scanner.py` — Dinamik sorgu üretimi: AI ile trend-uyumlu yeni arama sorguları (haftada 1)
- **feat**: `auto_topic_scanner.py` — `data/dynamic_queries.json` — dinamik sorgular kalıcı dosya
- **feat**: `trend_analyzer.py` — Breaking news algılama: 2 saat içinde 3+ hesaptan aynı konu → is_breaking flag
- **feat**: `trend_analyzer.py` — `_notify_breaking()` — Telegram breaking news bildirimi
- **feat**: `scheduler_worker.py` — `dynamic_query_generator` job eklendi (7 günde 1)
- **fix**: `content_generator.py` — 14 stildeki `SES KAYNAGI` bloğu → `STİL + DNA DENGESİ` olarak güncellendi (stil > DNA tutarlılığı)
- **fix**: `tweet_analyzer.py` — `build_training_context()` DNA tanım metni güncellendi: DNA artık "tüm tarzların temeli" değil, "ses kaynağı ve kelime paleti"
- **fix**: `content_generator.py` — DNA yokken fallback metni yeni hiyerarşiye uyumlu hale getirildi

### 2026-03-13 (Keşif Sayfası Büyük Refaktör)
- **remove**: `TabSmartSuggestions.tsx` — Silindi (TabAIOnerileri superset, duplicate)
- **move**: `TabMyTweets.tsx` — kesif/ → analiz/ sayfasına taşındı (semantik doğruluk)
- **fix**: `discovery_worker.py` — `MAX_TWEET_AGE_HOURS` 168→24 (sadece son 24 saat aktif analiz)
- **feat**: `discovery.py` — `GET /tweets` endpoint'ine `hours` query param eklendi (varsayılan 24)
- **feat**: `TabAIOnerileri.tsx` — Dismiss durumu localStorage'a kaydedilir (sayfa yenilenince kalıcı)
- **feat**: `TabAIOnerileri.tsx` — Zaman badge'i: feed öğelerinde "X saat önce" gösterilir
- **feat**: `TabTrends.tsx` — "Zamanla" butonu eklendi (schedulePost API)
- **fix**: Duplicate kod temizliği (5 dosya): timeAgo, ScoreGauge, formatFollowers, scoreColor → shared components/discovery import
- **fix**: `page.tsx` (kesif) — 6→5 tab (SmartSuggestions ve MyTweets kaldırıldı)
- **fix**: `page.tsx` (analiz) — 5→6 tab (Tweetlerim eklendi)
- **fix**: `TabSuggestedAccounts.tsx` — "Engagement" → "Etkilesim" Türkçe label

### 2026-03-12 (Keşif Sayfası Temizlik + Öneriler İyileştirme)
- **remove**: `TabNews.tsx` — Haberler tab'ı tamamen kaldırıldı (kullanıcı talebi)
- **remove**: `scheduler_worker.py` — `news_scanner` job kaldırıldı (4 saatlik haber taraması iptal)
- **remove**: `api.ts` — `getNews()`, `triggerNewsScan()` fonksiyonları kaldırıldı
- **remove**: `page.tsx` — Haberler tab'ı ve scheduler status'tan "Haber Tarama" kaldırıldı (6→5 tab)
- **feat**: `scheduler_worker.py` — `auto_content_suggester` scheduler'a eklendi (2 saatte bir otomatik kümele)
- **feat**: `page.tsx` — Scheduler status'a "Akıllı Öneriler" worker durumu eklendi
- **feat**: `TabSmartSuggestions.tsx` — TAM UI YENİDEN YAZIM: Trendler tabı gibi zengin UI
  - Öneri özeti paneli (tıklanabilir pill'ler, engagement skoru renkli)
  - Dairesel engagement gauge (SVG)
  - Tıkla-genişlet kart pattern'ı (accordion)
  - Stil/format/provider bar üst seviyeye taşındı
  - Scroll-to-card özelliği
  - Daha iyi görsel hiyerarşi ve hover animasyonları
- **verify**: Hesap keşfi Telegram bildirimi aktif ve çalışıyor (account_discoverer.py + discovery_worker.py)

### 2026-03-11 (Keşif Sayfası 10 Faz Güncelleme)
- **feat**: `scheduler_worker.py` — Worker last_run tracking + `get_scheduler_status()` fonksiyonu
- **feat**: `discovery.py` — 4 yeni endpoint: scheduler-status, score-newsvalue, smart-suggestions, search-accounts
- **feat**: `TabTrends.tsx` — TAM YENİDEN YAZIM: araştırma akışı + tweet üretimi + stil/format/provider + taslak/zamanla
- **feat**: `TabNews.tsx` — TAM YENİDEN YAZIM: araştırma + tweet üretimi + kaynak filtre + AI haber skoru
- **feat**: `TabSmartSuggestions.tsx` — YENİ: Trend/haber tabanlı akıllı tweet önerileri + engagement tahmini + önerilen saat
- **feat**: `TabSuggestedAccounts.tsx` — Aktif X hesap araması (Twikit search_user) + mevcut otomatik keşif
- **feat**: `page.tsx` — "Akıllı Öneriler" tab eklendi (6 tab), scheduler durum paneli
- **feat**: `api.ts` — 5 yeni API fonksiyonu: getSchedulerStatus, scoreNewsValue, getSmartSuggestions, generateSmartSuggestion, searchAccounts

### 2026-03-11 (min_faves Fix)
- **fix**: `scanner.py` — Tüm DISCOVER_QUERIES ve GITHUB_QUERIES'den `min_faves:XX` kaldırıldı (Twikit desteklemiyor → 400 Bad Request)
- **fix**: `deep_research.py` — Tüm X arama sorgularından `min_faves:XX` kaldırıldı (7 yer)
- Client-side engagement filtreleme zaten mevcut, arama kalitesi etkilenmez

### 2026-03-07 (Faz 1: Thread Paylaşımı)
- **fix**: `publish.py` — Twitter API credential'ları düzeltildi: cookie değerleri yerine doğru API key/secret kullanılıyor
- **feat**: `publish.py` — Thread paylaşımı tüm tweet sonuçlarını döndürüyor (`thread_results` array)
- **feat**: `yaz/page.tsx` — Thread parçaları düzenlenebilir (textarea + karakter sayacı)
- **feat**: `yaz/page.tsx` — "API ile Paylaş" butonu: backend API üzerinden tweet/thread paylaşımı
- **feat**: `yaz/page.tsx` — Thread paylaşımında her tweet'in sonucu ayrı gösteriliyor (URL + başarı/hata)
- **feat**: `yaz/page.tsx` — Quote Tweet tab'ında da API publish eklendi
- **feat**: `api.ts` — `PublishResult` tipi eklendi (`thread_results` desteği)

### 2026-03-07 (Faz 2A: Scheduled Posting Backend)
- **feat**: `scheduler_worker.py` — APScheduler BackgroundScheduler: her dakika bekleyen postları kontrol edip paylaşıyor
- **feat**: `api/scheduler.py` — Yeni API: POST /add, GET /pending, GET /all, DELETE /cancel/{id}
- **feat**: `style_manager.py` — Scheduled posts CRUD fonksiyonları (load, save, add, update, delete)
- **feat**: `main.py` — Scheduler startup/shutdown event'leri + router kaydı
- **feat**: `requirements.txt` — `apscheduler>=3.10.0` eklendi

### 2026-03-07 (Faz 2B: Scheduled Posting Frontend)
- **feat**: `api.ts` — Scheduler API fonksiyonları (schedulePost, getPendingPosts, getAllScheduledPosts, cancelScheduledPost)
- **feat**: `yaz/page.tsx` — "Zamanla" butonu: tarih/saat seçici ile tweet zamanlama
- **feat**: `takvim/page.tsx` — "Zamanlanmış Postlar" bölümü: bekleyen/tüm filtre + iptal butonu

### 2026-03-07 (Faz 3A: Performance Tracking Backend)
- **feat**: `api/performance.py` — Yeni API: /stats, /track, /refresh-all, /auto-register endpoint'leri
- **feat**: `style_manager.py` — Tweet metrics CRUD (load, save, add, update) — `data/tweet_metrics.json`
- **feat**: `scheduler_worker.py` — Her 30 dakikada bir son 48 saatteki tweet metriklerini otomatik güncelle
- **feat**: `publish.py` — Başarılı publish sonrası tweet_id otomatik metrik takibine eklenir
- **feat**: `main.py` — Performance router kaydı

### 2026-03-07 (Faz 3B: Performance Tracking Frontend)
- **feat**: `api.ts` — Performance API fonksiyonları (getPerformanceStats, refreshAllMetrics, autoRegisterMetrics, trackTweet)
- **feat**: `takvim/page.tsx` — "Performans Takibi" bölümü: özet istatistikler, en iyi tweet, son tweet metrikleri, "Gecmisten Ekle" ve "Metrikleri Guncelle" butonları

### BEKLEYEN IYILESTIRMELER (HAFIZADA)
- **Küçük İyileştirmeler (Sonra)**: En iyi paylaşım saati analizi, rakip analizi

---

## MIGRATION PLANI: Streamlit -> Next.js + FastAPI (TAMAMLANDI)

### ONEMLI NOTLAR
- Migration tamamlandı. Aktif kod `frontend/` ve `backend/` klasörlerinde.
- Eski Streamlit dosyaları (`pages/`, `modules/`, `streamlit_app.py`) artık kullanılmıyor.

### FAZ 1: AYARLAR SAYFASI (TAMAMLANDI - 2026-03-06)
Streamlit: `pages/3_Ayarlar.py` -> Next.js: `xcom-aktif/frontend/src/app/ayarlar/page.tsx`
Backend: `xcom-aktif/backend/api/settings.py`

- [x] 1.1 Backend: Settings API endpoint'leri (GET/POST API keys, test connections)
- [x] 1.2 Frontend: API anahtarlari formu (Twitter, Twikit, AI, Grok, Telegram)
- [x] 1.3 Frontend: Baglanti test butonlari (Twitter, AI, Grok, Telegram, Twikit)
- [x] 1.4 Frontend: Twikit/Cookie yonetimi
- [x] 1.5 Frontend: Izlenen hesaplar yonetimi
- [x] 1.6 Frontend: Yazim tarzi egitimi (ornek tweet'ler, persona)
- [x] 1.7 Frontend: Paylasim gecmisi goruntuleme

### FAZ 2: TARA SAYFASI (TAMAMLANDI - 2026-03-06)
Streamlit: `pages/1_Tara.py` -> Next.js: `xcom-aktif/frontend/src/app/tara/page.tsx`
Backend: `xcom-aktif/backend/api/scanner.py`

- [x] 2.1 Frontend: Gelismis filtreler (min like/RT/takipci, ozel sorgu)
- [x] 2.2 Frontend: Arama motoru secimi (DuckDuckGo/Grok)
- [x] 2.3 Frontend: Kesfet tab'i (AI Gelismeler, GitHub Repos, Trending)
- [x] 2.4 Frontend: Hesap bazli gorunum
- [x] 2.5 Frontend: Kategori filtrelerini genislet (10 kategori)
- [x] 2.6 Frontend: Quote Tweet butonu ve akisi
- [x] 2.7 Backend: Grok arama endpoint'i
- [x] 2.8 Backend: Kesfet endpoint'leri

### FAZ 3: YAZ SAYFASI (TAMAMLANDI - 2026-03-06)
Streamlit: `pages/2_Yaz.py` -> Next.js: `xcom-aktif/frontend/src/app/yaz/page.tsx`
Backend: `xcom-aktif/backend/api/generator.py`

- [x] 3.1 Frontend: Tweet scoring/kalite gostergesi (ScoreBar component)
- [x] 3.2 Frontend: Media bulma (gorsel/video arama - X/Web/Both)
- [x] 3.3 Frontend: Vision analiz (gorsel caption)
- [x] 3.4 Frontend: Agentic Mode (standard/grok toggle)
- [x] 3.5 Frontend: Persona/stil egitimi entegrasyonu (8 stil + 6 format)
- [x] 3.6 Frontend: Claim verification / fact-checking (claim-by-claim display)
- [x] 3.7 Backend: Media bulma endpoint'i (/find-media)
- [x] 3.8 Backend: Score endpoint'i (/score)
- [x] 3.9 Backend: Styles/formats endpoint'i (/styles)
- [x] 3.10 Frontend: 3 tab layout (Tweet Yaz, Quote Tweet, Hizli Reply)
- [x] 3.11 Frontend: Arama motoru secimi (DuckDuckGo/Grok)
- [x] 3.12 Frontend: Quote Tweet tab (arastirma + deep verify)

### FAZ 4: ANALIZ SAYFASI (TAMAMLANDI - 2026-03-06)
Streamlit: `pages/4_Analiz.py` -> Next.js: `xcom-aktif/frontend/src/app/analiz/page.tsx`
Backend: `xcom-aktif/backend/api/analytics.py`

- [x] 4.1 Frontend: 5 tab layout (Yeni Analiz, Kayitli, Takipci, Havuz, Export)
- [x] 4.2 Frontend: Coklu hesap analizi (virgul ile ayirma)
- [x] 4.3 Frontend: Stil DNA detaylari (hook ornekleri, imza kelimeleri/kaliplari, kapanis)
- [x] 4.4 Frontend: Uzunluk + Soru/Beyan analizi
- [x] 4.5 Frontend: Zaman analizi (en iyi saatler)
- [x] 4.6 Frontend: Hashtag + keyword analizi
- [x] 4.7 Frontend: Top tweet'ler siralama ile
- [x] 4.8 Frontend: Kayitli analizler (training context preview, silme)
- [x] 4.9 Frontend: Takipci kesfeti (onayli filtre, kayitli listeler)
- [x] 4.10 Frontend: Tweet havuzu (hesap yonetimi, cekme, DNA, onizleme)
- [x] 4.11 Frontend: Export/Import (JSON download + file upload)
- [x] 4.12 Backend: analyze-multi, saved, delete, training-context
- [x] 4.13 Backend: export/import endpoints
- [x] 4.14 Backend: Follower fetch/list/delete endpoints
- [x] 4.15 Backend: Pool accounts/fetch/stats/DNA/preview endpoints

### FAZ 5: ICERIK SAYFASI (TAMAMLANDI - 2026-03-06)
Streamlit: `pages/6_Icerik.py` -> Next.js: `xcom-aktif/frontend/src/app/icerik/page.tsx`
Backend: `xcom-aktif/backend/api/generator.py`

- [x] 5.1 Frontend: 2 tab layout (Konu Kesfet + Icerik Uret)
- [x] 5.2 Frontend: Konu Kesfet (odak alani, motor secimi, konu kartlari)
- [x] 5.3 Frontend: Icerik tarzi secimi (5 tarz: deneyim, egitici, karsilastirma, analiz, hikaye)
- [x] 5.4 Frontend: Format secimi (6 format: micro-mega)
- [x] 5.5 Frontend: Arastirma ayarlari (mod, motor, agentic toggle)
- [x] 5.6 Frontend: Kalite skoru gostergesi (ScoreBar)
- [x] 5.7 Frontend: Media bulma entegrasyonu (X/Web/Both)
- [x] 5.8 Frontend: Paylasilan ContentDisplay componenti
- [x] 5.9 Backend: POST /discover-topics endpoint
- [x] 5.10 Backend: CONTENT_STYLES sabiti + styles endpoint guncelleme

### FAZ 6: TAKVIM SAYFASI (TAMAMLANDI - 2026-03-06)
Streamlit: `pages/7_Takvim.py` -> Next.js: `xcom-aktif/frontend/src/app/takvim/page.tsx`
Backend: `xcom-aktif/backend/api/calendar.py`

- [x] 6.1 Frontend: Slot detaylari (post turu, aciklama, best practices)
- [x] 6.2 Frontend: Paylasim kaydetme formu (type, media, self-reply, URL)
- [x] 6.3 Frontend: Gunluk algoritma checklist (6 madde)
- [x] 6.4 Frontend: Haftalik ozet (istatistikler)
- [x] 6.5 Frontend: Paylasim gecmisi gorunumu
- [x] 6.6 Frontend: Strateji rehberi
- [x] 6.7 Backend: Checklist GET/POST + weekly-summary + history endpoint'leri

### FAZ 7: DASHBOARD (TAMAMLANDI - 2026-03-06)
Streamlit: `streamlit_app.py` -> Next.js: `xcom-aktif/frontend/src/app/page.tsx`

- [x] 7.1 Frontend: Gunluk takvim karti (slot gorunumu + geri sayim + takvime link)
- [x] 7.2 Frontend: Nasil kullanilir rehberi (5 adim, sayfa linkleri)
- [x] 7.3 Frontend: API anahtari uyarisi (detayli: hangi anahtarlar eksik)

### ILERLEME DURUMU
| Faz | Sayfa | Durum | Tamamlanma |
|-----|-------|-------|------------|
| 1 | Ayarlar | TAMAMLANDI | %100 |
| 2 | Tara | TAMAMLANDI | %100 |
| 3 | Yaz | TAMAMLANDI | %100 |
| 4 | Analiz | TAMAMLANDI | %100 |
| 5 | Icerik | TAMAMLANDI | %100 |
| 6 | Takvim | TAMAMLANDI | %100 |
| 7 | Dashboard | TAMAMLANDI | %100 |

---

### 2026-03-05 (Async Transport Fix)
- **fix**: `twikit_client.py` — sniffio `AsyncLibraryNotFoundError` düzeltildi: `_ensure_sniffio_asyncio()` wrapper ile background loop task'larında sniffio cvar set ediliyor
- **fix**: `twikit_client.py` — Transport hataları (weak reference, async library) artık re-auth tetiklemiyor; gereksiz login döngüsü önlendi
- **docs**: `CLAUDE.md` — Yeni kararlar ve çözülmüş sorunlar eklendi

### 2026-03-04 (Tweet Havuzu Sistemi)
- **feat**: `tweet_pool.py` — Yeni modül: çoklu hesaptan tweet biriktirme, engagement filtresi, akıllı seçim
- **feat**: Akıllı seçim: konuya uygun 50 örnek + rastgele karışım (her seferinde farklı kombinasyon)
- **feat**: `pages/3_⚙️_Ayarlar.py` — Tweet Havuzu tab'ı: hesap listesi, engagement eşiği, toplu çekme, istatistikler
- **feat**: `build_training_context()` — topic parametresi, havuz entegrasyonu (havuz varsa havuzdan, yoksa fallback)
- **feat**: `content_generator.py` — max_training_chars 10K → 25K (50 tweet desteği)

### 2026-03-04
- **feat**: DuckDuckGo paralel arama (ThreadPoolExecutor) — web, haber, makale çekme paralel
- **feat**: Arama fallback zinciri (day→week→month), retry mekanizması, rate limit koruması
- **feat**: Grok cost reset butonu (sidebar)
- **fix**: Page 6 kırık import (`x_scanner` → `twitter_scanner`)
- **fix**: Auto-update opt-in yapıldı (`ENABLE_AUTO_UPDATE` env)
- **fix**: Engagement weights X algorithm ile uyumlandı (tüm modüller)
- **fix**: `deep_research.py` article KeyError
- **fix**: `grok_client.py` greedy regex
- **fix**: Telegram kategori map eksikleri
- **fix**: `twikit_client.py` datetime ISO format fallback
- **fix**: `style_manager.py` import düzeni
- **chore**: `requirements.txt` — `lxml` eklendi

### 2026-03-04 (Görsel Arama + Görsel Anlama)
- **feat**: `media_finder.py` — Yeni modül: X ve DuckDuckGo'dan konu ile ilgili görsel/video arama
- **feat**: `content_generator.py` — Vision (görsel anlama) desteği: Claude ve OpenAI ile görsel analizi
- **feat**: `deep_research.py` — Araştırma sonuçlarında media_urls korunuyor (ResearchResult, TopicResearchResult)
- **feat**: `ui_components.py` — Medya öneri grid'i, görsel analiz gösterimi, kaynak seçici
- **feat**: `pages/2_✍️_Yaz.py` — Tweet üretildikten sonra "Görsel/Video Bul" bölümü
- **feat**: `pages/6_💡_İçerik.py` — İçerik üretildikten sonra "Görsel/Video Bul" bölümü (her iki tab)
- **feat**: `ui_components.py:render_tweet_card` — Tweet kartında medya göstergesi (🖼️ badge)

### 2026-03-04 (Posting Takvimi)
- **feat**: `pages/7_📅_Takvim.py` — Günlük 4 post takvimi (hafta içi/sonu ayrı saatler)
- **feat**: Geri sayım sayacı, slot durumu (paylaşıldı/bekliyor/ŞİMDİ)
- **feat**: Post kayıt sistemi (tür, medya, self-reply, URL, içerik)
- **feat**: Günlük algoritma checklist (6 madde, kalıcı kayıt)
- **feat**: Haftalık özet (post sayısı, medya oranı, self-reply oranı, tür dağılımı)
- **feat**: `style_manager.py` — `load_posting_log()`, `save_posting_log()`, `log_scheduled_post()`, `load_daily_checklist()`, `save_daily_checklist()`
- **feat**: `streamlit_app.py` — Ana sayfada "Bugünkü Plan" özet kartı + geri sayım

### 2026-03-11 (2026 Algoritma Güncellemesi + Yanıtlar Sayfası)
- **fix**: `icerik/page.tsx` — TabDiscover ve TabGenerate'e provider dropdown eklendi (eksikti)
- **fix**: `yaz/page.tsx` — TabLinkReply ve TabSelfReply'a provider dropdown eklendi (eksikti)
- **fix**: `yaz/page.tsx` — TabQuickReply'a provider dropdown UI eklendi (state vardı, UI yoktu)
- **fix**: `icerik/page.tsx` — generateLongContent redundant `length` parametresi kaldırıldı
- **feat**: `backend/modules/constants.py` — Engagement ağırlıkları tek kaynağa taşındı (2026 Phoenix)
- **feat**: `backend/api/calendar.py` — Checklist 6→8 maddeye güncellendi (community, reply-back, asimetrik saat)
- **feat**: `otomatik-yanit/page.tsx` — Yanıtlar sayfası: filtreleme, arama, relative time, tooltip, bulk actions
- **feat**: `otomatik-yanit/page.tsx` — Analitik tab: başarı oranı, hesap performansı, saat ısı haritası
- **docs**: `CLAUDE.md` — 2026 algoritma bulguları, engagement ağırlıkları, devam eden işler bölümü

---

## DEVAM EDEN İŞLER (Session Arası Hafıza)

Bu bölüm her session sonunda güncellenir. Yeni session başladığında buraya bak.

### Aktif Çalışma (2026-03-11)
- [x] Aşama 0: Generator API provider eksikleri düzeltildi
- [x] Aşama 1: CLAUDE.md güncellendi (2026 algoritma + unutma çözümü)
- [x] Aşama 6: `min_faves` operatörü kaldırıldı (scanner.py + deep_research.py) — Twikit desteklemiyor
- [x] Aşama 7: MiniMax `<minimax:tool_call>` ve `<think>` tag temizliği eklendi (3 dosya)
- [x] Aşama 2: `constants.py` oluşturuldu + engagement ağırlıkları tek kaynağa taşındı
- [x] Aşama 3: Checklist 2026'ya güncellendi (8 madde)
- [x] Aşama 4: Yanıtlar sayfası filtreleme & UX iyileştirmeleri tamamlandı
- [x] Aşama 5: Yanıtlar sayfası analitik tab tamamlandı
- [x] Aşama 8: CLAUDE.md dosya yapısı Next.js + FastAPI'ye güncellendi
- [x] **KEŞİF 10 FAZ** — Tamamlandı (aşağıdaki plan bölümüne bak)

### Planlanan İyileştirmeler (Sonraki Session'lar)
- En iyi paylaşım saati analizi
- Rakip analizi
- Tüm reply özelliklerini tek "Yanıt Merkezi" sayfasında birleştirme
- Dry-run modu (kaydetmeden reply önizleme)
- 90 günden eski logları otomatik temizleme

---

## KEŞİF SAYFASI BÜYÜK GÜNCELLEME PLANI (10 Faz)

### Genel Bakış
Keşif sayfasındaki Trendler ve Haberler tabları şu an çok basit (sadece liste gösterimi). Bu plan onları tam özellikli tweet üretim merkezlerine dönüştürüyor. Backend worker'lar (auto_topic_scanner, trend_analyzer, news_scanner, account_discoverer, auto_content_suggester) zaten implement edilmiş ve scheduler'da çalışıyor. Eksik olan: **frontend tablarının zenginleştirilmesi + birkaç yeni backend endpoint**.

### Mevcut Durum (Implement Edilmiş)
- **Backend Workers**: auto_topic_scanner (2sa), trend_analyzer (1sa), news_scanner (4sa), account_discoverer (6sa), auto_content_suggester (on-demand) — HEPSİ ÇALIŞIYOR
- **Backend API**: /api/discovery/* altında tüm CRUD endpoint'ler mevcut (trends, news, suggested-accounts, auto-scan)
- **Frontend TabTweets.tsx** (1028 satır): Zengin — araştırma, quote tweet üretimi, stil/format/provider, medya arama, infografik — TAM
- **Frontend TabTrends.tsx** (127 satır): BASİT — sadece keyword listesi, tweet üretimi yok
- **Frontend TabNews.tsx** (104 satır): BASİT — sadece haber listesi, tweet üretimi yok
- **Frontend TabSuggestedAccounts.tsx** (153 satır): TEMEL — ekle/sil/geç, aktif arama yok
- **Frontend TabAyarlar.tsx** (311 satır): TAM

### Faz 1: Gece Taraması + Durum Göstergesi (Backend + Frontend)
**Amaç**: Scheduler'ın 2 saatlik taramasının durumunu frontend'te göster, son tarama zamanı + sonraki tarama geri sayımı
**Değişen Dosyalar** (max 3):
1. `backend/api/discovery.py` — Yeni endpoint: `GET /api/discovery/scheduler-status` → tüm worker'ların son çalışma zamanı, sonraki çalışma zamanı, toplam tarama sayısı
2. `frontend/src/lib/api.ts` — Yeni fonksiyon: `getSchedulerStatus()`
3. `frontend/src/app/kesif/page.tsx` — Durum çubuğuna scheduler bilgisi ekleme (son tarama, sonraki tarama, aktif worker sayısı)

**Detaylar**:
- Scheduler status endpoint APScheduler'dan `get_jobs()` ile iş listesini çeker
- Her iş için: `next_run_time`, `last_run_time` (custom tracking gerekir — scheduler_worker.py'de dict tutulacak)
- Frontend'te status bar'a "🔄 Son tarama: 14:30 | Sonraki: 16:30" badge eklenir
- Auto-scan, trend, news, account discovery durumları ayrı ayrı görünür

### Faz 2: Trendler Tabı — Araştırma Akışı (Frontend)
**Amaç**: Trend keyword'e tıklayınca o konuda deep research yapabilme
**Değişen Dosyalar** (max 3):
1. `frontend/src/app/kesif/TabTrends.tsx` — TAM YENİDEN YAZIM:
   - Trend kartına "Araştır" butonu ekleme
   - Tıklayınca `researchTopicStream()` API çağrısı (TabTweets'te zaten kullanılıyor)
   - Araştırma sonuçları panel'de gösterilir (kaynaklar, özet, key findings)
   - AI bağlam özeti: trend'in neden önemli olduğunu 2-3 cümleyle açıklar
2. `frontend/src/lib/api.ts` — Gerekirse yeni tip tanımları (muhtemelen mevcut tipler yeterli)
3. _(gerek kalmazsa 2 dosya)_

**Detaylar**:
- `researchTopicStream(topic, engine, mode)` zaten mevcut API — yeni endpoint gerekmiyor
- Araştırma sonucu: `{ summary, sources[], key_findings[], research_context }`
- Trend kartı genişleyerek araştırma panelini gösterir (accordion pattern)
- Engine seçimi: DuckDuckGo (varsayılan) veya Grok

### Faz 3: Trendler Tabı — Tweet Üretimi (Frontend)
**Amaç**: Araştırma sonrasında trend hakkında tweet üretebilme (stil/format/provider seçimi)
**Değişen Dosyalar** (max 3):
1. `frontend/src/app/kesif/TabTrends.tsx` — Araştırma paneline tweet üretim bölümü ekleme:
   - Stil dropdown (8 stil: bilgilendirici, provoke edici, vb.)
   - Format dropdown (6 format: micro → mega thread)
   - Provider dropdown (MiniMax/Claude/GPT)
   - "Üret" butonu → `generateTweet()` veya `generateLongContent()` API
   - Üretilen tweet düzenlenebilir textarea
   - "Taslak Kaydet" + "Zamanla" + "Paylaş" butonları
2. `frontend/src/lib/api.ts` — `getStyles()` zaten mevcut, gerekirse ek tip
3. _(gerek kalmazsa 2 dosya)_

**Detaylar**:
- Tweet üretimi mevcut API'leri kullanır: `/api/generator/generate` (tek tweet) veya `/api/generator/generate-long` (thread)
- Araştırma context'i tweet üretim isteğine `research_context` olarak eklenir
- Trend'in top tweets'leri de context olarak gönderilir (AI daha iyi bağlam alır)
- Stil/format listeleri `getStyles()` API'den gelir (cache'lenir)

### Faz 4: Haberler Tabı — Araştırma Akışı (Frontend)
**Amaç**: Haber'e tıklayınca o konu hakkında deep research + AI bağlam özeti
**Değişen Dosyalar** (max 3):
1. `frontend/src/app/kesif/TabNews.tsx` — TAM YENİDEN YAZIM:
   - Haber kartına "Araştır" butonu
   - `researchTopicStream()` ile derin araştırma
   - Haber'in AI önem skoru gösterimi (yüksek/orta/düşük)
   - Dinamik haber sorguları: kullanıcı kendi arama terimini girebilir
   - Filtreleme: kaynak, tarih, önem skoru
2. `frontend/src/lib/api.ts` — Gerekirse ek fonksiyon
3. _(gerek kalmazsa 2 dosya)_

**Detaylar**:
- Haber URL'si araştırma context'ine eklenir
- AI özet: "Bu haber neden önemli?" + "Tweet açısı önerisi"
- Önem skoru: haber başlığı + içeriğinden AI ile hesaplanır (Faz 6'da detaylı)

### Faz 5: Haberler Tabı — Tweet Üretimi (Frontend)
**Amaç**: Haber konusundan tweet üretimi (Faz 3 ile aynı pattern)
**Değişen Dosyalar** (max 3):
1. `frontend/src/app/kesif/TabNews.tsx` — Tweet üretim bölümü:
   - Stil/format/provider dropdown'ları (Faz 3 ile aynı)
   - "Üret" → araştırma context'i + haber bilgisi ile tweet üretimi
   - Üretilen tweet düzenleme + kaydet/zamanla/paylaş
2. _(gerek kalmazsa 1 dosya)_

**Detaylar**:
- Haber URL'si + başlık + özet tweet üretim prompt'una eklenir
- Harici link uyarısı: "Link tweet'e eklenmemeli, reply'a koy" (X algoritma kuralı)

### Faz 6: AI Haber Değeri Filtresi (Backend + Frontend)
**Amaç**: Kişisel/düşük değerli tweetleri otomatik filtreleme, haberlere önem skoru atama
**Değişen Dosyalar** (max 3):
1. `backend/api/discovery.py` — Yeni endpoint: `POST /api/discovery/score-newsvalue` → tweet/haber metni alır, AI ile 1-10 önem skoru + kategori döndürür
2. `backend/modules/content_generator.py` — Yeni fonksiyon: `score_news_value(text)` → MiniMax/Claude ile önem skoru (basit prompt, düşük maliyet)
3. `frontend/src/app/kesif/TabNews.tsx` — Haber kartlarında önem skoru badge'i, filtreleme slider'ı (min skor)

**Detaylar**:
- Prompt: "Bu metin AI/teknoloji dünyası için ne kadar haber değeri taşıyor? 1-10 skor ver. Kişisel tweet/reklam/spam = 1-3, orta önem = 4-6, büyük duyuru/keşif = 7-10"
- Skor cache'lenir (aynı metin tekrar sorgulanmaz)
- TabTweets'teki tweetlere de uygulanabilir (opsiyonel)

### Faz 7: MiniMax Akıllı Öneriler — Backend (Backend)
**Amaç**: Trend + haber verilerinden otomatik tweet önerisi + engagement tahmini
**Değişen Dosyalar** (max 3):
1. `backend/api/discovery.py` — Yeni endpoint'ler:
   - `GET /api/discovery/smart-suggestions` → mevcut trend/haber verilerinden AI önerileri
   - `POST /api/discovery/smart-suggestions/generate` → yeni öneri üret
2. `backend/auto_content_suggester.py` — Genişletme: engagement tahmini + en iyi posting zamanı önerisi + stil önerisi
3. `frontend/src/lib/api.ts` — Yeni fonksiyonlar: `getSmartSuggestions()`, `generateSmartSuggestion()`

**Detaylar**:
- AI'dan: "Bu trend/haber hakkında tweet yazılmalı mı? Engagement potansiyeli 1-10?"
- Her öneri: konu, önerilen stil, önerilen format, önerilen saat, engagement tahmini, reasoning
- MiniMax öncelikli (ucuz + hızlı), fallback Claude/GPT
- Günde max 10 öneri (maliyet kontrolü)

### Faz 8: MiniMax Akıllı Öneriler — Frontend (Frontend)
**Amaç**: Akıllı önerileri gösterme + tek tıkla tweet üretimi
**Değişen Dosyalar** (max 3):
1. `frontend/src/app/kesif/page.tsx` — Yeni tab ekleme: "Öneriler" (veya mevcut bir tab'a entegre)
2. `frontend/src/app/kesif/TabSmartSuggestions.tsx` — YENİ DOSYA: Akıllı öneri kartları
   - Engagement tahmini göstergesi (progress bar)
   - Önerilen stil/format/saat bilgisi
   - "Tweet Üret" butonu → otomatik araştırma + üretim
   - "Zamanla" butonu → önerilen saatte zamanlama
   - "Geç" butonu → öneriyi reddet
3. _(gerek kalmazsa 2 dosya)_

**Detaylar**:
- Öneri kartı: 📈 Engagement tahmini: 8/10 | 🎯 Stil: Bilgilendirici | ⏰ Saat: 14:07
- "Tweet Üret" tıklanınca: araştırma → üretim → düzenleme → paylaş/zamanla akışı
- Zamanlama: scheduler API'ye POST (mevcut `/api/scheduler/add` endpoint)

### Faz 9: Hesap Keşfi — Aktif X Araması (Backend + Frontend)
**Amaç**: Mevcut pasif keşfin yanı sıra, aktif X araması ile yeni hesap bulma
**Değişen Dosyalar** (max 3):
1. `backend/api/discovery.py` — Yeni endpoint: `POST /api/discovery/search-accounts` → keyword ile X'te hesap arama (twikit kullanarak)
2. `backend/account_discoverer.py` — Yeni fonksiyon: `search_accounts_active(keyword)` → Twikit ile "@keyword" veya "keyword" araması → hesap listesi döndür
3. `frontend/src/app/kesif/TabSuggestedAccounts.tsx` — Arama input'u + "Ara" butonu, sonuçları mevcut öneri kartları formatında göster

**Detaylar**:
- Twikit `search_user(query)` kullanılır
- Sonuçlar: username, display_name, followers, bio, verified
- "Ekle" butonu ile doğrudan izleme listesine eklenir
- Günlük max 20 arama (rate limit koruması)

### Faz 10: Zamanlama Entegrasyonu (Frontend)
**Amaç**: Tüm üretilen tweetleri doğrudan zamanlayabilme (Trendler, Haberler, Akıllı Öneriler tablarından)
**Değişen Dosyalar** (max 3):
1. `frontend/src/app/kesif/TabTrends.tsx` — "Zamanla" butonu: tarih/saat picker + scheduler API çağrısı
2. `frontend/src/app/kesif/TabNews.tsx` — Aynı zamanlama butonu
3. `frontend/src/app/kesif/TabSmartSuggestions.tsx` — Önerilen saatte otomatik zamanlama seçeneği

**Detaylar**:
- `schedulePost()` API zaten mevcut (`/api/scheduler/add`)
- Tarih/saat picker component'i TabTweets veya yaz/page.tsx'ten kopyalanır
- Thread ise tüm parçalar sırayla zamanlanır (self-reply chain)

### Uygulama Sırası ve Bağımlılıklar
```
Faz 1 (scheduler status) → bağımsız, hemen yapılabilir
Faz 2 (trendler araştırma) → bağımsız
Faz 3 (trendler tweet üretimi) → Faz 2'ye bağımlı
Faz 4 (haberler araştırma) → bağımsız (Faz 2 ile paralel yapılabilir)
Faz 5 (haberler tweet üretimi) → Faz 4'e bağımlı
Faz 6 (AI filtre) → bağımsız
Faz 7 (akıllı öneriler backend) → Faz 6'ya bağımlı (skor kullanır)
Faz 8 (akıllı öneriler frontend) → Faz 7'ye bağımlı
Faz 9 (hesap araması) → bağımsız
Faz 10 (zamanlama) → Faz 3, 5, 8'e bağımlı (üretim tabları hazır olmalı)
```

### Kullanılan Mevcut API'ler (Yeni Endpoint Gerekmez)
- `researchTopicStream()` — Araştırma (DuckDuckGo/Grok)
- `generateTweet()` / `generateLongContent()` — Tweet/thread üretimi
- `getStyles()` — Stil/format listeleri
- `findMedia()` — Görsel/video arama
- `addDraft()` — Taslak kaydetme
- `schedulePost()` — Zamanlama
- `publishTweet()` — Direkt paylaşım

### Yeni Backend Endpoint'ler (Sadece 4 tane)
1. `GET /api/discovery/scheduler-status` (Faz 1)
2. `POST /api/discovery/score-newsvalue` (Faz 6)
3. `GET/POST /api/discovery/smart-suggestions` (Faz 7)
4. `POST /api/discovery/search-accounts` (Faz 9)

### İlerleme Durumu
| Faz | Açıklama | Dosya Sayısı | Durum |
|-----|----------|-------------|-------|
| 1 | Scheduler durum göstergesi | 4 | ✅ Tamamlandı (2026-03-11) |
| 2 | Trendler — araştırma akışı | 1 | ✅ Tamamlandı (2026-03-11) |
| 3 | Trendler — tweet üretimi | 1 | ✅ Tamamlandı (2026-03-11) |
| 4 | Haberler — araştırma akışı | 1 | ✅ Tamamlandı (2026-03-11) |
| 5 | Haberler — tweet üretimi | 1 | ✅ Tamamlandı (2026-03-11) |
| 6 | AI haber değeri filtresi | 3 | ✅ Tamamlandı (2026-03-11) |
| 7 | Akıllı öneriler backend | 2 | ✅ Tamamlandı (2026-03-11) |
| 8 | Akıllı öneriler frontend | 2 | ✅ Tamamlandı (2026-03-11) |
| 9 | Hesap keşfi aktif arama | 2 | ✅ Tamamlandı (2026-03-11) |
| 10 | Zamanlama entegrasyonu | 0 | ✅ Tamamlandı (Faz 2-5,8'de dahil) |
