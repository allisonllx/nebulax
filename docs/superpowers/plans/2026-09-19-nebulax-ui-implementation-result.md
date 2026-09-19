# Calm guidance implementation result

Implemented on `codex/calm-guidance-ui`.

## Delivered

- Elder home now prioritises destination, departure time and start/contact actions.
- Active guidance places the instruction, orientation map and repeated-speech/contact buttons in that order.
- Off-route recovery replaces the normal instruction; the prior route is retained for comparison after replanning.
- Caregiver dashboard consolidates status, map, ETA and deviation acknowledgement.
- Severe deviation records survive successful replanning until explicitly acknowledged.
- Persona switching is a collapsed, explicitly labelled local preview control.
- Full directions and travel refresh remain available in journey details; new journey planning lives with appointments.
- Onboarding preserves edited phone numbers, accepts a separate traveller number and explains the actual local sharing capability.
- Map markers are scoped to each map instance, avoiding cross-map cleanup. Next-leg markers and reduced emphasis on other legs support elder orientation.
- Missing map credentials produce a route-geometry diagram; tile errors show a visible notice rather than implying street-map coverage.

The three presentation components and shared contact control are grouped in `frontend/src/CalmScreens.tsx`, with presentation rules in `Calm.css`. Location detection remains in `LocationGuidance`; this avoids duplicating the GPS lifecycle during recovery. The recovery panel is a state within `ElderGuidance`, rather than a separately mounted screen.

## Verification

- Production build and lint passed.
- Standard frontend suite: 15 passed (offline reload, permissions, appointments, API failure and route acceptance).
- Guidance suite: 10 passed (onboarding, GPS reliability, sustained deviation, replanning, alert acknowledgement and 320px layout).
- Backend suite: 62 passed.
- Browser inspection: elder home, active guidance and caregiver dashboard.

## Limits

- This is a local frontend implementation; nothing has been deployed to Cloud Run.
- Family accounts, cross-device location sharing and remote notification delivery remain unimplemented, and the UI states this.
- GPS remains foreground-only. Real-phone background operation and actual voice playback require device testing.
- Street tiles failed to load in the local preview. The notice is visible; production MapTiler credentials/origin settings and provider availability need checking before deployment.
- The design-board illustrations are not production assets. The implemented home uses a restrained icon illustration, and maps use route/provider data.
- Existing build warnings concern bundle size; backend dependency deprecation warnings remain.
