# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This is a two-part monorepo. Product name in the UI/API is **Lectura**; the repo/CLI name is **VideoNoteExtractor**. LLM providers: the backend chat always uses **Groq** (`llama-3.3-70b-versatile`); the pipeline uses **OpenAI** if `OPENAI_API_KEY` is set, otherwise it **falls back to Groq** automatically (`backend/pipeline/_llm.py`). Running everything on a single Groq key requires no OpenAI account.

- **`backend/`** — Python. `app.py` (FastAPI server) + `pipeline/` (the note-extraction steps). Local pipeline outputs land in `backend/outputs/{run-id}/`.
- **`frontend/`** — Next.js 16 (App Router, React 19, Tailwind v4, shadcn) + Supabase auth. Talks to the backend over HTTP/SSE.
- **`supabase/schema.sql`** — Postgres schema (`runs`, `notes`), RLS policies, storage bucket, and a commented `pg_cron` cleanup job. Run it in the Supabase SQL editor.

## Environment

Python commands use the venv interpreter — the system `py` does not have the project's packages:

```powershell
.venv\Scripts\python.exe                      # run scripts
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

External binaries required on PATH:
- **ffmpeg** — audio extraction and video download (`winget install ffmpeg`)
- **Tesseract OCR** — slide OCR only; bypass with `--no-visual` or set `TESSERACT_CMD`

## Running the full stack

```powershell
# Backend API — http://127.0.0.1:8000 (run from backend/)
.venv\Scripts\python.exe backend\app.py

# Frontend dev server — http://localhost:3000
cd frontend ; npm install ; npm run dev
```

The backend CORS-allows `localhost:3000`; the frontend targets `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`). Frontend lint: `npm run lint` (ESLint 9 flat config). There is no frontend test suite.

## Running the pipeline (CLI)

Run the orchestrator with the venv Python. **It writes all outputs to the current working directory** (audio.mp3, transcript.txt, chunks/, chunk_notes.md, …), so `cd` into a scratch dir first:

```powershell
# YouTube URL (visual/slide mode is on by default)
.venv\Scripts\python.exe backend\pipeline\run_pipeline.py --url "https://www.youtube.com/watch?v=VIDEO_ID"

# Local video
.venv\Scripts\python.exe backend\pipeline\run_pipeline.py --video path\to\video.mp4

# Audio-only (skip slide extraction + OCR, no Tesseract needed)
.venv\Scripts\python.exe backend\pipeline\run_pipeline.py --url "..." --no-visual
```

`run_pipeline.py` derives a run-id (`--run-id`, else the YouTube video ID, else the local file stem), creates `outputs/{run-id}/` under the CWD, and `chdir`s into it before running any step. Each step is a self-contained script in `backend/pipeline/` importable as a module or runnable standalone; steps read/write the CWD.

Steps print status characters (`✓`, `→`) that crash on a Windows cp1252 console. Each entry-point step imports `_console.enable_utf8_console()` (reconfigures stdout/stderr to UTF-8) so it's safe standalone; `run_pipeline.py` and `app.py` additionally set `PYTHONUTF8=1` for child subprocesses.

## Configuration

Copy `.env.example` to `.env` (repo root). **Two different LLM providers are used:**

| Variable | Used by | Purpose |
|---|---|---|
| `GROQ_API_KEY` | backend `/api/chat` + pipeline fallback | Groq chat completions (OpenAI-compatible SDK) |
| `GROQ_MODEL` | Groq calls | default `llama-3.3-70b-versatile` |
| `OPENAI_API_KEY` | pipeline (`summarize_chunks`, `reduce_notes`, `extract_notes`) | optional; used if set, else Groq fallback |
| `OPENAI_MODEL` | pipeline | default `gpt-4o-mini` |
| `OPENAI_BASE_URL` | pipeline | optional; point the OpenAI SDK at a compatible endpoint |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | backend | auth + persistence (server-side) |

Frontend needs its own Supabase env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and optional `NEXT_PUBLIC_API_URL`.

Other pipeline knobs: `OPENAI_MAX_COST_USD` (budget cap), `SUMMARIZE_WORKERS` (>1 = parallel, disables anti-repetition), `REDUCE_BATCH_CHARS`, `SLIDE_SCENE_THRESHOLD`, `SLIDE_MAX_FRAMES`, `TESSERACT_CMD`, `OCR_LANG`, `SLIDES_INDEX_PATH`.

## Architecture

### Pipeline flow (`backend/pipeline/`)

```
YouTube URL / local video
       │  download_video.py (visual mode) → video.mp4
       ▼  download_audio.py / ffmpeg      → audio.mp3
  transcribe_audio.py ─► transcript.txt, transcript_timestamped.txt
       ▼
  chunk_transcript.py ─► chunks/chunk_0.txt, …   (prefers the timestamped transcript)
       │  [visual] extract_slides.py + ocr_slides.py → slides/index.json
       ▼
  summarize_chunks.py ─► chunk_notes.md   (merges slide OCR per chunk if slides/index.json exists)
       ▼
  reduce_notes.py ─────► notes_reduced.md
