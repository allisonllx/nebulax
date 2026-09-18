# Frontend–backend agreement checklist

Status: proposed contract for discussion. None of these endpoints except the existing `/api/health` is implemented or agreed yet.

Companion document: [frontend product plan](frontend-plan.md).

The goal is to agree response shapes and failure states before building screens. Frontend can then use matching fixtures while backend integrations proceed.

## Decisions to resolve together

| Decision | Proposed starting point | Agreement needed |
| --- | --- | --- |
| Demo scope | One verified Ang Mo Kio–TTSH journey plus a feasible alternative | Exact origin, entrance, checkpoints and disruption scenario |
| Routing | Candidate routes from a routing provider, checked against accessibility constraints | Provider, credentials, coverage and validation owner |
| No-stairs requirement | Hard constraint; unknown accessibility is not treated as verified | Evidence required and no-valid-route behaviour |
| Walking/time model | Persona walking pace, walking-leg adjustment and explicit buffers | Base speed, rest/wait assumptions and arrival range calculation |
| Caregiver | Separate identities, scoped linking and traveller-controlled active journey | Login method, invitation expiry and exact permissions |
| Changes | Caregiver proposals separate from accepted active plan | Approval rules, authorship and conflict handling |
| Languages | English + Simplified Chinese text in journey package | Locale codes, translation ownership and place-name handling |
| Voice | Tap-to-speak, limited journey intents, touch fallback | Browser/provider choice, costs, supported phones and audio retention |
| Offline | Versioned journey package and local event queue | Required assets, expiry/freshness rules, limits and refresh behaviour |
| Notifications | Backend schedules checks; alert only on actionable changes | Push/SMS/in-app delivery, permission denial and closed-browser behaviour |
| Location | Optional active-trip sharing, manual checkpoints as fallback | Precision, frequency, consent and retention |
| Demo data | Explicitly labelled scenarios alongside real integrations | Which feeds are live, replayed or manually curated |

## Data sources and feasibility checks

These are documented candidates, not evidence of working access or complete coverage. Backend should retrieve representative responses before promising frontend states.

| Data | Candidate | Check before committing |
| --- | --- | --- |
| Map and pedestrian geometry | OpenStreetMap | Coverage, attribution and permitted tile/offline provider |
| Public transport/walking candidates | OneMap routing | Authentication, returned geometry, time units and accessibility gaps |
| Train disruption | LTA `TrainServiceAlerts` | Actual schema, affected segment mapping, mitigations and update timestamps |
| Lift maintenance | LTA `v2/FacilitiesMaintenance` | Facility/exit identifiers, effective dates and route matching |
| Sheltered paths/exits | LTA geospatial layers | Geometry joins and missing links |
| Bus arrival/load | LTA `v3/BusArrival` | Freshness, no-results handling and accessibility fields |
| Station crowding | LTA `PCDRealTime` / `PCDForecast` | Station/line mapping, forecast coverage and unknown values |
| Weather | data.gov.sg forecasts | Geographic matching and appropriate forecast horizon |
| Indoor paths/landmarks | Verified, permitted curated material | Who verifies, source, date and what cannot be guaranteed |

Keep provider keys on the backend. Normalize provider data before returning it to frontend. A failed feed or missing record must not become a positive "all clear" response.

