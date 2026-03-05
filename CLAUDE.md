# CLAUDE.md — Proje Kuralları ve Sistem Belleği

## Geliştirme Süreci

1. **Herhangi bir kod yazmadan önce yaklaşımını açıkla ve onay bekle.** Doğrudan implementasyona geçme, önce planı sun.
2. **Önce açıklayıcı sorular sor.** Belirsiz veya eksik noktaları netleştirmeden kodlamaya başlama.
3. **Kod yazmayı bitirdikten sonra, olası edge case'leri listele ve bunları kapsayacak test senaryoları öner.**
4. **Bir görev 3'ten fazla dosyada değişiklik gerektiriyorsa, dur ve önce daha küçük görevlere böl.** Her alt görevi ayrı ayrı onayla.
5. **Bir hata olduğunda, öncelikle hatayı yeniden oluşturacak bir test yaz, ardından test başarılı olana kadar hatayı düzelt.**
6. **Her düzeltme yaptığında, neyi yanlış yaptığını düşün ve aynı hatayı bir daha asla yapmamak için bir plan geliştir.**
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

### Engagement Score Ağırlıkları (X Algorithm)
**Tek kaynak: `tweet_analyzer.py` ve `twitter_scanner.py` aynı ağırlıkları kullanır.**
- RT = 20x, Reply = 13.5x, Like = 1x, Bookmark ≈ 10x
- `twitter_scanner.py:AITopic.engagement_score` → tarama sıralaması için
- `tweet_analyzer.py:calculate_engagement_score()` → detaylı analiz için (impressions bonus dahil)
- `calculate_relevance()` divisor = 1000 (bu ağırlıklarla uyumlu)

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

---

## Bilinen Sorunlar / Teknik Borç

### Aktif Sorunlar
- [ ] **Engagement weights 3 yerde tanımlı**: `twitter_scanner.py`, `tweet_analyzer.py`, `content_generator.py` (system prompt). Tek bir `ENGAGEMENT_WEIGHTS` sabiti yapılabilir.
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

## Değişiklik Günlüğü

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
