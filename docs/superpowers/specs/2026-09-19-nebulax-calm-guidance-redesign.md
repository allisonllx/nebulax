# NebulaX Calm Guidance UI Redesign

## Goal

Redesign the existing NebulaX frontend around one principle: the elder should always understand **where I am, what I should do now, and how to get help**. The caregiver should see enough information to judge whether help is needed without exposing the elder to administrative controls.

This redesign preserves the existing route planning, live GPS, speech repetition, offline snapshot, automatic replanning, caregiver permissions, appointment and disruption logic. It changes the information architecture, page composition and interaction hierarchy.

## Users and roles

### Elder traveller

Mr Tan is 74, Mandarin-first and may forget the current task during a journey. He needs large text, repeated speech, a visible location map, familiar landmarks and a reliable way to contact his daughter.

The elder experience must never require interpreting a full transit dashboard. Every active screen has one dominant task.

### Caregiver

Mei Ling prepares journeys, configures preferences and intervenes when the system detects sustained or severe deviation. Her interface may expose more detail, but it should still prioritise status and action over configuration.

The existing same-browser role switch remains available only as a clearly labelled demo control. It must not appear as a primary navigation element in the elder experience and must not imply real authentication.

## Design principles

1. **One screen, one decision.** Only one primary action is visually dominant.
2. **Instruction before explanation.** The current action appears before route metadata, conditions and settings.
3. **Map for orientation.** The elder map shows the current blue dot, the active route and the next landmark. The instruction remains visually more important than the map.
4. **Calm recovery.** Off-route language reassures first, gives one safe instruction and then presents the new route.
5. **Progressive disclosure.** Full route details, transport conditions, settings and demo scenarios remain accessible but do not compete with the main journey.
6. **Stable actions.** “再说一次” and “联系女儿” remain in consistent positions during an active journey.
7. **Respectful presentation.** The visual language is warm and adult, not childish, medical or alarmist.

## Visual system

- Warm cream page background.
- Deep forest green for primary actions and the active route.
- Sage surfaces for supportive information.
- Charcoal for primary text.
- Soft coral only for a route deviation or action that genuinely requires attention.
- Minimum 56 px touch targets; primary journey actions target 64–72 px.
- Large Simplified Chinese by default, with concise English equivalents.
- Rounded cards with restrained borders and shadows; no glass effects or decorative gradients.
- Familiar outline icons with text labels. Icons never carry meaning alone.
- Maps retain required OpenStreetMap/MapTiler attribution.

## Information architecture

### Elder navigation

The elder journey is reduced to four primary states:

1. **Ready to leave**
2. **Following a step**
3. **Recovering from deviation**
4. **Arrived**

Settings, appointment management, the full route and demo scenarios are secondary destinations. The elder should not see caregiver planning controls or a persistent elder/caregiver mode switch.

### Caregiver navigation

The caregiver has three destinations:

1. **爸爸的行程** — current status, location, ETA and alerts
2. **预约与路线** — appointments and new trip planning
3. **家属设置** — contact, permissions and alert preferences

On small screens, these appear as a compact caregiver-only tab bar. On the elder side they do not appear.

## Screen specifications

### 1. Elder home — ready to leave

The first viewport contains only:

- Greeting: “陈伯，早上好”
- Destination: “今天去陈笃生医院”
- Departure time: “8:40 出门”
- Reassurance: “美玲已经为您准备好路线” when a caregiver is linked
- Primary action: “开始行程”
- Secondary action: “联系女儿” or “设置家属联系方式”

The existing arrival range, walking distance, transfers, accessibility status, conditions, map and route summary move below the fold into a collapsed “查看行程详情” section. The first viewport does not contain multiple cards or a mode switch.

### 2. Elder active guidance

The screen order is fixed:

1. Compact progress: “第 1 步，共 4 步”
2. Large action instruction, rewritten into plain landmark-oriented language
3. Distance or remaining time
4. Simplified live map
5. Primary action: “再说一次”
6. Secondary action: “联系女儿”
7. Manual step confirmation, visually secondary

The elder map occupies roughly one third of the initial viewport. It shows:

- A prominent blue dot labelled “您在这里”
- A thick forest-green active route
- The next stop or landmark
- Minimal surrounding streets
- No dense station labels, legends or condition overlays

The map stays visible even before GPS is enabled, using the planned route and a clear prompt to enable live positioning. GPS status and accuracy explanations are placed behind a small “定位帮助” disclosure unless action is required.

The full-route link and offline status stay below the primary actions.

### 3. Elder deviation recovery

The existing sustained off-route detection remains the trigger. The recovery state replaces the normal instruction block instead of appearing as an additional card within it.

Content order:

- Calm coral heading: “路线变了，请先停一下”
- Reassurance: “您现在很安全，我们正在找新的路线”
- Map comparing the old dotted path with the new solid route
- Voice status: “正在为您朗读新方向”
- Primary action after replanning: “按新路线继续”
- Secondary action: “联系女儿”

