"""
Telegram Bot Worker — Mesaj alma, sohbet, komut isleme.

CALISMA MANTIGI:
- Scheduler tarafindan her 5 saniyede bir cagirilir
- Telegram API'den yeni mesajlari ceker (getUpdates)
- Komut mu? → Ilgili handler calisir
- Normal mesaj? → MiniMax ile cevap uretir

KOMUTLAR:
/durum   — Sistem durumu (scheduler, pending reply, discovery)
/bekleyen — Bekleyen auto-reply listesi
/kesif    — Son discovery sonuclari (en iyi tweetler)
/yardim   — Komut listesi

SOHBET:
Normal mesajlar MiniMax API'ye gonderilir, cevap Telegram'a yazilir.
Sistem context'i: mevcut durum bilgisi + genel AI bilgisi.
"""
import datetime
import json
import logging
import ssl
import urllib.request
import urllib.parse
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
TZ_TR = ZoneInfo("Europe/Istanbul")

# Son islenen update_id (duplikat mesaj onleme)
_last_update_id: int = 0

# SSL context — Windows'ta sertifika dogrulama sorununu asan context
def _get_ssl_ctx() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

_ssl_ctx = _get_ssl_ctx()


# Kalici klavye butonlari — her mesajda gonderilir
PERSISTENT_KEYBOARD = {
    "keyboard": [
        [{"text": "📊 Durum"}, {"text": "🔔 Bekleyen"}],
        [{"text": "🔍 Keşif"}, {"text": "❓ Yardım"}],
    ],
    "resize_keyboard": True,
    "is_persistent": True,
}

# Buton metni → komut eslestirmesi
_BUTTON_TO_COMMAND = {
    "📊 Durum": "/durum",
    "🔔 Bekleyen": "/bekleyen",
    "🔍 Keşif": "/kesif",
    "❓ Yardım": "/yardim",
}


def _get_notifier():
    """TelegramNotifier instance dondur (config'den)."""
    try:
        from backend.config import get_settings
        from backend.modules.telegram_notifier import TelegramNotifier

        settings = get_settings()
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return None
        return TelegramNotifier(settings.telegram_bot_token, settings.telegram_chat_id)
    except Exception:
        return None


def _handle_command(command: str, args: str, chat_id: str) -> str:
    """Komut isleyici — komuta gore cevap dondurur."""
    cmd = command.lower().strip()

    if cmd in ("/start", "/yardim", "/help"):
        return _cmd_help()
    elif cmd == "/durum":
        return _cmd_status()
    elif cmd == "/bekleyen":
        return _cmd_pending_replies()
    elif cmd == "/kesif":
        return _cmd_discovery()
    else:
        return f"Bilinmeyen komut: {cmd}\n/yardim yazarak komut listesini gorebilirsin."


def _cmd_help() -> str:
    return (
        "<b>🤖 X AI Otomasyon Bot</b>\n\n"
        "<b>Komutlar:</b>\n"
        "/durum — Sistem durumu\n"
        "/bekleyen — Bekleyen otomatik yanitlar\n"
        "/kesif — Son hesap kesfi sonuclari\n"
        "/yardim — Bu mesaj\n\n"
        "<i>Normal mesaj yazarsan sohbet edebiliriz 💬</i>"
    )


def _cmd_status() -> str:
    """Sistem durum raporu."""
    try:
        from backend.modules.style_manager import (
            load_auto_reply_logs,
            load_self_reply_config,
            load_discovery_cache,
            load_discovery_config,
            load_auto_reply_config,
        )

        now = datetime.datetime.now(TZ_TR)

        # Auto-reply durumu
        ar_config = load_auto_reply_config()
        ar_enabled = ar_config.get("enabled", False)
        ar_logs = load_auto_reply_logs()
        ar_pending = sum(1 for l in ar_logs if l.get("status") == "ready")
        ar_published = sum(1 for l in ar_logs if l.get("status") == "published")

        # Self-reply durumu
        sr_config = load_self_reply_config()
        sr_enabled = sr_config.get("enabled", False)

        # Discovery durumu
        dc_config = load_discovery_config()
        dc_enabled = dc_config.get("enabled", False)
        dc_cache = load_discovery_cache()
        dc_total = len(dc_cache)

        # Hesap sayilari
        dc_priority = len(dc_config.get("priority_accounts", []))
        dc_normal = len(dc_config.get("normal_accounts", []))

        lines = [
            "<b>📊 Sistem Durumu</b>",
            f"<i>{now.strftime('%d.%m.%Y %H:%M')}</i>",
            "",
            "<b>🔔 Otomatik Yanit:</b>",
            f"  Durum: {'✅ Aktif' if ar_enabled else '❌ Kapali'}",
            f"  Bekleyen: {ar_pending}",
            f"  Paylasilan: {ar_published}",
            f"  Hesap: {len(ar_config.get('accounts', []))}",
            "",
            "<b>💬 Self-Reply:</b>",
            f"  Durum: {'✅ Aktif' if sr_enabled else '❌ Kapali'}",
            "",
            "<b>🔍 Hesap Kesfi:</b>",
            f"  Durum: {'✅ Aktif' if dc_enabled else '❌ Kapali'}",
            f"  Cache: {dc_total} tweet",
            f"  Hesaplar: {dc_priority} oncelikli + {dc_normal} normal",
        ]
        return "\n".join(lines)
    except Exception as e:
        return f"Durum alinamadi: {e}"


