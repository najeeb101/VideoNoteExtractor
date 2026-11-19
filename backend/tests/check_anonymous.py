"""Local check (no pytest, no network): python backend/tests/check_anonymous.py"""
import sys, types
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from fastapi import HTTPException

def fake(anon):
    user = types.SimpleNamespace(id="u1", is_anonymous=anon)
    sb = types.SimpleNamespace(auth=types.SimpleNamespace(get_user=lambda t: types.SimpleNamespace(user=user)))
    app._get_supabase = lambda: sb

fake(True)
try:
    app._validate_token("t"); raise SystemExit("FAIL: anonymous accepted")
except HTTPException as e:
    assert e.status_code == 403, e.status_code
    print("anonymous ->", e.status_code, e.detail)
fake(False)
assert app._validate_token("t").id == "u1"
print("regular user -> accepted\nOK")
