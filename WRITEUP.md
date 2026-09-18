# WRITEUP — Smart Commuter Companion (NebulaX PS2)

## 1. Persona: who this is for

**Mr Tan, 74, retired, lives alone in Ang Mo Kio.** Every two weeks he travels to Tan Tock Seng
Hospital (Novena) for a fixed-time appointment; arriving late means rescheduling. He cannot manage
stairs, walks at roughly 60% of average pace, tires when standing, reads Mandarin more comfortably
than English, and has taken the same route for four years. He will not improvise a reroute on a
platform — when something goes wrong, he calls his daughter.

**Mei Ling, his daughter**, works full-time and cannot accompany him. Caregiver involvement is
*optional* in the product: the app is fully usable without linking her.

We chose one persona and built the full depth of one journey for him, rather than a generic app for
everyone — that is the trade the brief invites.

## 2. What the app does

- **Plans backwards from the appointment.** Input is "arrive by 10:00", not "leave now". Output is
  a departure time (`leave by 8:50`) and an arrival *window* (9:19–9:25), never a single confident
  number.
- **Times the journey at his pace.** All walking legs are re-timed at a configurable
  `walkingSpeedFactor` (0.6 for Mr Tan) on top of OneMap's estimates.
- **Reacts to disruption with one decision, not a status.** When the North South Line is disrupted,
  the refresh endpoint proposes the direct bus 851 — no transfer, no stairs — with the reasons
  stated ("One ride, no transfer. About 11 minutes longer than your usual route."), and returns the
  old route's geometry with the disrupted stretch marked so both can be drawn for comparison.
- **Says the honest thing when there is no answer.** If no usable route remains, the response is
  `no_accessible_route` with a plain bilingual message and a "call for help" action — never a
  silently relaxed constraint.
- **Reports conditions that matter to *him*.** A lift under maintenance at his boarding or alighting
  station (parsed down to the exit from LTA's `LiftDesc` text) and rain forecast over either end of
  his walk are attached as warnings. Disruptions elsewhere on the network are filtered out, not
  shown — silence is a feature for this persona.
- **Bilingual by construction.** Every instruction, reason, summary and alert is generated
  server-side in English and Mandarin, one action per sentence, written to be read aloud
  ("搭红色的南北线,往滨海南码头方向。").

## 3. Architecture

```
Phone (mobile-first web app, React + Vite + MapLibre, OSM basemap via MapTiler)
   │  two endpoints, camelCase JSON, GeoJSON [lon, lat]
   ▼
FastAPI on Cloud Run (one container also serves the built frontend)
   ├── clients/    OneMap routing · LTA TrainServiceAlerts · LTA FacilitiesMaintenance · data.gov.sg weather
   ├── reference/  canonical line/station tables (the NS/NSL, BPL/BPLRT, SLRT/STL spelling traps)
   ├── services/   itinerary conversion · condition-vs-journey intersection · ranking · bilingual instructions
   └── scenarios/  labelled replay data for the demo
```

- `POST /api/journeys/plan` — candidates from OneMap (transit + bus-only), re-timed, ranked by
  time + 5 min per transfer + 1 min per 100 m walked, assembled into steps, GeoJSON and alerts.
- `POST /api/journeys/{id}/refresh` — re-evaluates stored candidates against live feeds:
  `unchanged` | `replacement_available` (version+1, old route included for comparison) |
  `no_accessible_route`.
- Full schema at `/docs`; worked examples in `docs/fixtures/`.

**Why no custom routing engine:** the brief says routing may be built on an existing engine. The
interesting work for this persona is not shortest-path — it is deciding what *this* commuter should
do, so our effort went into constraints, ranking, stability and language.

## 4. Simulated data policy

Real disruptions are rare on demand (`AffectedSegments` was empty on every probe day), so the demo
uses replay scenarios (`nsl_disruption`, `novena_lift_out`, `heavy_rain`, `bad_day`) modelled on the
official API guide's contingency example and the real response shapes we probed. **A scenario only
replaces the feed layer; planning code is identical for live and replayed data.** Every response
produced under a scenario carries `dataMode: "simulated"` (and per-alert `dataSource`), enforced
server-side so the UI label cannot be forgotten. Live mode is the default.

## 5. Assumptions (and where the numbers come from)

| Number | Value | How we arrived at it |
|---|---|---|
| Walking pace factor | 0.6 | Persona definition (approx. 60% of average pace); configurable per request |
| Arrival buffer | 30 min | Product decision: for a fixed appointment, being early is cheap, late is expensive |
| Arrival window's pessimistic end | ×1.2 of total | Simplifying assumption, stated here rather than hidden; observed OneMap variance between identical calls (74 vs 76 bus feeder, ±2 min) motivated using a range at all |
| Transfer penalty | 5 min | Product decision reflecting the persona's difficulty with transfers |
| Walk penalty | 1 min / 100 m | Product decision; slows ranking away from walk-heavy routes |
| "About 11 minutes longer" | computed | Difference of the two candidates' totals at his pace, measured from live OneMap responses |

These are stated as assumptions, not measurements. We did not conduct user testing with older
adults; doing so (task completion, error rate, unaided recovery) is the first thing we would do
next.

## 6. Known limitations

- **Step-free status is `unverified` end to end.** No open dataset covers step-free paths inside
  stations. Exit-level lift outages come from `FacilitiesMaintenance`, but we have not walked the
  corridor to verify exits, lifts and landmarks on site — every step is marked `unverified` rather
  than pretending otherwise.
- **`PCDForecast` covers today only** (probed 18 Sep 2026), so a true night-before crowd forecast is
  not possible from the API; crowd data is not yet integrated into ranking.
- **`FacilitiesMaintenance` has no dates** — we can say "under maintenance right now", never "will
  be down tomorrow".
- **Journeys are stored in memory** — a Cloud Run restart forgets them (the frontend re-plans).
  Firestore is the intended store.
- **Caregiver features are not built** (optional linking, progress sharing, dual notifications) —
  designed in `docs/backend-design.md`, honest future work.
- **OneMap tokens expire every 3 days**; auto-refresh from account credentials is implemented but
  requires `ONEMAP_EMAIL`/`ONEMAP_PASSWORD` to be set.
- The organisers' GCP project is a temporary lab environment; redeployment steps are in
  `docs/DEPLOY.md` if the URL rotates.

## 7. Privacy

No accounts, no personal data collected server-side. The demo profile (home coordinates, pace,
appointment time) is request-scoped; journeys live in process memory and are not logged. API keys
stay in environment variables and are git-ignored; the MapTiler key is public by design and
origin-restricted.

## 8. Verification

- 48 offline tests (`cd backend && uv run pytest`) — no network, no keys; recorded real OneMap
  responses in `backend/tests/data/`.
- README followed literally against a fresh clone before submission (deps, tests, server, plan
  call, frontend build).
- Live deployment smoke-tested end to end: plan → activate labelled scenario → refresh proposes
  bus 851 → deactivate.

## 9. Team & tooling

Backend: @wuyunkai · Frontend: @allisonllx. Claude Code was used throughout for research,
scaffolding, implementation and this document; all API findings were verified against the live
services, and all tests run offline against recorded responses.
