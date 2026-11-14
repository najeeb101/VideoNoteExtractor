# Hugging Face Spaces image for the Lectura API (free CPU Space: 2 vCPU, 16 GB RAM).
# Same as backend/Dockerfile, plus the Spaces rules: run as uid 1000, listen on 7860.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    WHISPER_DEVICE=cpu \
    PORT=7860

WORKDIR /app

COPY --chown=user requirements.txt .
RUN grep -v '^nvidia-' requirements.txt > requirements.cpu.txt \
    && pip install --no-cache-dir --user -r requirements.cpu.txt

COPY --chown=user . .

EXPOSE 7860
CMD ["python", "app.py"]
