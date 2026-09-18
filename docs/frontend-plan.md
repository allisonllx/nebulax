# Frontend product plan

Status: discussion record and proposed design, not an implemented feature specification.

This records the product discussion before frontend work begins. Product directions below have been discussed; numerical defaults, permissions, API shapes, providers, and implementation choices remain proposals until the team resolves the [backend contract checklist](backend-contracts.md).

## Persona and purpose

Mr Tan, 74, lives alone in Ang Mo Kio. He attends a fixed-time follow-up appointment at Tan Tock Seng Hospital in Novena every two weeks. In this persona's scenario, missing the appointment means rescheduling.

- Bad knees; cannot manage stairs; walks at approximately 60% of average walking speed.
- Tires when standing for long periods and worries about slippery walking surfaces during heavy rain.
- Uses a smartphone for WhatsApp and videos, struggles with small text and unfamiliar map interfaces, and is more comfortable in Mandarin than English.
- Has followed the same route for four years. He relies on familiarity and signage and calls his daughter when something goes wrong.
- His daughter, Mei Ling, works full-time. She wants to help prepare his journey and, with his permission, know whether he needs help or has arrived.

The experience centres on one saved journey and one clear next action. Mr Tan should understand whether his trip is affected, when to leave, and what to do next.

## Product direction

- Mobile-first web app, with OpenStreetMap as the geospatial base as required by PS2.
- English and Simplified Chinese, with a separate language preference for each person.
- Read instructions aloud; allow journey-specific questions or commands by voice.
- Plan the complete door-to-door journey, including walking at Mr Tan's pace.
- No stairs is a hard constraint. Shelter, less walking, fewer transfers and less crowding are preferences unless explicitly made mandatory.
- Proactively notify only about meaningful, relevant changes. A normal status remains visible when the app is opened, without routine notifications.
- Maintain access to saved instructions when connectivity drops.
- Mr Tan retains control; caregiver assistance supports his independent travel.

## Journey flow

| Stage | Information shown | Main action |
| --- | --- | --- |
| First use | Skippable welcome, language/text preview and a practice instruction; journey setup follows separately | Try the guide or go to My journey |
| Night before | Next appointment, proposed departure time, relevant published changes and freshness | Review tomorrow's journey |
| Before departure | Recommended route, arrival range, walking, transfers, shelter and readiness for offline use | Start journey |
| Travelling | Current instruction, next landmark, current progress and supporting map | Confirm a meaningful checkpoint when needed |
| Disruption | What changed, the next action, revised arrival range and route comparison | Accept updated route |
| Arrival | Saved destination and arrival confirmation | I have arrived |

These are states of a journey rather than six top-level navigation sections. The home screen shows the next appointment with its date, including when it is not today.

Save the actual hospital building/entrance or appointment destination. Do not assume reaching the MRT station or hospital boundary means arriving at the appointment.

Show a readable route overview before departure. During travel, place the current instruction above the map. Keep original/alternative route comparison, affected segments, crowding and time trade-offs available to satisfy the brief.

Split compound instructions into steps. Getting off a train, locating a lift and boarding a shuttle are separate actions. Exit names, lift connections, landmarks and shuttle boarding locations must be verified, not generated from assumptions.

When location is uncertain, ask for a recognisable checkpoint. Do not advance solely because a timer predicts arrival. Include "I'm not sure where I am" and help access.

If no verified route meets the no-stairs constraint, explain that and offer help. Do not silently relax the constraint. Show uncertainty rather than guaranteeing arrival or facility availability.

## First-time onboarding and ongoing help

Status: proposed next frontend work; this section does not describe implemented screens. Existing appointment and family prototype behaviour is documented in [the prototype walkthrough](appointment-family-prototype.md).

### Recommended approach

Use a short, skippable introduction plus a permanent Help page. Onboarding helps a new traveller recognise the main controls; Help lets them revisit an explanation when they forget it. Avoid a long slideshow, mandatory tutorial or tooltips covering the journey screen.

