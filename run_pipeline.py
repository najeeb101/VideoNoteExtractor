"""
One-shot study pipeline runner.

Runs (optionally) the full workflow in the right order:
  - download video (optional)
  - download audio (optional; for URL inputs)
  - transcribe (creates transcript + transcript_timestamped)
  - chunk transcript (prefers timestamped)
  - extract slides (optional)
  - OCR slides (optional)
  - summarize chunks into chunk_notes.md
  - reduce into notes_reduced.md (optional)

This script orchestrates existing scripts via subprocess to avoid import-time side effects.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
import shutil


REPO_ROOT = Path(__file__).resolve().parent


def run(cmd: list[str], env: dict[str, str] | None = None) -> None:
    print(f"\n$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, env=env)


def ensure_exists(path: str | Path, what: str) -> None:
    if not Path(path).exists():
        raise RuntimeError(f"Expected {what} to exist but it was missing: {path}")


def main() -> None:
    p = argparse.ArgumentParser(description="Run the full study pipeline.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="YouTube URL to process")
    src.add_argument("--video", help="Local video file path (mp4, mkv, etc.)")

    p.add_argument("--audio", default="audio.mp3", help="Audio output path (default: audio.mp3)")
    p.add_argument("--transcript", default="transcript.txt", help="Transcript output path (default: transcript.txt)")
    p.add_argument("--video-out", default="video.mp4", help="Video output path when using --url (default: video.mp4)")

    p.add_argument("--no-visual", action="store_true", help="Skip slide extraction + OCR")
    p.add_argument("--scene-threshold", type=float, default=None, help="Override SLIDE_SCENE_THRESHOLD")
    p.add_argument("--slides-dir", default="slides", help="Slides output directory (default: slides)")

    p.add_argument("--skip-reduce", action="store_true", help="Skip reduce step (notes_reduced.md)")
    p.add_argument("--chunk-notes", default="chunk_notes.md", help="Chunk notes output (default: chunk_notes.md)")
    p.add_argument("--reduced-notes", default="notes_reduced.md", help="Reduced notes output (default: notes_reduced.md)")

    args = p.parse_args()

    py = sys.executable

    # 1) Acquire video/audio
    video_path: str | None = None

    if args.url:
        # Video for visual mode
        if not args.no_visual:
            run([py, str(REPO_ROOT / "download_video.py"), args.url, args.video_out])
            video_path = args.video_out
            ensure_exists(video_path, "video file")

        # Audio for transcription
        run([py, str(REPO_ROOT / "download_audio.py"), args.url])
        # download_audio.py always writes to audio.mp3 unless user edited script; allow --audio by renaming externally later.
        ensure_exists("audio.mp3", "audio file (audio.mp3)")
        if args.audio != "audio.mp3":
            shutil.copyfile("audio.mp3", args.audio)
        audio_path = args.audio
    else:
        video_path = args.video
        ensure_exists(video_path, "input video file")
        # For local video, extract audio via ffmpeg into args.audio (requires ffmpeg on PATH)
        run(["ffmpeg", "-hide_banner", "-y", "-i", video_path, "-vn", "-acodec", "libmp3lame", args.audio])
        audio_path = args.audio
        ensure_exists(audio_path, "audio file")

    # 2) Transcribe
    run([py, str(REPO_ROOT / "transcribe_audio.py"), audio_path, args.transcript])
    ensure_exists(args.transcript, "transcript file")
    ts_transcript = Path(args.transcript).with_name(Path(args.transcript).stem + "_timestamped" + Path(args.transcript).suffix)
    ensure_exists(ts_transcript, "timestamped transcript file")

    # 3) Chunk (prefers transcript_timestamped.txt automatically)
    # Ensure the expected default filename exists for chunk_transcript.py
    if Path("transcript_timestamped.txt").exists() is False and ts_transcript.name != "transcript_timestamped.txt":
        # create a copy for chunker to pick up; keep it simple
        shutil.copyfile(ts_transcript, "transcript_timestamped.txt")
    elif ts_transcript.name == "transcript_timestamped.txt":
        pass
    run([py, str(REPO_ROOT / "chunk_transcript.py")])
    ensure_exists("chunks", "chunks directory")

    # 4) Visual mode: slides + OCR
    if not args.no_visual and video_path:
        env = os.environ.copy()
        if args.scene_threshold is not None:
            env["SLIDE_SCENE_THRESHOLD"] = str(args.scene_threshold)
        run([py, str(REPO_ROOT / "extract_slides.py"), video_path, args.slides_dir], env=env)
        ensure_exists(Path(args.slides_dir) / "frames.json", "slides/frames.json")
        run([py, str(REPO_ROOT / "ocr_slides.py"), str(Path(args.slides_dir) / "frames.json"), str(Path(args.slides_dir) / "index.json")])
        ensure_exists(Path(args.slides_dir) / "index.json", "slides/index.json")
        # summarize_chunks.py reads slides/index.json by default; if slides_dir differs, user can set SLIDES_INDEX_PATH.
        if args.slides_dir != "slides":
            print(f"Note: set SLIDES_INDEX_PATH={Path(args.slides_dir) / 'index.json'} before running summarize if needed.")

    # 5) Summarize chunks -> chunk_notes.md
    # summarize_chunks.py uses a fixed output filename chunk_notes.md; rename if user requested
    run([py, str(REPO_ROOT / "summarize_chunks.py")])
    ensure_exists("chunk_notes.md", "chunk notes file (chunk_notes.md)")
    if args.chunk_notes != "chunk_notes.md":
        shutil.copyfile("chunk_notes.md", args.chunk_notes)

    # 6) Reduce -> notes_reduced.md
    if not args.skip_reduce:
        run([py, str(REPO_ROOT / "reduce_notes.py"), args.chunk_notes, args.reduced_notes])
        ensure_exists(args.reduced_notes, "reduced notes file")

    print("\n[OK] Pipeline complete.")


if __name__ == "__main__":
    main()