def _cmd_pending_replies() -> str:
    """Bekleyen auto-reply listesi."""
    try:
        from backend.modules.style_manager import load_auto_reply_logs

        logs = load_auto_reply_logs()
        pending = [l for l in logs if l.get("status") == "ready"]

        if not pending:
            return "✅ Bekleyen yanit yok."

        lines = [f"<b>🔔 {len(pending)} Bekleyen Yanit</b>", ""]

        for i, log in enumerate(pending[-10:], 1):  # Son 10
            account = log.get("account", "?")
            tweet_text = log.get("tweet_text", "")[:100]
            reply_text = log.get("reply_text", "")[:150]
            score = log.get("engagement_score", 0)
            tweet_id = log.get("tweet_id", "")
            url = f"https://x.com/{account}/status/{tweet_id}" if tweet_id else ""

            lines.append(f"<b>#{i}</b> @{account} (⭐ {score:.0f})")
            lines.append(f"<i>{tweet_text}</i>")
            lines.append(f"→ {reply_text}")
            if url:
                lines.append(f'<a href="{url}">Tweet</a>')
            lines.append("")

        msg = "\n".join(lines)
        if len(msg) > 4000:
            msg = msg[:4000] + "\n\n<i>...mesaj kesildi</i>"
        return msg
    except Exception as e:
        return f"Hata: {e}"


def _cmd_discovery() -> str:
    """Son discovery sonuclari."""
    try:
        from backend.modules.style_manager import load_discovery_cache

        cache = load_discovery_cache()
        if not cache:
            return "🔍 Henuz tarama yapilmamis."

        # En yuksek engagement'li 10 tweet
        top = sorted(cache, key=lambda x: x.get("display_score", 0), reverse=True)[:10]

        lines = [
            f"<b>🔍 Hesap Kesfi — {len(cache)} tweet</b>",
            "",
        ]

        # Hesap bazli ozet
        account_counts: dict[str, int] = {}
        for t in cache:
            acc = t.get("account", "")
            account_counts[acc] = account_counts.get(acc, 0) + 1

        acc_summary = ", ".join(f"@{a}({c})" for a, c in
                                sorted(account_counts.items(), key=lambda x: -x[1])[:8])
        lines.append(f"👥 {acc_summary}")
        lines.append("")
        lines.append("<b>En iyi tweetler:</b>")

        for i, t in enumerate(top, 1):
            acc = t.get("account", "?")
            text = t.get("summary_tr", t.get("text", ""))[:120]
            score = t.get("display_score", 0)
            url = t.get("tweet_url", "")
            is_priority = "⭐" if t.get("is_priority") else ""

            lines.append(f"\n<b>#{i}</b> {is_priority}@{acc} (🔥 {score:.0f})")
            lines.append(f"{text}")
            if url:
                lines.append(f'<a href="{url}">Gor</a>')

        msg = "\n".join(lines)
        if len(msg) > 4000:
            msg = msg[:4000] + "\n\n<i>...mesaj kesildi</i>"
        return msg
    except Exception as e:
        return f"Hata: {e}"