Keep orientation separate from filling in appointments, travel needs and family permissions. A family member can sit beside the traveller during setup, but the traveller can complete or skip the introduction independently.

### First-use flow

Show one task per screen, with labelled Back, Next and Skip introduction controls. Use large text, generous touch targets and the same labels as the real app. Do not advance automatically or impose a time limit.

| Step | What the traveller sees and does |
| --- | --- |
| 1. Welcome and language | “We will guide you one step at a time.” Choose English / 中文 using those language names; a clearly labelled Listen / 听一听 button offers a spoken introduction after a tap. |
| 2. Make it comfortable | Preview an actual instruction in large or extra-large text. Try reading it aloud, repeating it and stopping playback. Keep a readable default if this step is skipped; audio is optional. |
| 3. Try one instruction | A clearly labelled practice screen: read a sample instruction, optionally listen, then tap “Practise next step”. Explain that in a real journey they confirm only after completing the instruction. Practice must not start a trip, change progress, mark arrival or contact anyone. |
| 4. Know where to get help | Point out “I’m not sure where I am”, “Call my trusted person” and “How to use this app”. Explain that saved instructions remain readable without internet, but new travel updates and calls may be unavailable. Finish with “Go to My journey”. |

After orientation, My journey offers “Set up my journey” when there is no saved appointment/route. Collect travel needs and appointment details there; offer family support as an optional later step. Skipping orientation must never imply that travel needs, a route or sharing consent have been configured. Keep demo journeys visibly labelled in the prototype.

Remember completion or an explicit skip on this device. If interrupted, resume at the last introduction step on the next first-use visit, with Skip still available. Never interrupt an active journey with onboarding, including after an app update. Replaying the introduction from Help must preserve the active journey and all saved preferences; changing language/text size remains an explicit action.

### Help page

Keep a labelled “Help” button accessible from every main screen. Inside Help, put immediate assistance first, with learning below it:

- **I’m not sure where I am:** show the current saved step and recognisable checkpoint; offer repeating the instruction and contacting a trusted person. Never guess a new route from an uncertain location.
- **Call / text my trusted person:** show the configured name and number. If none exists, say so and offer contact setup. Open the dialler/composer only after the traveller taps; opening it does not mean a call connected or a message was sent.
- **How to use this app:** replay the introduction or choose a short explanation of starting a journey, reading/hearing a step, handling a route change, or confirming arrival.
- **No internet / no sound:** explain what is saved, when travel conditions were last updated, and how to continue using text if speech is unavailable.
- **Family and privacy:** explain what is shared, how to review permissions and how to stop sharing; link to Family controls.

Use plain language, English/Chinese and optional read-aloud. Keep explanations short, with one useful action and a visible “Back to journey” button. A searchable FAQ, chatbot and mandatory voice input are outside the first version.

### Offline, permissions and minimum backend agreement

- Bundle the introduction and Help text with the app shell so they remain available after a successful offline download. A first-ever visit still needs the app to load; do not promise offline audio unless a usable local voice or saved audio is available.
- Store a versioned local onboarding record: completed/skipped/in-progress and last step. Store language/text preferences separately, without resetting the existing journey snapshot. If storage fails, keep the app usable and explain that preferences may not be remembered.
- No new API endpoint is needed for this first version. Confirm with backend whether preferences will eventually sync to a profile; cross-device onboarding completion can wait.
- Completing onboarding never grants caregiver permissions. Microphone and location permission requests belong at the point a supported feature needs them, with touch/manual alternatives; do not request them during the introduction.
- Keep the current prototype’s family preview and help links clearly distinguished from future real account linking, notifications and help-message delivery.

### Validation for this addition

- A first-time traveller can choose a language, try a spoken instruction, skip/replay the guide and find Help without coaching.
- Completing or replaying practice never alters the saved route, checkpoint, arrival state or sharing permissions.
- Completed/skipped introductions stay dismissed after reopening; interrupted introductions resume without blocking access to My journey.
- Help works in English/Chinese, at enlarged text sizes and offline after caching; missing audio or a missing contact has a clear fallback.
- Leaving Help or replaying the guide returns to the same active journey step.