```

`extract_notes.py` is an alternate one-shot path: timestamped transcript → single structured `notes.md`, not part of `run_pipeline.py`'s default flow.

- **`summarize_chunks.py`** — sequential mode (default) passes the last 30 bullets as `recent_bullets` context to reduce cross-chunk repetition; parallel mode (`SUMMARIZE_WORKERS>1`, `ThreadPoolExecutor`) drops that context.
- **`reduce_notes.py`** — map-reduce: batch bullets by `REDUCE_BATCH_CHARS`, condense each batch (map), merge partials in a final call (reduce).

### Backend server (`backend/app.py`)

FastAPI, thread-per-job model. `/api/run` spawns `run_pipeline.py` as a subprocess (always with `--no-visual`); `_read_subprocess_output` runs in a daemon thread parsing stdout into a `queue.Queue`; the SSE endpoint `/api/stream/{run_id}` drains it via `run_in_executor`. Step progress is inferred by matching `$ …` log lines against `STEP_PATTERNS`.

- **Auth**: every endpoint depends on a Supabase JWT — `Authorization: Bearer` header for normal calls, `?token=` query param for SSE (`EventSource` can't set headers).
- **Free tier**: `FREE_TIER_LIMIT` runs/calendar-month and `FREE_TIER_MAX_DURATION` (20 min, checked via a yt-dlp metadata probe) enforced in `/api/run`. Concurrent runs by the same user are rejected (HTTP 409).
- **Persistence**: on completion, `_on_pipeline_complete` updates the `runs` row and inserts generated notes into the `notes` table.
- **Chat** (`/api/chat/{run_id}`): stuffs `chunk_notes.md` (≤80k chars) + `notes_reduced.md` (≤5k) into the system prompt and streams a Groq answer. (No embeddings/RAG — Groq has no embeddings API, and a ≤20-min free-tier video's notes fit comfortably in context.)
- **Safety**: `_safe_run_dir` validates run dirs stay under `outputs/`; downloads gated to `DOWNLOAD_ALLOWLIST`; `_assert_run_owner` checks ownership against Supabase.

`app.py` invokes `run_pipeline.py` with `--run-id <uuid>` and `cwd=backend/`, so outputs land in `backend/outputs/{uuid}/` — the same `OUTPUTS_DIR` the server reads notes back from. The subprocess's stdout markers (`[OK] Pre-flight checks passed`, `$ …` step lines, `[OK] Pipeline complete.`) are what `STEP_PATTERNS` keys progress off of, so keep those strings in sync if you touch either side.

### Frontend (`frontend/src/`)

Next.js App Router. Route groups `(auth)` (login) and `(dashboard)` (dashboard, `run/[id]`, settings). All backend calls go through the typed `api` object in `lib/api.ts` (fetch + SSE `EventSource`). Supabase clients are split browser (`lib/supabase/client.ts`) / server (`server.ts`) / middleware (`middleware.ts`); session refresh runs in `proxy.ts`. UI is shadcn components under `components/ui/`.
