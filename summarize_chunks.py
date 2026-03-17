import os
import sys
import time

try:
    from google import genai
except ImportError:
    print("Error: google-genai package not found. Install with: py -m pip install google-genai")
    sys.exit(1)

from dotenv import load_dotenv

# Load environment variables (like GEMINI_API_KEY from .env)
load_dotenv()

# configure Gemini using the google-genai SDK
api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY environment variable not found.")
    sys.exit(1)

client = genai.Client(api_key=api_key)
model_name = 'gemini-2.5-flash'  # Using the same model you used in extraction!

chunk_folder = "chunks"
output_file = "notes.txt"

if not os.path.exists(chunk_folder):
    print(f"Error: Directory '{chunk_folder}' not found. Please run chunk_transcript.py first.")
    sys.exit(1)

# Get all chunk files and sort them *numerically* (so chunk_2 comes before chunk_10)
files = [f for f in os.listdir(chunk_folder) if f.startswith("chunk_") and f.endswith(".txt")]
files.sort(key=lambda x: int(x.split('_')[1].split('.')[0]))

if not files:
    print(f"No chunks found in '{chunk_folder}'. Please check your transcript.")
    sys.exit()

with open(output_file, "w", encoding="utf-8") as notes:
    for file in files:
        filepath = os.path.join(chunk_folder, file)
        with open(filepath, "r", encoding="utf-8") as f:
            chunk = f.read()

        prompt = f"""
You are an AI lecture assistant.

Summarize this transcript section and extract:
- Key ideas
- Important explanations
- If timestamps appear, keep them

Transcript:
{chunk}
"""
        print(f"Processing {file}...")
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                notes.write(response.text + "\n\n---\n\n")
                
                # To prevent hitting the 15 RPM (Requests Per Minute) free-tier limit:
                print("  Waiting 4.5 seconds to respect API rate limits...")
                time.sleep(4.5) 
                break # Success, so break out of the retry loop
            
            except Exception as e:
                print(f"  Attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 10
                    print(f"  Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    print(f"  Failed permanently on {file}: {e}")

print(f"Notes generated successfully in {output_file}!")
