# CLAUDE.md

NebulaX 2026 hackathon, Problem Statement 2 (LTA "Smart Commuter Companion").
Persona: **Mr Tan**, 74, Ang Mo Kio → Tan Tock Seng Hospital, step-free, Mandarin-first, plus his
daughter Mei Ling (optional caregiver). Judged on: a real phone browser, a clean-machine README run,
and one end-to-end journey through one disruption. Judging environment requires the app deployed on
Google Cloud.

## Layout

- `backend/` — FastAPI + uv (Python 3.12). The product logic lives here.
- `frontend/` — React 19 + Vite + TypeScript. Owned by the frontend teammate; coordinate before editing.
- `docs/backend-design.md` — the agreed two-endpoint contract and Mr Tan planning rules. Read it first.
- `docs/fixtures/` — example API responses (real OneMap geometry). Regenerate, never hand-edit.
- `docs/DEPLOY.md` — Cloud Run deployment, verified commands.
- `PS2/` — the organisers' problem statement. Reference only, never edit.

## Commands (each verified on this machine)

Backend dev server (http://127.0.0.1:8000, docs at /docs):

    cd backend && uv sync --locked && uv run fastapi dev main.py

Tests — 39 offline tests, no network, no keys needed:

    cd backend && uv run pytest -q

Frontend dev server (http://localhost:5173, proxies /api to :8000). Node 22.12+ — run `nvm use 22`
first, the machine default is Node 20:

    cd frontend && npm ci && npm run dev

Regenerate API fixtures / probe the live feeds (needs keys in `backend/.env`):

    cd backend && python3 scripts/make_fixtures.py
    cd backend && python3 scripts/probe_apis.py

Deploy (see docs/DEPLOY.md for the full sequence): build with `gcloud builds submit --config
cloudbuild.yaml --substitutions _MAPTILER_KEY=...`, then `gcloud run deploy nebulax --image ...`.
Live service: https://nebulax-631606536056.asia-southeast1.run.app (Qwiklabs project — may expire;
redeploy per DEPLOY.md if so).

## Environment

`backend/.env` (git-ignored; names in `backend/.env.example`): `LTA_DATAMALL_ACCOUNT_KEY`,
`ONEMAP_TOKEN` (expires every 3 days), `ONEMAP_EMAIL`/`ONEMAP_PASSWORD` (used to auto-refresh).
`frontend/.env`: `VITE_MAPTILER_KEY` (public by design; origin-restricted in the MapTiler dashboard).

## Hard rules

- **Never commit a key** — `.env` files are ignored; keep it that way. A committed credential caps
  the score.
- **Simulated data must stay labelled.** Scenario mode forces `dataMode: "simulated"` on every
  response; do not weaken this, and the UI must show the label. Mock data presented as live caps
  the score.
- **OpenStreetMap attribution is mandatory** on the map; do not hide MapLibre's attribution control.
- A failed feed is `dataFreshness: "unknown"`, never an implicit all-clear.
- API responses are camelCase with bilingual `{en, zh}` text; geometry is GeoJSON `[lon, lat]`.
  The contract is frozen in `docs/backend-design.md` §3 + `docs/fixtures/` — change both or neither,
  and tell the frontend teammate first.

## Gotchas already hit

- Line codes differ per feed (`NS` vs `NSL`, `BPL` vs `BPLRT`, `SLRT`/`STL`): always map through
  `app/reference.py`, never compare raw codes.
- `TrainServiceAlerts.FreePublicBus` can be prose ("Free bus service island wide"), not codes.
- `PCDForecast` covers today only; `v2/FacilitiesMaintenance` has no dates (current state only).
- OneMap returns slightly different itineraries per call — assert on shape, not exact routes;
  tests use recorded responses in `backend/tests/data/`.
- TDD: tests first (`backend/tests/`), then implementation. Run the full suite before committing.
