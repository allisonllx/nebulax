# Local development

The application lives in `frontend/` and `backend/`. Problem-statement materials remain in `PS2/`.

Before feature work, see the [frontend product plan](docs/frontend-plan.md) and [frontend–backend contract checklist](docs/backend-contracts.md).

## Prerequisites

- Node.js 22.12+ and npm (Node.js 24 LTS recommended)
- Python 3.12+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

## Start the backend

In a terminal from the repository root:

```sh
cd backend
uv sync --locked
uv run fastapi dev main.py
```

API: http://127.0.0.1:8000

Interactive API documentation: http://127.0.0.1:8000/docs

Health endpoint: http://127.0.0.1:8000/api/health

## Start the frontend

In a second terminal from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173 to see the React starter page.

During development, Vite forwards `/api` requests to FastAPI at `127.0.0.1:8000`. Frontend code can call `fetch('/api/health')` without configuring CORS. This proxy is development-only; configure API routing separately when deploying.

## Frontend checks

```sh
cd frontend
npm run lint
npm run build
```

Dependency lockfiles are included. Local environments, build output, and `.env` files are ignored by Git.
