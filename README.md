# Lectura (VideoNoteExtractor)

Turn a YouTube lecture into structured study notes you can read, export, and chat with.

A Python pipeline downloads a video's audio, transcribes it locally (faster-whisper),
and uses an LLM to generate notes. A FastAPI backend wraps that in an authenticated,
free-tier-gated API; a Next.js frontend provides the dashboard, notes viewer, and a
"chat with your notes" panel.

## Repository layout

```
backend/            FastAPI server + the note-extraction pipeline
  app.py            Web server (auth, free tier, SSE logs, chat)
  pipeline/         Self-contained pipeline steps + run_pipeline.py orchestrator
  requirements.txt
frontend/           Next.js 16 app (App Router, React 19, Tailwind v4, shadcn)
supabase/schema.sql Postgres schema, RLS policies, storage bucket
```

## LLM providers

- **Groq** — the backend `/api/chat` endpoint (OpenAI-compatible), and the default for the pipeline too. Default model `llama-3.3-70b-versatile`.
- **OpenAI** — optional. If `OPENAI_API_KEY` is set, the pipeline uses it for note generation (`summarize`, `reduce`, `extract`) instead of Groq. Default `gpt-4o-mini`.

You can run the entire app on a single Groq key — no OpenAI account required.

## Prerequisites

- Python 3.11+ with a virtualenv at `.venv/`
- Node.js 20+ (for the frontend)
- **ffmpeg** on PATH (`winget install ffmpeg`) — audio extraction / download
- **Tesseract OCR** — only for optional slide/visual mode (skip with `--no-visual`)
- A Supabase project (for the web app's auth + persistence)

## Setup

### Backend

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Copy `.env.example` to `.env` (repo root) and fill in `GROQ_API_KEY` and your Supabase
`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`. `OPENAI_API_KEY` is optional — the pipeline
falls back to Groq without it. See `.env.example` for the full list of options.

Apply the database schema by running `supabase/schema.sql` in the Supabase SQL editor.

### Frontend

```powershell
cd frontend
npm install
```

Create `frontend/.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Running the web app

```powershell
# Terminal 1 — backend API (http://127.0.0.1:8000)
.venv\Scripts\python.exe backend\app.py

# Terminal 2 — frontend (http://localhost:3000)
cd frontend ; npm run dev
```

Sign in, paste a YouTube URL, and watch the pipeline stream progress. Free tier allows
3 videos/month, up to 20 minutes each. Completed runs expire after 7 days.

## Running the pipeline directly (CLI, no web app)

`run_pipeline.py` writes all outputs into `outputs/<run-id>/` under the current directory.

```powershell
# YouTube URL (visual/slide mode on by default)
.venv\Scripts\python.exe backend\pipeline\run_pipeline.py --url "https://www.youtube.com/watch?v=VIDEO_ID"

# Local video file
.venv\Scripts\python.exe backend\pipeline\run_pipeline.py --video "path\to\video.mp4"

# Audio-only (skip slide extraction + OCR — no Tesseract needed)
.venv\Scripts\python.exe backend\pipeline\run_pipeline.py --url "..." --no-visual
```

Outputs:
- `chunk_notes.md` — in-depth notes with timestamps
- `notes_reduced.md` — consolidated outline

## Pipeline steps

Each step in `backend/pipeline/` is runnable standalone and reads/writes the current
working directory:

1. `download_audio.py` — YouTube → `audio.mp3` (yt-dlp)
2. `transcribe_audio.py` — audio → `transcript.txt` + `transcript_timestamped.txt` (faster-whisper, auto language/model, GPU if available)
3. `chunk_transcript.py` — transcript → `chunks/chunk_*.txt`
4. `summarize_chunks.py` — chunks → `chunk_notes.md` (Groq/OpenAI; merges slide OCR if present)
5. `reduce_notes.py` — `chunk_notes.md` → `notes_reduced.md` (map-reduce consolidation)

Optional visual mode adds `download_video.py` → `extract_slides.py` → `ocr_slides.py`,
feeding slide OCR text into step 4. `extract_notes.py` is an alternate one-shot path
(timestamped transcript → single `notes.md`).
