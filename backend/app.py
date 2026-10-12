"""
Lectura — web server (FastAPI + Supabase auth).

Start with:  py app.py
Frontend:    http://localhost:3000  (Next.js dev server)
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import re
import subprocess
import sys
import threading
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from pipeline._llm import completion_kwargs
from pipeline.study_pack import build_study_pack

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

REPO_ROOT    = Path(__file__).resolve().parent
PIPELINE_DIR = REPO_ROOT / "pipeline"
OUTPUTS_DIR  = REPO_ROOT / "outputs"
STATIC_DIR   = REPO_ROOT / "static"

FREE_TIER_LIMIT        = 3        # max runs per calendar month
FREE_TIER_MAX_DURATION = 1200     # 20 minutes in seconds

# Pipeline output file -> column in the Supabase `notes` table.
NOTE_FILES = [
    ("chunk_notes.md",             "chunk_notes_md"),
    ("notes_reduced.md",           "reduced_notes_md"),
    ("transcript.txt",             "transcript_txt"),
    ("transcript_timestamped.txt", "transcript_timestamped_txt"),
]
MEDIA_FILES = ("audio.mp3", "video.mp4")

DOWNLOAD_ALLOWLIST = {
    "chunk_notes.md",
    "notes_reduced.md",
    "notes.json",
    "transcript.txt",
    "transcript_timestamped.txt",
}

STEP_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"download_audio\.py|download_video\.py"), "download"),
    (re.compile(r"transcribe_audio\.py"),                  "transcribe"),
    (re.compile(r"chunk_transcript\.py"),                  "chunk"),
    (re.compile(r"extract_slides\.py|ocr_slides\.py"),     "slides"),
    (re.compile(r"summarize_chunks\.py"),                  "summarize"),
    (re.compile(r"reduce_notes\.py"),                      "reduce"),
]


# ── Supabase ──────────────────────────────────────────────────────────────────

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_supabase = None

def _get_supabase():
    global _supabase
    if _supabase is None and SUPABASE_URL and SUPABASE_SERVICE_KEY:
        from supabase import create_client
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


# ── Auth dependencies ─────────────────────────────────────────────────────────

def _validate_token(token: str):
    """Validate a Supabase JWT and return the user object."""
    sb = _get_supabase()
    if not sb:
        raise HTTPException(503, "Auth not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY.")
    try:
        resp = sb.auth.get_user(token)
        if not resp.user:
            raise HTTPException(401, "Invalid or expired token.")
        return resp.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")


def get_current_user(authorization: str = Header(default=None)):
    """Dependency: extracts Bearer token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Authorization header.")
    return _validate_token(authorization[7:])


def get_current_user_sse(token: str = Query(default=None)):
    """Dependency: extracts token from ?token= query param (needed for EventSource)."""
    if not token:
        raise HTTPException(401, "Missing token query parameter.")
    return _validate_token(token)


# ── Free tier helpers ─────────────────────────────────────────────────────────

def _count_runs_this_month(user_id: str) -> int:
    # Counted from run_usage, not runs: users can delete runs, which would
    # otherwise refund their quota.
    sb = _get_supabase()
    if not sb:
        return 0
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    result = (
        sb.table("run_usage")
        .select("run_id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", start.isoformat())
        .execute()
    )
    return result.count or 0


def _get_video_info(url: str) -> dict:
    """Return {duration, title, thumbnail_url} via yt-dlp (no download)."""
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "duration": info.get("duration") or 0,
                "title":    info.get("title") or url,
                "thumbnail_url": info.get("thumbnail") or None,
            }
    except Exception as exc:
        return {"duration": 0, "title": url, "thumbnail_url": None}


# ── Job tracking ──────────────────────────────────────────────────────────────

@dataclass
class RunJob:
    run_id:       str
    process:      subprocess.Popen
    user_id:      str = ""
    log_queue:    queue.Queue = field(default_factory=queue.Queue)
    started_at:   datetime    = field(default_factory=datetime.now)
    exit_code:    int | None  = None
    current_step: str | None  = None


