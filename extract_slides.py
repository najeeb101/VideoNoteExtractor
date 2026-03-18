"""
Optional Visual Mode - Slide Extraction (scene-change detection)

Extracts frames from a video when the scene changes (good for slide lectures).
Writes:
  - slides/frame_000001.jpg, ...
  - slides/frames.json  (timestamp + image path)
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass


SHOWINFO_RE = re.compile(r"pts_time:(?P<pts>[0-9]+(?:\.[0-9]+)?)")


@dataclass(frozen=True)
class SlideFrame:
    timestamp: float
    image_path: str


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def extract_slides(
    video_path: str = "video.mp4",
    out_dir: str = "slides",
    scene_threshold: float = 0.35,
    max_frames: int | None = None,
) -> str:
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    _ensure_dir(out_dir)

    frame_pattern = os.path.join(out_dir, "frame_%06d.jpg")
    frames_json_path = os.path.join(out_dir, "frames.json")

    vf = f"select='gt(scene,{scene_threshold})',showinfo"

    # Note:
    # - showinfo prints pts_time to stderr for each selected frame
    # - We map the Nth pts_time to the Nth written frame file.
    command = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        video_path,
        "-vf",
        vf,
        "-vsync",
        "vfr",
        "-q:v",
        "2",
        frame_pattern,
    ]
    if max_frames is not None and max_frames > 0:
        command.insert(1, "-frames:v")
        command.insert(2, str(max_frames))

    print(f"[*] Extracting slides from: {video_path}")
    print(f"[*] Output dir: {os.path.abspath(out_dir)}")
    print(f"[*] Scene threshold: {scene_threshold}")
    if max_frames:
        print(f"[*] Max frames: {max_frames}")

    proc = subprocess.run(command, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{proc.stderr}")

    pts_times = [float(m.group("pts")) for m in SHOWINFO_RE.finditer(proc.stderr)]

    # List written frames (ffmpeg may write fewer than pts_time matches in edge cases)
    written = sorted(
        (p for p in os.listdir(out_dir) if p.startswith("frame_") and p.lower().endswith(".jpg"))
    )

    slide_frames: list[SlideFrame] = []
    for idx, name in enumerate(written):
        if idx >= len(pts_times):
            break
        slide_frames.append(
            SlideFrame(timestamp=pts_times[idx], image_path=os.path.join(out_dir, name))
        )

    with open(frames_json_path, "w", encoding="utf-8") as f:
        json.dump(
            [
                {"timestamp": sf.timestamp, "image_path": sf.image_path}
                for sf in slide_frames
            ],
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"[OK] Extracted {len(slide_frames)} slide frame(s).")
    print(f"[OK] Wrote: {os.path.abspath(frames_json_path)}")
    return os.path.abspath(frames_json_path)


def main() -> None:
    video_path = sys.argv[1] if len(sys.argv) > 1 else "video.mp4"
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "slides"
    scene_threshold = float(sys.argv[3]) if len(sys.argv) > 3 else float(os.environ.get("SLIDE_SCENE_THRESHOLD", 0.35))
    max_frames_env = os.environ.get("SLIDE_MAX_FRAMES", "").strip()
    max_frames = int(max_frames_env) if max_frames_env.isdigit() else None

    extract_slides(
        video_path=video_path,
        out_dir=out_dir,
        scene_threshold=scene_threshold,
        max_frames=max_frames,
    )


if __name__ == "__main__":
    main()

