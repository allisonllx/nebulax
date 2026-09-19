# NebulaX Calm Guidance UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing NebulaX frontend around the approved four-screen calm-guidance design while preserving current planning, GPS, speech, offline, appointment and caregiver behaviours.

**Architecture:** Keep journey state, persistence and API orchestration in `App.tsx`, but move the large elder-home, elder-guidance and caregiver-dashboard render branches into focused presentation components. Convert `LocationGuidance` into a state-and-actions surface consumed by the elder guidance layout, and add a density mode to `LiveMap` so the elder sees a simplified orientation map while the caregiver retains the fuller route context.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Playwright, MapLibre GL, Lucide React, existing browser SpeechSynthesis and Geolocation APIs.

**Spec:** `docs/superpowers/specs/2026-09-19-nebulax-calm-guidance-redesign.md`

## Global Constraints

- Preserve the existing backend journey contract and camelCase bilingual data model.
- Do not add frontend dependencies.
- Retain mandatory MapTiler and OpenStreetMap attribution.
- Keep simulated data visibly labelled and never claim a remote notification was delivered.
- Chinese remains the default language and the largest text setting must fit at 320 px without horizontal overflow.
- Keep the current route planning, speech repetition, foreground GPS, automatic replanning, offline snapshot, appointment and caregiver permission behaviour.
- Keep all touch targets at least 56 px; primary journey actions should be 64–72 px where layout permits.
- Do not expose the caregiver navigation or persistent role switch in the elder journey viewport.

---

## File Structure

- Create `frontend/src/ElderHome.tsx`: ready-to-leave content and elder contact actions only.
- Create `frontend/src/ElderGuidance.tsx`: normal active instruction, simplified map, speech/contact actions and manual confirmation.
- Create `frontend/src/DeviationRecovery.tsx`: calm off-route/replanning presentation.
- Create `frontend/src/CaregiverDashboard.tsx`: caregiver status, map, alert and contact actions.
- Modify `frontend/src/LocationGuidance.tsx`: expose a render-state callback and keep GPS/manual-arrival behaviour separate from visual composition.
- Modify `frontend/src/LiveMap.tsx`: support `density="elder" | "caregiver"` and an accessible summary.
- Modify `frontend/src/App.tsx`: compose new screens, retain state orchestration and demote the role switch to demo controls.
- Modify `frontend/src/Onboarding.tsx`: clarify caregiver phone and location-sharing consent.
- Modify `frontend/src/travelProfile.ts`: persist an optional traveller phone number for the caregiver contact action.
- Modify `frontend/src/App.css`: replace competing legacy layout rules with the approved warm, single-task visual hierarchy.
- Modify `frontend/tests/journey.spec.ts`: elder hierarchy, role separation and active guidance coverage.
- Modify `frontend/tests/profile-guidance.spec.ts`: live location, deviation recovery and replanning coverage.
- Modify `frontend/tests/family.spec.ts`: caregiver dashboard and consent coverage.

---

### Task 1: Lock the approved information hierarchy with browser tests

**Files:**
- Modify: `frontend/tests/journey.spec.ts`
- Modify: `frontend/tests/profile-guidance.spec.ts`
- Modify: `frontend/tests/family.spec.ts`

**Interfaces:**
- Consumes: existing Playwright fixtures, setup helpers and mocked `/api/journeys/plan` responses.
- Produces: executable acceptance criteria for `ElderHome`, `ElderGuidance`, `DeviationRecovery` and `CaregiverDashboard`.

- [ ] **Step 1: Add a ready-to-leave hierarchy test**

Add to `frontend/tests/journey.spec.ts`:

```ts
test("elder home keeps one dominant journey action and hides caregiver navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good morning, Mr Tan." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start journey", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Where is Dad", exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Who is using the app" })).toHaveCount(0);
  await expect(page.getByText("Journey details", { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Add an active-guidance order test**

Use DOM bounding boxes in `frontend/tests/journey.spec.ts` to assert that the current instruction is above the map and the map is above the manual confirmation:

```ts
test("active elder guidance presents instruction, orientation map, then manual confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start journey", exact: true }).click();
  const instruction = page.getByTestId("elder-current-instruction");
  const map = page.getByLabel("Current-step orientation map");
  const confirm = page.getByRole("button", { name: "I’m here — show next step", exact: true });
  const [instructionBox, mapBox, confirmBox] = await Promise.all([
    instruction.boundingBox(), map.boundingBox(), confirm.boundingBox(),
  ]);
  expect(instructionBox!.y).toBeLessThan(mapBox!.y);
  expect(mapBox!.y).toBeLessThan(confirmBox!.y);
});
```

- [ ] **Step 3: Add deviation-recovery replacement coverage**

Extend the existing fake-GPS test in `frontend/tests/profile-guidance.spec.ts` so sustained off-route fixes assert:

```ts
await expect(page.getByRole("heading", { name: "The route has changed — please stop for a moment" })).toBeVisible();
await expect(page.getByTestId("elder-current-instruction")).toHaveCount(0);
await expect(page.getByRole("button", { name: "Continue on the new route" })).toBeVisible();
await expect(page.getByRole("button", { name: "Call Mei Ling" })).toBeVisible();
```

- [ ] **Step 4: Add caregiver-dashboard acceptance coverage**

Add to `frontend/tests/family.spec.ts` after linking family support:

```ts
test("caregiver dashboard prioritises status, map freshness and contact", async ({ page }) => {
  await page.goto("/");
  await linkFamily(page);
  await page.getByRole("button", { name: "Family view", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dad’s journey" })).toBeVisible();
  await expect(page.getByLabel("Caregiver journey map")).toBeVisible();
  await expect(page.getByText(/Location updates when his screen is open|Position normal/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Call Dad" })).toBeVisible();
});
```

- [ ] **Step 5: Run the new tests and verify the current UI fails for the intended reasons**

Run:

```bash
cd frontend
npm test -- journey.spec.ts profile-guidance.spec.ts family.spec.ts
```

Expected: the new hierarchy, test-id, recovery-action and role-separation assertions fail; existing behavioural tests remain green.

- [ ] **Step 6: Commit the acceptance tests**

```bash
git add frontend/tests/journey.spec.ts frontend/tests/profile-guidance.spec.ts frontend/tests/family.spec.ts
git commit -m "test: define calm-guidance UI hierarchy"
```

---

### Task 2: Build the elder ready-to-leave home

**Files:**
- Create: `frontend/src/ElderHome.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/tests/journey.spec.ts`

**Interfaces:**
- Consumes: `Journey`, `Language`, formatted departure time, linked caregiver name/phone and existing callbacks from `App`.
- Produces: `ElderHome(props: ElderHomeProps)` with `onStart`, `onOpenDetails`, `onOpenHelp` and optional `tel:` contact rendering.

- [ ] **Step 1: Create the focused component contract**

Create `frontend/src/ElderHome.tsx` with:

```ts
export interface ElderHomeProps {
  journey: Journey;
  language: Language;
  caregiverName?: string;
  caregiverPhone?: string;
  disabled: boolean;
  onStart: () => void;
  onOpenDetails: () => void;
  onOpenHelp: () => void;
}
```

Render one `section.elder-home` containing the greeting, destination, departure time, prepared-by reassurance, one `.primary.elder-start`, one `.secondary.elder-contact`, and a disclosure button labelled “Journey details / 查看行程详情”. Use `dialNumber` for the optional `tel:` target.

- [ ] **Step 2: Replace the planned elder branch in `App.tsx`**

Import `ElderHome` and replace the current planned-state grid/card markup around the existing `state.phase === "planned"` branch. Pass existing `start`, `go("details")`, `go("help")`, busy/blocked/proposal state and caregiver fields. Keep route details and conditions in the existing details view instead of rendering them above the fold.

- [ ] **Step 3: Demote the persona switch to demo controls**

Remove the persistent `.mode-bar` from the app footer. Add two explicit buttons inside the existing `<details className="demo-controls">`:

```tsx
<button onClick={() => setPersonaMode("elder")}>{t("Open elder demo", "打开长辈演示")}</button>
<button onClick={() => setPersonaMode("caregiver")}>{t("Open family demo", "打开家人演示")}</button>
```

When `personaMode === "caregiver"`, retain the caregiver top navigation. Do not render it for the elder.

- [ ] **Step 4: Add the approved elder-home CSS**

Add `.elder-home`, `.elder-home__greeting`, `.elder-home__appointment`, `.elder-home__time`, `.elder-start`, `.elder-contact` and `.elder-home__details` rules. At widths below 600 px, keep the appointment and two actions in the first viewport, use a minimum 64 px primary button and remove decorative art that competes with the appointment.

- [ ] **Step 5: Run the elder-home test**

Run:

```bash
cd frontend
npx playwright test tests/journey.spec.ts -g "elder home keeps"
```

Expected: PASS.

- [ ] **Step 6: Commit the elder home**

```bash
git add frontend/src/ElderHome.tsx frontend/src/App.tsx frontend/src/App.css frontend/tests/journey.spec.ts
git commit -m "feat: simplify the elder journey home"
```

---

### Task 3: Recompose active guidance around instruction and map

**Files:**
- Create: `frontend/src/ElderGuidance.tsx`
- Modify: `frontend/src/LocationGuidance.tsx`
- Modify: `frontend/src/LiveMap.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/tests/journey.spec.ts`
- Test: `frontend/tests/profile-guidance.spec.ts`

**Interfaces:**
- Consumes: `Journey`, current `stepIndex`, `Language`, live fix, speech state, contact data and callbacks owned by `App`.
- Produces: `ElderGuidance`, `LocationGuidanceState`, `LocationGuidanceActions` and `LiveMap` density/accessibility props.

- [ ] **Step 1: Define a presentation-neutral location state**

Export from `LocationGuidance.tsx`:

```ts
export type LocationGuidanceState = {
  enabled: boolean;
  reliable: boolean;
  status: "waiting" | "tracking" | "denied" | "timeout" | "unsupported" | "unavailable";
  near: boolean;
  far: boolean;
  offRoute: boolean;
  endMetres: number | null;
  routeMetres: number | null;
  position: { lat: number; lon: number } | null;
  title: string;
  detail: string;
};
```

Add `onGuidanceState?: (state: LocationGuidanceState) => void` and report coarse position/status through an effect. Preserve existing `onStatus` so the parent replanning logic does not change during this task.

- [ ] **Step 2: Add elder/caregiver map density**

Extend `LiveMap` props:

```ts
density?: "elder" | "caregiver";
ariaLabel?: string;
```

For elder density: disable rotation, pitch and unnecessary gestures; use thicker recommended-route lines, stronger dimming outside `currentLegId`, a larger blue dot and a visible “You are here / 您在这里” label. For caregiver density, preserve full-route context. Render the passed `ariaLabel` and keep MapLibre attribution enabled.

- [ ] **Step 3: Create `ElderGuidance`**

Create `frontend/src/ElderGuidance.tsx` with a single active-layout component. Its first elements are:

```tsx
<p className="elder-progress">...</p>
<h1 data-testid="elder-current-instruction">{step.instruction[language]}</h1>
<p className="elder-distance">...</p>
<div aria-label={t("Current-step orientation map", "当前步骤方向地图")}>
  <LiveMap density="elder" currentLegId={step.legId} ... />
</div>
```

Below the map render a 64 px “Repeat instruction / 再说一次” action, a “Call Mei Ling / 联系女儿” action, then the existing manual landmark confirmation. Put location diagnostics, previous instruction, full route and offline status in a collapsed secondary region.

- [ ] **Step 4: Replace the active elder branch in `App.tsx`**

Pass `listen`, `advance`, `handleLiveFix`, `setLocationEnabled`, `nearLabel`, `replanBusy`, family phone and existing disabled rules. Do not duplicate the step count, next-step preview, full direction list or GPS status above the map.

- [ ] **Step 5: Style the active guidance**

Add `.elder-guidance`, `.elder-guidance__instruction`, `.elder-guidance__map`, `.elder-guidance__actions`, `.elder-guidance__manual` and `.elder-guidance__secondary` rules. On mobile, use one column, a 240–300 px map, 1.6–2 rem instruction text and consistent bottom actions. On wider screens cap the reading width rather than spreading controls across two competing columns.

- [ ] **Step 6: Run active guidance and location tests**

Run:

```bash
cd frontend
npx playwright test tests/journey.spec.ts -g "active elder guidance"
npx playwright test tests/profile-guidance.spec.ts -g "nearby position|weak location|blue dot"
```

Expected: PASS, with manual arrival still required.

- [ ] **Step 7: Commit active guidance**

```bash
git add frontend/src/ElderGuidance.tsx frontend/src/LocationGuidance.tsx frontend/src/LiveMap.tsx frontend/src/App.tsx frontend/src/App.css frontend/tests/journey.spec.ts frontend/tests/profile-guidance.spec.ts
git commit -m "feat: focus elder guidance on instruction and map"
```

---

### Task 4: Turn deviation handling into a dedicated recovery state

**Files:**
- Create: `frontend/src/DeviationRecovery.tsx`
- Modify: `frontend/src/ElderGuidance.tsx`
- Modify: `frontend/src/LocationGuidance.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/tests/profile-guidance.spec.ts`

**Interfaces:**
- Consumes: `LocationGuidanceState.offRoute`, `replanBusy`, current and previous journey, family phone, speech and help callbacks.
- Produces: `DeviationRecovery` and an explicit `onContinueNewRoute` action after successful replanning.

- [ ] **Step 1: Create the recovery component**

Create `frontend/src/DeviationRecovery.tsx` with props:

```ts
export interface DeviationRecoveryProps {
  journey: Journey;
  previousJourney?: Journey;
  language: Language;
  position: { lat: number; lon: number } | null;
  replanBusy: boolean;
  caregiverPhone?: string;
  onRepeat: () => void;
  onContinue: () => void;
  onHelp: () => void;
}
```

Render the approved calm heading and reassurance, `LiveMap density="elder" original={previousJourney}`, voice status, one primary continue button and one family contact action. Disable continue while `replanBusy` is true.

- [ ] **Step 2: Make recovery replace normal guidance**

In `ElderGuidance`, return `DeviationRecovery` when `guidance.offRoute || replanBusy`. Do not render the normal instruction, arrival confirmation or duplicated off-route card in that state.

- [ ] **Step 3: Remove visual recovery markup from `LocationGuidance`**

Keep detection, speech warning, manual arrival validation and status reporting. Delete `.offroute-card` rendering from `LocationGuidance`; its state now drives `DeviationRecovery`.

- [ ] **Step 4: Preserve old/new journey comparison during replanning**

In `App.tsx`, retain the pre-replan journey in a ref or state before replacing `state.journey`. Clear it only when the user chooses “Continue on the new route” or returns to the planned route. Pass it to `DeviationRecovery` for the dotted previous route.

- [ ] **Step 5: Update and run the recovery tests**

Run:

```bash
cd frontend
npx playwright test tests/profile-guidance.spec.ts -g "off-route|replan|route has changed"
```

Expected: recovery replaces normal guidance, the new-route action appears after replanning and existing sustained-reading thresholds remain unchanged.

- [ ] **Step 6: Commit deviation recovery**

```bash
git add frontend/src/DeviationRecovery.tsx frontend/src/ElderGuidance.tsx frontend/src/LocationGuidance.tsx frontend/src/App.tsx frontend/src/App.css frontend/tests/profile-guidance.spec.ts
git commit -m "feat: add calm off-route recovery"
```

---

### Task 5: Rebuild the caregiver dashboard and clarify consent

**Files:**
- Create: `frontend/src/CaregiverDashboard.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/Onboarding.tsx`
- Modify: `frontend/src/travelProfile.ts`
- Modify: `frontend/src/App.css`
- Test: `frontend/tests/family.spec.ts`

**Interfaces:**
- Consumes: `Snapshot`, `Language`, live position/freshness, current step, optional traveller phone and existing navigation callbacks.
- Produces: `CaregiverDashboard`, clarified onboarding values and optional `TravelProfile.travellerPhone` persistence.

- [ ] **Step 1: Create the caregiver dashboard component**

Create `frontend/src/CaregiverDashboard.tsx` with:

```ts
export interface CaregiverDashboardProps {
  snapshot: Snapshot;
  language: Language;
  position: { lat: number; lon: number; at: number; off: boolean } | null;
  travellerPhone?: string;
  onContactDad: () => void;
  onDismissAlert: () => void;
  onOpenDetails: () => void;
  onOpenFamily: () => void;
}
```

Render one status surface that switches between normal and alert states, a `LiveMap density="caregiver" ariaLabel="Caregiver journey map"`, step/ETA/freshness, the most recent deviation row and contact/details actions. When `lostAlert` exists, do not render a separate second alert banner. Render “Call Dad” as a button that invokes `onContactDad`; `App` opens a `tel:` URL only when `travellerPhone` exists and otherwise opens the existing help/setup view with honest explanatory copy.

- [ ] **Step 2: Replace the caregiver journey branch in `App.tsx`**

Use `CaregiverDashboard` for `personaMode === "caregiver" && view === "journey"`. Keep trip planning, appointments and `FamilyPanel` in their existing separate views. Pass the current `liveFix` only while it is fresh; otherwise show the last-update copy.

- [ ] **Step 3: Clarify onboarding consent copy**

Update the final onboarding question to distinguish guidance processing from family visibility. The selected option text must say that NebulaX uses live location during a journey and that Mei Ling can see it only while the journey is active or assistance is needed. Keep the existing sharing boolean and backend contracts.

Continue collecting the optional family phone using the existing `familyPhone` field for the elder-side “联系女儿” action. Add `travellerPhone: z.string().default("")` to `travelProfileSchema`, include it in `defaultTravelProfile`, and collect “爸爸的手机号码（可选）” during caregiver setup for the caregiver-side “联系爸爸” action. Because it has a default, previously saved snapshots continue to parse without migration.

- [ ] **Step 4: Style caregiver status and responsive layout**

Add `.caregiver-dashboard`, `.caregiver-dashboard__status`, `.caregiver-dashboard__map`, `.caregiver-dashboard__meta`, `.caregiver-dashboard__event` and `.caregiver-dashboard__actions`. Use coral only for active severe deviation. At 320 px stack actions and keep the map at least 220 px tall.

- [ ] **Step 5: Run caregiver and onboarding tests**

Run:

```bash
cd frontend
npx playwright test tests/family.spec.ts
npx playwright test tests/profile-guidance.spec.ts -g "saved places|profile edits"
```

Expected: caregiver permission, appointment proposal and revocation behaviours remain green; the dashboard acceptance test passes.

- [ ] **Step 6: Commit caregiver and consent changes**

```bash
git add frontend/src/CaregiverDashboard.tsx frontend/src/App.tsx frontend/src/Onboarding.tsx frontend/src/travelProfile.ts frontend/src/App.css frontend/tests/family.spec.ts
git commit -m "feat: clarify caregiver status and consent"
```

---

### Task 6: Visual QA, accessibility and full regression

**Files:**
- Modify: `frontend/src/App.css` only if QA finds a concrete layout defect.
- Modify: affected test file only if the test was asserting removed presentation rather than product behaviour.

**Interfaces:**
- Consumes: completed components and existing test suite.
- Produces: verified production build and responsive UI matching the approved four-screen direction.

- [ ] **Step 1: Run static checks and production build**

Run:

```bash
cd frontend
npm run lint
npm run build
```

Expected: both commands exit 0 with no TypeScript errors.

- [ ] **Step 2: Run the complete frontend browser suite**

Run:

```bash
cd frontend
npm test
```

Expected: all Playwright tests pass.

- [ ] **Step 3: Run the complete backend suite**

Run:

```bash
cd backend
uv run pytest -q
```

Expected: all backend tests pass; the UI redesign has not changed route contracts.

- [ ] **Step 4: Inspect the four core screens at phone width**

Run the app, use a 390 × 844 viewport and visually inspect:

1. Elder home
2. Elder active guidance with a blue live-position dot
3. Deviation recovery after sustained fake GPS fixes
4. Caregiver dashboard with normal and active-alert status

Compare hierarchy, palette, map placement and actions with `/Users/wuyunkai/.codex/generated_images/01a0b756-214e-7c62-940f-d7f7c2fb2d09/exec-6981de63-a7ff-4306-aa92-66b5184060fd.png`.

- [ ] **Step 5: Verify 320 px largest-text accessibility**

Confirm no horizontal overflow, all controls remain reachable, text does not overlap the map, focus order follows visual order and the reduced-motion rule disables the blue-dot pulse.

- [ ] **Step 6: Commit any QA-only fixes**

If QA required changes:

```bash
git add frontend/src/App.css frontend/tests
git commit -m "fix: polish calm-guidance responsive layout"
```

If no files changed, do not create an empty commit.
