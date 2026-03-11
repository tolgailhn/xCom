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

---

## Sistem Mimarisi

### Proje Nedir?
X (Twitter) AI Otomasyon Dashboard — AI gelişmelerini tarayıp, araştırıp, doğal tweet üreten Streamlit uygulaması.

### Dosya Yapısı
```
streamlit_app.py              → Ana sayfa (dashboard, istatistikler)
scheduled_scanner.py          → Arka plan zamanlı tarayıcı
pages/
  1_🔍_Tara.py               → AI konu tarama (X'te arama)
  2_✍️_Yaz.py                → Tweet üretme ve paylaşma
  3_⚙️_Ayarlar.py            → API anahtarları ve ayarlar
  4_📊_Analiz.py             → Hesap analizi (stil öğrenme)
  5_👥_Takipçiler.py         → Takipçi keşfi
  6_💡_İçerik.py             → Uzun içerik üretimi + konu keşfi
  7_📅_Takvim.py             → Günlük posting takvimi, log, algoritma checklist
modules/
  twitter_scanner.py          → TwitterScanner sınıfı, AI konu keşfi
  content_generator.py        → ContentGenerator, tweet/thread üretimi (Claude/OpenAI/MiniMax)
  deep_research.py            → Derin araştırma: DDG arama + makale çekme + agentic research
  tweet_analyzer.py           → Hesap tweet analizi, stil DNA çıkarma
  tweet_publisher.py          → TweetPublisher: tweet/thread/quote tweet paylaşma
  twikit_client.py            → TwikitSearchClient: ücretsiz Twitter arama (cookie)
  grok_client.py              → Grok xAI API: X arama, web arama, otonom araştırma
  telegram_notifier.py        → Telegram bildirim gönderici
  style_manager.py            → JSON dosya yöneticisi (taslaklar, geçmiş, kişiler)
  ui_components.py            → Streamlit UI bileşenleri, CSS, sidebar, auth
  media_finder.py             → Görsel/video arama: X + DuckDuckGo image search
  tweet_pool.py               → Tweet havuzu: çoklu hesaptan tweet biriktirme, akıllı seçim
```

### Modüller Arası Bağımlılıklar
```
Pages → ui_components (CSS, auth, sidebar)
Pages → content_generator (tweet üretimi)
Pages → twitter_scanner (konu tarama)
Pages → deep_research (araştırma)
Pages → tweet_analyzer (stil analizi)
Pages → style_manager (dosya I/O)
twitter_scanner → twikit_client (ücretsiz arama)
deep_research → DDG + BeautifulSoup (web arama/makale çekme)
grok_client → OpenAI SDK (xAI base_url ile)
content_generator → anthropic / openai SDK (+ vision desteği)
media_finder → twikit_client (X arama) + duckduckgo_search (web görsel)
tweet_pool → tweet_analyzer (tweet çekme + engagement hesaplama)
Pages → tweet_pool (havuz yönetimi, akıllı seçim)
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

---

## Bilinen Sorunlar / Teknik Borç

### Aktif Sorunlar
- [x] **Engagement weights 4+ yerde tanımlı** → `constants.py` tek kaynağa taşındı (2026-03-11)
- [ ] **Kategori tanımları 2 yerde**: `twitter_scanner.py:CATEGORY_KEYWORDS` ve `telegram_notifier.py`. Tek kaynağa taşınabilir.
- [ ] **Hardcoded config**: Account listesi, API limitleri, timeout'lar ayrı bir `config.py`'ye taşınabilir.
- [ ] **Test eksikliği**: Hiçbir modülde unit test yok.
- [ ] **Session state bellek**: Grok cost ve scan sonuçları sınırsız birikebilir (cost reset eklendi ama scan cache'i hâlâ sınırsız).
- [ ] **content_generator.py** çok büyük (~1700+ satır): bölünebilir.

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

## MIGRATION PLANI: Streamlit -> Next.js + FastAPI (AKTIF)

### ONEMLI NOTLAR
- **Kaynak Streamlit kodu**: Bu repodaki `pages/`, `modules/`, `streamlit_app.py` dosyalari
- **Hedef Next.js kodu**: `xcom-aktif/frontend/` ve `xcom-aktif/backend/` klasorleri
- **Workflow**: Degisiklikler `xcom-aktif/` icine yazilir, kullanici xCom reposuna tasir
- **Streamlit dosyalari TASINMAZ**: Sadece Next.js + FastAPI kodu yazilir

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
- [ ] Aşama 2: `constants.py` oluştur + engagement ağırlıkları tek kaynağa taşı
- [ ] Aşama 3: Checklist 2026'ya güncelle (8 madde)
- [ ] Aşama 4: Yanıtlar sayfası filtreleme & UX iyileştirmeleri
- [ ] Aşama 5: Yanıtlar sayfası analitik tab

### Planlanan İyileştirmeler (Sonraki Session'lar)
- En iyi paylaşım saati analizi
- Rakip analizi
- Tüm reply özelliklerini tek "Yanıt Merkezi" sayfasında birleştirme
- Dry-run modu (kaydetmeden reply önizleme)
- 90 günden eski logları otomatik temizleme
