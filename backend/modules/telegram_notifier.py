"""
Telegram Bildirim Modulu
iPhone/Android'e push bildirim gonderir.

Kurulum:
1. Telegram'da @BotFather'a git
2. /newbot yaz, isim ver (ornek: AI Gundem Bot)
3. Sana bir token verecek → secrets.toml'a ekle: telegram_bot_token = "..."
4. Botunu bul ve /start yaz
5. Chat ID'ni al → secrets.toml'a ekle: telegram_chat_id = "..."
   (Chat ID almak icin: botuna mesaj at, sonra
    https://api.telegram.org/bot<TOKEN>/getUpdates adresini ac,
    chat.id degerini kopyala)
"""
import json
import ssl
import urllib.request
import urllib.parse
import urllib.error


def _make_ssl_context() -> ssl.SSLContext:
    """SSL context olustur — Windows'ta sertifika dogrulama sorununu asariz."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


class TelegramNotifier:
    """Telegram Bot API ile bildirim gonderici."""

    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self._ssl_ctx = _make_ssl_context()

    def send_message(self, text: str, parse_mode: str = "HTML",
                     disable_preview: bool = False) -> bool:
        """Telegram'a mesaj gonder. Basarili ise True doner."""
        url = f"{self.base_url}/sendMessage"
        data = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": disable_preview,
        }

        try:
            req_data = urllib.parse.urlencode(data).encode("utf-8")
            req = urllib.request.Request(url, data=req_data)
            with urllib.request.urlopen(req, timeout=10, context=self._ssl_ctx) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return result.get("ok", False)
        except Exception as e:
            print(f"Telegram bildirim hatasi: {e}")
            return False

    def send_scan_results(self, topics: list, max_items: int = 10) -> bool:
        """Tarama sonuclarini formatli mesaj olarak gonder."""
        if not topics:
            return True  # Bos sonuc icin bildirim gonderme

        # Baslik
        lines = [f"<b>🔍 AI Gundem Taramasi</b>"]
        lines.append(f"<i>{len(topics)} yeni konu bulundu</i>")
        lines.append("")

        for i, topic in enumerate(topics[:max_items], 1):
            # Kategori emoji
            cat_emoji = {
                "Yeni Model": "🚀", "Model Güncelleme": "🔄",
                "Araştırma": "📄", "Benchmark": "📊",
                "Açık Kaynak": "🔓", "API/Platform": "⚙️",
                "AI Ajanlar": "🤖", "Görüntü/Video": "🎨",
                "Endüstri": "💼", "GitHub/Repo": "💻",
                "AI Araçlar": "🛠️", "Donanım": "🖥️", "Genel": "📌",
            }.get(getattr(topic, 'category', ''), "📌")

            author = getattr(topic, 'author_username', '?')
            text = getattr(topic, 'text', '')[:200]
            url = getattr(topic, 'url', '')
            likes = getattr(topic, 'like_count', 0)
            rts = getattr(topic, 'retweet_count', 0)

            lines.append(f"{cat_emoji} <b>#{i}</b> @{author}")
            lines.append(f"{text}")
            lines.append(f"❤️ {likes} | 🔁 {rts}")
            if url:
                lines.append(f'<a href="{url}">Tweet\'i ac</a>')
            lines.append("")

        if len(topics) > max_items:
            lines.append(f"<i>...ve {len(topics) - max_items} konu daha</i>")

        message = "\n".join(lines)

        # Telegram mesaj limiti 4096 karakter
        if len(message) > 4000:
            message = message[:4000] + "\n\n<i>...mesaj kesildi</i>"

        return self.send_message(message)

    def send_auto_reply_notification(self, account: str, tweet_text: str,
                                       reply_text: str, tweet_id: str = "",
                                       engagement_score: float = 0) -> bool:
        """Auto-reply hazir bildirim gonder."""
        tweet_url = f"https://x.com/{account}/status/{tweet_id}" if tweet_id else ""
        lines = [
            "<b>🔔 Otomatik Yanit Hazir</b>",
            "",
            f"<b>@{account}</b> tweet'ine yanit uretildi",
            f"❤️ Engagement: {engagement_score:.0f}",
            "",
            "<b>Orijinal tweet:</b>",
            f"<i>{tweet_text[:300]}</i>",
            "",
            "<b>Uretilen yanit:</b>",
            reply_text[:500],
        ]
        if tweet_url:
            lines.append("")
            lines.append(f'<a href="{tweet_url}">Tweet\'i ac</a>')
        lines.append("")
        lines.append("<i>Dashboard'dan onayla veya duzenle</i>")

        message = "\n".join(lines)
        if len(message) > 4000:
            message = message[:4000] + "\n\n<i>...mesaj kesildi</i>"
        return self.send_message(message)

    def send_self_reply_notification(self, tweet_text: str, reply_text: str,
                                      reply_number: int = 1,
                                      reply_url: str = "",
                                      status: str = "published") -> bool:
        """Self-reply bildirim gonder."""
        if status == "published":
            title = "💬 Self-Reply Paylasildi"
        else:
            title = "💬 Self-Reply Hazir"

        lines = [
            f"<b>{title}</b>",
            "",
            f"<b>Orijinal tweet:</b>",
            f"<i>{tweet_text[:200]}</i>",
            "",
            f"<b>Reply #{reply_number}:</b>",
            reply_text[:500],
        ]
        if reply_url:
            lines.append("")
            lines.append(f'<a href="{reply_url}">Reply\'i gor</a>')

        message = "\n".join(lines)
        if len(message) > 4000:
            message = message[:4000] + "\n\n<i>...mesaj kesildi</i>"
        return self.send_message(message)

    def send_discovery_summary(self, new_count: int, total_count: int,
                                accounts_scanned: list[str],
                                top_tweets: list[dict] | None = None) -> bool:
        """Discovery tarama ozeti gonder."""
        if new_count == 0:
            return True  # Yeni tweet yoksa bildirim gonderme

        lines = [
            "<b>🔍 Hesap Kesfi Taramasi</b>",
            "",
            f"📊 <b>{new_count}</b> yeni tweet bulundu (toplam: {total_count})",
            f"👥 Taranan: {', '.join(f'@{a}' for a in accounts_scanned)}",
        ]

        if top_tweets:
            lines.append("")
            lines.append("<b>En iyi tweetler:</b>")
            for i, t in enumerate(top_tweets[:5], 1):
                acc = t.get("account", "?")
                text = t.get("summary_tr", t.get("text", ""))[:150]
                score = t.get("display_score", 0)
                url = t.get("tweet_url", "")
                lines.append(f"\n<b>#{i}</b> @{acc} (⭐ {score:.0f})")
                lines.append(f"{text}")
                if url:
                    lines.append(f'<a href="{url}">Gor</a>')

        message = "\n".join(lines)
        if len(message) > 4000:
            message = message[:4000] + "\n\n<i>...mesaj kesildi</i>"
        return self.send_message(message)

    def get_updates(self, offset: int = 0, timeout: int = 1) -> list[dict]:
        """Telegram'dan yeni mesajlari cek (long polling)."""
        url = f"{self.base_url}/getUpdates"
        params = {
            "timeout": timeout,
            "allowed_updates": '["message"]',
        }
        if offset:
            params["offset"] = offset

        try:
            query = urllib.parse.urlencode(params)
            req = urllib.request.Request(f"{url}?{query}")
            with urllib.request.urlopen(req, timeout=timeout + 5, context=self._ssl_ctx) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                if result.get("ok"):
                    return result.get("result", [])
        except Exception:
            pass
        return []

    def test_connection(self) -> dict:
        """Bot baglatisini test et. Bot bilgilerini doner."""
        url = f"{self.base_url}/getMe"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10, context=self._ssl_ctx) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                if result.get("ok"):
                    bot = result["result"]
                    return {
                        "ok": True,
                        "bot_name": bot.get("first_name", ""),
                        "bot_username": bot.get("username", ""),
                    }
            return {"ok": False, "error": "API yanit vermedi"}
        except Exception as e:
            return {"ok": False, "error": str(e)}
