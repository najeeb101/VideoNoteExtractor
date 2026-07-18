"""
One-shot study pipeline runner.

Runs (optionally) the full workflow in the right order:
  1. Download video  (optional — needed for visual mode)
  2. Download audio  (or extract from local video via ffmpeg)
  3. Transcribe      (creates transcript + transcript_timestamped)
  4. Chunk           (prefers timestamped transcript automatically)
  5. Extract slides  (optional visual mode)
  6. OCR slides      (optional visual mode)
  7. Summarize chunks → chunk_notes.md
  8. Reduce          → notes_reduced.md  (optional)

Run `py run_pipeline.py --help` for all options.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from _console import enable_utf8_console

enable_utf8_console()

REPO_ROOT = Path(__file__).resolve().parent

# Matches the 11-char video ID in common YouTube URL shapes.
_YT_ID_RE = re.compile(r"(?:v=|/shorts/|youtu\.be/|/embed/|/v/)([A-Za-z0-9_-]{11})")


# ── Helpers ───────────────────────────────────────────────────────────────────

def run(cmd: list[str], env: dict[str, str] | None = None) -> None:
    print(f"\n$ {' '.join(str(c) for c in cmd)}")
    subprocess.run(cmd, check=True, env=env)


def derive_run_id(args: argparse.Namespace) -> str:
    """Explicit --run-id wins; otherwise use the YouTube video ID or local file stem."""
    if args.run_id:
        return args.run_id
    if args.url:
        m = _YT_ID_RE.search(args.url)
        return m.group(1) if m else "run"
    return Path(args.video).stem


def ensure_exists(path: str | Path, what: str) -> None:
    if not Path(path).exists():
        raise RuntimeError(f"Expected {what} at '{path}' but it is missing.")


# ── Pre-flight checks ─────────────────────────────────────────────────────────

def _check_tool_on_path(tool: str, hint: str) -> None:
    """Raise SystemExit with a helpful message if `tool` is not on PATH."""
    if shutil.which(tool) is None:
        print(f"\n[ERROR] '{tool}' not found on PATH.")
        print(f"  {hint}")
        sys.exit(1)


def preflight_check(args: argparse.Namespace) -> None:
    """Validate external dependencies and env vars before the pipeline starts."""
    errors: list[str] = []

    # Load .env so OPENAI_API_KEY is available even if not set in the shell.
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass  # python-dotenv not installed; rely on shell env

    # 1. LLM API key — always required (summarize + reduce both need it).
    #    Either OpenAI or Groq (OpenAI-compatible) works.
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("GROQ_API_KEY"):
        errors.append(
            "No LLM API key set — need OPENAI_API_KEY or GROQ_API_KEY.\n"
            "  → Add one to a .env file (copy .env.example) or export it in your shell."
        )

    # 2. ffmpeg — needed when extracting audio from a local video or visual mode
    needs_ffmpeg = args.video or (not args.no_visual)
    if needs_ffmpeg and shutil.which("ffmpeg") is None:
        errors.append(
            "ffmpeg is not found on PATH.\n"
            "  → Install ffmpeg: https://ffmpeg.org/download.html\n"
            "  → On Windows you can use: winget install ffmpeg"
        )

    # 3. Tesseract — only needed for visual / OCR mode
    if not args.no_visual:
        tesseract_cmd = os.environ.get("TESSERACT_CMD", "").strip()
        if tesseract_cmd:
            if not Path(tesseract_cmd).exists():
                errors.append(
                    f"TESSERACT_CMD points to a file that does not exist: {tesseract_cmd}"
                )
        elif shutil.which("tesseract") is None:
            errors.append(
                "Tesseract OCR is not found on PATH (needed for --visual / slide OCR).\n"
                "  → Install Tesseract: https://github.com/UB-Mannheim/tesseract/wiki\n"
                "  → Or set TESSERACT_CMD=/path/to/tesseract.exe in your .env\n"
                "  → Or pass --no-visual to skip slide extraction entirely."
            )

    if errors:
        print("\n[ERROR] Pre-flight check failed. Please fix the following:\n")
        for i, err in enumerate(errors, 1):
            print(f"  {i}. {err}\n")
        sys.exit(1)

    print("[OK] Pre-flight checks passed.\n")


# ── Pipeline steps ────────────────────────────────────────────────────────────

def step_acquire(args: argparse.Namespace, py: str) -> tuple[str, str | None]:
    """Returns (audio_path, video_path|None)."""
    video_path: str | None = None

    if args.url:
        # Visual mode needs the video file too
        if not args.no_visual:
            run([py, str(REPO_ROOT / "download_video.py"), args.url, args.video_out])
            ensure_exists(args.video_out, "downloaded video")
            video_path = args.video_out

        run([py, str(REPO_ROOT / "download_audio.py"), args.url])
        ensure_exists("audio.mp3", "downloaded audio (audio.mp3)")
        if args.audio != "audio.mp3":
            shutil.move("audio.mp3", args.audio)
        audio_path = args.audio

    else:  # --video (local file)
        video_path = args.video
        ensure_exists(video_path, "input video file")
        # Extract audio from the local video via ffmpeg
        run([
            "ffmpeg", "-hide_banner", "-y",
            "-i", video_path,
            "-vn", "-acodec", "libmp3lame",
            args.audio,
        ])
        ensure_exists(args.audio, "extracted audio")
        audio_path = args.audio

    return audio_path, video_path


def step_transcribe(args: argparse.Namespace, audio_path: str, py: str) -> Path:
    """Run transcription and return the path to the timestamped transcript."""
    run([py, str(REPO_ROOT / "transcribe_audio.py"), audio_path, args.transcript])
    ensure_exists(args.transcript, "plain transcript")

    stem = Path(args.transcript).stem
    suffix = Path(args.transcript).suffix
    ts_transcript = Path(args.transcript).with_name(f"{stem}_timestamped{suffix}")
    ensure_exists(ts_transcript, "timestamped transcript")
    return ts_transcript


def step_chunk(ts_transcript: Path, py: str) -> None:
    """Chunk the timestamped transcript. chunk_transcript.py reads the default filename."""
    default = Path("transcript_timestamped.txt")
    created_copy = False

    if ts_transcript.resolve() != default.resolve() and not default.exists():
        shutil.copy(ts_transcript, default)
        created_copy = True

    try:
        run([py, str(REPO_ROOT / "chunk_transcript.py")])
        ensure_exists("chunks", "chunks directory")
    finally:
        if created_copy and default.exists():
            default.unlink()


def step_visual(args: argparse.Namespace, video_path: str, py: str) -> None:
    """Extract slides and run OCR."""
    slides_dir = Path(args.slides_dir)
    env = os.environ.copy()
    if args.scene_threshold is not None:
        env["SLIDE_SCENE_THRESHOLD"] = str(args.scene_threshold)

    run([py, str(REPO_ROOT / "extract_slides.py"), video_path, args.slides_dir], env=env)
    ensure_exists(slides_dir / "frames.json", "slides/frames.json")

    run([
        py, str(REPO_ROOT / "ocr_slides.py"),
        str(slides_dir / "frames.json"),
        str(slides_dir / "index.json"),
    ])
    ensure_exists(slides_dir / "index.json", "slides/index.json")

    if args.slides_dir != "slides":
        print(
            f"Note: set SLIDES_INDEX_PATH={slides_dir / 'index.json'} "
            "before running summarize if needed."
        )


def step_summarize(args: argparse.Namespace, py: str) -> None:
    """Run summarize_chunks.py and rename output if requested."""
    run([py, str(REPO_ROOT / "summarize_chunks.py"), "chunks", "chunk_notes.md"])
    ensure_exists("chunk_notes.md", "chunk notes (chunk_notes.md)")
    if args.chunk_notes != "chunk_notes.md":
        shutil.copy("chunk_notes.md", args.chunk_notes)


def step_reduce(args: argparse.Namespace, py: str) -> None:
    run([py, str(REPO_ROOT / "reduce_notes.py"), args.chunk_notes, args.reduced_notes])
    ensure_exists(args.reduced_notes, "reduced notes")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description="Run the full VideoNoteExtractor pipeline.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="YouTube URL to process")
    src.add_argument("--video", help="Local video file path (mp4, mkv, etc.)")

    p.add_argument("--run-id", default=None, help="Run identifier; outputs go to outputs/<run-id>/ (default: derived from URL/file)")
    p.add_argument("--audio", default="audio.mp3", help="Audio output path (default: audio.mp3)")
    p.add_argument("--transcript", default="transcript.txt", help="Transcript path (default: transcript.txt)")
    p.add_argument("--video-out", default="video.mp4", help="Video output path for --url (default: video.mp4)")

    p.add_argument("--no-visual", action="store_true", help="Skip slide extraction + OCR")
    p.add_argument("--scene-threshold", type=float, default=None, help="Override SLIDE_SCENE_THRESHOLD env var")
    p.add_argument("--slides-dir", default="slides", help="Slides output directory (default: slides)")

    p.add_argument("--skip-reduce", action="store_true", help="Skip the reduce (consolidation) step")
    p.add_argument("--chunk-notes", default="chunk_notes.md", help="Chunk notes output (default: chunk_notes.md)")
    p.add_argument("--reduced-notes", default="notes_reduced.md", help="Reduced notes output (default: notes_reduced.md)")

    args = p.parse_args()
    py = sys.executable

    # Force child steps to emit UTF-8. Windows consoles/pipes default to cp1252,
    # which crashes on the ✓/→/… characters the steps print. Children inherit these.
    os.environ["PYTHONUTF8"] = "1"
    os.environ["PYTHONIOENCODING"] = "utf-8"

    # ── Pre-flight ── (runs before we change directories so .env in the CWD is found)
    preflight_check(args)

    # Resolve the local video path to an absolute path before we chdir away.
    if args.video:
        args.video = str(Path(args.video).resolve())

    # All step scripts read/write the CWD, so give each run its own directory.
    run_id = derive_run_id(args)
    out_dir = (Path.cwd() / "outputs" / run_id).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    os.chdir(out_dir)
    print(f"[i] Run ID:           {run_id}")
    print(f"[i] Output directory: {out_dir}\n")

    try:
        # 1. Acquire audio (and video if needed)
        audio_path, video_path = step_acquire(args, py)

        # 2. Transcribe
        ts_transcript = step_transcribe(args, audio_path, py)

        # 3. Chunk
        step_chunk(ts_transcript, py)

        # 4. Visual mode (optional)
        if not args.no_visual and video_path:
            step_visual(args, video_path, py)

        # 5. Summarize chunks
        step_summarize(args, py)

        # 6. Reduce (optional)
        if not args.skip_reduce:
            step_reduce(args, py)

    except KeyboardInterrupt:
        print("\n\n[!] Interrupted by user. Partial outputs have been left in place.")
        sys.exit(130)
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] A pipeline step failed (exit code {e.returncode}).")
        sys.exit(e.returncode)
    except RuntimeError as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)

    print("\n[OK] Pipeline complete.")
    print(f"  Notes:         {Path(args.chunk_notes).resolve()}")
    if not args.skip_reduce:
        print(f"  Reduced notes: {Path(args.reduced_notes).resolve()}")


if __name__ == "__main__":
    main()