jobs: dict[str, RunJob] = {}


def _detect_step(line: str) -> str | None:
    if not line.startswith("$"):
        return None
    for pattern, name in STEP_PATTERNS:
        if pattern.search(line):
            return name
    return None


def _read_subprocess_output(job: RunJob) -> None:
    try:
        for raw in job.process.stdout:
            line = raw.rstrip()
            job.log_queue.put(("log", line))

            stripped = line.strip()
            if "[OK] Pre-flight checks passed" in stripped:
                job.log_queue.put(("step", ("preflight", "done")))
                continue

            step = _detect_step(stripped)
            if step:
                if job.current_step:
                    job.log_queue.put(("step", (job.current_step, "done")))
                job.current_step = step
                job.log_queue.put(("step", (step, "running")))
                continue

            if "[OK] Pipeline complete." in stripped:
                if job.current_step:
                    job.log_queue.put(("step", (job.current_step, "done")))
                    job.current_step = None
    finally:
        job.process.wait()
        job.exit_code = job.process.returncode
        try:
            # Persist before signalling: the client reloads the run list as soon
            # as it sees "done", so the DB status must already be updated.
            _on_pipeline_complete(job)
        finally:
            job.log_queue.put(None)  # sentinel

        # Pre-generate the study pack so the notes page has it on first open.
        # Best effort: GET /api/study generates it lazily if this fails.
        if job.exit_code == 0 and job.user_id:
            try:
                _ensure_study_pack(job.run_id)
            except (Exception, SystemExit) as exc:
                print(f"[study] pre-generation failed for {job.run_id}: {exc!r}")


