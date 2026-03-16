"""
Step 1 - Video Note Extractor
Accepts a YouTube URL, downloads the video using yt-dlp,
extracts the audio via ffmpeg, and saves it as audio.mp3
"""

import subprocess
import sys
import os


def download_audio(youtube_url: str, output_path: str = "audio.mp3") -> str:
    """
    Downloads a YouTube video and extracts its audio as an MP3 file.

    Args:
        youtube_url: The full YouTube video URL.
        output_path: Destination filename for the extracted audio.

    Returns:
        The absolute path to the saved audio file.

    Raises:
        RuntimeError: If yt-dlp fails to download or convert.
    """
    print(f"[*] Downloading audio from: {youtube_url}")

    command = [
        sys.executable, "-m", "yt_dlp",  # Use current Python's yt-dlp (no PATH needed)
        "--extract-audio",           # Extract audio only
        "--audio-format", "mp3",     # Convert to MP3 via ffmpeg
        "--audio-quality", "0",      # Best audio quality (VBR)
        "--output", output_path,     # Output filename
        "--no-playlist",             # Download single video, not a playlist
        youtube_url,
    ]

    try:
        result = subprocess.run(
            command,
            check=True,               # Raise CalledProcessError on non-zero exit
            capture_output=True,
            text=True,
        )
        print(result.stdout)
    except FileNotFoundError:
        raise RuntimeError(
            "yt-dlp is not installed or not on PATH. "
            "Install it with: pip install yt-dlp"
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"yt-dlp failed:\n{e.stderr}")

    abs_path = os.path.abspath(output_path)
    print(f"[✓] Audio saved to: {abs_path}")
    return abs_path


def main():
    if len(sys.argv) < 2:
        print("Usage: python step1_download_audio.py <YouTube URL>")
        print("Example: python step1_download_audio.py https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        sys.exit(1)

    url = sys.argv[1]
    download_audio(url)


if __name__ == "__main__":
    main()
