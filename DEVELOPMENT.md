# Local development

The application lives in `frontend/` and `backend/`. Problem-statement materials remain in `PS2/`.

Before feature work, see the [frontend product plan](docs/frontend-plan.md) and [frontend–backend contract checklist](docs/backend-contracts.md).

The implemented frontend now uses the smaller [minimum API contract](docs/minimum-api-contract.md), with copyable JSON examples. Start there for backend integration.

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

Open http://localhost:5173 to use the bilingual journey prototype with labelled demo data.

During development, Vite forwards `/api` requests to FastAPI at `127.0.0.1:8000`. Frontend code can call `fetch('/api/health')` without configuring CORS. This proxy is development-only; configure API routing separately when deploying.

## Frontend checks

```sh
cd frontend
npm run lint
npm run build
```

Dependency lockfiles are included. Local environments, build output, and `.env` files are ignored by Git.

## Offline-capable frontend preview

Service-worker caching is enabled in production builds, not the development server:

```sh
cd frontend
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open http://127.0.0.1:4173 online, wait for “Saved for offline use”, start the trip, then test offline reload. Audio requires an installed local voice when offline.

## Browser tests

```sh
cd frontend
npx playwright install chromium
npm test
```

Tests start preview servers on ports 4173 and 4174; stop existing previews first. They cover offline reopening, progress, Chinese/large text, reroute acceptance, blocked routes, arrival and API failures.
