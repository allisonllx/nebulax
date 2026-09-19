# NebulaX — Smart Commuter Companion

A mobile-first web app for **Mr Tan, 74** — retired, understands mainly Mandarin, with early-stage
dementia and poor mobility — who travels from Ang Mo Kio to Tan Tock Seng Hospital every two weeks
for a fixed-time appointment. His daughter **Mei Ling** sets it up with him; from then on it plans a
step-free, door-to-door route at his own pace, speaks every step aloud and repeats it, quietly
re-routes him when he takes a wrong turn, and keeps the two of them one tap away from each other for
the whole journey.

Built for NebulaX 2026, Problem Statement 2 (LTA). The original problem statement lives in
[`PS2/`](PS2/PS2_README.md).

**Live deployment (Google Cloud Run):** https://nebulax-631606536056.asia-southeast1.run.app
**Write-up:** [`WRITEUP.md`](WRITEUP.md) · **Demo video:** https://youtu.be/_za0B450H4I

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 22.12+ | `node --version` |
| npm | comes with Node | `npm --version` |
| Python | 3.12+ | `python3 --version` |
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | any recent | `uv --version` |

No database or Docker needed for a local run.

## 2. Configure keys (two files, both free)

The app calls live Singapore government APIs. Copy the templates and fill in your own keys:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

| Variable | File | Where to get it |
|---|---|---|
| `LTA_DATAMALL_ACCOUNT_KEY` | `backend/.env` | Free registration at https://datamall.lta.gov.sg (Request for API Access; key arrives by email) |
| `ONEMAP_TOKEN` — or `ONEMAP_EMAIL` + `ONEMAP_PASSWORD` | `backend/.env` | Free registration at https://www.onemap.gov.sg/apidocs/register — tokens expire every 3 days, so email+password (auto-refresh) is more reliable |
| `VITE_MAPTILER_KEY` | `frontend/.env` | Free account at https://cloud.maptiler.com → Account → API keys |

Never commit `.env` files (they are git-ignored).

## 3. Run

Two terminals from the repository root.

**Terminal 1 — backend** (http://127.0.0.1:8000, interactive API docs at `/docs`):

```bash
cd backend
uv sync --locked
uv run fastapi dev main.py
```

**Terminal 2 — frontend** (http://localhost:5173, proxies `/api` to the backend):

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173** — on a phone on the same network, `http://<your-ip>:5173`.

**Tests** — 76 offline backend tests, no network or keys required:

```bash
cd backend
uv run pytest -q
```

The frontend has 30 Playwright end-to-end tests (`cd frontend && npx playwright test`).

## 4. What to try first

The demo journey is **Mr Tan's fortnightly trip: home (Ang Mo Kio) → Tan Tock Seng Hospital,
arriving by 10:00**.

1. Plan the journey — the app shows his usual route (bus 74 + North South Line), a departure time
   computed backwards from the appointment, and an arrival *window*, all timed at 60% walking pace.
2. Trigger the disruption — real disruptions are rare on demand, so activate the **labelled**
   replay scenario:

   ```bash
   curl -X POST <base-url>/api/scenarios/nsl_disruption/activate
   ```

   Refresh the journey: the app now proposes the direct bus 851 (no transfer, no stairs), shows the
   old route with the disrupted stretch marked, and every response carries `dataMode: "simulated"`.
3. Deactivate to return to live data:

   ```bash
   curl -X POST <base-url>/api/scenarios/deactivate
   ```

`<base-url>` is `http://127.0.0.1:8000` locally, or the live deployment URL above. The same two
endpoints drive everything: `POST /api/journeys/plan` and `POST /api/journeys/{id}/refresh` — full
schema at `/docs`, examples in [`docs/fixtures/`](docs/fixtures/).

For the two-button before-and-after demo (lift outage + crowded platform), open the **Demo panel /
演示控制台** at the bottom of the running app: step 1 shows the original route, step 2 simulates the
lift outage + crowded platform and switches to a step-free seated route, and a "Simulate offline"
toggle shows the saved route working with no signal.

## 5. Data sources

| Source | Used for |
|---|---|
| [LTA DataMall](https://datamall.lta.gov.sg) `TrainServiceAlerts` | Live disruptions and the official free-bus mitigation |
| [OneMap](https://www.onemap.gov.sg) routing + geocoding | Candidate door-to-door routes |
| [OpenStreetMap](https://www.openstreetmap.org) via MapTiler tiles | Basemap — © OpenStreetMap contributors |
| [data.gov.sg](https://data.gov.sg) real-time weather | Rain-aware advice (no key needed) |

Simulated data is always labelled as such (`dataMode` / `dataSource` fields); a feed that cannot be
read is reported as `unknown`, never as all-clear.

## 6. Repository map

```
backend/        FastAPI service — planning, disruption handling, bilingual instructions
frontend/       React + Vite + MapLibre mobile UI
docs/           Design docs, agreed API contract, fixtures, deployment guide
PS2/            The organisers' problem statement (unmodified)
Dockerfile      Single container: builds frontend, serves it + /api from FastAPI
docs/DEPLOY.md  Cloud Run deployment steps (as used for the live URL above)
```

## 7. Team

- Backend: @wuyunkai *(with Claude Code)*
- Frontend: @allisonllx
