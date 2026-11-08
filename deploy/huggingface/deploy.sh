#!/usr/bin/env bash
# Push the committed backend/ to a Hugging Face Docker Space.
# Usage: HF_TOKEN=hf_xxx HF_USER=yourname ./deploy/huggingface/deploy.sh [space-name]
# Create the Space first (Docker SDK, blank) at https://huggingface.co/new-space,
# and set its secrets: GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, FRONTEND_URL.
set -euo pipefail
: "${HF_TOKEN:?set HF_TOKEN (write token)}"; : "${HF_USER:?set HF_USER}"
SPACE="${1:-lectura-api}"
ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone -q "https://$HF_USER:$HF_TOKEN@huggingface.co/spaces/$HF_USER/$SPACE" "$TMP/space"
cd "$TMP/space"
git rm -rq --ignore-unmatch . >/dev/null
# Only tracked backend files: no .env, outputs or caches.
git -C "$ROOT" archive HEAD:backend | tar -x -C .
rm -f Dockerfile
cp "$ROOT/deploy/huggingface/Dockerfile" "$ROOT/deploy/huggingface/README.md" .
git add -A
git -c user.name="$HF_USER" -c user.email="$HF_USER@users.noreply.huggingface.co" \
  commit -qm "Deploy $(git -C "$ROOT" rev-parse --short HEAD)" || { echo "No changes."; exit 0; }
git push -q origin HEAD:main
echo "Pushed. Build log: https://huggingface.co/spaces/$HF_USER/$SPACE?logs=build"
echo "API URL: https://${HF_USER,,}-${SPACE}.hf.space"