References: [LTA catalogue](https://datamall.lta.gov.sg/content/datamall/en/search_datasets.html), [OneMap routing](https://www.onemap.gov.sg/apidocs/routing), [data.gov.sg two-hour forecast](https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast), [PS2 data requirements](../PS2/PS2_README.md).

## Responsibility split

| Frontend | Backend | Shared |
| --- | --- | --- |
| Accessible bilingual screens | Provider access and normalization | Journey/step identifiers and schemas |
| Permission prompts and visible sharing status | Authentication and permission enforcement | Consent semantics and retention policy |
| Save/read offline package and verify assets | Generate versioned plans and package manifest | Freshness, partial failures and version conflicts |
| Local progress and pending-event UI | Idempotent event processing and authoritative acknowledgment | Event state transitions and replay rules |
| Audio controls and supported device behaviour | Server speech/assistant integration if selected | Voice confirmation and grounding rules |
| Maps and route comparison | Route constraints, explanation and timing | Verified demo paths and scenario fixtures |

## Proposed API surface

Use `/api` to match the existing development proxy. Backend must authorize every operation for the acting user and target traveller. Decide exact request/response bodies and status codes in OpenAPI before treating this table as final.

| Method and path | Purpose | Essential inputs/outputs |
| --- | --- | --- |
| `GET /api/me` | Current identity and roles | User ID, linked traveller permissions |
| `GET/PATCH /api/me/preferences` | Personal display/voice preferences | Language, text size, voice choice |
| `GET/PATCH /api/travellers/{id}/preferences` | Traveller's routing requirements | Step-free constraint, pace and preferences; caregiver approval rules |
| `POST /api/caregiver-invitations` | Create invitation | Target relationship, proposed scopes, expiry |
| `POST /api/caregiver-invitations/{id}/accept` | Accept linking | Verified actor and accepted scopes |
| `GET/PATCH/DELETE /api/caregiver-links/{id}` | Inspect/change/revoke link | Explicit scopes; only authorised parties can broaden permissions |
| `GET/POST /api/appointments` | List/create appointments | Traveller, destination, local schedule and timezone |
| `PATCH /api/appointments/{id}` | Change appointment | Expected version and proposed changes |
| `POST /api/journeys` | Plan a trip | Traveller, appointment, origin/destination and constraints |
| `GET /api/journeys/{id}` | Current state | Accepted plan, progress, proposals, freshness and allowed actions |
| `GET /api/journeys/{id}/offline-package` | Fetch package manifest and route data | Route version, essential assets and localization |
| `POST /api/journeys/{id}/events` | Record traveller action | Unique event ID, route version, occurrence time, action and step ID |
| `POST /api/journeys/{id}/replan` | Request replacement proposal | Known checkpoint/location accuracy, constraints and current version |
| `POST /api/journeys/{id}/accept-plan` | Accept proposed replacement | Proposed plan ID/version and expected current version |
| `POST /api/journeys/{id}/assistant` | Interpret voice transcript | Transcript, locale, current step/version; answer or proposed action |

If audio is uploaded for transcription, agree a separate media contract: accepted formats, size/duration limits, provider, deletion and error behaviour. Do not overload the transcript endpoint without specifying this.

Caregiver proposals should reuse planning APIs with actor-aware authorization; do not add a separate routing system. Confirm how proposed appointment/preference edits are accepted before implementation.

## Journey response: minimum agreement

| Field group | Required content |
| --- | --- |
| Identity/version | `journeyId`, `travellerId`, `routeVersion`, proposed vs accepted plan |
| Schedule | Appointment, departure, earliest/latest estimated arrival, timezone |
| Progress | Lifecycle state, current step ID, last confirmed checkpoint and confirmation source |
| Steps | Stable IDs, order, mode, bilingual display/spoken instructions, official place identifiers and confirmation requirements |
| Geometry | Agreed format, recommended/original/alternative routes and affected segments |
| Accessibility | Step-free evidence/status, walking distance/time, shelter, transfers and known gaps |
| Conditions | Alerts, impact, recommendation, source, source update time and fetched time |
| Sharing | Granted scopes, last acknowledged update and permitted actions |
| Offline | Manifest/version, asset requirements, package generation time and freshness policy |

Proposed conventions to confirm:

- ISO 8601 timestamps with offsets; retain `Asia/Singapore` for appointment recurrence.
- Metres for distances, seconds for durations, metres/second for walking speed.
- GeoJSON geometries use `[longitude, latitude]`; avoid mixing coordinate order between endpoints.
- Use explicit unknown/null values, not zero, for unavailable ETA/crowding/location.
- Bilingual text keyed by agreed locale identifiers, e.g. `en-SG` and `zh-SG`.
- Distinguish source observation time, server fetch time and local save time.
- Use a defined accessibility status such as `verified`, `unverified`, `blocked`, with evidence/source. Do not invent percentage confidence without a model.
- Ineligible routes are excluded from recommendations; explain when no eligible route exists.

## State and error contract

Keep these independent: the network can be down while the saved route is readable; a network connection can be healthy while a provider is stale.

| Dimension | Proposed states |
| --- | --- |
| Journey lifecycle | `planned`, `active`, `paused`, `arrived`, `cancelled` |
| Planning result | `ready`, `no_accessible_route`, `insufficient_data`, `failed` |
| Route change | `none`, `proposal_available`, `accepting`, `accepted`, `rejected` |
| Data freshness | `fresh`, `stale`, `unknown` per source |
| Local package | `not_saved`, `saving`, `ready`, `partial`, `failed` |
| Event delivery | `pending`, `acknowledged`, `rejected` |

Agree machine-readable errors for unauthenticated, forbidden/revoked, version conflict, invalid input, provider failure, rate limiting and unavailable route. Error responses need a stable code, recoverability and enough context for localized frontend explanations.

Server acknowledgment means the service received the event, not that Mei Ling saw it. Track notification delivery/read status separately only when the chosen channel can establish it.

## Offline package and synchronization

- Manifest identifies route version, required/optional resources, sizes and checksums where applicable.
- Essential content includes the app shell, bilingual steps, destination/contact details, progress and a permitted map/diagram fallback. Track audio readiness independently.
- Frontend verifies successful local storage before claiming readiness. Avoid mixing steps/assets from different route versions.
- Preserve a readable previous version if a new download fails. Never present a superseded route as current without a warning, particularly when a known closure invalidates it.
- Queued events include `eventId`, `journeyId`, `routeVersion`, `occurredAt`, type and relevant `stepId`. Backend derives/validates the actor from authentication.
- Backend deduplicates retries and handles occurrence order; late events must not rewind newer progress.
- Recheck authorization when syncing. A locally queued action does not bypass revoked permissions.
- Reject or reconcile stale route-version actions explicitly; don't silently overwrite a newer accepted route.
- Define cancellation/expiry for delayed help requests so resolved requests do not trigger misleading alerts later.
- Retry when the app reconnects or reopens; background synchronization is best effort, not the only delivery mechanism.
- Agree local expiry, storage cleanup, logout handling, expired-login read access and deletion of cached shared data.

## Notifications and voice decisions

- Who schedules the night-before check, and how is its time chosen?
- What counts as a meaningful change, and how are repeats deduplicated?
- What happens when push permission is denied or the browser is closed?
- How does each person choose alert language/channel?
- Can audio be generated in advance and legally stored offline?
- Which phones/browsers support the selected English/Chinese recognition and playback?
- Which commands require confirmation, and how are actions bound to the current route version?
- How are uncertain recognition, microphone denial and provider timeout represented?
- Are transcripts/audio retained? Proposed default: avoid retaining raw audio beyond processing unless an explicit need is agreed.

## Fixtures to agree before frontend implementation

- [ ] Normal journey: complete bilingual steps and geometry.
- [ ] Planned facility closure: published notice, affected segment and valid alternative.
- [ ] Mid-journey disruption: proposed reroute with revised timing and version.
- [ ] No verified accessible alternative: explain limitations and show help actions.
- [ ] Offline-ready journey: saved instructions, assets and timestamps.
- [ ] Partial download / offline without saved route.
- [ ] Stale bus/crowding/facility information with unknown values.
- [ ] Uncertain location requiring a manual checkpoint.
- [ ] Caregiver proposal awaiting acceptance.
- [ ] Revoked sharing and a stale caregiver screen.
- [ ] Offline arrival and unsent help request, followed by acknowledged/rejected sync.
- [ ] Duplicate events and a conflicting route version.
- [ ] Unsupported or failed voice input with touch fallback.

## Ready-to-build agreement

- [ ] Confirm the proposed caregiver control model and permission scopes.
- [ ] Obtain representative source responses and document credentials/coverage gaps.
- [ ] Assign ownership for verified route/landmark content and translations.
- [ ] Select routing, speech, map/offline assets and notification approach.
- [ ] Agree journey schema, state names, units and localized text ownership.
- [ ] Agree offline package, event deduplication and version-conflict rules.
- [ ] Agree error/freshness behaviour and no-accessible-route fallback.
- [ ] Publish agreed OpenAPI schema and matching fixtures for frontend development.

Record decisions here as they are made. These checkboxes are a team coordination checklist, not additional approval requirements for routine work.
