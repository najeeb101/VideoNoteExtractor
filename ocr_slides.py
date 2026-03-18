"""
Optional Visual Mode - OCR slide frames with local Tesseract

Inputs:
  - slides/frames.json (from extract_slides.py)
Outputs:
  - slides/index.json  (timestamp + image_path + ocr_text + cleaned_text)

Requirements:
  - pytesseract + pillow in your Python env
  - Tesseract installed on the machine (Windows installer) and available on PATH
    OR set env var TESSERACT_CMD to the tesseract.exe path.
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

try:
    from PIL import Image
except ImportError:
    print("Error: pillow not found. Install with: py -m pip install pillow")
    sys.exit(1)

try:
    import pytesseract
except ImportError:
    print("Error: pytesseract not found. Install with: py -m pip install pytesseract")
    sys.exit(1)


def _clean_text(text: str) -> str:
    # Basic cleanup: normalize whitespace, remove repeated blank lines
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def ocr_slides(
    frames_json_path: str = os.path.join("slides", "frames.json"),
    out_index_path: str = os.path.join("slides", "index.json"),
    lang: str | None = None,
) -> str:
    if not os.path.exists(frames_json_path):
        raise FileNotFoundError(f"Frames index not found: {frames_json_path}")

    tesseract_cmd = os.environ.get("TESSERACT_CMD", "").strip()
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    lang = lang or os.environ.get("OCR_LANG", "").strip() or None

    with open(frames_json_path, "r", encoding="utf-8") as f:
        frames: list[dict[str, Any]] = json.load(f)

    results: list[dict[str, Any]] = []
    print(f"[*] OCR on {len(frames)} slide frame(s)...")
    if lang:
        print(f"[*] OCR language: {lang}")

    for i, fr in enumerate(frames, start=1):
        ts = float(fr.get("timestamp", 0.0) or 0.0)
        image_path = fr.get("image_path")
        if not image_path or not os.path.exists(image_path):
            continue

        with Image.open(image_path) as img:
            ocr_text = pytesseract.image_to_string(img, lang=lang) if lang else pytesseract.image_to_string(img)

        cleaned = _clean_text(ocr_text)
        results.append(
            {
                "timestamp": ts,
                "image_path": image_path,
                "ocr_text": ocr_text,
                "cleaned_text": cleaned,
            }
        )

        if i % 10 == 0 or i == len(frames):
            print(f"  - {i}/{len(frames)}")

    os.makedirs(os.path.dirname(out_index_path) or ".", exist_ok=True)
    with open(out_index_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    abs_path = os.path.abspath(out_index_path)
    print(f"[OK] Wrote OCR index: {abs_path}")
    return abs_path


def main() -> None:
    frames_json_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("slides", "frames.json")
    out_index_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join("slides", "index.json")
    lang = sys.argv[3] if len(sys.argv) > 3 else None
    ocr_slides(frames_json_path, out_index_path, lang=lang)


if __name__ == "__main__":
    main()

