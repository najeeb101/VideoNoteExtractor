"""
Shared LLM client resolution for the pipeline.

Prefers OpenAI (OPENAI_API_KEY). If that is absent, falls back to Groq
(GROQ_API_KEY) via its OpenAI-compatible endpoint, so the whole pipeline can
run on a single Groq key with no OpenAI account.
"""

from __future__ import annotations

import os
import sys

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def make_client_and_model():
    """Return (client, model). Exits with a clear message if no key is configured."""
    try:
        from openai import OpenAI
    except ImportError:
        print("Error: openai package not found. Install with: pip install openai")
        sys.exit(1)

    model = os.environ.get("OPENAI_MODEL")
    base_url = os.environ.get("OPENAI_BASE_URL")

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        client = OpenAI(api_key=openai_key, base_url=base_url) if base_url else OpenAI(api_key=openai_key)
        print(f"[*] LLM: OpenAI ({model or 'gpt-4o-mini'})")
        return client, (model or "gpt-4o-mini")

    groq_key = os.environ.get("GROQ_API_KEY")
    if groq_key:
        model = model or os.environ.get("GROQ_MODEL") or "llama-3.3-70b-versatile"
        client = OpenAI(api_key=groq_key, base_url=base_url or GROQ_BASE_URL)
        print(f"[*] LLM: Groq ({model})")
        return client, model

    print("Error: no LLM API key found. Set OPENAI_API_KEY or GROQ_API_KEY in your .env.")
    sys.exit(1)
