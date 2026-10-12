FROM python:3.12-slim

# ffmpeg: audio extraction + video download. Tesseract is skipped on purpose:
# the web API always runs the pipeline with --no-visual.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Drop the optional CUDA wheels (~1 GB); deployed hosts transcribe on CPU.
COPY requirements.txt .
RUN grep -v '^nvidia-' requirements.txt > requirements.cpu.txt \
    && pip install --no-cache-dir -r requirements.cpu.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    WHISPER_DEVICE=cpu \
    PORT=8000

EXPOSE 8000
CMD ["python", "app.py"]
