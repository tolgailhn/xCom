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
import urllib.request
import urllib.parse
import urllib.error


class TelegramNotifier:
    """Telegram Bot API ile bildirim gonderici."""

    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"

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
            with urllib.request.urlopen(req, timeout=10) as resp:
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

    def test_connection(self) -> dict:
        """Bot baglatisini test et. Bot bilgilerini doner."""
        url = f"{self.base_url}/getMe"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
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