def _on_pipeline_complete(job: RunJob) -> None:
    sb = _get_supabase()
    if not sb or not job.user_id:
        return

    status = "done" if job.exit_code == 0 else "failed"

    try:
        sb.table("runs").update({"status": status}).eq("id", job.run_id).execute()
    except Exception as exc:
        print(f"[db] failed to update run status: {exc}")

    if status != "done":
        return

    run_dir = OUTPUTS_DIR / job.run_id
    note_data = _read_note_files(run_dir)
    if not note_data:
        return
    try:
        sb.table("notes").insert({
            "run_id":  job.run_id,
            "user_id": job.user_id,
            **note_data,
        }).execute()
    except Exception as exc:
        print(f"[db] failed to save notes: {exc}")
        return

    # Notes now live in Supabase; drop the downloaded media (tens of MB per run).
    for fname in MEDIA_FILES:
        (run_dir / fname).unlink(missing_ok=True)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Lectura API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.environ.get("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── /api/run ──────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    url: str
    model: str | None = None   # local (Ollama) model name; must be one of /api/models


OLLAMA_MAX_MODEL_BYTES = 6 * 1024**3


def _ollama_models() -> list[str]:
    """Names of locally installed Ollama chat models (empty if Ollama is off/unreachable)."""
    if os.environ.get("LLM_PROVIDER", "").lower() != "ollama":
        return []
    base = (os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434/v1").removesuffix("/v1")
    try:
        with urllib.request.urlopen(f"{base}/api/tags", timeout=3) as r:
            tags = json.load(r).get("models", [])
    except Exception:
        return []
    # Skip embedding models and anything too big for a typical 8 GB GPU.
    return sorted(
        t["name"] for t in tags
        if "embed" not in t["name"] and t.get("size", 0) <= OLLAMA_MAX_MODEL_BYTES
    )


@app.get("/api/models")
async def list_models(user=Depends(get_current_user)):
    loop = asyncio.get_event_loop()
    models = await loop.run_in_executor(None, _ollama_models)
    default = os.environ.get("OLLAMA_MODEL") or "lectura-notes"
    if default not in models and f"{default}:latest" in models:
        default = f"{default}:latest"
    return {"models": models, "default": default}


@app.get("/api/usage")
async def usage(user=Depends(get_current_user)):
    loop = asyncio.get_event_loop()
    used = await loop.run_in_executor(None, _count_runs_this_month, user.id)
    return {"used": used, "limit": FREE_TIER_LIMIT}


@app.post("/api/run")
async def start_run(body: RunRequest, user=Depends(get_current_user)):
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "URL is required.")

    if body.model and body.model not in await asyncio.get_event_loop().run_in_executor(None, _ollama_models):
        raise HTTPException(400, "Unknown model.")

    # Reject if user already has a run in progress
    for j in jobs.values():
        if j.user_id == user.id and j.exit_code is None:
            raise HTTPException(409, "You already have a video processing.")

    # Free tier: monthly run count
    month_count = _count_runs_this_month(user.id)
    if month_count >= FREE_TIER_LIMIT:
        raise HTTPException(
            403,
            f"Free tier limit reached ({FREE_TIER_LIMIT} videos/month). "
            "Upgrade to Pro for unlimited access.",
        )

    # Get video info + duration check (runs in thread to not block)
    loop = asyncio.get_event_loop()
    info = await loop.run_in_executor(None, _get_video_info, url)
    duration = info["duration"]

    if duration > FREE_TIER_MAX_DURATION:
        raise HTTPException(
            400,
            f"Video is {duration // 60} min long. "
            f"Free tier limit is {FREE_TIER_MAX_DURATION // 60} minutes.",
        )

    run_id = str(uuid.uuid4())

    # Create run record in Supabase
    sb = _get_supabase()
    if sb:
        expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        try:
            sb.table("runs").insert({
                "id":               run_id,
                "user_id":          user.id,
                "url":              url,
                "title":            info["title"],
                "thumbnail_url":    info["thumbnail_url"],
                "status":           "processing",
                "duration_seconds": duration or None,
                "expires_at":       expires,
            }).execute()
            sb.table("run_usage").insert({"run_id": run_id, "user_id": user.id}).execute()
        except Exception as exc:
            try:
                sb.table("runs").delete().eq("id", run_id).execute()
            except Exception:
                pass
            raise HTTPException(500, f"Failed to create run record: {exc}")

    # Launch pipeline
    cmd = [
        sys.executable, "-u",
        str(PIPELINE_DIR / "run_pipeline.py"),
        "--url", url,
        "--run-id", run_id,
        "--no-visual",
    ]
    env = {
        **os.environ,
        "PYTHONUNBUFFERED": "1",
        "PYTHONUTF8": "1",           # steps print ✓/→/… — force UTF-8, not cp1252
        "PYTHONIOENCODING": "utf-8",
        **({"OLLAMA_MODEL": body.model} if body.model else {}),
    }
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",            # decode the child's UTF-8 output correctly
        errors="replace",
        bufsize=1,
        env=env,
        cwd=str(REPO_ROOT),
    )

    job = RunJob(run_id=run_id, process=proc, user_id=user.id)
    jobs[run_id] = job
    threading.Thread(target=_read_subprocess_output, args=(job,), daemon=True).start()

    return {"run_id": run_id}


# ── /api/stream/{run_id} ──────────────────────────────────────────────────────

@app.get("/api/stream/{run_id}")
async def stream_logs(run_id: str, user=Depends(get_current_user_sse)):
    if run_id not in jobs:
        raise HTTPException(404, "Run not found.")
    job = jobs[run_id]
    if job.user_id and job.user_id != user.id:
        raise HTTPException(403, "Access denied.")

    loop = asyncio.get_event_loop()

    def _get():
        try:
            return job.log_queue.get(block=True, timeout=1.0)
        except queue.Empty:
            return ("_timeout",)

    async def generate():
        while True:
            item = await loop.run_in_executor(None, _get)
            if item == ("_timeout",):
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                continue
            if item is None:
                code = job.exit_code or 0
                evt = "done" if code == 0 else "error"
                yield f"data: {json.dumps({'type': evt, 'exit_code': code})}\n\n"
                break
            kind, payload = item
            if kind == "log":
                yield f"data: {json.dumps({'type': 'log', 'text': payload})}\n\n"
            elif kind == "step":
                step_name, status = payload
                yield f"data: {json.dumps({'type': 'step', 'name': step_name, 'status': status})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── /api/runs ─────────────────────────────────────────────────────────────────

