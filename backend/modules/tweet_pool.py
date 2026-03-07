"""
Tweet Havuzu (Pool) Sistemi

Birden fazla hesaptan yüksek etkileşimli tweet'leri biriktiren,
hiçbir zaman silmeyen, ve her tweet yazımında konuya uygun
akıllı seçim yapan merkezi havuz sistemi.
"""

import json
import random
import re
import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
POOL_FILE = DATA_DIR / "tweet_pool.json"
POOL_ACCOUNTS_FILE = DATA_DIR / "pool_accounts.json"


# --- Havuz Dosya İşlemleri ---

def load_pool() -> dict:
    """Havuzu dosyadan yükle."""
    if POOL_FILE.exists():
        try:
            with open(POOL_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"pool": [], "source_accounts": [], "last_updated": "", "stats": {}}


def save_pool(pool_data: dict):
    """Havuzu dosyaya kaydet."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    pool_data["last_updated"] = datetime.datetime.now().isoformat()
    pool_data["stats"] = _calculate_stats(pool_data["pool"], pool_data.get("source_accounts", []))
    with open(POOL_FILE, "w", encoding="utf-8") as f:
        json.dump(pool_data, f, ensure_ascii=False, indent=2, default=str)


def load_pool_accounts() -> list[str]:
    """Havuz hesap listesini yükle."""
    if POOL_ACCOUNTS_FILE.exists():
        try:
            with open(POOL_ACCOUNTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_pool_accounts(accounts: list[str]):
    """Havuz hesap listesini kaydet."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Normalize: küçük harf, @ temizle, boşluk temizle
    cleaned = []
    for a in accounts:
        a = a.strip().lstrip("@").lower()
        if a and a not in cleaned:
            cleaned.append(a)
    with open(POOL_ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2)


# --- Tweet Ekleme ---

def add_tweets_to_pool(pool_data: dict, tweets: list[dict], author: str,
                       min_engagement: float = 100) -> int:
    """
    Tweet'leri havuza ekle.
    - Engagement eşiğini geçenleri ekler
    - RT'leri atlar
    - Duplikat kontrolü yapar (text[:100])
    - Hiçbir tweet silinmez

    Returns: eklenen tweet sayısı
    """
    from backend.modules.tweet_analyzer import calculate_engagement_score

    existing_fingerprints = {t["text"][:100] for t in pool_data["pool"]}
    added = 0

    for tweet in tweets:
        text = tweet.get("text", "").strip()

        # RT'leri atla
        if text.startswith("RT @"):
            continue

        # Çok kısa tweet'leri atla
        if len(text) < 30:
            continue

        # Engagement skoru hesapla
        score = calculate_engagement_score(tweet)
        if score < min_engagement:
            continue

        # Duplikat kontrolü
        fingerprint = text[:100]
        if fingerprint in existing_fingerprints:
            continue

        # Havuza ekle
        hook = _extract_hook(text)
        pool_entry = {
            "text": text,
            "author": author.lower().lstrip("@"),
            "engagement_score": score,
            "likes": _safe_int(tweet.get("like_count", 0)),
            "retweets": _safe_int(tweet.get("retweet_count", 0)),
            "replies": _safe_int(tweet.get("reply_count", 0)),
            "created_at": tweet.get("created_at", ""),
            "added_at": datetime.datetime.now().isoformat(),
            "char_count": len(text),
            "hook": hook,
        }
        pool_data["pool"].append(pool_entry)
        existing_fingerprints.add(fingerprint)
        added += 1

    # source_accounts güncelle
    author_clean = author.lower().lstrip("@")
    if author_clean not in pool_data.get("source_accounts", []):
        pool_data.setdefault("source_accounts", []).append(author_clean)

    return added


# --- Akıllı Seçim ---

