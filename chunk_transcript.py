import os

def chunk_text(text, chunk_size=500, overlap=50):
    words = text.split()
    chunks = []
    
    # We step by (chunk_size - overlap) to ensure the chunks overlap
    step = chunk_size - overlap
    
    # Ensure step is at least 1 to avoid an infinite loop if overlap >= chunk_size
    if step <= 0:
        step = chunk_size

    for i in range(0, len(words), step):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)

    return chunks

# 1. Read the transcript
with open("transcript.txt", "r", encoding="utf-8") as f:
    transcript = f.read()

# 2. Split into chunks
chunks = chunk_text(transcript, chunk_size=500, overlap=50)

# 3. Create the chunks output directory if it doesn't exist
output_dir = "chunks"
os.makedirs(output_dir, exist_ok=True)

# 4. Save the chunks
for i, chunk in enumerate(chunks):
    filepath = os.path.join(output_dir, f"chunk_{i}.txt")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(chunk)

print(f"Transcript split into {len(chunks)} chunks successfully!")
