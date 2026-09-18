# Minimum frontend API contract

This is the small integration target for the current frontend. The larger [backend checklist](backend-contracts.md) remains a future planning reference, not a prerequisite for this prototype.

## Scope

- One Mr Tan appointment journey: Ang Mo Kio → Tan Tock Seng Hospital.
- Normal journey, a proposed alternative, no accessible route, and offline viewing.
- Frontend owns language, read-aloud, local progress and offline saving.
- Backend owns route generation, accessibility checks, timing and relevant conditions.
- A local appointment editor and consent-based caregiver preview are implemented. Real caregiver accounts, cross-device sharing, notifications and voice questions remain deferred; see the [family prototype notes](appointment-family-prototype.md).

The frontend defaults to labelled demo data. Set `VITE_API_MODE=live` and restart/rebuild to use the API. Failures in live mode never fall back silently to demo data.

## 1. Plan

`POST /api/journeys/plan`

```json
{
  "origin": "saved-home",
  "destination": "ttsh-entrance",
  "arriveBy": "2026-09-21T10:00:00+08:00",
  "stepFree": true,
  "walkingSpeedFactor": 0.6
}
```

Saved place identifiers remain fixed demo inputs. The appointment editor supplies the selected date/time through `arriveBy`; repeat schedule and notes are stored locally. Agree the places' actual coordinates/entrance with backend before real integration.

Response: [complete plan example](api-examples/plan.json).

Required fields:

- `id`, positive integer `version`, `status: "ready"`, `updatedAt`.
- `departureTime`, `arrivalWindow.earliest`, `arrivalWindow.latest`.
- Non-empty `steps`: `id`, `mode` (`walk`, `train`, `lift`), `instruction`, `detail`, `confirmation`, `place`, `durationMinutes`.
- Every text object above contains `en` and `zh`. `confirmation` is the button label, such as “I'm at the station”. These supporting fields are the small additions the implemented screens need beyond the original abbreviated example.
- `routeGeometry`: GeoJSON FeatureCollection of LineString features, with `properties.mode` (`walk`, `train`). Coordinates are `[longitude, latitude]`.
- `alerts`: list of `{ id, message: { en, zh } }`; empty when there are none.

Timestamps use ISO 8601 with an offset. Display timezone is Asia/Singapore. The frontend validates responses; invalid data produces a retry state rather than misleading instructions.

## 2. Refresh

`POST /api/journeys/{id}/refresh`

```json
{ "version": 1, "currentStepId": "amk-lift" }
```

Return one of:

| Status | Other fields | Frontend behaviour |
| --- | --- | --- |
| `unchanged` | `checkedAt` | Retain progress; update last-check time |
| `replacement_available` | `journey` in the plan format | Show proposal; replace only after the traveller accepts |
| `no_accessible_route` | `message: { en, zh }` | Stop forward guidance and offer help |

Examples: [unchanged](api-examples/refresh-unchanged.json), [route change](api-examples/refresh-change.json), [unavailable](api-examples/refresh-blocked.json).

Preserve the current step ID in a proposed replacement when the same checkpoint still applies. A replacement that cannot preserve it currently starts from its first step; backend must make that step appropriate to the supplied confirmed checkpoint, not assume the traveller is still at home.

Acceptance and progress are local in this version. There is no separate acceptance/event endpoint yet. The refresh API must be able to handle the version of a previously proposed plan that the frontend accepted locally.

## Five items to settle with backend

- [ ] Confirm the endpoint names, full example response and stable step IDs.
- [ ] Confirm origin/destination coordinates and the verified step-free route, including walking legs.
- [ ] Specify which timing, alerts and accessibility information is live, curated or simulated.
- [ ] Agree a useful sample alternative beginning at the traveller's current confirmed checkpoint.
- [ ] Agree initial-plan failure responses. Current frontend handles non-2xx/invalid results with a retry screen; the structured no-accessible-route state currently comes from refresh.

## Offline and current limits

Production build caches the app and bundled OSM street-map extract. The current bilingual route, accepted version and progress are saved in localStorage. API calls are not cached as successful responses by the service worker.

Readiness is shown only after both the route save and app/map cache checks succeed. Browser storage can still be cleared; local storage is not a backup service. API requests have an eight-second timeout. A failed refresh preserves the previous route and its timestamp. Refresh is manual in this prototype; there is no background monitoring or notification delivery.

Read-aloud uses browser speech synthesis. Offline audio depends on a matching installed local voice; there is no downloaded audio package. Voice questions are not implemented.

All provided geometry, timing, accessibility assumptions and route alternatives are illustrative and are labelled as such. The bundled OSM background is real data; that does not verify the overlaid walking connections.
