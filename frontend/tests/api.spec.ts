import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { setupLive, mode } from "./setup";
const plan = JSON.parse(
  readFileSync(
    new URL("../../docs/api-examples/plan.json", import.meta.url),
    "utf8",
  ),
);

test("live adapter sends the agreed requests and preserves the trip on refresh failure", async ({
  page,
}) => {
  const bodies: unknown[] = [];
  await page.route("**/api/journeys/plan", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: plan });
  });
  await page.route("**/api/journeys/demo-tan-001/refresh", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, body: "Provider unavailable" });
  });
  await setupLive(page);
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I’m here — show next step", exact: true })
    .click();
  await page.getByRole("button",{name:"See the full route",exact:true}).click();
  await page.getByText("Travel conditions",{exact:true}).click();
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await expect(
    page.getByText("Unable to check the journey", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button",{name:"Back to journey",exact:true}).click();
  await expect(
    page.getByRole("heading", { name: "Take the lift to the platform" }),
  ).toBeVisible();
  expect(bodies[0]).toEqual({
    origin: {lat:1.3691,lon:103.8454,name:"Home, Ang Mo Kio"},
    destination: {lat:1.3214,lon:103.8459,name:"Tan Tock Seng Hospital"},
    arriveBy: "2026-09-21T10:00:00+08:00",
    stepFree: true,
    walkingSpeedFactor: 1.1 - 0.032 * 15,
  });
  expect(bodies.at(-1)).toEqual({ version: 1, currentStepId: "amk-lift" });
});

test("malformed live data is rejected rather than replaced with a demo journey", async ({
  page,
}) => {
  await page.route("**/api/journeys/plan", (route) =>
    route.fulfill({ json: { id: "broken", steps: [] } }),
  );
  await setupLive(page);
  await expect(
    page.getByText("Unable to check the journey", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start journey", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Plan his route", exact: true }),
  ).toBeVisible();
});

test("failed appointment replanning keeps the saved appointment and draft separate", async ({
  page,
}) => {
  let count = 0;
  const bodies: unknown[] = [];
  await page.route("**/api/journeys/plan", async (route) => {
    bodies.push(route.request().postDataJSON());
    count++;
    if (count === 1) await route.fulfill({ json: plan });
    else await route.fulfill({ status: 503, body: "Routing unavailable" });
  });
  await setupLive(page);
  await mode(page,"caregiver");
  await page.getByRole("button", { name: "Appointment", exact: true }).click();
  await page.getByLabel("Appointment time", { exact: true }).fill("11:30");
  await page
    .getByRole("button", { name: "Save appointment and plan", exact: true })
    .click();
  await expect(
    page.getByText("Unable to check the journey", { exact: true }),
  ).toBeVisible();
  expect(bodies.at(-1)).toEqual({
    origin: {lat:1.3691,lon:103.8454,name:"Home, Ang Mo Kio"},
    destination: {lat:1.3214,lon:103.8459,name:"Tan Tock Seng Hospital"},
    arriveBy: "2026-09-21T11:30:00+08:00",
    stepFree: true,
    walkingSpeedFactor: 1.1 - 0.032 * 15,
  });
  await expect(
    page.getByLabel("Appointment time", { exact: true }),
  ).toHaveValue("11:30");
  await mode(page,"elder");
  await page.getByRole("button",{name:"See the full route",exact:true}).click();
  await expect(page.getByText("9:35–9:45", { exact: true })).toBeVisible();
  await page.reload();
  await mode(page,"caregiver");
  await page.getByRole("button", { name: "Appointment", exact: true }).click();
  await expect(
    page.getByLabel("Appointment time", { exact: true }),
  ).toHaveValue("10:00");
});
