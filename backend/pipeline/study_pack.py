"""
Study pack step: turns a run's notes into study material.

One LLM call (JSON mode) produces a TL;DR, a title for each chunk part (the
video's chapters), key terms, flashcards and a short quiz, every item tied to
a timestamp taken from the notes. The backend caches the result in
notes.study_json (GET /api/study/{run_id}); also runnable standalone:

    python study_pack.py [chunk_notes.md] [notes_reduced.md] [study_pack.json]
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import List

from pydantic import BaseModel, ValidationError

try:  # imported by the backend as pipeline.study_pack
    from ._llm import completion_kwargs, make_client_and_model
except ImportError:  # run as a script from this directory
    from _llm import completion_kwargs, make_client_and_model

TS_RE = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")
_TS = r"\d{1,2}:\d{2}(?::\d{2})?"
PART_RE = re.compile(rf"^#+\s+chunk_(\d+)\.txt\s*\[({_TS})\s*[-‐‑‒–—]\s*({_TS})\]", re.M)


class Term(BaseModel):
    term: str
    definition: str
    timestamp: str = ""


class Card(BaseModel):
    front: str
    back: str
    timestamp: str = ""


class Question(BaseModel):
    question: str
    options: List[str]
    answer_index: int
    explanation: str = ""
    timestamp: str = ""


class ChapterTitle(BaseModel):
    part: int
    title: str


class StudyPack(BaseModel):
    tldr: str
    chapters: List[ChapterTitle] = []
    key_terms: List[Term] = []
    flashcards: List[Card] = []
    quiz: List[Question] = []


def _parts(chunk_notes_md: str) -> list[tuple[int, str, str]]:
    return [(int(m[1]), m[2], m[3]) for m in PART_RE.finditer(chunk_notes_md)]


def _clean_ts(ts: str) -> str:
    ts = ts.strip().strip("[]() ")
    return ts if TS_RE.match(ts) else ""


def _sanitize(pack: StudyPack, part_ids: set[int]) -> dict:
    for item in [*pack.key_terms, *pack.flashcards, *pack.quiz]:
        item.timestamp = _clean_ts(item.timestamp)
    pack.quiz = [q for q in pack.quiz if len(q.options) >= 2 and 0 <= q.answer_index < len(q.options)]
    seen: set[int] = set()
    pack.chapters = [
        c for c in pack.chapters
        if c.part in part_ids and c.title.strip() and not (c.part in seen or seen.add(c.part))
    ]
    return pack.model_dump()


def _prompt(notes_md: str, parts: list[tuple[int, str, str]]) -> str:
    parts_list = "\n".join(f"- part {i}: {start} - {end}" for i, start, end in parts) or "- (none)"
    return f"""You are making study material from a lecture's notes.

Return ONLY a JSON object with exactly these keys:
{{
  "tldr": "string",
  "chapters": [{{"part": 0, "title": "string"}}],
  "key_terms": [{{"term": "string", "definition": "string", "timestamp": "HH:MM:SS"}}],
  "flashcards": [{{"front": "string", "back": "string", "timestamp": "HH:MM:SS"}}],
  "quiz": [{{"question": "string", "options": ["string", "string", "string", "string"], "answer_index": 0, "explanation": "string", "timestamp": "HH:MM:SS"}}]
}}

Rules:
- tldr: 2-3 plain sentences: what the video is about and its main conclusion.
- chapters: exactly one entry per part listed below, with a 3-6 word title for what that part covers.
- key_terms: 6-10 important terms, each with a one-sentence definition.
- flashcards: 8-12 cards; front is a question or prompt, back is a concise answer.
- quiz: 5 multiple-choice questions with exactly 4 options and one correct answer
  (answer_index is its 0-based position; vary the position). Wrong options must be plausible.
  explanation says briefly why the answer is right.
- Use ONLY facts from the notes. No outside knowledge.
- Every timestamp must be copied from the notes ([HH:MM:SS] next to the fact), written as HH:MM:SS.
- Plain text only: no markdown in any field.

Parts (part number: time range):
{parts_list}

Notes:
{notes_md}"""


def build_study_pack(chunk_notes_md: str, reduced_notes_md: str) -> dict:
    """Generate and validate a study pack. Raises on LLM or validation failure."""
    # The detailed notes hold every fact, so the outline is only a fallback:
    # sending both overflows Groq's free tier (8k tokens/minute per request).
    # Local models (8k context) need a smaller input still.
    limit = 12_000 if os.environ.get("LLM_PROVIDER", "").lower() == "ollama" else 40_000
    notes_md = (chunk_notes_md or reduced_notes_md)[:limit]
    parts = _parts(chunk_notes_md)
    prompt = _prompt(notes_md, parts)

    client, model = make_client_and_model()
    last_error: Exception | None = None
    for _ in range(2):  # one retry on malformed output
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            response_format={"type": "json_object"},
            **completion_kwargs(model),
        )
        try:
            pack = StudyPack.model_validate(json.loads(resp.choices[0].message.content or ""))
            return _sanitize(pack, {i for i, _, _ in parts})
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
    raise RuntimeError(f"Study pack output was invalid: {last_error}")


def main() -> None:
    try:
        from _console import enable_utf8_console
        enable_utf8_console()
    except ImportError:
        pass
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    chunk_path = sys.argv[1] if len(sys.argv) > 1 else "chunk_notes.md"
    reduced_path = sys.argv[2] if len(sys.argv) > 2 else "notes_reduced.md"
    out_path = sys.argv[3] if len(sys.argv) > 3 else "study_pack.json"
    with open(chunk_path, encoding="utf-8") as f:
        chunk = f.read()
    reduced = ""
    if os.path.exists(reduced_path):
        with open(reduced_path, encoding="utf-8") as f:
            reduced = f.read()

    pack = build_study_pack(chunk, reduced)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
    print(
        f"[OK] Study pack written to {os.path.abspath(out_path)}: "
        f"{len(pack['chapters'])} chapters, {len(pack['key_terms'])} terms, "
        f"{len(pack['flashcards'])} flashcards, {len(pack['quiz'])} quiz questions"
    )


if __name__ == "__main__":
    main()
