"""
Summarize transcript chunks into timestamped study notes using the OpenAI API.

Usage:
    py summarize_chunks.py [chunk_dir] [output_file]

Defaults:
    chunk_dir   = chunks/
    output_file = chunk_notes.md

Environment variables (see .env.example for full list):
    OPENAI_API_KEY, OPENAI_MODEL, OPENAI_MAX_COST_USD,
    OPENAI_INPUT_COST_PER_MILLION, OPENAI_OUTPUT_COST_PER_MILLION,
    DELAY_BASE_SECONDS, DELAY_ADD_PER_CHUNKS, DELAY_ADD_SECONDS,
    SUMMARIZE_WORKERS, SLIDES_INDEX_PATH
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock
from typing import Any

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not found. Install with: py -m pip install openai")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[assignment]

TS_RE = re.compile(r"\[(\d{2}:\d{2}:\d{2})\]")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ts_to_seconds(ts: str) -> int:
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def _seconds_to_ts(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def _read_float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "")
    try:
        return float(raw) if raw else default
    except ValueError:
        print(f"Warning: {name} must be a number. Using default {default}.")
        return default


def _read_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "")
    try:
        return int(raw) if raw else default
    except ValueError:
        print(f"Warning: {name} must be an integer. Using default {default}.")
        return default


def _calculate_delay(total_chunks: int) -> float:
    base = _read_float_env("DELAY_BASE_SECONDS", 2.0)
    per = max(1, _read_int_env("DELAY_ADD_PER_CHUNKS", 4))
    add = _read_float_env("DELAY_ADD_SECONDS", 1.0)
    return base + (total_chunks // per) * add


def _estimate_cost(usage: Any, input_cpp: float, output_cpp: float) -> float:
    inp = getattr(usage, "prompt_tokens", 0) or 0
    out = getattr(usage, "completion_tokens", 0) or 0
    return (inp / 1_000_000) * input_cpp + (out / 1_000_000) * output_cpp


def _load_slide_entries(slides_index_path: str) -> list[dict]:
    if not os.path.exists(slides_index_path):
        return []
    try:
        with open(slides_index_path, "r", encoding="utf-8") as f:
            entries = json.load(f) or []
        print(f"[*] Loaded slide OCR index: {slides_index_path} ({len(entries)} entries)")
        return entries
    except Exception as e:
        print(f"Warning: Failed to load slide OCR index: {e}")
        return []


def _slide_context_for_chunk(
    slide_entries: list[dict], start_ts: str | None, end_ts: str | None
) -> str:
    if not slide_entries or not start_ts or not end_ts:
        return ""
    start_s = _ts_to_seconds(start_ts)
    end_s = _ts_to_seconds(end_ts)
    relevant: list[str] = []
    for entry in slide_entries:
        try:
            ts_val = float(entry.get("timestamp", -1))
        except (TypeError, ValueError):
            continue
        if ts_val < 0:
            continue
        # Use a small tolerance at boundaries to avoid missing edge slides.
        if start_s - 1 <= int(ts_val) <= end_s + 1:
            text = (entry.get("cleaned_text") or entry.get("ocr_text") or "").strip()
            if not text:
                continue
            if len(text) > 500:
                text = text[:500] + "…"
            relevant.append(f"- [{_seconds_to_ts(ts_val)}] {text}")
    return "\n".join(relevant[:25])


def _build_prompt(chunk: str, slide_context: str, recent_bullets: str) -> str:
    return f"""You are creating study notes from a lecture transcript.

Output format rules (must follow):
- Output ONLY Markdown bullet points (lines starting with "- ").
- No headings, no numbered lists, no intro/outro, no "this summary..." sentences, no separators.
- Each bullet should be a concrete takeaway (fact, definition, explanation, or example).
- Bold important terms like **this**.
- Keep it concise: 6-12 bullets max.
- If timestamps are present in the transcript, EVERY bullet MUST end with the most relevant timestamp in brackets, like this: ... [00:12:34]

Anti-repetition rule:
- Avoid repeating what is already covered below. If a point is already covered, do NOT restate it.

Already covered (recent bullets):
{recent_bullets}

Slide text (OCR) in this time window (may contain errors):
{slide_context}

