"""
UTF-8 console helper for the pipeline.

The steps print status characters like ✓ and → to stdout. On Windows the
default console/pipe encoding is cp1252, which cannot encode those code points,
so an unguarded print crashes with UnicodeEncodeError. run_pipeline.py (and the
backend when it spawns run_pipeline.py) set PYTHONUTF8=1 for child processes,
but a step run *standalone* — which CLAUDE.md documents as supported — has no
such protection. Calling enable_utf8_console() at import time makes every entry
point safe on its own, regardless of how it was launched.
"""

from __future__ import annotations

import sys


def enable_utf8_console() -> None:
    """Reconfigure stdout/stderr to UTF-8. Idempotent; no-op where unsupported."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass
