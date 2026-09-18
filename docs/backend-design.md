# Backend design

Status: backend's reply to the [contract checklist](backend-contracts.md) and
[frontend plan](frontend-plan.md). Proposal for team review; nothing here is implemented yet except
the probe and fixture scripts.

Short version: the frontend plan is right about the product. This document (1) reports what the data
sources actually return, (2) records the two-endpoint contract agreed on 19 Sep and its fixtures, and
(3) says how the backend makes decisions for Mr Tan rather than for a generic commuter.

---

## 1. What the data sources actually return

Checked on 18 Sep 2026 with real keys (`backend/scripts/probe_apis.py`; raw responses are saved to
the git-ignored `backend/probe-output/`). This closes "Obtain representative source responses" in the
checklist.

| Source | Result | Consequence for the product |
| --- | --- | --- |
| OneMap PT routing | Works. Returns itineraries with per-leg encoded polylines, stop codes (`NS16`), walk distance, transfers, times in **epoch ms / seconds** | Usable as the candidate-route provider. Knows nothing about stairs or lifts. Token expires every **3 days** → backend refreshes it from email + password |
| `TrainServiceAlerts` | `Status: 1`, `AffectedSegments: []` today. `Message[]` carries **real planned closures as free text**, e.g. "Bukit Panjang LRT will be closed on 20 Sep and 27 Sep 2026 (Sundays)" | Major disruption must be replayed (allowed if labelled). Planned events are genuinely available in advance, but only as sentences that need parsing |
| `v2/FacilitiesMaintenance` | 4 lifts down right now. Fields: `Line, StationCode, StationName, LiftID, LiftDesc` — **no dates at all** | We can say "this lift is under maintenance as of tonight; we will recheck before you leave". We cannot say "it will be down tomorrow". Matches the frontend plan's wording |
| Line codes | A third spelling appeared: `BPLRT` here vs `BPL` elsewhere. `LiftID` is inconsistent (`B1L01`, `B1 L01`, empty) | One canonical line/station table; match lifts by station + parsed exit letter from `LiftDesc`, not by `LiftID` |
| `PCDRealTime` | Works, 10-min windows, `l/m/h` | Fine |
| `PCDForecast` | **Today only** (48 half-hour slots), not tomorrow | No night-before crowd forecast from the API. Store each day's forecast to build a weekday baseline |
| `PlannedBusRoutes` | 0 rows | Do not depend on it |
| `v3/BusArrival` | Works. `Load`, `Feature: WAB`, `Type` all populated | Seat/wheelchair-bus preference is feasible |
| `RoadWorks` | Works, has `StartDate/EndDate` | Low priority for this persona |
| data.gov.sg weather | Works without a key | Fine |
| MapTiler tiles | Key works for style + vector tiles over Singapore | Frontend: `VITE_MAPTILER_KEY` in `frontend/.env`. Restrict the key to our origins in the MapTiler dashboard |

A real OneMap result worth knowing: Ang Mo Kio Ave 3 → TTSH has a **direct bus (851), zero
transfers**, about 11 minutes slower than bus + NSL at Mr Tan's pace. That is a natural, truthful
demo: when NSL is disrupted, the right answer for him is one bus with a seat, not a two-transfer
rail detour.

---

## 2. New constraint from the organisers: Google Cloud

Announced 19 Sep: a submission is only judged if it is **deployed on Google Cloud** using the
provided credits. (Do not swap the basemap for Google Maps — OSM is still mandatory.)

- **One Cloud Run service**: a single container where FastAPI serves `/api/*` and the built
  frontend. One URL, same origin, HTTPS (needed for the service worker and Add to Home Screen).
  Frontend must therefore use a relative `/api` base — no hard-coded host.
- The same `Dockerfile` gives judges a one-command local run for the clean-machine README check.
- **Secret Manager** for DataMall / OneMap credentials.
- **Firestore** for anything that must survive a redeploy (profiles, journeys, events, stored
  snapshots). Cloud Run's disk is ephemeral.
- **Cloud Scheduler** calls internal endpoints for the night-before and before-departure checks.
  Service runs with `min-instances=1`, CPU always allocated, so the feed poller keeps running.
- **Vertex AI (Gemini)** only if we do notice parsing (section 7).

---

## 3. API: the two-endpoint contract (agreed 19 Sep)

Frontend and backend agreed to shrink the first version to **one demo journey, the data the screens
receive, and the actions they send**. Accounts, caregiver linking, event sync, SMS and the voice
assistant each get their own small agreement later; the fuller table in
[backend-contracts.md](backend-contracts.md) is the eventual direction, not the current scope.