## Family involvement and independence

Proposed model: separate linked profiles. Mei Ling can prepare a journey; Mr Tan reviews it, starts it and controls progress. Either person can request assistance. Caregiver participation is optional.

| Capability | Mr Tan | Mei Ling |
| --- | --- | --- |
| Appointments/preferences | Sets them himself or with help | Prepares changes when authorised |
| Proposed journey | Reviews and accepts | Suggests/prepares |
| Active journey | Starts, pauses, confirms checkpoints and finishes | Views permitted updates |
| Route replacement | Reviews and accepts the new plan | Suggests; cannot silently replace |
| Sharing | Grants, reviews and revokes | Receives only permitted data |
| Arrival | Confirms arrival | Sees whether arrival was confirmed or merely estimated |

Proposed consent flow:

1. Set up Mr Tan's profile together if he wants help.
2. Link Mei Ling through a short-lived invitation requiring acceptance.
3. Explain permissions in the chosen language, with read-aloud available.
4. Choose trip updates, active-trip location sharing, and help preparing journeys separately.
5. Keep a visible "Sharing with Mei Ling" control for review and revocation.

Do not start sharing before consent. Recommend trip-status sharing at setup; continuous location sharing stays off by default. Backend authorization must enforce scopes.

Caregiver changes show the author and a summary. Proposed changes remain separate from the active route. Permission to help should not allow silent changes to sharing consent or removal of the no-stairs requirement.

During help, both people should be able to refer to the same numbered step and route version, even in different languages. Stale caregiver views show the last update time.

## Language and voice

- Keep station codes and official sign names where helpful for matching real signage. Review Chinese translations of safety-critical instructions.
- Read-aloud controls: play current instruction, repeat and stop.
- Tap to speak, with a clear listening state and cancel control; no always-listening microphone.
- Initial voice intents: next instruction, repeat, arrival estimate, call daughter, help/lost.
- Responses use the active journey and known conditions. Voice assistance must not invent routes or accessibility facts.
- Confirm consequential actions such as calling, ending a journey or replacing a route.
- All voice functions have touch alternatives. Specify microphone-denied, unsupported-browser and offline states.
- Offline spoken instructions require downloaded audio or a verified local voice. Do not promise arbitrary offline voice questions.

## Proposed usability defaults

These are starting points for user testing, not universal requirements for older people.

| Element | Starting point |
| --- | --- |
| Body text | 22–24 CSS px, adjustable |
| Main instruction | 30–36 CSS px, responsive and adjustable |
| Essential text contrast | Aim for 7:1; never communicate status through colour alone |
| Touch targets | At least 56 × 56 CSS px with spacing |
| Motion | No decorative animation, pulsing or automatic map movement; respect reduced-motion preferences |
| Navigation | Flat structure; visible, labelled controls; no hidden gestures or icon-only critical actions |
| Back behaviour | "Back to journey" for detail pages; "Previous instruction" for reviewing a step |
| Recovery | Preserve progress after navigation, refresh and reopening |
| Audio | Explicitly enabled, easy to replay and stop |

Support zoom and enlarged text without truncating instructions or hiding controls. Avoid a fixed-height screen that breaks with the phone keyboard or browser address bar.

## Offline and weak connectivity

Promise: saved instructions stay available when the connection drops. Cached information is not a live status guarantee.

### Preparation

1. Save the journey when the prepared plan is opened, including the night before.
2. Before departure, refresh conditions and verify the essential local files are available.
3. At journey start, persist the selected route and progress.
4. Refresh opportunistically before a rail segment while connected.
5. After a reroute is accepted, save the replacement as a complete version before retiring the old one.

Do not depend on detecting cellular signal strength or a tunnel. Browser connectivity hints are imperfect; combine them with real request outcomes. Automatic downloading while the website is closed is not guaranteed.

