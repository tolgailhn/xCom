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

BRIEF_SYSTEM_PROMPT = """Sen bir HABER infografik editörusun (gazetecilik tonu). Sana verilen arastirma sonuclarindan Twitter/X icin 16:9 landscape HABER infografik brief'i olusturacaksin.

KURALLAR:
- Brief MUTLAKA Turkce olacak
- Bu bir HABER/BILGI infografigi — reklam veya tanitim DEGIL
- Baslik haber basligi gibi olmali (max 8 kelime, "Tanitiyoruz" gibi promosyon ifadeleri YASAK)
- 3-5 ana BILGI/VERI maddesi cikar (kisa, nesnel cumleler)
- Varsa anahtar sayilar/istatistikler MUTLAKA belirt (yuzde, rakam, karsilastirma)
- Renk onerisinde bulun (konu ile uyumlu)
- Her bilgi maddesi yaninda uygun bir emoji belirt
- Hicbir maddede "hemen dene", "kesfet", "basvur" gibi CTA ifadesi OLMASIN

CIKTI FORMATI (JSON):
{
  "title": "Haber Basligi Gibi Kisa Baslik",
  "subtitle": "Alt baslik (1 cumle ozet — nesnel, bilgilendirici)",
  "key_points": [
    {"emoji": "...", "text": "Nesnel bilgi maddesi 1"},
    {"emoji": "...", "text": "Nesnel bilgi maddesi 2"},
    {"emoji": "...", "text": "Nesnel bilgi maddesi 3"}
  ],
  "stats": [
    {"value": "95%", "label": "Dogruluk Orani"},
    {"value": "2x", "label": "Onceki Modele Gore Hiz"}
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

    return f"""Create a professional 16:9 landscape NEWS INFOGRAPHIC image for Twitter/X.

THIS IS A NEWS/INFORMATION INFOGRAPHIC — NOT AN ADVERTISEMENT OR PRODUCT PROMOTION.

STRICT RULES — DO NOT INCLUDE ANY OF THESE:
- NO promotional language ("Tanitiyoruz", "Hemen Basla", "Kesfet", "Dene", "Basvur", "Satin Al")
- NO call-to-action buttons or links ("Baglantiya Git", "Hemen Basla", "Daha Fazla", "Kayit Ol")
- NO marketing/sales tone — this is journalism, not advertising
- NO arrows pointing to buttons or external links
- NO "introducing", "presenting", "meet", "discover" style phrases
- NO QR codes, URLs, or website links
- NO bottom banner with CTA

DESIGN REQUIREMENTS:
- Modern, clean design with dark background
- Color theme: {color_theme}
- Mood: {mood}
- Flat design / vector style icons — NO photo-realistic elements
- Clear visual hierarchy: title at top, factual content below
- Use dividers, cards, or grid sections to organize information densely
- Fill the space with DATA — stats, facts, comparisons, timelines
- Make it information-dense like a newspaper infographic or Bloomberg chart
- All text MUST be in Turkish language
- Resolution: 1200x675 (16:9 landscape)
- Add a small source/credit text at bottom-right corner: "AI Gundem"

CONTENT TO DISPLAY:

Headline (large, bold, top): {title}
{f'Subheadline: {subtitle}' if subtitle else ''}

Key Facts (organized in cards, columns, or grid — NOT as a product feature list):
{points_text}
{stats_text}

TONE: Objective, factual, journalistic — like Reuters, Bloomberg, or TRT Haber infographics.
Present INFORMATION and DATA, not a product pitch. Think "news summary visual" not "product launch poster"."""


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