| Decision | Agreed minimum |
| --- | --- |
| Demo journey | One saved Ang Mo Kio → TTSH appointment |
| Scenarios | Normal trip · one disruption with an alternative · offline |
| Backend | Produce route, instructions, timing and relevant alerts |
| Frontend | Display, language switch, read-aloud, save trip offline, track current step |
| Data readiness | Every response says what is live, manually verified or simulated |

**`POST /api/journeys/plan`** — request `{origin, destination, arriveBy, stepFree, walkingSpeedFactor}`,
response: one journey (section 6).

**`POST /api/journeys/{id}/refresh`** — request `{version, lastConfirmedStepId}`, response
`{result, checkedAt, journey}` where `result` is `unchanged` · `replacement_available` (with a new
journey in the same shape, `version` + 1) · `no_accessible_route` (with `message`, `alerts`,
`helpActions`). Mr Tan accepts a replacement on his phone; progress and acceptance stay local in
this version.

Four rules:

- Instructions are returned in both English and Chinese (`en`, `zh`).
- Geometry is GeoJSON, `[longitude, latitude]`.
- Missing information is `null` or an explicit unknown — never "all clear".
- A failed refresh leaves the saved journey visible, labelled with its `updatedAt`.

Backend-only additions that do not change the contract: `GET /api/health` (exists),
`POST /api/scenarios/{name}/activate` for the labelled demo replay (section 8). `origin` and
`destination` start as the saved ids `saved-home` / `ttsh-entrance`; free-text geocoding comes with
the setup flow.

---

## 4. Architecture

```
backend/
├── main.py                 FastAPI app, lifespan starts the poller, serves built frontend
├── app/
│   ├── clients/            Thin provider wrappers. No business logic. Replay swaps this layer only
│   │   ├── datamall.py         AccountKey header, $skip paging, timeouts
│   │   ├── onemap.py           token refresh
│   │   └── weather.py
│   ├── reference/          Loaded at start-up
│   │   ├── lines.py            canonical line codes (STL/SLRT, BPL/BPLRT, CEL→CCL, CGL→EWL)
│   │   ├── stations.py         code ↔ English ↔ official Chinese ↔ coordinates ↔ exits
│   │   └── corridor.py         hand-verified access facts for the demo stations (section 5.1)
│   ├── store/              Interface with two implementations: SQLite (local), Firestore (GCP)
│   ├── services/
│   │   ├── planner.py          candidates → constraints → score → rank → reasons
│   │   ├── impact.py           does this condition touch this journey?
│   │   ├── instructions.py     one action per step, bilingual, written to be spoken
│   │   ├── notify.py           interrupt or stay silent; traveller and caregiver wording
│   │   └── notices.py          free-text notice → structured condition
│   ├── scenarios/          Replay fixtures, always labelled
│   └── api/                Routers: validation + call services. OpenAPI is generated from these
└── tests/
```

Because replay replaces only `clients/`, the judge-facing answer to "is the replayed path the same
code as live?" is yes.