### Saved content

- App shell and critical screens, so refresh/reopen works offline.
- Complete bilingual instructions, active step and route version.
- Route overview and essential, verified diagrams/landmarks.
- Destination, appointment, relevant travel preferences and caregiver contact.
- Audio if downloaded; track its readiness separately from text.
- Last-known conditions with their source timestamps.
- Local progress and pending updates for later synchronization.

"Journey saved on this phone" appears only after a readiness check. If maps or audio failed to download, say what remains available. Browser storage can be cleared or evicted; recheck readiness before travel. Do not require a network-only login refresh to read an already-authorised saved trip; agree the session/privacy policy with backend.

Map resources must permit offline use. Do not bulk-prefetch standard OpenStreetMap public tiles.

### Connection states

| State | Behaviour |
| --- | --- |
| Connected | Show the saved screen promptly and refresh live conditions |
| Slow/intermittent | Keep usable instructions visible; bounded retries; avoid blocking spinners |
| Offline with saved trip | Same layout and controls, plus calm connection/freshness text |
| Offline without saved trip | Explain that the route is unavailable; show locally available contact/help information |
| Reconnected | Sync permitted pending events and check conditions without resetting progress or silently changing the plan |

Example message: "Connection unavailable. Your saved route is still available. Last travel update: 9:05 am."

Chinese equivalent: "暂时无法连接网络。已保存的路线仍可查看。" Display the last update time alongside it.

- Stop live-looking bus countdowns when data is stale.
- Label old ETA and facility/service information with its last update time.
- Do not infer the current station from elapsed time. Provide manual checkpoint confirmation when location is uncertain.
- Avoid repeated offline alerts or full-screen errors.

### Caregiver and SMS behaviour

- Offline arrival: "Arrival saved. We'll update Mei Ling when connected." Only show delivery to the service after server acknowledgment; do not imply Mei Ling has read it.
- Offline help: prominently show "Not sent" and offer calling/texting immediately. A queued request alone is inadequate.
- Caregiver view: "Last update at 9:05", not a live-looking marker or an automatic distress claim.
- Proposed MVP fallback: buttons opening the phone dialler or SMS composer. Mr Tan reviews and sends the SMS; the web app cannot infer delivery from opening the composer.
- SMS can help when data is unavailable but cellular service remains; it cannot guarantee delivery without coverage.
- Automated backend SMS is an optional later feature requiring a provider, consent and delivery handling.

## Data limitations to reflect in the design

- Reported lift maintenance is not comprehensive proof that every unlisted lift is working.
- A generic transit route is not automatically verified step-free end to end.
- Sheltered-path coverage does not prove a surface is dry or non-slip.
- Bus load and station crowding do not guarantee a seat.
- Indoor station paths, hospital interiors and shuttle accessibility may need manual verification for the demo corridor.
- Night-before checks can use only notices already published. Recheck before departure.
- Use labelled scenario data for demo disruptions; do not present it as live.

## Validation before frontend completion

- Can a target user start the trip, understand a changed exit, recover from a wrong tap and find help without coaching?
- Test English/Chinese, enlarged text, screen reader labels and one-handed use on a real phone.
- Test both languages' audio and microphone behaviour on target devices.
- Test offline after refresh/reopen, partial downloads, stale conditions and uncertain location.
- Demo: prepare trip → airplane mode → reopen → read/hear saved step → confirm checkpoint → reconnect without losing progress.
- Verify denied caregiver permissions, revoked sharing, unsent help and duplicate event retries.

## References

- [PS2 brief](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/PS2_README.md)
- [W3C accessible design](https://www.w3.org/WAI/tips/designing/)
- [W3C enhanced target sizes](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)
- [Speech recognition limitations](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [Local speech voices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)
- [Network information](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API)
- [Online detection limitations](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [PWA caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
- [Offline/background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)
- [SMS URI standard](https://www.rfc-editor.org/info/rfc5724/)
