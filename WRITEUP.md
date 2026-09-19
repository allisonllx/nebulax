# WRITEUP — Smart Commuter Companion (NebulaX PS2)

## Background: the gap we set out to close

Singapore's public transport is among the most efficient in the world, yet for vulnerable commuters —
especially the frail elderly — the apps that plan their journeys fall short at exactly the moments that
matter. MyTransport, Google Maps and the like give competent routes, but they are built for an able,
English-reading commuter who can improvise. They assume you can read small text, understand English,
climb a flight of stairs when a lift is out, stand on a crowded platform, and calmly compare a screen
full of options when something goes wrong. For someone who cannot, the same app becomes the problem: it
overwhelms with choices instead of giving one clear instruction, and it says nothing about the things
that actually stop him — a lift under maintenance at his exit, or a platform too crowded to wait on
safely.

We set out to close that gap for one such commuter and the family member who worries about him. Rather
than a general trip planner, we built a companion that plans around *his* body and memory, speaks to him
in his own language one step at a time, quietly fixes his route when he goes wrong, keeps him and his
daughter one tap apart, and keeps working when the signal drops underground. Everything below is what we
actually built and can demonstrate on a phone; where a capability is not real yet, we say so.

## 1. Persona: who this is for

**Mr Tan, 74, retired, lives alone in Ang Mo Kio.** He understands mainly Mandarin, has early-stage
dementia and poor mobility. He cannot manage stairs, walks at roughly 60% of average pace, tires
when standing, and — because his memory is unreliable — loses track of which step he is on, or takes
a wrong turn on a route he has walked for years. Every two weeks he travels to Tan Tock Seng Hospital
(Novena) for a fixed-time appointment; arriving late means rescheduling. He will not improvise a
reroute on a platform.

**Mei Ling, his daughter,** works full-time and cannot go with him, and she worries every time he
leaves alone — did he set off on time, is he on the right path, has something gone wrong that he
cannot explain? This app is built for the two of them together: she sets it up with him, and from
then on each is one tap away from the other for the whole journey.

## 2. What the app does

### 2.1 The setup quiz — done once, by Mei Ling with her dad

Five short questions, written for the daughter to answer *with* him, that configure real behaviour
rather than just storing preferences:

- **His home and familiar destinations** → a journey becomes one tap, not an address search he would
  struggle with.
- **What he uses to get around** (nothing / walking stick / walker) → routes always avoid stairs; a
  walker adds extra walking time and buffer so he is never rushed.
- **How long he takes to walk to his station** → converted to a personal pace factor (~0.6) that
  re-times every walking leg.
- **How often to repeat each instruction aloud** (default every 30 s) → the core accommodation for
  memory loss.
- **Consent for Mei Ling to follow the trip, and both phone numbers** → these switch on the family
  view and the one-tap calling below.

### 2.2 What we do that a general transit app does not

- **Spoken guidance that repeats on a timer.** Every step is read aloud and, because he forgets where
  he is, repeats on the interval set in the quiz (default 30 s) — each time with the *remaining
  distance and direction*, not the same sentence. He never has to remember what he is doing.
- **It fixes wrong turns for him — automatically.** With location on, if he drifts off the route the
  app re-plans the rest of the journey from where he actually is (after a sustained deviation of
  ~15 s — he taps nothing) and speaks the new directions. If he is far off (≥ 300 m), it raises a
  "Dad is off route" alert with his location in Mei Ling's family view so she can check on him.
- **One-tap calling, both ways.** A large "Call Mei Ling" button sits on every elder screen; she has
  "Call Dad" in her view. When something feels wrong, neither has to hunt through a phone — which
  matters most exactly when he is confused.
- **Routes chosen for a frail, easily-overwhelmed traveller.** When his boarding or alighting station
  has a lift under maintenance or a very crowded platform, the app doesn't just warn — it switches
  him to a route with no stairs, no lift wait and a seat, and says why it changed.
- **Plans backwards from the appointment, at his pace.** Input is "arrive by 10:00", not "leave now";
  output is a departure time (`leave by 8:50`) and an arrival *window* (9:19–9:25), never a single
  confident number, with every walking leg re-timed at his `walkingSpeedFactor` (0.6).
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

## 4. The demo, and how simulated data is handled

The demo walks one real journey and then makes the hard morning happen on cue:

1. **Plan the default route** — Ang Mo Kio → Tan Tock Seng Hospital, arrive by 10:00. Show the
   pace-based plan and departure time, start the journey to hear the spoken step-by-step guidance
   that repeats itself, and show the one-tap "Call Mei Ling" button.