Transcript section:
{chunk}"""


def _call_api(client: OpenAI, model: str, prompt: str, max_retries: int = 3) -> tuple[str, Any]:
    """Returns (response_text, usage). Raises on permanent failure."""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
            return response.choices[0].message.content or "", response.usage
        except Exception as e:
            print(f"  Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 10
                print(f"  Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise


# ── Core ──────────────────────────────────────────────────────────────────────

def summarize_chunks(
    chunk_dir: str = "chunks",
    output_file: str = "chunk_notes.md",
) -> str:
    """
    Summarize all chunks in chunk_dir into output_file.
    Returns the absolute path to the output file.
    """
    if load_dotenv is not None:
        load_dotenv()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not found.")
        sys.exit(1)

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)

    max_cost = _read_float_env("OPENAI_MAX_COST_USD", 0.0)
    input_cpp = _read_float_env("OPENAI_INPUT_COST_PER_MILLION", 0.0)
    output_cpp = _read_float_env("OPENAI_OUTPUT_COST_PER_MILLION", 0.0)
    cost_tracking = max_cost > 0.0 and input_cpp > 0.0 and output_cpp > 0.0
    if max_cost > 0.0 and not cost_tracking:
        print(
            "Warning: OPENAI_MAX_COST_USD is set but cost rates are missing. "
            "Set OPENAI_INPUT_COST_PER_MILLION and OPENAI_OUTPUT_COST_PER_MILLION."
        )

    workers = _read_int_env("SUMMARIZE_WORKERS", 1)
    parallel = workers > 1

    if not os.path.isdir(chunk_dir):
        print(f"Error: Chunk directory '{chunk_dir}' not found. Run chunk_transcript.py first.")
        sys.exit(1)

    files = sorted(
        [f for f in os.listdir(chunk_dir) if f.startswith("chunk_") and f.endswith(".txt")],
        key=lambda x: int(x.split("_")[1].split(".")[0]),
    )
    if not files:
        print(f"Error: No chunks found in '{chunk_dir}'. Check your transcript.")
        sys.exit(1)

    total_chunks = len(files)
    delay = _calculate_delay(total_chunks)
    slides_index = os.environ.get("SLIDES_INDEX_PATH", os.path.join("slides", "index.json"))
    slide_entries = _load_slide_entries(slides_index)

    print(f"[*] Found {total_chunks} chunks. Model: {model}")
    if parallel:
        print(f"[*] Parallel mode: {workers} workers (anti-repetition disabled)")
    else:
        print(f"[*] Sequential mode. Delay between requests: {delay:.1f}s")

    if parallel:
        results = _run_parallel(
            files, chunk_dir, client, model, slide_entries, workers, delay
        )
    else:
        results = _run_sequential(
            files, chunk_dir, client, model, slide_entries, delay,
            cost_tracking, input_cpp, output_cpp, max_cost,
        )

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("# Chunk Notes\n\n")
        for section in results:
            f.write(section)

    abs_path = os.path.abspath(output_file)
    print(f"\n[OK] Notes written to: {abs_path}")
    return abs_path


def _run_sequential(
    files: list[str],
    chunk_dir: str,
    client: OpenAI,
    model: str,
    slide_entries: list[dict],
    delay: float,
    cost_tracking: bool,
    input_cpp: float,
    output_cpp: float,
    max_cost: float,
) -> list[str]:
    results: list[str] = []
    total_cost = 0.0
    usage_warning_shown = False
    recent_bullets = ""

    for i, filename in enumerate(files):
        chunk = (Path(chunk_dir) / filename).read_text(encoding="utf-8")

        ts_matches = TS_RE.findall(chunk)
        start_ts = ts_matches[0] if ts_matches else None
        end_ts = ts_matches[-1] if ts_matches else None
        ts_range = f"[{start_ts} - {end_ts}]" if (start_ts and end_ts) else ""

        slide_ctx = _slide_context_for_chunk(slide_entries, start_ts, end_ts)
        prompt = _build_prompt(chunk, slide_ctx, recent_bullets)

        print(f"Processing {filename} ({i + 1}/{len(files)})...")
        response_text, usage = _call_api(client, model, prompt)

        results.append(f"## {filename} {ts_range}\n\n{response_text.strip()}\n\n")

        # Update anti-repetition context
        bullet_lines = [
            ln.strip() for ln in response_text.splitlines() if ln.strip().startswith("- ")
        ]
        recent_bullets = "\n".join(bullet_lines[-30:])

        if cost_tracking and usage is not None:
            total_cost += _estimate_cost(usage, input_cpp, output_cpp)
            print(f"  Estimated cost so far: ${total_cost:.4f}")
            if total_cost >= max_cost:
                print(f"  Budget cap reached (${max_cost:.2f}). Stopping early.")
                break
        elif cost_tracking and not usage_warning_shown:
            print("Warning: Usage data missing; cannot track cost.")
            usage_warning_shown = True

        if i < len(files) - 1:
            print(f"  Waiting {delay:.1f}s...")
            time.sleep(delay)

    return results


def _run_parallel(
    files: list[str],
    chunk_dir: str,
    client: OpenAI,
    model: str,
    slide_entries: list[dict],
    workers: int,
    delay: float,
) -> list[str]:
    """Process chunks in parallel. Results are returned in original order."""
    results: dict[int, str] = {}
    lock = Lock()

    def process_chunk(idx: int, filename: str) -> None:
        chunk = (Path(chunk_dir) / filename).read_text(encoding="utf-8")
        ts_matches = TS_RE.findall(chunk)
        start_ts = ts_matches[0] if ts_matches else None
        end_ts = ts_matches[-1] if ts_matches else None
        ts_range = f"[{start_ts} - {end_ts}]" if (start_ts and end_ts) else ""

        slide_ctx = _slide_context_for_chunk(slide_entries, start_ts, end_ts)
        prompt = _build_prompt(chunk, slide_ctx, "")  # no anti-repetition in parallel

        with lock:
            print(f"  → Starting {filename} ({idx + 1}/{len(files)})")

        response_text, _ = _call_api(client, model, prompt)

        with lock:
            results[idx] = f"## {filename} {ts_range}\n\n{response_text.strip()}\n\n"
            print(f"  ✓ Done    {filename} ({idx + 1}/{len(files)})")

        time.sleep(delay)  # still respect rate limits

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_chunk, i, f): i for i, f in enumerate(files)}
        for future in as_completed(futures):
            future.result()  # re-raise any exception

    return [results[i] for i in range(len(files))]


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    chunk_dir = sys.argv[1] if len(sys.argv) > 1 else "chunks"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "chunk_notes.md"
    summarize_chunks(chunk_dir, output_file)


if __name__ == "__main__":
    main()
