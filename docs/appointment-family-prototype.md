# Appointment and family frontend

This extends the local prototype on `frontend/mr-tan-journey`. Real caregiver accounts, invitations, remote sharing and notifications still require backend support.

## Try it

1. Open **Appointment**. Edit the date, time, repeat schedule or note and choose **Save appointment and plan**. The travel times update together with the appointment.
2. Open **Family → Set up family support**. Both permissions start off. Enter a name and optionally a real phone number, select permissions, then confirm. The choices can be read aloud.
3. Select **Caregiver preview** to explore Mei Ling's view in the same browser.
4. With appointment-suggestion permission, propose a different appointment. It stays pending until Mr Tan reviews and accepts it under **Appointment**. He can also keep his original appointment.
5. With trip-update permission, the preview shows the appointment, manually confirmed step and confirmed arrival. It never claims live location or delivered notifications.
6. Under **Mr Tan's controls**, change permissions or stop sharing. Stopping sharing removes preview access and pending suggestions while retaining the journey.

The role switch is a demonstration tool, not authentication or a secure account boundary. Data remains in the browser's localStorage. Do not use this as real remote sharing.

## Appointment behaviour

- Saved origin and destination remain the demo Ang Mo Kio → TTSH locations. Arbitrary address search and verified routing remain backend work.
- Date/time changes call the existing plan endpoint with the selected `arriveBy` value. No new appointment endpoint is required to try the UI.
- Route, appointment and version are saved together after successful planning. A request or storage failure preserves the previous saved plan.
- An active journey cannot be replaced through appointment editing or caregiver acceptance. Suggestions may be prepared during travel and reviewed later.
- A two-week recurrence offers **Prepare next visit** after arrival. This is an explicit action; it neither silently rolls the date forward nor schedules notifications.
- Changing an appointment in the app does not change a booking with the hospital.
- Notes, date/time, repetition, permission settings and pending suggestions survive reload. Unsaved form drafts do not.

## Permissions

| Permission | Preview access |
| --- | --- |
| Share trip updates | Appointment, journey phase, manually confirmed step, arrival and progress timestamp |
| Allow appointment suggestions | Current appointment and a form to propose a replacement; no automatic acceptance |

Turning off suggestion permission removes its pending proposal. A suggestion records the appointment revision it was based on; an obsolete proposal cannot overwrite newer appointment data. Revoking permissions during a pending replan prevents that response from replacing the current state.

If a phone number is entered, Help offers links to the phone's dialler and SMS composer. The user chooses whether to call/send. No message or call is automatically initiated by the app, and no delivery is claimed.

## Remaining backend agreement

The existing [two-endpoint contract](minimum-api-contract.md) still covers planning and refresh. For real family support, agree these three items separately:

1. Separate identities and verified invitation/acceptance, with server-enforced permissions.
2. Saving appointments, proposals and progress with revision checks across devices.
3. Notification delivery/acknowledgment and offline revocation/sync rules.

The prototype has no server-side family endpoints, cross-tab synchronization, invitation codes, live location or automatic arrival alerts. Both demo perspectives currently use the selected interface language.

## Verification

Browser tests cover saved appointment timing, suggestion acceptance, permission gates, revocation, protecting active journeys, explicit recurrence, Chinese/enlarged text and preserving the old appointment on API failure. Existing journey/offline tests also run. Native phone calling/SMS and available speech voices still need target-device checks.
