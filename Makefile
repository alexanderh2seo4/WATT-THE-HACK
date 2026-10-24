.PHONY: dev backend frontend install test

# Backend (:8000) + frontend (:5173) together, prefixed logs; Ctrl-C stops both.
dev: frontend/node_modules
	./dev.sh

backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend: frontend/node_modules
	cd frontend && npm run dev

install:
	cd backend && uv sync
	cd frontend && npm install

test:
	cd backend && uv run pytest -q

# npm install on first run or when the lockfile changes
frontend/node_modules: frontend/package.json frontend/package-lock.json
	cd frontend && npm install
	touch frontend/node_modules
