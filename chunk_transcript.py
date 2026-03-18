import os
import re


TS_LINE_RE = re.compile(r"^\[(\d{2}:\d{2}:\d{2})\]\s+")


def _read_transcript_path() -> str:
    """
    Prefer timestamped transcript when present, otherwise fall back to plain transcript.
    """
    if os.path.exists("transcript_timestamped.txt"):
        return "transcript_timestamped.txt"
    return "transcript.txt"


def chunk_timestamped_lines(lines: list[str], max_words: int = 500, overlap_lines: int = 5) -> list[str]:
    """
    Chunks transcript by lines while preserving timestamps (when present).

    - max_words: approximate cap per chunk
    - overlap_lines: number of trailing lines to repeat into the next chunk
    """
    chunks: list[str] = []
    i = 0
    n = len(lines)

    while i < n:
        word_count = 0
        start = i

        while i < n and word_count < max_words:
            word_count += len(lines[i].split())
            i += 1

        end = i
        chunk = "\n".join(lines[start:end]).strip()
        if chunk:
            chunks.append(chunk)

        if end >= n:
            break

        # Overlap a few lines for continuity
        i = max(0, end - max(0, overlap_lines))

    return chunks


def main() -> None:
    transcript_path = _read_transcript_path()
    with open(transcript_path, "r", encoding="utf-8") as f:
        raw_lines = [line.rstrip("\n") for line in f]

    # Keep non-empty lines; if timestamped, keep original lines (including [HH:MM:SS])
    lines = [ln.strip() for ln in raw_lines if ln.strip()]

    chunks = chunk_timestamped_lines(lines, max_words=500, overlap_lines=5)

    output_dir = "chunks"
    os.makedirs(output_dir, exist_ok=True)

    for idx, chunk in enumerate(chunks):
        filepath = os.path.join(output_dir, f"chunk_{idx}.txt")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(chunk)

    print(f"Transcript ({transcript_path}) split into {len(chunks)} chunks successfully!")


if __name__ == "__main__":
    main()
