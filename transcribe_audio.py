"""
Step 2 - Video Note Extractor
Accepts an audio file (e.g. audio.mp3), auto-detects its language,
selects the appropriate Whisper model, transcribes it using faster-whisper
(GPU-accelerated if available), and saves both a plain and timestamped transcript.
"""

import sys
import os

# --- Register NVIDIA DLL directories so ctranslate2 can find cublas/cudnn ---
# Required on Windows when CUDA libraries are installed via pip (not CUDA Toolkit)
def _add_nvidia_dll_dirs():
    try:
        import site
        for sp in site.getsitepackages():
            nvidia_base = os.path.join(sp, "nvidia")
            if os.path.isdir(nvidia_base):
                for pkg in os.listdir(nvidia_base):
                    bin_dir = os.path.join(nvidia_base, pkg, "bin")
                    if os.path.isdir(bin_dir):
                        os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]
                        if hasattr(os, "add_dll_directory"):
                            os.add_dll_directory(bin_dir)
    except Exception:
        pass

_add_nvidia_dll_dirs()

from faster_whisper import WhisperModel


# ---------------------------------------------------------------------------
# Language → model mapping
# English is well-supported at 'small'; complex scripts need 'large'.
# ---------------------------------------------------------------------------
LANGUAGE_MODEL_MAP = {
    "en": "small",                              # English       → small is plenty
    "fr": "medium", "de": "medium",             # Common European
    "es": "medium", "it": "medium",
    "pt": "medium", "nl": "medium",
    "ar": "large-v3",                           # Arabic        → needs large
    "zh": "large-v3", "ja": "large-v3",         # CJK scripts
    "ko": "large-v3", "ru": "large-v3",
    "fa": "large-v3", "hi": "large-v3",
}
DEFAULT_MODEL = "medium"   # safe fallback for unknown languages


def format_timestamp(seconds: float) -> str:
    """Converts seconds to a human-readable HH:MM:SS timestamp string."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def get_device() -> tuple[str, str]:
    """
    Detects whether a CUDA GPU is available.
    Returns (device, compute_type) tuple optimized for the hardware.
    """
    try:
        import ctranslate2
        cuda_types = ctranslate2.get_supported_compute_types("cuda")
        if cuda_types:   # non-empty → CUDA is accessible
            print("[✓] GPU detected — using CUDA (float16)")
            return "cuda", "float16"
    except Exception:
        pass
    print("[!] No GPU detected — using CPU (int8, slower)")
    return "cpu", "int8"


def detect_language(audio_path: str, device: str, compute_type: str) -> tuple[str, float]:
    """
    Detects the spoken language using the 'tiny' model (fast, ~5 seconds).
    Returns (language_code, confidence_percent).
    """
    print("[*] Detecting language (using 'tiny' model) ...")
    model = WhisperModel("tiny", device=device, compute_type=compute_type)
    segments, info = model.transcribe(audio_path, beam_size=1, language=None)

    # Consume the generator to complete detection
    for _ in segments:
        pass

    language   = info.language
    confidence = info.language_probability * 100
    print(f"[✓] Detected language: '{language}' ({confidence:.1f}% confidence)")
    return language, confidence


def pick_model(language: str) -> str:
    """Returns the recommended model size for the given language code."""
    model = LANGUAGE_MODEL_MAP.get(language, DEFAULT_MODEL)
    print(f"[*] Selected model: '{model}' (based on language '{language}')")
    return model


def transcribe_audio(
    audio_path: str,
    output_path: str = "transcript.txt",
    model_name: str = None,
    language: str = None,
) -> str:
    """
    Transcribes an audio file using faster-whisper (GPU-accelerated if available).

    Saves two files:
      - <output_path>               → plain transcript
      - <output_path>_timestamped   → transcript with [HH:MM:SS] timestamps

    Args:
        audio_path:  Path to the audio file.
        output_path: Destination filename for the plain transcript.
        model_name:  Whisper model size. If None, auto-selected by language.
        language:    Language code (e.g. 'ar', 'en'). If None, auto-detected.

    Returns:
        Absolute path to the plain transcript file.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    device, compute_type = get_device()

    # --- Auto-detect language ---
    if language is None:
        language, confidence = detect_language(audio_path, device, compute_type)
        if confidence < 60:
            print(f"[!] Low confidence ({confidence:.1f}%). Detection may be inaccurate.")
    else:
        print(f"[*] Using specified language: '{language}'")

    # --- Auto-select model ---
    if model_name is None:
        model_name = pick_model(language)
    else:
        print(f"[*] Using specified model: '{model_name}'")

    # --- Load model and transcribe ---
    print(f"[*] Loading faster-whisper model: '{model_name}' on {device.upper()} ...")
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    print(f"[*] Transcribing: {audio_path} ...")
    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,          # Skip silent parts — significantly faster
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    # --- Collect segments (generator) ---
    plain_lines      = []
    timestamped_lines = []

    for segment in segments:
        text = segment.text.strip()
        ts   = format_timestamp(segment.start)
        plain_lines.append(text)
        timestamped_lines.append(f"[{ts}] {text}")
        print(f"  [{ts}] {text}")   # live progress

    # --- Save plain transcript ---
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(plain_lines))

    # --- Save timestamped transcript ---
    base, ext = os.path.splitext(output_path)
    timestamped_path = f"{base}_timestamped{ext}"
    with open(timestamped_path, "w", encoding="utf-8") as f:
        f.write("\n".join(timestamped_lines))

    abs_path = os.path.abspath(output_path)
    abs_ts   = os.path.abspath(timestamped_path)
    print(f"\n[✓] Plain transcript saved to      : {abs_path}")
    print(f"[✓] Timestamped transcript saved to: {abs_ts}")
    return abs_path


def main():
    if len(sys.argv) < 2:
        print("Usage:   py step2_transcribe_audio.py <audio_file> [output_file] [model] [language]")
        print()
        print("Examples:")
        print("  py step2_transcribe_audio.py audio.mp3")
        print("    → auto-detects language + model, uses GPU if available")
        print()
        print("  py step2_transcribe_audio.py audio.mp3 transcript.txt medium ar")
        print("    → forces Arabic + medium model")
        print()
        print("Available models : tiny, base, small, medium, large-v3")
        print("Language codes   : en, ar, fr, de, es, zh, ja, etc.")
        sys.exit(1)

    audio_path  = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "transcript.txt"
    model_name  = sys.argv[3] if len(sys.argv) > 3 else None
    language    = sys.argv[4] if len(sys.argv) > 4 else None

    transcribe_audio(audio_path, output_path, model_name, language)


if __name__ == "__main__":
    main()