2. **Trigger the hard case from the in-app demo panel** — one control simulates a lift outage plus a
   crowded platform at once. The saved route is re-checked and switched to a step-free, seated
   alternative, with a short notice explaining why it changed.
3. **Optionally show offline** — the panel's "Simulate offline" toggle pauses updates so you can see
   the already-saved route, steps and voice keep working with no signal.

**Offline.** This is real, not faked by the toggle. The app is a PWA: a service worker precaches the
whole app shell and the neighbourhood basemap up front, and the planned route is saved on the device
as soon as it is planned (the app shows "Saved for offline use"). So when signal drops underground,
the route, its steps and the spoken guidance all keep working; the toggle just lets us demonstrate
that on demand. *(We do not yet predict the exact moment he enters a tunnel and cache reactively — the
caching is done ahead of time, which covers the same need more simply.)*

**Simulated data.** Real disruptions are rare on demand (`AffectedSegments` was empty on every probe
day), so the hard case is driven by a labelled replay scenario modelled on the official API guide's
contingency example and the real response shapes we probed. The backend keeps several such scenarios,
but the presentation panel deliberately surfaces the one that matters for this persona — a lift
outage together with a crowded platform. Crucially this **changes the recommended route**, not just a
warning: the refresh endpoint screens every candidate against the disruption, lift and crowding feeds
and proposes a step-free, seated alternative. **A scenario only replaces the feed layer; planning code
is identical for live and replayed data.** Every response produced under a scenario carries
`dataMode: "simulated"` (and per-alert `dataSource`), enforced server-side so the UI label cannot be
forgotten. Live mode is the default.

## 5. Assumptions (and where the numbers come from)

| Number | Value | How we arrived at it |
|---|---|---|
| Walking pace factor | 0.6 | Persona definition (approx. 60% of average pace); configurable per request |
| Arrival buffer | 30 min | Product decision: for a fixed appointment, being early is cheap, late is expensive |
| Arrival window's pessimistic end | ×1.2 of total | Simplifying assumption, stated here rather than hidden; observed OneMap variance between identical calls (74 vs 76 bus feeder, ±2 min) motivated using a range at all |
| Transfer penalty | 5 min | Product decision reflecting the persona's difficulty with transfers |
| Walk penalty | 1 min / 100 m | Product decision; slows ranking away from walk-heavy routes |
| "About 11 minutes longer" | computed | Difference of the two candidates' totals at his pace, measured from live OneMap responses |
| Voice repeat interval | 30 s default | Product decision for memory loss; set in the quiz, adjustable per user (any 10–600 s) |
| Off-route alert threshold | 300 m from route | Product decision: far enough to mean a genuine wrong turn, not GPS jitter |
| Auto-replan trigger | 15 s sustained off-route, 60 s cooldown | Product decision: long enough to rule out a brief detour, cooldown avoids thrashing |
| Crowd level that reroutes | `h` (high) at a board/alight platform | LTA `PCDRealTime` three-level scale; only the platform he stands on matters |

These are stated as assumptions, not measurements. We did not conduct user testing with older
adults; doing so (task completion, error rate, unaided recovery) is the first thing we would do
next.

## 6. Privacy

No accounts, no personal data collected server-side. The profile (home and destination coordinates,
pace, appointment time, and the two phone numbers) is held on the device and sent per request only to
plan a journey; it is not stored in a server database or logged. His GPS position is used on the
device to detect a wrong turn and is sent to the backend only as part of a replan request — it is not
tracked or retained. Phone numbers are used solely to build the `tel:` calling links. API keys stay
in environment variables and are git-ignored; the MapTiler key is public by design and
origin-restricted.

## 7. Verification

- 76 offline backend tests (`cd backend && uv run pytest`) — no network, no keys; recorded real
  OneMap responses in `backend/tests/data/`.
- 30 Playwright end-to-end tests (`cd frontend && npx playwright test`), covering the family view,
  per-profile guidance, walking substeps and the lift-outage + crowded-platform presentation demo.
- README followed literally against a fresh clone before submission (deps, tests, server, plan
  call, frontend build).
- Walked end to end in a real mobile browser: plan the original Ang Mo Kio → TTSH route, trigger the
  lift outage + crowded platform, watch the route switch to a step-free seated alternative with the
  reason shown, then start the journey and follow the new step-by-step directions.
- Live deployment smoke-tested end to end: plan → activate labelled scenario → refresh proposes a
  step-free replacement → deactivate.

## 8. Team & tooling

Backend: @wuyunkai · Frontend: @allisonllx. Claude Code was used throughout for research,
scaffolding, implementation and this document; all API findings were verified against the live
services, and all tests run offline against recorded responses.

**Demo video:** https://www.youtube.com/watch?v=yHKtHozUN7w
