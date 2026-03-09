"""
Settings API - API anahtarlari, baglanti testleri, hesaplar, yazim tarzi, gecmis
"""
from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import get_settings
from backend.modules.style_manager import (
    load_user_samples, save_user_samples,
    load_custom_persona, save_custom_persona,
    load_monitored_accounts, save_monitored_accounts,
    load_post_history, save_post_history,
)

router = APIRouter()


# ── Models ──────────────────────────────────────────────

class APIStatus(BaseModel):
    minimax: bool
    groq: bool
    anthropic: bool
    openai: bool
    xai: bool
    gemini: bool
    twitter: bool
    twikit: bool
    telegram: bool


class UpdateKeyRequest(BaseModel):
    key: str
    value: str


class CookieRequest(BaseModel):
    auth_token: str
    ct0: str


class AccountRequest(BaseModel):
    username: str


class SampleRequest(BaseModel):
    text: str


class BulkSampleRequest(BaseModel):
    texts: list[str]


class PersonaRequest(BaseModel):
    persona: str


# ── API Status ──────────────────────────────────────────

@router.get("/status", response_model=APIStatus)
async def get_api_status():
    """API anahtarlarinin durumunu kontrol et"""
    s = get_settings()
    has_twikit = bool(s.twikit_username) or bool(s.twikit_auth_token or s.twitter_auth_token)
    return APIStatus(
        minimax=bool(s.minimax_api_key),
        groq=bool(s.groq_api_key),
        anthropic=bool(s.anthropic_api_key),
        openai=bool(s.openai_api_key),
        xai=bool(s.xai_api_key),
        gemini=bool(s.gemini_api_key),
        twitter=bool(s.twitter_bearer_token),
        twikit=has_twikit,
        telegram=bool(s.telegram_bot_token and s.telegram_chat_id),
    )


@router.post("/update-key")
async def update_api_key(request: UpdateKeyRequest):
    """API anahtarini guncelle (.env dosyasina yazar)"""
    from pathlib import Path

    env_path = Path(__file__).parent.parent.parent / ".env"

    lines = []
    key_found = False
    if env_path.exists():
        with open(env_path, "r") as f:
            for line in f:
                if line.strip().startswith(f"{request.key}="):
                    lines.append(f"{request.key}={request.value}\n")
                    key_found = True
                else:
                    lines.append(line)

    if not key_found:
        lines.append(f"{request.key}={request.value}\n")

    with open(env_path, "w") as f:
        f.writelines(lines)

    get_settings.cache_clear()
    return {"status": "ok", "key": request.key}


# ── Connection Tests ────────────────────────────────────

@router.post("/test-twitter")
async def test_twitter_connection():
    """Twitter API baglanti testi"""
    s = get_settings()
    if not all([s.twitter_api_key, s.twitter_api_secret,
                s.twitter_access_token, s.twitter_access_secret]):
        return {"success": False, "error": "Twitter API anahtarlari eksik"}

    try:
        from backend.modules.tweet_publisher import TweetPublisher
        publisher = TweetPublisher(
            api_key=s.twitter_api_key,
            api_secret=s.twitter_api_secret,
            access_token=s.twitter_access_token,
            access_secret=s.twitter_access_secret,
            bearer_token=s.twitter_bearer_token,
        )
        me = publisher.get_me()
        if me["success"]:
            return {"success": True, "username": me["username"],
                    "name": me["name"], "followers": me.get("followers", 0)}
        return {"success": False, "error": me.get("error", "Bilinmeyen hata")}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/test-ai")
async def test_ai_connection():
    """AI API baglanti testi"""
    try:
        from backend.api.helpers import get_ai_provider
        from backend.modules.content_generator import ContentGenerator

        provider, api_key, model = get_ai_provider()
        gen = ContentGenerator(provider=provider, api_key=api_key, model=model)
        result = gen.generate_tweet(
            topic_text="Test mesaji - AI baglanti testi",
            style="samimi"
        )
        return {"success": True, "provider": provider, "preview": result[:100]}
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/test-grok")
async def test_grok_connection():
    """Grok xAI API baglanti testi"""
    s = get_settings()
    if not s.xai_api_key:
        return {"success": False, "error": "xAI API key eksik"}

    try:
        from backend.modules.grok_client import test_grok_connection
        result = test_grok_connection(s.xai_api_key)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/test-gemini")
