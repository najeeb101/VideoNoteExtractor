# VideoNoteExtractor

Turn a YouTube video into study notes:

1) Download audio (`download_audio.py`)
2) Transcribe (`transcribe_audio.py`)
3) (Optional) Chunk transcript (`chunk_transcript.py`)
4) Generate notes with an LLM:
   - `summarize_chunks.py` → in-depth chunk notes with timestamps into `chunk_notes.md`
   - `reduce_notes.py` → overall consolidated outline into `notes_reduced.md`
   - `extract_notes.py` → one structured Markdown study guide into `notes.md`

## Setup

Install deps:

```bash
py -m pip install -r requirements.txt
```

Create a `.env` file in the repo root.

## OpenAI configuration

In `.env`, set:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

## Usage

## One-command runner (recommended)

Run everything (audio + transcript + timestamped chunk notes + reduced outline). This supports either a YouTube URL or a local video file.

YouTube URL:

```bash
py run_pipeline.py --url "https://www.youtube.com/watch?v=VIDEO_ID"
```

Local video file:

```bash
py run_pipeline.py --video "path/to/video.mp4"
```

Skip visual slide OCR (audio-only):

```bash
py run_pipeline.py --url "https://www.youtube.com/watch?v=VIDEO_ID" --no-visual
```

Outputs:
- `chunk_notes.md` (in-depth notes with timestamps)
- `notes_reduced.md` (overall outline)

If you enable visual mode and run slide OCR, `summarize_chunks.py` will incorporate slide text automatically.

Download audio:

```bash
py download_audio.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

Transcribe:

```bash
py transcribe_audio.py audio.mp3 transcript.txt
```

Chunk transcript (prefers `transcript_timestamped.txt` if present → writes `chunks/chunk_*.txt`):

```bash
py chunk_transcript.py
```

Summarize chunks into per-chunk notes (writes `chunk_notes.md`). If chunks include timestamps (recommended), bullets will include timestamps like `[00:12:34]`:

```bash
py summarize_chunks.py
```

Reduce chunk bullets into one outline (writes `notes_reduced.md`):

```bash
py reduce_notes.py
```

Or generate full structured notes from timestamped transcript (writes `notes.md`):

```bash
py extract_notes.py transcript_timestamped.txt notes.md
```

## Optional: Visual study mode (slides + OCR)

For slide lectures (and math/physics), audio-only can miss on-screen text and equations. Visual mode extracts slide frames, OCRs them, and feeds the slide text into chunk note generation.

1) Download the video:

```bash
py download_video.py "https://www.youtube.com/watch?v=VIDEO_ID" video.mp4
```

2) Extract slide frames (scene-change detection):

```bash
py extract_slides.py video.mp4 slides
```

3) OCR the slides (local Tesseract):

```bash
py ocr_slides.py slides/frames.json slides/index.json
```

4) Regenerate chunk notes (will auto-load `slides/index.json` if present):

```bash
py summarize_chunks.py
```

### Requirements for visual mode

- **ffmpeg**: required by `extract_slides.py` (and commonly needed by yt-dlp). Must be on PATH.
- **Tesseract OCR**: install it locally, then either add it to PATH or set `TESSERACT_CMD` to the `tesseract.exe` path.\n- Optional env vars:\n  - `SLIDE_SCENE_THRESHOLD` (default `0.35`)\n  - `SLIDE_MAX_FRAMES` (optional cap)\n  - `OCR_LANG` (e.g. `eng`)\n  - `SLIDES_INDEX_PATH` (default `slides/index.json`)\n