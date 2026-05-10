"""
Optional Visual Mode - Video Downloader

Downloads a YouTube video (single video, no playlist) to a local MP4 file.
This is used for slide/frame extraction and OCR.
"""

import os
import subprocess
import sys


def download_video(youtube_url: str, output_path: str = "video.mp4") -> str:
    print(f"[*] Downloading video from: {youtube_url}")

    # Prefer MP4 container if available; yt-dlp will handle the best selection.
    command = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--format",
        "bv*+ba/best",
        "--merge-output-format",
        "mp4",
        "--output",
        output_path,
        "--no-playlist",
        youtube_url,
    ]

    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        if result.stdout:
            print(result.stdout)
    except FileNotFoundError as e:
        raise RuntimeError(
            "yt-dlp is not installed or not on PATH. Install it with: py -m pip install yt-dlp"
        ) from e
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"yt-dlp failed:\n{e.stderr}") from e

    abs_path = os.path.abspath(output_path)
    print(f"[OK] Video saved to: {abs_path}")
    return abs_path


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage:   py download_video.py <YouTube URL> [output_file]")
        print("Example: py download_video.py https://www.youtube.com/watch?v=dQw4w9WgXcQ video.mp4")
        sys.exit(1)

    url = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "video.mp4"
    download_video(url, out)


if __name__ == "__main__":
    main()

