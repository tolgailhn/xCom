"""
Claude Code CLI Client — Uses `claude -p` for research and tweet generation.
Leverages Claude Max subscription (unlimited usage, zero API cost).

Usage:
  - Research: claude_code_research(topic) → ResearchResult-compatible dict
  - Tweet generation: claude_code_generate(system_prompt, user_prompt) → str
"""
import subprocess
import json
import logging
import shutil

logger = logging.getLogger(__name__)

# Check if claude CLI is available
CLAUDE_CLI = shutil.which("claude")

# Timeout for CLI calls (seconds)
RESEARCH_TIMEOUT = 120
GENERATE_TIMEOUT = 60


def is_available() -> bool:
    """Check if claude CLI is installed and accessible."""
    return CLAUDE_CLI is not None


def _run_claude(prompt: str, timeout: int = GENERATE_TIMEOUT,
                allowed_tools: list[str] | None = None,
                output_format: str = "text") -> str:
    """Run claude CLI with a prompt and return the output.

    Args:
        prompt: The prompt to send
        timeout: Timeout in seconds
        allowed_tools: List of tools to allow (e.g. ["WebSearch", "WebFetch"])
        output_format: "text" or "json"

    Returns:
        CLI output as string
    """
    if not CLAUDE_CLI:
        raise RuntimeError("Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code")

    cmd = [CLAUDE_CLI, "-p", prompt, "--output-format", output_format]

    if allowed_tools:
        for tool in allowed_tools:
            cmd.extend(["--allowedTools", tool])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=None,  # inherit parent env
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            logger.warning(f"Claude CLI returned non-zero: {result.returncode}, stderr: {stderr[:200]}")
            # Still try to use stdout if available
            if result.stdout.strip():
                return result.stdout.strip()
            raise RuntimeError(f"Claude CLI error: {stderr[:300]}")
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Claude CLI timed out after {timeout}s")


def claude_code_research(topic: str, research_sources: list[str] | None = None,
                         progress_callback=None) -> dict:
    """Research a topic using Claude Code CLI with web search capabilities.

    Args:
        topic: Topic to research
        research_sources: Not used (Claude Code decides autonomously)
        progress_callback: Optional callback for progress messages

    Returns:
        Dict with keys: summary, key_points, sources, media_urls
    """
    if progress_callback:
        progress_callback("Claude Code ile araştırma başlatılıyor...")

    prompt = f"""Aşağıdaki konu hakkında kapsamlı bir araştırma yap. Web'de arama yap, güncel kaynakları bul ve oku.

KONU: {topic}

ARAŞTIRMA TALİMATLARI:
1. Konuyla ilgili en güncel gelişmeleri bul (son 1 hafta öncelikli)
2. En az 3-5 farklı kaynak kullan
3. Spesifik rakamlar, tarihler, isimler ve teknik detaylar topla
4. Karşıt görüşleri de dahil et
5. Kaynakların URL'lerini not et

ÇIKTI FORMATI (JSON):
{{
  "summary": "Kapsamlı araştırma özeti (en az 500 kelime, detaylı)",
  "key_points": ["Önemli bulgu 1", "Önemli bulgu 2", ...],
  "sources": [
    {{"title": "Kaynak başlığı", "url": "https://...", "body": "Kısa özet"}},
    ...
  ]
}}

SADECE JSON çıktısı ver, başka bir şey yazma."""

    if progress_callback:
        progress_callback("Claude Code web'de araştırma yapıyor...")

    try:
        raw = _run_claude(
            prompt,
            timeout=RESEARCH_TIMEOUT,
            allowed_tools=["WebSearch", "WebFetch"],
            output_format="text",
        )

        if progress_callback:
            progress_callback("Claude Code araştırma sonuçlarını derliyor...")

        # Try to parse JSON from output
        result = _extract_json(raw)
        if result:
            return {
                "summary": result.get("summary", ""),
                "key_points": result.get("key_points", []),
                "sources": result.get("sources", []),
                "media_urls": [],
            }

        # If JSON parse fails, use raw text as summary
        return {
            "summary": raw,
            "key_points": [],
            "sources": [],
            "media_urls": [],
        }

    except Exception as e:
        logger.error(f"Claude Code research error: {e}")
        if progress_callback:
            progress_callback(f"Claude Code hatası: {e}")
        raise


def claude_code_generate(system_prompt: str, user_prompt: str) -> str:
    """Generate content using Claude Code CLI.

    Args:
        system_prompt: System instructions (persona, style, etc.)
        user_prompt: The actual generation prompt

    Returns:
        Generated text
    """
    # Combine system + user prompt for CLI
    combined = f"""SİSTEM TALİMATI:
{system_prompt}

---

KULLANICI İSTEĞİ:
{user_prompt}"""

    raw = _run_claude(combined, timeout=GENERATE_TIMEOUT)
    return raw


def _extract_json(text: str) -> dict | None:
    """Try to extract JSON object from text that may contain extra content."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON in code blocks
    import re
    patterns = [
        r'```json\s*\n(.*?)\n```',
        r'```\s*\n(.*?)\n```',
        r'\{[\s\S]*"summary"[\s\S]*\}',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                candidate = match.group(1) if match.lastindex else match.group(0)
                return json.loads(candidate)
            except (json.JSONDecodeError, IndexError):
                continue

    # Last resort: find the outermost { ... }
    start = text.find('{')
    if start >= 0:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        break

    return None