def _chat_with_ai(user_message: str) -> str:
    """MiniMax ile sohbet — sistem context'i + kullanici mesaji."""
    try:
        from backend.config import get_settings
        settings = get_settings()

        # Sistem durumunu context'e ekle
        system_context = _build_system_context()

        system_prompt = (
            "Sen X (Twitter) AI Otomasyon sistemi asistanisin. "
            "Kullaniciyla Turkce sohbet ediyorsun. Samimi ve yardimci ol. "
            "Kisa ve oz cevaplar ver. Emoji kullanabilirsin.\n\n"
            "SISTEM DURUMU:\n" + system_context
        )

        # MiniMax > Anthropic > OpenAI sirasiyla dene
        if settings.minimax_api_key:
            return _call_minimax(settings.minimax_api_key, system_prompt, user_message)
        elif settings.anthropic_api_key:
            return _call_anthropic(settings.anthropic_api_key, system_prompt, user_message)
        elif settings.openai_api_key:
            return _call_openai(settings.openai_api_key, system_prompt, user_message)
        else:
            return "AI API anahtari ayarlanmamis. Ayarlar sayfasindan ekle."
    except Exception as e:
        logger.exception("Telegram chat AI error")
        return f"AI cevap uretemedi: {e}"


def _build_system_context() -> str:
    """Mevcut sistem durumunu ozetleyen context metni."""
    parts = []
    try:
        from backend.modules.style_manager import (
            load_auto_reply_logs, load_discovery_cache,
            load_auto_reply_config, load_discovery_config,
        )

        ar_config = load_auto_reply_config()
        ar_logs = load_auto_reply_logs()
        pending = sum(1 for l in ar_logs if l.get("status") == "ready")
        published = sum(1 for l in ar_logs if l.get("status") == "published")
        parts.append(f"Auto-reply: {'aktif' if ar_config.get('enabled') else 'kapali'}, "
                     f"{pending} bekleyen, {published} paylasilan")

        dc_config = load_discovery_config()
        dc_cache = load_discovery_cache()
        parts.append(f"Hesap kesfi: {'aktif' if dc_config.get('enabled') else 'kapali'}, "
                     f"{len(dc_cache)} tweet cache'te")
    except Exception:
        parts.append("Sistem durumu alinamadi")

    return "\n".join(parts)


def _call_minimax(api_key: str, system_prompt: str, user_message: str) -> str:
    """MiniMax API ile chat completion."""
    url = "https://api.minimaxi.chat/v1/text/chatcompletion_v2"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {
        "model": "MiniMax-Text-01",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 1000,
        "temperature": 0.7,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        choices = result.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "Cevap uretilemedi.")
    return "Cevap uretilemedi."


def _call_anthropic(api_key: str, system_prompt: str, user_message: str) -> str:
    """Anthropic Claude API ile chat."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1000,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_message},
        ],
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        content = result.get("content", [])
        if content:
            return content[0].get("text", "Cevap uretilemedi.")
    return "Cevap uretilemedi."


def _call_openai(api_key: str, system_prompt: str, user_message: str) -> str:
    """OpenAI API ile chat."""
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 1000,
        "temperature": 0.7,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        choices = result.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "Cevap uretilemedi.")
    return "Cevap uretilemedi."


def check_telegram_messages():
    """
    Telegram'dan yeni mesajlari cek ve isle.
    Scheduler tarafindan her 5 saniyede bir cagirilir.
    """
    global _last_update_id

    notifier = _get_notifier()
    if not notifier:
        return

    try:
        updates = notifier.get_updates(offset=_last_update_id + 1 if _last_update_id else 0,
                                        timeout=1)
    except Exception:
        return

    for update in updates:
        update_id = update.get("update_id", 0)
        if update_id <= _last_update_id:
            continue
        _last_update_id = update_id

        message = update.get("message", {})
        if not message:
            continue

        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "").strip()

        if not text or not chat_id:
            continue

        # Sadece ayarli chat_id'den gelen mesajlari isle (guvenlik)
        if chat_id != notifier.chat_id:
            logger.warning("Telegram: Yetkisiz mesaj chat_id=%s", chat_id)
            continue

        logger.info("Telegram: Mesaj alindi: %s", text[:50])

        # Buton metni mi? (emoji + text formatinda)
        mapped_cmd = _BUTTON_TO_COMMAND.get(text)
        if mapped_cmd:
            text = mapped_cmd

        # Komut mu?
        if text.startswith("/"):
            parts = text.split(maxsplit=1)
            command = parts[0].split("@")[0]  # /durum@BotName -> /durum
            args = parts[1] if len(parts) > 1 else ""
            response = _handle_command(command, args, chat_id)
        else:
            # Sohbet
            response = _chat_with_ai(text)

        # Cevabi gonder (kalici klavye ile birlikte)
        if response:
            success = notifier.send_message(
                response, parse_mode="HTML",
                reply_markup=PERSISTENT_KEYBOARD,
            )
            if not success:
                notifier.send_message(
                    response, parse_mode="",
                    reply_markup=PERSISTENT_KEYBOARD,
                )
