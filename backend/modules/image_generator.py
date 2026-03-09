"""
Image Generator — Gemini API ile infografik gorsel uretimi.

2 asamali akis:
1. Mevcut AI (Claude/MiniMax/OpenAI) ile arastirma sonuclarindan infografik brief olustur
2. Gemini ile brief'e gore 16:9 landscape infografik uret

Kullanim:
    from backend.modules.image_generator import generate_infographic
    result = generate_infographic(
        topic="GPT-5 Benchmark Sonuclari",
        research_summary="...",
        key_points=["...", "..."],
        gemini_api_key="...",
        ai_client=...,
        ai_model="...",
        ai_provider="anthropic",
    )
"""
import base64
import logging
import re
import json
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class InfographicResult:
    """Uretilen infografik sonucu."""
    success: bool
    image_base64: str = ""       # base64 encoded PNG
    image_format: str = "png"
    brief: str = ""              # AI tarafindan olusturulan brief
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "image_base64": self.image_base64,
            "image_format": self.image_format,
            "brief": self.brief,
            "error": self.error,
        }


# ── Step 1: Brief Olusturma ──────────────────────────────

BRIEF_SYSTEM_PROMPT = """Sen bir infografik tasarim direktörusun. Sana verilen arastirma sonuclarindan Twitter/X icin 16:9 landscape infografik brief'i olusturacaksin.

KURALLAR:
- Brief MUTLAKA Turkce olacak
- Baslik kisa ve catchy olmali (max 8 kelime)
- 3-5 ana mesaj/bilgi cikar (kisa cumleler)
- Varsa anahtar sayilar/istatistikler belirt
- Renk onerisinde bulun (konu ile uyumlu)
- Her bilgi maddesi yaninda uygun bir emoji belirt

CIKTI FORMATI (JSON):
{
  "title": "Ana Baslik",
  "subtitle": "Alt baslik (opsiyonel, kisa aciklama)",
  "key_points": [
    {"emoji": "...", "text": "Kisa bilgi maddesi 1"},
    {"emoji": "...", "text": "Kisa bilgi maddesi 2"},
    {"emoji": "...", "text": "Kisa bilgi maddesi 3"}
  ],
  "stats": [
    {"value": "95%", "label": "Dogruluk"},
    {"value": "2x", "label": "Hiz Artisi"}
  ],
  "color_theme": "mavi-mor",
  "mood": "teknolojik"
}

Sadece JSON don, baska bir sey yazma."""