**Polling cadence** (matches each feed's real refresh rate): alerts 1 min · lifts 5 min ·
`PCDRealTime` 10 min · `PCDForecast` daily · weather 5 min · `BusArrival` on demand with a 30 s
cache · reference layers once at start-up. Every snapshot is stored with `sourceUpdatedAt` and
`fetchedAt`. **A failed or empty fetch never becomes "all clear"** — the source's freshness becomes
`unknown` and the summary says so.

---

## 5. How the backend is built around Mr Tan

A generic planner minimises time. Each row below is a place where that would be the wrong answer
for him.

| What is true of Mr Tan | What the backend does differently |
| --- | --- |
| Cannot do stairs | **Hard constraint, not a penalty.** A plan that depends on stairs or on a lift reported down is excluded. Each step carries `stepFree: verified / unverified / blocked`. If nothing usable remains, refresh returns `no_accessible_route` — never a silently relaxed route |
| Walks at ~60% pace, tires standing | Walking legs are re-timed from his own pace, then **connections are re-checked** — a slower walk can miss the bus OneMap assumed. Transfer buffer enlarged. Continuous-walk cap. `Load = SEA` strongly preferred; "wait for the next bus with seats" is a valid recommendation |
| Fixed appointment, late = rescheduled | Plan **backwards from the appointment** using the pessimistic end of the range plus a buffer. The main output is `departureTime`, not a duration |
| Will not improvise on a platform | **Stability over optimality.** (a) Hysteresis: a new plan must beat the current one by a clear margin before it is proposed. (b) Proposals are raised at safe points — before leaving, or on arrival at a station — not mid-tunnel. (c) A fallback for each rail leg is computed **at planning time** and shipped in the offline package, so it exists on the phone when the network does not. (d) Mid-journey, prefer the alternative most similar to what he is already doing, not the fastest |
| Same route for four years | His **baseline route** is stored. If it is feasible today it is recommended, even if something is a few minutes faster. Reasons are phrased relative to it ("about 11 minutes longer than usual") |
| Relies on signage, gets lost | `instructions.py` is a first-class service: one action per step, references things visible on site (line colour, exit letter, station code), full sentences for read-aloud, optional `landmark` for verified on-site cues. It never generates exits, lifts or landmarks that are not in `corridor.py` or provider data |
| Mandarin, large text, voice | Text is produced server-side in `en` and `zh`, as full sentences that work both on screen and read aloud. Official Chinese station names; bus stop names stay in English because that is what the pole says |
| Fortnightly trip, not daily | Check cadence is tied to the appointment: **T-4 days** (weather outlook, published planned closures) → **night before** (lifts, forecast) → **45 min before leaving** (everything) → **en route** (only conditions touching remaining legs) |
| Daughter wants to know, he wants independence | Every event yields two messages from one source: an action for him, a status for her ("Lift at Exit A is down. Route already switched to Exit B. Still on time."). She can propose; only he accepts. Progress sharing is step-level, not GPS |

### 5.1 The honest gap: step-free routing inside stations

No open dataset describes step-free paths inside stations or interchanges. OneMap does not know
about stairs. Plan:

1. Network-wide: exit-level reasoning from LTA `TrainStationExit`, OSM tags and
   `FacilitiesMaintenance` — choose an exit whose lift is not reported down, then re-route the final
   walk from that exit.
2. Demo corridor (Ang Mo Kio, Novena, the 851 stops, TTSH entrance): **someone walks it and records
   the facts** in `corridor.py` with date and verifier. Only these legs are ever `verified`.
3. Everything else is `unverified` and the UI says so.

This needs an owner — see section 10.

### 5.2 Setup answers → profile

Agreed in team discussion: five skippable questions, plus two optional caregiver items (caregiver
participation is optional, as in the frontend plan). Obvious senior
defaults (no stairs, shelter in rain, prefer seats, 30-minute arrival buffer) are not asked.

| # | Question | Stored as | Drives |
| --- | --- | --- | --- |
| 1 | What do you use when going out? none / stick / walker / wheelchair | `mobilityAid` | escalator policy, continuous-walk cap, WAB-bus requirement |
| 2 | More used to MRT / bus / either | `familiarMode` | tie-breaks and mid-journey fallback choice |
| 3 | Text / voice / both, and language | `outputMode`, `locale` | which instruction form is primary |
| 4 | How long does it take you to walk from home to `<nearest station>`? | `homeToStationSeconds` | **derives his real walking speed** from a distance we know — more reliable than asking "are you slow?" |
| 5 | How do you get to the hospital now? (pick on map) | `baselinePlanId` | baseline route behaviour above |
| — | Emergency contact phone (optional) | `emergencyContact` | `tel:` / `sms:` actions work with no backend; help screens fall back to general help text when absent |
| — | Allow Mei Ling to see trip progress? (only asked if a contact was given) | `shareTripStatus` | off unless he says yes; app fully works either way |

Derived values (`walkingSpeedMetresPerSecond`, `escalatorPolicy`, `maxContinuousWalkMetres`,
`requireWheelchairBus`) are computed at planning time, not stored, so rules can change without
migrating profiles. Every `reason` names the setting that caused it, so a judge can flip an answer
and watch the route change.

---

## 6. Journey document

Four example responses with **real OneMap geometry** are in [`fixtures/`](fixtures/) — build
against them today:

| File | Endpoint / result |
| --- | --- |
| [`plan.normal.json`](fixtures/plan.normal.json) | `plan` — his usual bus 74 + NSL route, all clear, 7 steps |
| [`refresh.unchanged.json`](fixtures/refresh.unchanged.json) | `refresh` → `unchanged` |
| [`refresh.replacement_available.json`](fixtures/refresh.replacement_available.json) | `refresh` → NSL Bishan–Newton disrupted, direct bus 851 proposed as version 2 |
| [`refresh.no_accessible_route.json`](fixtures/refresh.no_accessible_route.json) | `refresh` → nothing step-free remains; message, alerts and a call action |

Regenerate with `python3 backend/scripts/make_fixtures.py`. Timing, instructions and alerts in them
are illustrative. Field names freeze as OpenAPI at the end of milestone 1; any change before then is
flagged here first.

The shape follows the frontend's proposal. Fields added by the backend, all optional to render:

| Field | Why |
| --- | --- |
| `dataMode`: `live` \| `simulated` | One switch for the on-screen "simulated data" label. Mock data shown as live caps our score |
| `alerts[].dataSource`: `live` \| `verified` \| `simulated` | The per-item version of the same promise |
| `steps[].stepFree`: `verified` \| `unverified` \| `blocked` | Everything is `unverified` until the corridor is walked (section 5.1) |
| `steps[].connectivity`: `online` \| `tunnel` | The browser cannot read signal strength, so the "refresh before a rail segment" rule is driven from the route |
| `steps[].legId`, feature `properties.stepIds` | Several steps can share one map leg ("take bus 851" / "get off at Novena") — lets the map highlight the current step |
| feature `properties.role`: `recommended` \| `previous` and `status`: `normal` \| `affected` | In a replacement, the old route is included so both can be drawn and the affected part styled differently — the brief's visualisation requirement |
| `summary`, `reasons[]` | One-line headline and the "why" sentences, bilingual, shown verbatim |
| `crowdLevel`, `busLoad` | `null` = unknown, per rule 3 |

---

## 7. AI: only where it can be measured

`notices.py` turns free-text notices (the `Message[]` sentences above) into structured conditions
that `impact.py` can intersect with a journey. Build a rules baseline first, then an LLM version,
and score both against 30–50 hand-labelled historical notices. Report the numbers and how they were
obtained in `WRITEUP.md`. If rules are good enough, saying so is creditable under the brief.
Judges must be able to verify without paying: the labelled set and the rules path run locally.

Reasons and rankings are **not** LLM-generated; they come from the scoring terms so every sentence
traces to a number.

---

## 8. Replay scenarios

`scenarios/*.json` override what `clients/` return. Planned set, stackable:

1. `nsl_disruption` — built from the official Annex C sample: Bishan–Newton, free public bus active
2. `novena_lift_out` — Exit A lift in `FacilitiesMaintenance`
3. `heavy_rain` — nowcast + rainfall over the walking legs

Activating any of them forces `dataMode: "replay"` on all responses. Real captured snapshots can be
promoted into scenarios, which is how a genuine lift outage becomes a reproducible demo.

---

## 9. Milestones

| | Scope | Unblocks |
| --- | --- | --- |
| M1 | clients, `POST /api/journeys/plan` normalising OneMap into the journey document at his pace; OpenAPI published; Dockerfile; first Cloud Run deploy of the skeleton | Frontend swaps fixtures for the live endpoint. Deployment risk retired early |
| M2 | line/station tables, conditions from alerts + lifts + weather, `impact.py`, exit-level access, `corridor.py` | Affected segments on the map |
| M3 | scoring, baseline-route behaviour, hysteresis, `departureTime`, `instructions.py`, reasons | Ranking that is visibly Mr Tan's |
| M4 | `POST /api/journeys/{id}/refresh` with all three results, scenarios, `dataMode`, precomputed fallback per rail leg | Stable demo; offline story |
| M5 | poller, stored snapshots, Cloud Scheduler checks, `notify.py` | Proactivity |
| M6 | progress sync, caregiver tokens and view (needs its own small agreement first) | Father–daughter story |
| M7 | `notices.py` + evaluation set | AI credit |

M1–M4 cover the backend half of all three mandatory capabilities.

---

## 10. Decisions needed from the team

1. ~~Phase order~~ — settled 19 Sep: two endpoints first (section 3).
2. **Capability tokens instead of logins** — only matters once caregiver linking starts; park it.
3. ~~Emergency contact required?~~ — settled: caregiver participation, including the contact number,
   is optional.
4. **Who walks the corridor** (Ang Mo Kio ↔ Novena ↔ TTSH entrance, plus the 851 stops) and records
   lifts, exits and landmarks with photos? This is the only source of `verified` legs.
5. **Exact demo origin and hospital entrance.** Fixtures currently use Ang Mo Kio Ave 3
   (1.3691, 103.8454) and TTSH main building.
6. **SMS**: the plan's `sms:` composer is free and fine. Backend-sent SMS costs money, and the brief
   says judges must be able to verify everything without paying — propose we do not build it.
7. **GCP project and credits** — who holds the project, and have we claimed the credits?
8. Two items still open with the organisers: submission address/deadline, and the missing
   `PS2_scoring_rubric.md`.
