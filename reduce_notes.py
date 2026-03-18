"""
Reduce step for chunked notes.

Reads a chunk-by-chunk notes file (e.g. notes.txt), extracts bullet-like takeaways,
and consolidates them into a single deduplicated study outline in Markdown.
"""

from __future__ import annotations

import os
import re
import sys
from typing import Iterable, List

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not found. Install with: py -m pip install openai")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


def _read_int_env(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None or raw_value == "":
        return default
    try:
        return int(raw_value)
    except ValueError:
        print(f"Warning: {name} must be an integer. Using default {default}.")
        return default


def _extract_takeaway_lines(text: str) -> List[str]:
    """
    Extracts bullet-ish takeaway lines from notes produced by chunk summarization.

    Supports:
      - Markdown bullets: "- ..."
      - Numbered lists: "1. ..." (converted to bullets)
    """
    lines: List[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("- "):
            lines.append(line)
            continue
        m = re.match(r"^(\d+)\.\s+(.*)$", line)
        if m:
            lines.append(f"- {m.group(2).strip()}")
            continue
    # De-dup identical lines while preserving order
    seen = set()
    deduped: List[str] = []
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        deduped.append(line)
    return deduped


def _pack_batches(lines: Iterable[str], max_chars: int) -> List[str]:
    batches: List[str] = []
    buf: List[str] = []
    size = 0
    for line in lines:
        add = len(line) + 1
        if buf and size + add > max_chars:
            batches.append("\n".join(buf))
            buf = []
            size = 0
        buf.append(line)
        size += add
    if buf:
        batches.append("\n".join(buf))
    return batches


def _chat(client: OpenAI, model: str, user_prompt: str) -> str:
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.2,
    )
    return resp.choices[0].message.content or ""


def reduce_notes(input_path: str = "chunk_notes.md", output_path: str = "notes_reduced.md") -> str:
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    if load_dotenv is not None:
        load_dotenv()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable not found.")

    model_name = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)

    with open(input_path, "r", encoding="utf-8") as f:
        raw = f.read()

    takeaway_lines = _extract_takeaway_lines(raw)
    if not takeaway_lines:
        raise RuntimeError(
            f"No bullet/numbered takeaway lines found in {input_path}. "
            "Run summarize_chunks.py (bullets-only) or provide a notes file with bullets."
        )

    max_chars = _read_int_env("REDUCE_BATCH_CHARS", 12000)
    batches = _pack_batches(takeaway_lines, max_chars=max_chars)

    print(f"[*] Reducing {len(takeaway_lines)} lines from {input_path} in {len(batches)} batch(es)...")
    print(f"[*] Using OpenAI model: {model_name}")

    partials: List[str] = []
    for i, batch in enumerate(batches, start=1):
        prompt = f"""
You are consolidating study notes from multiple chunks of the same lecture.

Input is a list of bullet points (some may be redundant or overlapping).
Your job: deduplicate, merge, and rewrite into compact, high-signal notes.

Output rules:
- Output Markdown with headings and bullet points.
- Use 5-10 section headings (## / ###) with bullets under them.
- No boilerplate, no intro/outro, no "this summary..." lines.
- Keep bullets concrete; bold key terms like **this**.
- Preserve important examples as bullets under the relevant section.

Bullet points to consolidate:
{batch}
"""
        print(f"  - Map {i}/{len(batches)} ...")
        partials.append(_chat(client, model_name, prompt).strip())

    combined = "\n\n".join(partials)

    final_prompt = f"""
You are producing the FINAL consolidated study outline for a lecture.

You will be given multiple partial consolidated outlines. Merge them into ONE clean outline.

Output rules:
- Output Markdown only.
- Use clear section headings (## / ###).
- Under each section, use bullet points only.
- Deduplicate aggressively and remove any repeated or near-duplicate points.
- No boilerplate, no intro/outro, no separators.

Partial outlines:
{combined}
"""
    print("  - Reduce (final) ...")
    final = _chat(client, model_name, final_prompt).strip() + "\n"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final)

    abs_path = os.path.abspath(output_path)
    print(f"[OK] Reduced notes written to: {abs_path}")
    return abs_path


def main() -> None:
    input_path = sys.argv[1] if len(sys.argv) > 1 else "chunk_notes.md"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "notes_reduced.md"
    reduce_notes(input_path, output_path)


if __name__ == "__main__":
    main()

