#!/usr/bin/env bash
# Start backend (uvicorn) and frontend (vite) together; Ctrl-C stops both.
# Ports: BACKEND_PORT (default 8000), FRONTEND_PORT (default 5173).
set -u
cd "$(dirname "$0")"
BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

# Job control: each service runs in its own process group, so one kill reaches
# uv + uvicorn (+ reload worker) or npm + vite, plus the log prefixer.
set -m

# Plain bash, so lines show up immediately (awk/sed may block-buffer a pipe).
prefix() { while IFS= read -r line; do printf '%s%s\n' "$1" "$line"; done; }

(cd backend && PYTHONUNBUFFERED=1 uv run uvicorn app.main:app --reload --port "$BACKEND_PORT" 2>&1 | prefix '[backend]  ') &
backend=$!
(cd frontend && API_URL="http://localhost:$BACKEND_PORT" npm run dev -- --port "$FRONTEND_PORT" 2>&1 | prefix '[frontend] ') &
frontend=$!

stop() {
  trap - INT TERM EXIT
  echo "[dev] stopping backend and frontend..."
  kill -TERM -- "-$backend" "-$frontend" 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap stop INT TERM EXIT

# Stop everything as soon as either service exits (no `wait -n`: macOS ships bash 3.2).
while kill -0 "$backend" 2>/dev/null && kill -0 "$frontend" 2>/dev/null; do sleep 1; done
echo "[dev] a service exited"
