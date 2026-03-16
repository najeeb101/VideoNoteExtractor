"""
Step 3 - Video Note Extractor
Accepts a timestamped transcript file, sends it to Google Gemini,
and generates structured Markdown study notes.
"""

import sys
import os

try:
    from google import genai
except ImportError:
    print("Error: google-genai package not found.")
    print("Install it with: py -m pip install google-genai")
    sys.exit(1)


def extract_notes(transcript_path: str, output_path: str = "notes.md"):
    """
    Sends the transcript to Gemini to generate structured notes.
    """
    if not os.path.exists(transcript_path):
        raise FileNotFoundError(f"Transcript file not found: {transcript_path}")

    # Load environment variables from .env file (if it exists)
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass  # If not installed, it just skips this (useful if deploying online where dotenv isn't needed)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable is not set.")
        print("Please set your API key in a .env file or your system environment variables.")
        print()
        print("1. Create a file called '.env' in this folder")
        print("2. Put this inside it: GEMINI_API_KEY=your_actual_api_key_here")
        sys.exit(1)

    print(f"[*] Reading transcript from: {transcript_path}")
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript_text = f.read()

    print("[*] Connecting to Google Gemini (gemini-2.5-flash) ...")
    client = genai.Client(api_key=api_key)

    prompt = (
        "You are an expert professor and a world-class student note-taker. "
        "I am providing a timestamped transcript of a video lecture. "
        "Your goal is to transform this raw text into a comprehensive, beautifully structured Markdown study guide.\n\n"
        "Strict Requirements regarding Structure & Formatting:\n"
        "1. **High-Level Summary:** Start with a brief paragraph summarizing the entire lecture.\n"
        "2. **Chronological Topics:** Use Markdown headings (##, ###) to separate major concepts as they appear in the video.\n"
        "3. **Timestamps:** **CRITICAL:** Next to EVERY heading and bullet point, include the exact timestamp from the transcript (e.g., [00:15:20]) so I can easily refer back to the video.\n"
        "4. **Terminology:** **Bold** any key terms, vocabulary, or important definitions.\n"
        "5. **Math & Formulas:** If the lecture involves math, code, or formulas, format them clearly using Markdown code blocks or LaTeX-style math formatting (e.g. `f(x) = wx + b`).\n"
        "6. **Examples:** Clearly separate abstract explanations from concrete 'Examples' given by the speaker.\n"
        "7. Keep the writing concise, academic, and highly readable.\n\n"
        "Here is the transcript:\n\n"
        f"{transcript_text}"
    )

    print("[*] Analyzing the lecture and writing notes. This may take 10-30 seconds...")
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
    except Exception as e:
        print(f"\n[!] Error calling Gemini API: {e}")
        sys.exit(1)

    notes = response.text

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(notes)

    abs_path = os.path.abspath(output_path)
    print(f"\n[✓] Video notes successfully generated and saved to: {abs_path}")
    return abs_path


def main():
    if len(sys.argv) < 2:
        print("Usage:   py step3_extract_notes.py <transcript_file> [output_file]")
        print("Example: py step3_extract_notes.py transcript_timestamped.txt my_notes.md")
        sys.exit(1)

    transcript_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "notes.md"

    extract_notes(transcript_path, output_path)


if __name__ == "__main__":
    main()
