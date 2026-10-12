"""
Shared LLM client resolution for the pipeline.

Set LLM_PROVIDER=ollama to use a local Ollama model (no key needed).
Otherwise prefers OpenAI (OPENAI_API_KEY). If that is absent, falls back to Groq
(GROQ_API_KEY) via its OpenAI-compatible endpoint, so the whole pipeline can
run on a single Groq key with no OpenAI account.
"""

from __future__ import annotations

import os
import sys

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
OLLAMA_BASE_URL = "http://localhost:11434/v1"
# Built from backend/ollama/Modelfile (qwen3 4B instruct + 8k context; the /v1
# endpoint can't set num_ctx per request, so it is baked into the model).
OLLAMA_DEFAULT_MODEL = "lectura-notes"


def make_client_and_model():
    """Return (client, model). Exits with a clear message if no key is configured."""
    try:
        from openai import OpenAI
    except ImportError:
        print("Error: openai package not found. Install with: pip install openai")
        sys.exit(1)

    model = os.environ.get("OPENAI_MODEL")
    base_url = os.environ.get("OPENAI_BASE_URL")

    if os.environ.get("LLM_PROVIDER", "").lower() == "ollama":
        model = os.environ.get("OLLAMA_MODEL") or OLLAMA_DEFAULT_MODEL
        client = OpenAI(
            api_key="ollama",  # required by the SDK, ignored by Ollama
            base_url=os.environ.get("OLLAMA_BASE_URL") or OLLAMA_BASE_URL,
        )
        print(f"[*] LLM: Ollama ({model})")
        return client, model

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        client = OpenAI(api_key=openai_key, base_url=base_url) if base_url else OpenAI(api_key=openai_key)
        print(f"[*] LLM: OpenAI ({model or 'gpt-4o-mini'})")
        return client, (model or "gpt-4o-mini")

    groq_key = os.environ.get("GROQ_API_KEY")
    if groq_key:
        model = model or os.environ.get("GROQ_MODEL") or "openai/gpt-oss-120b"
        client = OpenAI(api_key=groq_key, base_url=base_url or GROQ_BASE_URL)
        print(f"[*] LLM: Groq ({model})")
        return client, model

    print("Error: no LLM API key found. Set OPENAI_API_KEY or GROQ_API_KEY in your .env.")
    sys.exit(1)