Technical GPS accuracy, distance thresholds and diagnostic messages are hidden from the main state. If replanning fails, the screen instructs the elder to remain in a safe place and contact family; it never silently returns to the old route.

### 4. Caregiver dashboard

The first viewport answers four questions:

- Is Dad travelling now?
- Is he on the expected route?
- Where was he last seen and when was it updated?
- Does Mei Ling need to act?

It contains:

- Status card: “正在前往医院 / 位置正常 / 刚刚更新”
- Map with current position, home, destination and active route
- Progress and ETA
- Most recent deviation or replanning event
- Primary action: “联系爸爸”
- Secondary action: “查看行程详情”

If a severe deviation alert is active, the status card becomes the alert surface. It displays the last known area, time and acknowledgement action. It does not add a second competing alert banner.

Appointment editing, trip planning and permission management remain separate views.

### 5. Onboarding questionnaire

The existing one-question-per-screen structure remains. Copy is shortened and the daughter is clearly identified as the person completing setup with Mr Tan.

The questionnaire covers:

- Home and familiar destinations
- Mobility aid
- Observed walking time
- Spoken reminder frequency
- Caregiver name and phone number
- Consent for live progress and emergency alerts

Consent separates two concepts:

1. NebulaX may process live location to guide and replan.
2. The caregiver may see location only during a journey and when an alert requires assistance.

This replaces the current contradictory promise that location is never shared while the product simultaneously raises a caregiver lost-route alert.

## Behaviour and data flow

1. Starting a journey activates speech and offers foreground GPS guidance.
2. Fresh, reliable GPS updates the blue dot and distance-to-route calculation.
3. Normal progress updates the instruction and caregiver status without creating alerts.
4. Sustained deviation triggers the calm elder recovery state.
5. Automatic replanning requests a route from the current coarse position.
6. Successful replanning replaces only the remaining route and announces the first new instruction.
7. A severe deviation creates or refreshes one caregiver alert until acknowledged or the traveller returns to the route.
8. Location failure preserves the manual route and offers clear recovery choices.

No interface should claim that a remote notification was delivered until a real backend notification service exists. Demo data and local-only caregiver behaviour remain explicitly labelled.

## Component boundaries

The large `App.tsx` rendering branches should be decomposed into focused presentation components while preserving state ownership and API calls in `App`:

- `ElderHome` — ready-to-leave summary and actions
- `ElderGuidance` — active instruction, map and stable actions
- `DeviationRecovery` — off-route/replanning state
- `CaregiverDashboard` — status, map, alerts and contact action
- `DemoRoleSwitcher` — explicitly secondary demo-only role control

`LocationGuidance` remains responsible for browser geolocation, route distance and manual arrival validation. It exposes state to `ElderGuidance` rather than rendering all consent, status, warning and completion controls in one long block.

`LiveMap` continues to own map rendering and attribution. It accepts an elder/caregiver presentation mode to control label density and overlays.

## Error and offline states

- **Location denied:** retain manual guidance; show one concise enable-location action.
- **Weak or stale GPS:** keep the planned route visible; state that the position is approximate without blocking manual progress.
- **Replanning unavailable:** ask the elder to stop safely and contact family; preserve the last valid plan.
- **Offline:** keep the saved route, directions and manual confirmation available. Do not claim live position or live conditions.
- **No caregiver phone:** replace call actions with a setup/help action without dead links.
- **No accessible route:** retain the existing blocked state and prioritise human help.

## Accessibility requirements

- Maintain semantic headings and live regions for changed instructions and alerts.
- Keep keyboard-visible focus states and a logical focus order.
- Respect reduced-motion preferences.
- Validate at 320 px width with the largest text setting and no horizontal overflow.
- Do not rely on red/green alone for state.
- Speech buttons expose speaking/stopped state in their accessible names.
- Maps have concise accessible summaries; essential instructions remain available as text.

## Verification

Existing planning, offline, location, arrival, appointment and family-permission tests must continue to pass. Add or update browser tests for:

- Elder ready screen contains only one primary journey action above the fold.
- Elder active screen shows instruction before map and map before secondary details.
- Blue-dot/current-location label appears when a reliable fix arrives.
- Sustained deviation replaces normal guidance with the recovery state.
- Successful replanning exposes “按新路线继续”.
- Severe deviation produces one caregiver alert and no duplicate banner.
- Elder mode does not display caregiver navigation or a persistent mode switch.
- Caregiver dashboard shows location freshness and a contact action.
- Chinese largest-text layout fits at 320 px without horizontal overflow.
- Offline and denied-location paths retain manual journey instructions.

## Non-goals for this pass

- Building real caregiver authentication or cross-device accounts
- Sending actual push, SMS or voice notifications
- Background location tracking while the browser is closed
- Replacing the existing backend route contract
- Removing mandatory map attribution or simulated-data labels

