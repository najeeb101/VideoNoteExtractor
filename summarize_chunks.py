import os
import sys
import time
import re
import json

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not found. Install with: py -m pip install openai")
    sys.exit(1)

from dotenv import load_dotenv

# Load environment variables (like OPENAI_API_KEY from .env)
load_dotenv()

api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    print("Error: OPENAI_API_KEY environment variable not found.")
    sys.exit(1)

model_name = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
client = OpenAI(api_key=api_key)

TS_RE = re.compile(r"\[(\d{2}:\d{2}:\d{2})\]")

def _ts_to_seconds(ts: str) -> int:
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def _seconds_to_ts(seconds: float) -> str:
    seconds_i = int(seconds)
    h = seconds_i // 3600
    m = (seconds_i % 3600) // 60
    s = seconds_i % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def _read_float_env(name: str, default: float) -> float:
    raw_value = os.environ.get(name)
    if raw_value is None or raw_value == "":
        return default
    try:
        return float(raw_value)
    except ValueError:
        print(f"Warning: {name} must be a number. Using default {default}.")
        return default


def _read_int_env(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None or raw_value == "":
        return default
    try:
        return int(raw_value)
    except ValueError:
        print(f"Warning: {name} must be an integer. Using default {default}.")
        return default


max_cost_usd = _read_float_env("OPENAI_MAX_COST_USD", 0.0)
input_cost_per_million = _read_float_env("OPENAI_INPUT_COST_PER_MILLION", 0.0)
output_cost_per_million = _read_float_env("OPENAI_OUTPUT_COST_PER_MILLION", 0.0)
cost_tracking_enabled = (
    max_cost_usd > 0.0 and input_cost_per_million > 0.0 and output_cost_per_million > 0.0
)
if max_cost_usd > 0.0 and not cost_tracking_enabled:
    print(
        "Warning: OPENAI_MAX_COST_USD is set, but cost rates are missing. "
        "Set OPENAI_INPUT_COST_PER_MILLION and OPENAI_OUTPUT_COST_PER_MILLION to enable budget tracking."
    )

chunk_folder = "chunks"
output_file = "chunk_notes.md"

if not os.path.exists(chunk_folder):
    print(f"Error: Directory '{chunk_folder}' not found. Please run chunk_transcript.py first.")
    sys.exit(1)


def calculate_delay(total_chunks):
    """Calculates a dynamic delay to avoid API rate limiting."""
    base_delay = _read_float_env("DELAY_BASE_SECONDS", 2.0)
    add_per_chunks = _read_int_env("DELAY_ADD_PER_CHUNKS", 4)
    add_seconds = _read_float_env("DELAY_ADD_SECONDS", 1.0)
    if add_per_chunks <= 0:
        add_per_chunks = 1
    return base_delay + (total_chunks // add_per_chunks) * add_seconds


def _estimate_cost_usd(usage) -> float:
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
    return (prompt_tokens / 1_000_000) * input_cost_per_million + (
        completion_tokens / 1_000_000
    ) * output_cost_per_million

# Get all chunk files and sort them *numerically* (so chunk_2 comes before chunk_10)
files = [f for f in os.listdir(chunk_folder) if f.startswith("chunk_") and f.endswith(".txt")]
files.sort(key=lambda x: int(x.split('_')[1].split('.')[0]))

if not files:
    print(f"No chunks found in '{chunk_folder}'. Please check your transcript.")
    sys.exit()

# Calculate the delay based on the total number of chunks
total_chunks = len(files)
dynamic_delay = calculate_delay(total_chunks)
print(f"[*] Found {total_chunks} chunks. Using a dynamic delay of {dynamic_delay:.1f} seconds between requests.")
print(f"[*] Using OpenAI model: {model_name}")

total_cost_usd = 0.0
budget_exceeded = False
usage_warning_shown = False
recent_bullets_context = ""

slides_index_path = os.environ.get("SLIDES_INDEX_PATH", os.path.join("slides", "index.json"))
slide_entries: list[dict] = []
if os.path.exists(slides_index_path):
    try:
        with open(slides_index_path, "r", encoding="utf-8") as f:
            slide_entries = json.load(f) or []
        print(f"[*] Loaded slide OCR index: {slides_index_path} ({len(slide_entries)} entries)")
    except Exception as e:
        print(f"Warning: Failed to load slide OCR index at {slides_index_path}: {e}")
        slide_entries = []

with open(output_file, "w", encoding="utf-8") as notes:
    notes.write("# Chunk Notes\n\n")
    # Use enumerate to get the index of the current file
    for i, file in enumerate(files):
        filepath = os.path.join(chunk_folder, file)
        with open(filepath, "r", encoding="utf-8") as f:
            chunk = f.read()

        ts_matches = TS_RE.findall(chunk)
        start_ts = ts_matches[0] if ts_matches else None
        end_ts = ts_matches[-1] if ts_matches else None
        ts_range = f"[{start_ts} - {end_ts}]" if (start_ts and end_ts) else ""

        slide_context = ""
        if slide_entries and start_ts and end_ts:
            start_s = _ts_to_seconds(start_ts)
            end_s = _ts_to_seconds(end_ts)
            # Include slide OCR text that falls inside this chunk window.
            relevant = []
            for entry in slide_entries:
                try:
                    ts_val = float(entry.get("timestamp", -1))
                except Exception:
                    continue
                if ts_val < 0:
                    continue
                ts_int = int(ts_val)
                if start_s <= ts_int <= end_s:
                    text = (entry.get("cleaned_text") or entry.get("ocr_text") or "").strip()
                    if not text:
                        continue
                    # Clip per-slide text to avoid blowing up the prompt.
                    if len(text) > 500:
                        text = text[:500] + "…"
                    relevant.append(f"- [{_seconds_to_ts(ts_val)}] {text}")
            if relevant:
                slide_context = "\n".join(relevant[:25])

        prompt = f"""
You are creating study notes from a lecture transcript.

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
{recent_bullets_context}

Slide text (OCR) in this time window (may contain errors):
{slide_context}

Transcript section:
{chunk}
"""
        print(f"Processing {file} ({i + 1}/{total_chunks})...")
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                )
                response_text = response.choices[0].message.content or ""
                notes.write(f"## {file} {ts_range}\n\n{response_text.strip()}\n\n")
                # Provide lightweight continuity across chunks to reduce repetition.
                # Keep only the last ~30 bullet lines from the latest output.
                bullet_lines = [
                    line.strip()
                    for line in response_text.splitlines()
                    if line.strip().startswith("- ")
                ]
                recent_bullets_context = "\n".join(bullet_lines[-30:])

                if cost_tracking_enabled:
                    if response.usage is None:
                        if not usage_warning_shown:
                            print("Warning: Usage data missing; cannot track cost.")
                            usage_warning_shown = True
                    else:
                        total_cost_usd += _estimate_cost_usd(response.usage)
                        print(f"  Estimated cost so far: ${total_cost_usd:.4f}")
                        if total_cost_usd >= max_cost_usd and max_cost_usd > 0.0:
                            print(f"  Budget cap reached (${max_cost_usd:.2f}). Stopping early.")
                            budget_exceeded = True
                            break
                
                # To prevent hitting the API rate limit, use the dynamic delay
                print(f"  Waiting {dynamic_delay:.1f} seconds to respect API rate limits...")
                time.sleep(dynamic_delay)
                break # Success, so break out of the retry loop
            
            except Exception as e:
                print(f"  Attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 10
                    print(f"  Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    print(f"  Failed permanently on {file}: {e}")

        if budget_exceeded:
            break

print(f"Notes generated successfully in {output_file}!")