def select_examples(pool_data: dict, topic: str = "", count: int = 50) -> list[dict]:
    """
    Havuzdan konuya uygun + rastgele karışım ile örnek seç.

    Algoritma:
    1. Topic varsa → keyword eşleşmesi ile konuya uygun tweet'leri bul
    2. Uygun olanlardan en yüksek engagement'lıları al (max count//2)
    3. Geri kalanı havuzun genelinden rastgele seç (çeşitlilik)
    4. random.sample ile her seferinde farklı kombinasyon
    """
    pool = pool_data.get("pool", [])
    if not pool:
        return []

    if len(pool) <= count:
        # Havuz küçükse hepsini döndür
        return list(pool)

    topic_matched = []
    topic_unmatched = []

    if topic:
        topic_keywords = _extract_keywords(topic)
        for tweet in pool:
            tweet_keywords = _extract_keywords(tweet["text"])
            overlap = topic_keywords & tweet_keywords
            if overlap:
                tweet["_relevance"] = len(overlap)
                topic_matched.append(tweet)
            else:
                topic_unmatched.append(tweet)
    else:
        topic_unmatched = list(pool)

    selected = []

    # Konuya uygun olanlardan seç (max count//2)
    if topic_matched:
        # Önce relevance'a, sonra engagement'a göre sırala
        topic_matched.sort(key=lambda t: (t.get("_relevance", 0), t["engagement_score"]), reverse=True)
        topic_count = min(len(topic_matched), count // 2)
        selected.extend(topic_matched[:topic_count])

    # Geri kalanı rastgele seç (çeşitlilik)
    remaining_needed = count - len(selected)
    if remaining_needed > 0:
        # Seçilmemiş tweet'lerden rastgele al
        selected_texts = {t["text"][:100] for t in selected}
        candidates = [t for t in topic_unmatched if t["text"][:100] not in selected_texts]

        # Konuya uygun ama seçilmemiş olanları da ekle
        if topic_matched:
            unselected_matched = [t for t in topic_matched[len(selected):] if t["text"][:100] not in selected_texts]
            candidates.extend(unselected_matched)

        if len(candidates) <= remaining_needed:
            selected.extend(candidates)
        else:
            # Ağırlıklı rastgele: yüksek engagement'lılara biraz daha şans ver
            # ama tamamen engagement'a göre sıralama yapma (çeşitlilik için)
            selected.extend(random.sample(candidates, remaining_needed))

    # _relevance geçici alanını temizle
    for t in selected:
        t.pop("_relevance", None)

    # Karıştır ki sıralama etkisi olmasın
    random.shuffle(selected)
    return selected


def build_pool_training_context(selected_tweets: list[dict]) -> str:
    """
    Seçilen tweet'leri prompt formatına çevir.
    Bu, build_training_context()'in YAZIM TARZI ÖRNEKLERİ bölümünün yerine geçer.
    """
    if not selected_tweets:
        return ""

    # Engagement'a göre sırala (prompt'ta yüksek engagement'lılar önce)
    sorted_tweets = sorted(selected_tweets, key=lambda t: t["engagement_score"], reverse=True)

    examples = []
    for t in sorted_tweets:
        text = t["text"][:500] + "..." if len(t["text"]) > 500 else t["text"]
        score = t["engagement_score"]
        author = t.get("author", "?")
        examples.append(f'"{text}"\n[@{author} | Skor:{score}]')

    authors = list({t.get("author", "?") for t in selected_tweets})
    total_pool_tweets = len(selected_tweets)

    return f"""### YAZIM TARZI ÖRNEKLERİ — TWEET HAVUZU ({total_pool_tweets} seçilmiş tweet, {len(authors)} hesaptan):
Bu tweet'lerin TONUNU, CÜMLE YAPISINI, KELİME SEÇİMİNİ ve GİRİŞ TARZLARINI model al.
Her tweet farklı bir yaklaşım gösteriyor — bu ÇEŞİTLİLİĞİ koru, tek kalıba düşme.

Kaynak hesaplar: {", ".join(f"@{a}" for a in authors)}

{chr(10).join(f"{i+1}. {ex}" for i, ex in enumerate(examples))}

ÖNEMLİ:
- Bu örnekleri birebir KOPYALAMA — sadece ton, yapı ve yaklaşımı model al
- Her tweet yazımında FARKLI bir giriş tarzı kullan
- Örneklerdeki çeşitliliği koru: kişisel deneyim, rakam hook, paradoks, karşıt görüş, merak boşluğu
"""


# --- Otomatik Çekme ---

def fetch_and_add_account(twikit_client, username: str,
                          min_engagement: float = 100,
                          tweet_count: int = 500,
                          progress_callback=None) -> dict:
    """
    Bir hesabın tweet'lerini çek, filtrele, havuza ekle.

    Returns: {"username": str, "fetched": int, "added": int, "skipped": int}
    """
    from backend.modules.tweet_analyzer import pull_user_tweets

    if progress_callback:
        progress_callback(f"@{username} tweet'leri çekiliyor...")

    try:
        tweets = pull_user_tweets(twikit_client, username, count=tweet_count,
                                  progress_callback=progress_callback)
    except Exception as e:
        return {"username": username, "fetched": 0, "added": 0, "error": str(e)}

    pool_data = load_pool()
    added = add_tweets_to_pool(pool_data, tweets, username, min_engagement)
    save_pool(pool_data)

    return {
        "username": username,
        "fetched": len(tweets),
        "added": added,
        "skipped": len(tweets) - added,
    }


def bulk_fetch_accounts(twikit_client, accounts: list[str],
                        min_engagement: float = 100,
                        tweet_count: int = 500,
                        progress_callback=None) -> list[dict]:
    """
    Birden fazla hesabın tweet'lerini sırayla çek ve havuza ekle.
    Hesaplar arası 3sn delay + rate limit'te otomatik bekleme.

    Returns: list of results per account
    """
    import time

    results = []
    for i, username in enumerate(accounts):
        username = username.strip().lstrip("@")
        if not username:
            continue

        if progress_callback:
            progress_callback(f"[{i+1}/{len(accounts)}] @{username} işleniyor...")

        result = fetch_and_add_account(
            twikit_client, username,
            min_engagement=min_engagement,
            tweet_count=tweet_count,
            progress_callback=progress_callback,
        )
        results.append(result)

        # Rate limit hatası varsa 60sn bekle
        if result.get("error") and "rate limit" in result["error"].lower():
            if progress_callback:
                progress_callback(f"Rate limit! 60 saniye bekleniyor...")
            time.sleep(60)
        elif i < len(accounts) - 1:
            # Hesaplar arası 3sn delay (rate limit koruması)
            if progress_callback:
                progress_callback(f"Sonraki hesap için 3sn bekleniyor...")
            time.sleep(3)

    return results


def import_from_analyses(min_engagement: float = 100,
                         progress_callback=None) -> list[dict]:
    """
    Mevcut analiz dosyalarından (data/tweet_analyses/*.json) havuza aktarma.
    Tekrar tweet çekmeye gerek kalmaz — zaten kaydedilmiş verileri kullanır.

    Returns: list of {"username", "fetched", "added", "skipped"} per account
    """
    from backend.modules.tweet_analyzer import load_all_analyses

    analyses = load_all_analyses()
    if not analyses:
        return []

    results = []
    pool_data = load_pool()

    for analysis_data in analyses:
        username = analysis_data.get("username", "unknown")
        analysis = analysis_data.get("analysis", {})

        if progress_callback:
            progress_callback(f"@{username} analiz dosyasından aktarılıyor...")

        # all_original_tweets kullan (analiz sırasında kaydedilmiş tüm orijinal tweetler)
        all_originals = analysis.get("all_original_tweets", [])

        # Eski format desteği: all_original_tweets yoksa top_tweets kullan
        if not all_originals:
            all_originals = analysis.get("top_tweets", [])

        if not all_originals:
            results.append({
                "username": username,
                "fetched": 0,
                "added": 0,
                "skipped": 0,
                "error": "Analiz dosyasında tweet verisi bulunamadı",
            })
            continue

        # Analiz formatındaki tweet'leri havuz formatına uyumlu hale getir
        tweets_for_pool = []
        for t in all_originals:
            tweets_for_pool.append({
                "text": t.get("text", ""),
                "like_count": t.get("like_count", 0),
                "retweet_count": t.get("retweet_count", 0),
                "reply_count": t.get("reply_count", 0),
                "impression_count": t.get("impression_count", 0),
                "bookmark_count": t.get("bookmark_count", 0),
                "created_at": t.get("created_at", ""),
                "engagement_score": t.get("engagement_score", 0),
            })

        added = add_tweets_to_pool(pool_data, tweets_for_pool, username, min_engagement)

        results.append({
            "username": username,
            "fetched": len(tweets_for_pool),
            "added": added,
            "skipped": len(tweets_for_pool) - added,
        })

    save_pool(pool_data)
    return results


# --- Havuzdan DNA Yeniden Hesaplama ---

def regenerate_pool_dna() -> dict:
    """
    Havuzdaki TÜM tweet'lerden birleşik Style DNA çıkar.
    Havuz büyüdükçe DNA daha zengin ve doğru olur.

    Returns: {"dna": dict, "tweet_count": int, "account_count": int}
    """
    from backend.modules.tweet_analyzer import _extract_style_dna

    pool_data = load_pool()
    pool = pool_data.get("pool", [])

    if not pool:
        return {"dna": {}, "tweet_count": 0, "account_count": 0}

    # Havuzdaki tweetleri _extract_style_dna formatına çevir
    tweets_for_dna = [
        {
            "text": t["text"],
            "engagement_score": t.get("engagement_score", 0),
        }
        for t in pool
    ]

    dna = _extract_style_dna(tweets_for_dna)

    # DNA'yı havuz dosyasına kaydet
    pool_data["pool_dna"] = dna
    pool_data["pool_dna_updated"] = datetime.datetime.now().isoformat()
    save_pool(pool_data)

    authors = list({t.get("author", "") for t in pool})

    return {
        "dna": dna,
        "tweet_count": len(pool),
        "account_count": len(authors),
    }


def get_pool_dna() -> dict:
    """Kaydedilmiş havuz DNA'sını döndür (yoksa boş dict)."""
    pool_data = load_pool()
    return pool_data.get("pool_dna", {})


# --- İstatistikler ---

def get_pool_stats(pool_data: dict = None) -> dict:
    """Havuz istatistiklerini döndür."""
    if pool_data is None:
        pool_data = load_pool()
    return _calculate_stats(pool_data.get("pool", []), pool_data.get("source_accounts", []))


# --- Yardımcı Fonksiyonlar ---

def _calculate_stats(pool: list[dict], source_accounts: list[str]) -> dict:
    """Havuz istatistiklerini hesapla."""
    if not pool:
        return {"total_tweets": 0, "accounts_count": 0, "avg_engagement": 0}

    scores = [t["engagement_score"] for t in pool]
    authors = list({t.get("author", "") for t in pool})

    return {
        "total_tweets": len(pool),
        "accounts_count": len(authors),
        "avg_engagement": round(sum(scores) / len(scores), 1),
        "max_engagement": round(max(scores), 1),
        "min_engagement": round(min(scores), 1),
        "authors": {a: sum(1 for t in pool if t.get("author") == a) for a in authors},
    }


def _extract_hook(text: str) -> str:
    """Tweet'in ilk cümlesini (hook) çıkar."""
    # İlk satırı al
    first_line = text.split("\n")[0].strip()
    # Çok uzunsa kes
    if len(first_line) > 150:
        first_line = first_line[:150] + "..."
    return first_line


def _extract_keywords(text: str) -> set[str]:
    """Basit keyword çıkarma (eşleşme için)."""
    # URL, mention, hashtag temizle
    clean = re.sub(r'https?://\S+', '', text)
    clean = re.sub(r'@\w+', '', clean)
    clean = re.sub(r'#', '', clean)
    clean = re.sub(r'[^\w\s]', ' ', clean)

    # Türkçe + İngilizce stop words
    stop_words = {
        'bir', 'bu', 'da', 'de', 've', 'ile', 'için', 'var', 'yok', 'ama',
        'çok', 'ne', 'ki', 'gibi', 'daha', 'en', 'her', 'o', 'ben', 'sen',
        'biz', 'şu', 'ya', 'mı', 'mi', 'mu', 'olan', 'olarak', 'sonra',
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to',
        'of', 'and', 'in', 'that', 'it', 'for', 'on', 'with', 'as', 'at',
        'by', 'from', 'or', 'not', 'but', 'this', 'has', 'have', 'had',
        'kadar', 'artık', 'bile', 'hem', 'sadece', 'zaten', 'yani', 'bence',
        'diyor', 'olan', 'oldu', 'olur', 'oluyor', 'değil', 'nasıl',
    }

    words = clean.lower().split()
    keywords = {w for w in words if len(w) > 2 and w not in stop_words}
    return keywords


def _safe_int(val) -> int:
    """Güvenli int dönüşümü."""
    try:
        return int(val) if val else 0
    except (ValueError, TypeError):
        return 0