def _create_brief(
    topic: str,
    research_summary: str,
    key_points: list[str],
    ai_client,
    ai_model: str,
    ai_provider: str,
) -> dict:
    """Arastirma sonuclarindan infografik brief'i olustur."""

    user_content = f"""KONU: {topic}

ARASTIRMA OZETI:
{research_summary[:3000]}

ANAHTAR NOKTALAR:
{chr(10).join(f'- {p}' for p in key_points[:10])}

Bu bilgilerden Twitter icin etkileyici bir 16:9 landscape infografik brief'i olustur."""

    try:
        if ai_provider == "anthropic":
            resp = ai_client.messages.create(
                model=ai_model or "claude-sonnet-4-20250514",
                max_tokens=1000,
                system=BRIEF_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_content}],
            )
            text = resp.content[0].text
        else:
            # OpenAI / MiniMax / Groq
            resp = ai_client.chat.completions.create(
                model=ai_model or "gpt-4o-mini",
                max_tokens=1000,
                messages=[
                    {"role": "system", "content": BRIEF_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
            )
            text = resp.choices[0].message.content

        # Parse JSON from response
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group())

        logger.warning("Brief JSON parse edilemedi, raw text kullanilacak")
        return {"title": topic, "key_points": [{"emoji": "📌", "text": p} for p in key_points[:5]]}

    except Exception as e:
        logger.error(f"Brief olusturma hatasi: {e}")
        return {"title": topic, "key_points": [{"emoji": "📌", "text": p} for p in key_points[:5]]}


# ── Step 2: Gemini ile Gorsel Uretim ─────────────────────

def _build_gemini_prompt(brief: dict) -> str:
    """Brief'den Gemini icin gorsel uretim prompt'u olustur."""

    title = brief.get("title", "")
    subtitle = brief.get("subtitle", "")
    key_points = brief.get("key_points", [])
    stats = brief.get("stats", [])
    color_theme = brief.get("color_theme", "mavi-koyu")
    mood = brief.get("mood", "teknolojik")

    points_text = "\n".join(
        f'  - {p.get("emoji", "•")} {p.get("text", p) if isinstance(p, dict) else p}'
        for p in key_points
    )

    stats_text = ""
    if stats:
        stats_text = "\nOnemli Sayilar/Istatistikler (buyuk ve dikkat cekici yaz):\n" + "\n".join(
            f'  - {s.get("value", "")} → {s.get("label", "")}' for s in stats
        )

    return f"""Create a professional 16:9 landscape infographic image for Twitter/X.

DESIGN REQUIREMENTS:
- Modern, clean design with dark background
- Color theme: {color_theme}
- Mood: {mood}
- NO photo-realistic elements, use flat design / vector style icons
- Clear visual hierarchy: title at top, content in organized sections
- Use dividers, cards, or sections to organize information
- Make it visually rich with icons, shapes, and color accents
- All text MUST be in Turkish language
- Resolution suitable for Twitter (1200x675 or similar 16:9)

CONTENT TO DISPLAY:

Title (large, bold, top of image): {title}
{f'Subtitle: {subtitle}' if subtitle else ''}

Key Information Points (use icons/bullets, organized in cards or columns):
{points_text}
{stats_text}

STYLE: Professional tech infographic, like you'd see from a top tech media outlet.
Make it visually engaging and easy to read at a glance on a phone screen."""


def _generate_with_gemini(prompt: str, gemini_api_key: str) -> InfographicResult:
    """Gemini API ile gorsel uret."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_api_key)

        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
            ),
        )

        # Extract image from response parts
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                    img_b64 = base64.standard_b64encode(part.inline_data.data).decode("utf-8")
                    fmt = part.inline_data.mime_type.split("/")[-1]  # "png" or "jpeg"
                    return InfographicResult(
                        success=True,
                        image_base64=img_b64,
                        image_format=fmt,
                    )

        return InfographicResult(success=False, error="Gemini gorsel uretemedi — response'da image bulunamadi")

    except ImportError:
        return InfographicResult(success=False, error="google-genai paketi yuklu degil. pip install google-genai")
    except Exception as e:
        logger.error(f"Gemini gorsel uretim hatasi: {e}")
        return InfographicResult(success=False, error=str(e))


# ── Public API ────────────────────────────────────────────

def generate_infographic(
    topic: str,
    research_summary: str,
    key_points: list[str],
    gemini_api_key: str,
    ai_client=None,
    ai_model: str = "",
    ai_provider: str = "anthropic",
) -> InfographicResult:
    """
    2 asamali infografik uretim:
    1. AI ile brief olustur (opsiyonel — ai_client yoksa basit brief kullanilir)
    2. Gemini ile gorsel uret
    """
    if not gemini_api_key:
        return InfographicResult(success=False, error="Gemini API key eksik")

    # Step 1: Brief olustur
    if ai_client:
        brief = _create_brief(topic, research_summary, key_points, ai_client, ai_model, ai_provider)
    else:
        brief = {
            "title": topic,
            "key_points": [{"emoji": "📌", "text": p} for p in key_points[:5]],
            "color_theme": "mavi-koyu",
            "mood": "teknolojik",
        }

    logger.info(f"Infografik brief olusturuldu: {brief.get('title', topic)}")

    # Step 2: Gemini ile gorsel uret
    prompt = _build_gemini_prompt(brief)
    result = _generate_with_gemini(prompt, gemini_api_key)
    result.brief = json.dumps(brief, ensure_ascii=False, indent=2)

    return result