async def test_gemini_connection():
    """Gemini API baglanti testi"""
    s = get_settings()
    if not s.gemini_api_key:
        return {"success": False, "error": "Gemini API key eksik"}

    try:
        from google import genai
        client = genai.Client(api_key=s.gemini_api_key)
        # Simple text generation to verify key works
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents="Say 'OK' in one word.",
        )
        if response and response.text:
            return {"success": True, "model": "gemini-3-pro-image-preview"}
        return {"success": False, "error": "Bos yanit alindi"}
    except ImportError:
        return {"success": False, "error": "google-genai paketi yuklu degil"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/test-telegram")
async def test_telegram_connection():
    """Telegram bot baglanti testi + test mesaji"""
    s = get_settings()
    if not s.telegram_bot_token or not s.telegram_chat_id:
        return {"success": False, "error": "Telegram token veya chat ID eksik"}

    try:
        from backend.modules.telegram_notifier import TelegramNotifier
        notifier = TelegramNotifier(s.telegram_bot_token, s.telegram_chat_id)
        info = notifier.test_connection()
        if info["ok"]:
            sent = notifier.send_message("AI Gundem Dashboard baglantisi basarili!")
            return {"success": True, "bot_username": info["bot_username"],
                    "message_sent": sent}
        return {"success": False, "error": info.get("error", "Baglanti basarisiz")}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/test-twikit")
async def test_twikit_connection():
    """Twikit cookie baglanti testi"""
    s = get_settings()
    has_cookies = bool(s.twikit_auth_token or s.twitter_auth_token)
    if not s.twikit_username and not has_cookies:
        return {"success": False, "error": "Twikit kullanici adi veya cookie eksik"}

    try:
        from backend.modules.twikit_client import TwikitSearchClient
        tc = TwikitSearchClient(
            s.twikit_username, s.twikit_password, s.twikit_email
        )
        if tc.authenticate():
            if tc.validate_connection():
                return {"success": True, "source": tc._cookie_source}
            return {"success": False,
                    "error": f"Cookie yuklendi ama arama basarisiz: {tc.last_error}"}
        return {"success": False, "error": tc.last_error or "Giris basarisiz"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Twikit Cookies ──────────────────────────────────────

@router.get("/twikit-status")
async def get_twikit_status():
    """Twikit cookie durumu"""
    from pathlib import Path
    s = get_settings()

    cookies_path = Path(__file__).parent.parent.parent / "data" / "twikit_cookies.json"
    has_env_cookies = bool(s.twikit_auth_token or s.twitter_auth_token)
    has_file_cookies = cookies_path.exists()

    return {
        "username": s.twikit_username or None,
        "has_env_cookies": has_env_cookies,
        "has_file_cookies": has_file_cookies,
        "source": "env" if has_env_cookies else "file" if has_file_cookies else None,
    }


@router.post("/twikit-cookies")
async def save_twikit_cookies(request: CookieRequest):
    """Cookie'leri dosyaya kaydet"""
    import json
    from pathlib import Path

    cookies_path = Path(__file__).parent.parent.parent / "data" / "twikit_cookies.json"
    cookies_path.parent.mkdir(parents=True, exist_ok=True)

    cookie_dict = {
        "auth_token": request.auth_token.strip(),
        "ct0": request.ct0.strip(),
    }
    with open(cookies_path, "w", encoding="utf-8") as f:
        json.dump(cookie_dict, f, ensure_ascii=False, indent=2)

    return {"status": "ok"}


@router.delete("/twikit-cookies")
async def delete_twikit_cookies():
    """Cookie dosyasini sil"""
    from pathlib import Path

    cookies_path = Path(__file__).parent.parent.parent / "data" / "twikit_cookies.json"
    if cookies_path.exists():
        cookies_path.unlink()
        return {"status": "ok", "deleted": True}
    return {"status": "ok", "deleted": False}


# ── X Account Info ──────────────────────────────────────

@router.get("/account-info")
async def get_account_info():
    """X hesap bilgilerini getir"""
    s = get_settings()
    if not all([s.twitter_api_key, s.twitter_api_secret,
                s.twitter_access_token, s.twitter_access_secret]):
        return {"success": False, "error": "Twitter API anahtarlari eksik"}

    try:
        from backend.modules.tweet_publisher import TweetPublisher
        publisher = TweetPublisher(
            api_key=s.twitter_api_key,
            api_secret=s.twitter_api_secret,
            access_token=s.twitter_access_token,
            access_secret=s.twitter_access_secret,
            bearer_token=s.twitter_bearer_token,
        )
        return publisher.get_me()
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Monitored Accounts ─────────────────────────────────

@router.get("/monitored-accounts")
async def get_monitored_accounts():
    """Izlenen hesaplari getir (varsayilan + ozel)"""
    from backend.modules.twitter_scanner import DEFAULT_AI_ACCOUNTS
    import json
    from pathlib import Path

    custom = load_monitored_accounts()

    # Load categorized accounts if available
    accounts_path = Path(__file__).parent.parent.parent / "data" / "ai_accounts.json"
    categories = []
    if accounts_path.exists():
        with open(accounts_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            categories = data.get("categories", [])

    return {
        "default_accounts": list(DEFAULT_AI_ACCOUNTS),
        "custom_accounts": custom,
        "categories": categories,
    }


@router.post("/monitored-accounts")
async def add_monitored_account(request: AccountRequest):
    """Ozel hesap ekle"""
    accounts = load_monitored_accounts()
    clean = request.username.strip().lstrip("@")
    if not clean:
        return {"status": "error", "error": "Hesap adi bos"}
    if clean in accounts:
        return {"status": "error", "error": "Bu hesap zaten ekli"}
    accounts.append(clean)
    save_monitored_accounts(accounts)
    return {"status": "ok", "accounts": accounts}


@router.delete("/monitored-accounts/{username}")
async def remove_monitored_account(username: str):
    """Ozel hesap kaldir"""
    accounts = load_monitored_accounts()
    clean = username.strip().lstrip("@")
    if clean in accounts:
        accounts.remove(clean)
        save_monitored_accounts(accounts)
    return {"status": "ok", "accounts": accounts}


# ── User Samples (Writing Style) ───────────────────────

@router.get("/user-samples")
async def get_user_samples():
    """Kullanicinin ornek tweet'lerini getir"""
    samples = load_user_samples()
    return {"samples": samples, "count": len(samples)}


@router.post("/user-samples")
async def add_user_sample(request: SampleRequest):
    """Tek ornek tweet ekle"""
    samples = load_user_samples()
    text = request.text.strip()
    if not text:
        return {"status": "error", "error": "Ornek bos"}
    samples.append(text)
    save_user_samples(samples)
    return {"status": "ok", "count": len(samples)}


@router.post("/user-samples/bulk")
async def add_bulk_samples(request: BulkSampleRequest):
    """Toplu ornek tweet ekle"""
    samples = load_user_samples()
    new_texts = [t.strip() for t in request.texts if t.strip()]
    samples.extend(new_texts)
    save_user_samples(samples)
    return {"status": "ok", "added": len(new_texts), "count": len(samples)}


@router.delete("/user-samples/{index}")
async def delete_user_sample(index: int):
    """Ornek tweet sil"""
    samples = load_user_samples()
    if 0 <= index < len(samples):
        samples.pop(index)
        save_user_samples(samples)
        return {"status": "ok", "count": len(samples)}
    return {"status": "error", "error": "Gecersiz index"}


# ── Persona / Style Analysis ───────────────────────────

@router.get("/persona")
async def get_persona():
    """Mevcut persona/tarz profilini getir"""
    persona = load_custom_persona()
    return {"persona": persona}


@router.post("/persona")
async def save_persona(request: PersonaRequest):
    """Persona kaydet"""
    save_custom_persona(request.persona)
    return {"status": "ok"}


@router.post("/analyze-style")
async def analyze_writing_style():
    """AI ile yazim tarzi analiz et"""
    samples = load_user_samples()
    if len(samples) < 5:
        return {"success": False, "error": f"En az 5 ornek gerekli (su an: {len(samples)})"}

    try:
        from backend.api.helpers import get_ai_provider
        from backend.modules.content_generator import ContentGenerator

        provider, api_key, model = get_ai_provider()
        gen = ContentGenerator(provider=provider, api_key=api_key, model=model)
        analysis = gen.analyze_writing_style(samples)
        save_custom_persona(analysis)
        return {"success": True, "persona": analysis}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Post History ────────────────────────────────────────

@router.get("/post-history")
async def get_post_history():
    """Paylasim gecmisini getir"""
    history = load_post_history()
    return {"history": history, "count": len(history)}


@router.delete("/post-history")
async def clear_post_history():
    """Paylasim gecmisini temizle"""
    save_post_history([])
    return {"status": "ok"}
