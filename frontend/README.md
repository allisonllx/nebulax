# NebulaX frontend

React + TypeScript + Vite. A mobile-first bilingual commuter prototype for Mr Tan's hospital journey.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. No backend is needed in default demo mode.

## Available flows

- Appointment overview and full route, with a bundled OpenStreetMap background.
- One instruction at a time, manually confirmed progress and arrival.
- English/Chinese, adjustable text size and browser read-aloud.
- Route-change review and explicit acceptance, plus a no-accessible-route help state.
- Saved progress and production-build offline reopening.
- “Demo scenarios” controls at the bottom of the page.
- Appointment date/time, notes, and explicitly prepared fortnightly visits.
- Local caregiver preview, separate consent scopes, pending suggestions, acceptance/rejection and revocation.

All travel conditions and route overlays are sample data, not verified navigation. Caregiver accounts, voice questions, live monitoring and notifications are not implemented.

## Commands

- `npm run dev`: development server on port 5173.
- `npm run build`: type-check and build, including the offline service worker.
- `npm run preview -- --port 4173`: serve the offline-capable build.
- `npm run lint`: Oxlint.
- `npm test`: Playwright tests; install Chromium with `npx playwright install chromium` first.

For an offline test, open the production preview online, wait for “Saved for offline use”, start the journey and advance a step. Disconnect and reload. Offline read-aloud needs a matching local voice; audio files are not precached.

## Backend connection

See the [minimum API contract](../docs/minimum-api-contract.md) and [JSON examples](../docs/api-examples/plan.json).

Set `VITE_API_MODE=live` in `.env.local` and restart/rebuild to use the two API endpoints. Development `/api` requests proxy to http://127.0.0.1:8000. Configure API routing separately for deployment. Live failures never fall back to demo data.

Place IDs remain fixed demo inputs. The appointment editor sends the selected date/time to the plan endpoint. Refresh is manual. Backend must verify routes and accessibility, independently of response validation.

See the [appointment and family walkthrough](../docs/appointment-family-prototype.md). Family support is a local demonstration: no real account linking, cross-device sharing or notifications occur.

## Structure

- `src/journey.ts`: schemas, fixtures, API adapter and saved snapshots.
- `src/App.tsx`: journey flow and bilingual UI.
- `src/RouteMap.tsx`: OSM background and route overlays.
- `src/useSpeech.ts`: read-aloud and local-voice fallback.
- `src/profile.ts`: appointment/permission schemas and recurrence helpers.
- `src/AppointmentForm.tsx`, `src/AppointmentPanel.tsx`, `src/FamilyPanel.tsx`: appointment and family views.
- `public/data/`: OSM extract and provenance.
- `tests/`: journey and API browser tests.

See [local development](../DEVELOPMENT.md) for the full setup.