@app.get("/api/runs")
async def list_runs(user=Depends(get_current_user)):
    sb = _get_supabase()
    if not sb:
        return []
    result = (
        sb.table("runs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ── /api/notes/{run_id} ───────────────────────────────────────────────────────

def _safe_run_dir(run_id: str) -> Path:
    root = OUTPUTS_DIR.resolve()
    candidate = (OUTPUTS_DIR / run_id).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        raise HTTPException(400, "Invalid run ID.")
    return candidate


def _assert_run_owner(run_id: str, user_id: str) -> dict:
    """Return the run row if `user_id` owns it; 404 if missing, 403 if not theirs."""
    try:
        uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(404, "Run not found.")
    sb = _get_supabase()
    if not sb:
        return {}
    rows = sb.table("runs").select("*").eq("id", run_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Run not found.")
    if rows[0]["user_id"] != user_id:
        raise HTTPException(403, "Access denied.")
    return rows[0]


def _read_note_files(run_dir: Path) -> dict:
    return {
        key: (run_dir / fname).read_text(encoding="utf-8")
        for fname, key in NOTE_FILES
        if (run_dir / fname).exists()
    }


def _load_notes(run_id: str) -> dict:
    """Notes for a run, from the Supabase `notes` row: the backend's local disk
    is ephemeral on hosts like Render. Falls back to the local output files when
    there's no row (Supabase not configured, or the save failed)."""
    sb = _get_supabase()
    if sb:
        rows = (
            sb.table("notes")
            .select(", ".join(key for _, key in NOTE_FILES))
            .eq("run_id", run_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if rows:
            return {k: v for k, v in rows[0].items() if v}
    return _read_note_files(_safe_run_dir(run_id))


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str, user=Depends(get_current_user)):
    run = _assert_run_owner(run_id, user.id)
    if not run:
        raise HTTPException(404, "Run not found.")
    return run


@app.get("/api/notes/{run_id}")
async def get_notes(run_id: str, user=Depends(get_current_user)):
    _assert_run_owner(run_id, user.id)
    result = _load_notes(run_id)
    if not result:
        raise HTTPException(404, "No notes generated yet.")
    return result


# ── /api/download/{run_id}/{filename} ─────────────────────────────────────────

@app.get("/api/download/{run_id}/{filename}")
async def download_file(run_id: str, filename: str, user=Depends(get_current_user)):
    if filename not in DOWNLOAD_ALLOWLIST:
        raise HTTPException(400, f"File not available for download.")
    _assert_run_owner(run_id, user.id)
    run_dir = _safe_run_dir(run_id)
    path = run_dir / filename
    if not path.exists():
        raise HTTPException(404, "File not found.")
    return FileResponse(path, filename=f"lectura_{run_id[:8]}_{filename}")


# ── /api/runs/{run_id} DELETE ─────────────────────────────────────────────────

@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str, user=Depends(get_current_user)):
    _assert_run_owner(run_id, user.id)
    sb = _get_supabase()
    if sb:
        sb.table("runs").delete().eq("id", run_id).execute()
    # Also clean up local files if they exist
    run_dir = _safe_run_dir(run_id)
    if run_dir.exists():
        import shutil
        shutil.rmtree(run_dir, ignore_errors=True)
    jobs.pop(run_id, None)
    return {"ok": True}


# ── Study pack ────────────────────────────────────────────────────────────────

_study_locks: dict[str, threading.Lock] = {}
_study_locks_guard = threading.Lock()


def _latest_notes_row(run_id: str, columns: str) -> dict:
    rows = (
        _get_supabase().table("notes").select(columns).eq("run_id", run_id)
        .order("created_at", desc=True).limit(1).execute().data
    )
    return rows[0] if rows else {}


def _ensure_study_pack(run_id: str) -> dict | None:
    """The run's cached study pack, generated and saved on first use.
    A per-run lock keeps concurrent requests from generating it twice."""
    with _study_locks_guard:
        lock = _study_locks.setdefault(run_id, threading.Lock())
    with lock:
        sb = _get_supabase()
        if sb:
            cached = _latest_notes_row(run_id, "study_json").get("study_json")
            if cached:
                return cached
        notes = _load_notes(run_id)
        if not notes.get("chunk_notes_md") and not notes.get("reduced_notes_md"):
            return None
        pack = build_study_pack(notes.get("chunk_notes_md", ""), notes.get("reduced_notes_md", ""))
        if sb:
            sb.table("notes").update({"study_json": pack}).eq("run_id", run_id).execute()
        return pack


@app.get("/api/study/{run_id}")
async def get_study_pack(run_id: str, user=Depends(get_current_user)):
    _assert_run_owner(run_id, user.id)
    loop = asyncio.get_event_loop()
    try:
        pack = await loop.run_in_executor(None, _ensure_study_pack, run_id)
    except (Exception, SystemExit) as exc:  # LLM errors and rate limits; SystemExit = no API key
        print(f"[study] {run_id}: {exc!r}")
        raise HTTPException(503, "Couldn't generate study material right now. Try again in a minute.")
    if pack is None:
        raise HTTPException(404, "No notes available for this run.")
    return pack


# ── Personal notes & stars ────────────────────────────────────────────────────

MY_NOTES_MAX_CHARS = 50_000
MY_NOTES_MAX_STARS = 500


class MyNotesUpdate(BaseModel):
    body: str | None = None
    starred: list[str] | None = None


@app.get("/api/runs/{run_id}/my-notes")
async def get_my_notes(run_id: str, user=Depends(get_current_user)):
    _assert_run_owner(run_id, user.id)
    rows = (
        _get_supabase().table("user_notes").select("body, starred")
        .eq("run_id", run_id).eq("user_id", user.id).limit(1).execute().data
    )
    return rows[0] if rows else {"body": "", "starred": []}


@app.put("/api/runs/{run_id}/my-notes")
async def put_my_notes(run_id: str, body: MyNotesUpdate, user=Depends(get_current_user)):
    _assert_run_owner(run_id, user.id)
    if body.body is not None and len(body.body) > MY_NOTES_MAX_CHARS:
        raise HTTPException(413, f"Notes are limited to {MY_NOTES_MAX_CHARS:,} characters.")
    if body.starred is not None and (
        len(body.starred) > MY_NOTES_MAX_STARS or any(len(k) > 32 for k in body.starred)
    ):
        raise HTTPException(400, "Invalid starred list.")
    sb = _get_supabase()
    existing = (
        sb.table("user_notes").select("body, starred")
        .eq("run_id", run_id).eq("user_id", user.id).limit(1).execute().data
    )
    row = existing[0] if existing else {"body": "", "starred": []}
    if body.body is not None:
        row["body"] = body.body
    if body.starred is not None:
        row["starred"] = list(dict.fromkeys(body.starred))
    sb.table("user_notes").upsert({
        "run_id": run_id,
        "user_id": user.id,
        **row,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="run_id,user_id").execute()
    return row


# ── Search ────────────────────────────────────────────────────────────────────

@app.get("/api/search")
async def search_notes(q: str = Query(default=""), user=Depends(get_current_user)):
    q = q.strip()[:200]
    if len(q) < 2:
        return []
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: _get_supabase().rpc("search_notes", {"uid": user.id, "q": q}).execute()
    )
    return result.data or []


# ── Share links ───────────────────────────────────────────────────────────────

@app.post("/api/runs/{run_id}/share")
async def create_share_link(run_id: str, user=Depends(get_current_user)):
    run = _assert_run_owner(run_id, user.id)
    if run.get("status") != "done":
        raise HTTPException(400, "Only finished videos can be shared.")
    token = run.get("share_token")
    if not token:
        token = str(uuid.uuid4())
        _get_supabase().table("runs").update({"share_token": token}).eq("id", run_id).execute()
    return {"share_token": token}


@app.delete("/api/runs/{run_id}/share")
async def revoke_share_link(run_id: str, user=Depends(get_current_user)):
    _assert_run_owner(run_id, user.id)
    _get_supabase().table("runs").update({"share_token": None}).eq("id", run_id).execute()
    return {"ok": True}


@app.get("/api/share/{token}")
async def get_shared_notes(token: str):
    """Public, read-only notes for a share link. No auth; no transcript or user info."""
    try:
        uuid.UUID(token)
    except ValueError:
        raise HTTPException(404, "Link not found.")
    sb = _get_supabase()
    if not sb:
        raise HTTPException(404, "Link not found.")
    rows = (
        sb.table("runs").select("id, title, url, duration_seconds")
        .eq("share_token", token).eq("status", "done").limit(1).execute().data
    )
    if not rows:
        raise HTTPException(404, "Link not found.")
    run = rows[0]
    notes = _latest_notes_row(run["id"], "reduced_notes_md, chunk_notes_md, study_json")
    if not notes:
        raise HTTPException(404, "Link not found.")
    return {
        "title": run["title"],
        "url": run["url"],
        "duration_seconds": run["duration_seconds"],
        "reduced_notes_md": notes.get("reduced_notes_md") or "",
        "chunk_notes_md": notes.get("chunk_notes_md") or "",
        "study": notes.get("study_json"),
    }


# ── /api/chat/{run_id} ────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@app.post("/api/chat/{run_id}")
async def chat(run_id: str, body: ChatRequest, user=Depends(get_current_user)):
    _assert_run_owner(run_id, user.id)

    use_ollama = os.environ.get("LLM_PROVIDER", "").lower() == "ollama"
    api_key = os.environ.get("GROQ_API_KEY")
    if not use_ollama and not api_key:
        raise HTTPException(503, "GROQ_API_KEY is not set.")

    loop = asyncio.get_event_loop()

    notes = _load_notes(run_id)
    reduced_notes = notes.get("reduced_notes_md", "")[:5_000]
    # Local models have a much smaller context window than Groq's.
    chunk_limit = 24_000 if use_ollama else 80_000
    chunk_notes = notes.get("chunk_notes_md", "")[:chunk_limit]
    if not chunk_notes and not reduced_notes:
        raise HTTPException(404, "No notes available for this run.")
    context = f"DETAILED NOTES:\n{chunk_notes}\n\nOUTLINE:\n{reduced_notes}"

    system = (
        "You are a helpful study assistant for a student who watched a video lecture.\n"
        "Answer questions based on the notes and outline below. "
        "Reference timestamps like [HH:MM:SS] when relevant. "
        "If the context doesn't cover the question, say so clearly.\n\n"
        + context
    )

    if use_ollama:
        # Larger-context variant of the pipeline model; see backend/ollama/Modelfile.chat
        model = os.environ.get("OLLAMA_CHAT_MODEL", "lectura-chat")
    else:
        model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
    token_q: asyncio.Queue = asyncio.Queue()

    def _stream():
        try:
            if use_ollama:
                from openai import OpenAI
                client = OpenAI(
                    api_key="ollama",
                    base_url=os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434/v1",
                )
            else:
                from groq import Groq
                client = Groq(api_key=api_key)
            messages = [{"role": "system", "content": system}]
            messages += [
                {"role": "assistant" if m.role == "assistant" else "user", "content": m.content}
                for m in body.messages
            ]
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.3,
                stream=True,
                **completion_kwargs(model),
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    asyncio.run_coroutine_threadsafe(token_q.put(("token", delta)), loop)
        except Exception as exc:
            asyncio.run_coroutine_threadsafe(token_q.put(("error", str(exc))), loop)
        asyncio.run_coroutine_threadsafe(token_q.put(None), loop)

    threading.Thread(target=_stream, daemon=True).start()

    async def generate():
        while True:
            item = await token_q.get()
            if item is None:
                yield f"data: {json.dumps({'done': True})}\n\n"
                break
            kind, payload = item
            if kind == "token":
                yield f"data: {json.dumps({'token': payload})}\n\n"
            else:
                yield f"data: {json.dumps({'error': payload})}\n\n"
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"\n  Lectura API  ->  http://127.0.0.1:{port}\n")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
