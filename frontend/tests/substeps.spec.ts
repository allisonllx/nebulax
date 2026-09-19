import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const journey = JSON.parse(
  readFileSync(
    new URL("../../docs/fixtures/plan.substeps.json", import.meta.url),
    "utf8",
  ),
);
async function openJourney(page: Page, index = 0, trip = journey) {
  await page.addInitScript(
    ({ trip, index }) => {
      if (!localStorage.getItem("nebulax:journey:live:1"))
        localStorage.setItem(
          "nebulax:journey:live:1",
          JSON.stringify({
            schemaVersion: 1,
            journey: trip,
            stepIndex: index,
            phase: "active",
            language: "en",
            large: true,
            blocked: false,
            proposal: null,
          }),
        );
    },
    { trip, index },
  );
  await page.goto("/");
}
test("walking substeps are separate, bilingual, saved, and never advance the major step", async ({
  page,
}) => {
  await openJourney(page);
  const section = page.getByRole("region", {
    name: "Current walking instruction",
  });
  await expect(section.getByRole("heading")).toHaveText(
    journey.steps[0].substeps[0].instruction.en,
  );
  await page
    .getByRole("button", {
      name: "Finished this section — next instruction",
      exact: true,
    })
    .click();
  await expect(section.getByRole("heading")).toHaveText(
    journey.steps[0].substeps[1].instruction.en,
  );
  await expect(
    page.getByText(`Step 1 of ${journey.steps.length}`, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(section.getByRole("heading")).toHaveText(
    journey.steps[0].substeps[1].instruction.en,
  );
  await expect(page.locator(".leg-endpoints")).toContainText(
    journey.steps[0].fromPlace.name.en,
  );
  await expect(page.locator(".leg-endpoints")).toContainText(
    journey.steps[0].toPlace.name.en,
  );
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator(".walking-substep h2")).toHaveText(
    journey.steps[0].substeps[1].instruction.zh,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/walking-substeps.png",
    fullPage: true,
  });
});
test("transit lists intermediate stops and only updates the count after manual confirmation", async ({
  page,
}) => {
  const index = journey.steps.findIndex(
    (s: { mode: string; action: string }) =>
      s.mode === "train" && s.action === "ride",
  );
  await openJourney(page, index);
  await expect(
    page.getByRole("heading", { name: "4 stops to alight" }),
  ).toBeVisible();
  await expect(page.locator(".transit-stop-list")).toContainText("Bishan");
  await expect(page.locator(".transit-stop-list")).toContainText("Braddell");
  await expect(page.locator(".transit-stop-list")).toContainText("Toa Payoh");
  await page
    .getByRole("button", { name: "We passed Bishan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 stops to alight" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "3 stops to alight" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Undo last stop confirmation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "4 stops to alight" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/transit-substeps.png",
    fullPage: true,
  });
});
test("missing detail keeps manual guidance and never invents a stop count", async ({
  page,
}) => {
  const trip = structuredClone(journey);
  const index = trip.steps.findIndex(
    (s: { action: string }) => s.action === "ride",
  );
  trip.steps[index].stopsComplete = false;
  await openJourney(page, index, trip);
  await expect(
    page.getByText(
      "Intermediate stop data is incomplete; remaining stops are unknown.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /stops to alight/ }),
  ).toHaveCount(0);
});

for (const legacy of [false, true]) {
  test(`boarding and alighting stay distinct with ${legacy ? "saved older" : "new"} journeys and GPS off`, async ({
    page,
  }) => {
    const trip = structuredClone(journey);
    const index = trip.steps.findIndex(
      (s: { action: string }) => s.action === "board",
    );
    const from = trip.steps[index].fromPlace.name.en;
    const to = trip.steps[index].toPlace.name.en;
    if (legacy)
      for (const step of trip.steps) {
        delete step.fromPlace;
        delete step.toPlace;
        delete step.action;
        delete step.stops;
        delete step.stopsComplete;
        delete step.substeps;
      }
    await openJourney(page, index, trip);
    await expect(page.locator(".leg-endpoints")).toContainText(
      `Board at ${from}`,
    );
    await expect(page.locator(".leg-endpoints")).toContainText(
      `Alight at ${to}`,
    );
    await expect(page.locator(".diagram-endpoints")).toContainText(
      `Alight at: ${to}`,
    );
    await expect(page.getByTestId("elder-current-instruction")).toContainText(
      to,
    );
    if (legacy)
      await expect(
        page.getByText(
          "This saved journey has no intermediate stop details. Plan a new journey to request them.",
          { exact: true },
        ),
      ).toBeVisible();
    await page
      .getByRole("button", { name: "I’m on board — next step", exact: true })
      .click();
    await expect(page.getByTestId("elder-current-instruction")).toContainText(
      "Stay on board.",
    );
    await expect(page.locator(".leg-endpoints")).toContainText(
      `Alight at ${to}`,
    );
    await expect(
      page.getByRole("button", {
        name: `I’ve alighted at ${to} — next step`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator(".leg-endpoints")).toContainText("上车站");
    await expect(page.locator(".leg-endpoints")).toContainText("下车站");
    await expect(page.getByTestId("elder-current-instruction")).toContainText(
      "继续乘车",
    );
  });
}
