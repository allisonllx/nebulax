import { test, expect, type Page } from "@playwright/test";
import { seed, mode } from "./setup";
test.beforeEach(async ({page}) => { await seed(page, "caregiver"); });
async function appointment(page: Page) { await mode(page,"caregiver"); await page.getByRole("button", {name:"Appointment",exact:true}).click(); }
async function details(page: Page) { await mode(page,"elder"); await page.getByRole("button",{name:"See the full route",exact:true}).click(); }

async function linkFamily(page: Page, updates = true, prepare = true) {
  await page.getByRole("button", { name: "Family", exact: true }).click();
  await page
    .getByRole("button", { name: "Set up family support", exact: true })
    .click();
  await expect(page.locator("#caregiver-name")).toBeFocused();
  if (updates)
    await page.getByLabel("Share trip updates", { exact: true }).check();
  if (prepare)
    await page
      .getByLabel("Allow appointment suggestions", { exact: true })
      .check();
  await page
    .getByRole("button", { name: "Confirm permissions", exact: true })
    .click();
}

test("appointment edits update route timing and survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await appointment(page);
  await page.getByLabel("Appointment date", { exact: true }).fill("2026-10-05");
  await page.getByLabel("Appointment time", { exact: true }).fill("11:30");
  await page
    .getByRole("button", { name: "Save appointment and plan", exact: true })
    .click();
  await details(page);
  await expect(page.getByText("11:05–11:15", { exact: true })).toBeVisible();
  await expect(page.getByText(/Leave 10:15/)).toBeVisible();
  await page.reload();
  await details(page);
  await expect(page.getByText("11:05–11:15", { exact: true })).toBeVisible();
  await appointment(page);
  await expect(
    page.getByLabel("Appointment date", { exact: true }),
  ).toHaveValue("2026-10-05");
});

test("caregiver suggestion needs traveller acceptance before changing the appointment", async ({
  page,
}) => {
  await page.goto("/");
  await linkFamily(page);
  await page
    .getByRole("button", { name: "Caregiver preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Suggest appointment change", exact: true })
    .click();
  await page.getByLabel("Appointment time", { exact: true }).fill("11:30");
  await page
    .getByRole("button", { name: "Save suggestion for review", exact: true })
    .click();
  await expect(
    page.getByText("Waiting for Mr Tan to review", { exact: true }),
  ).toBeVisible();
  await mode(page, "elder");
  await details(page);
  await expect(page.getByText("9:35–9:45", { exact: true })).toBeVisible();
  await mode(page,"elder");
  await page
    .getByRole("button", { name: "Review suggestion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Accept and update plan", exact: true })
    .click();
  await details(page);
  await expect(page.getByText("11:05–11:15", { exact: true })).toBeVisible();
  await page.reload();
  await details(page);
  await expect(page.getByText("11:05–11:15", { exact: true })).toBeVisible();
});

test("revocation removes caregiver access and pending suggestions", async ({
  page,
}) => {
  await page.goto("/");
  await linkFamily(page);
  await page
    .getByRole("button", { name: "Caregiver preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mr Tan’s trip", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Suggest appointment change", exact: true })
    .click();
  await page.getByLabel("Appointment time", { exact: true }).fill("11:30");
  await page
    .getByRole("button", { name: "Save suggestion for review", exact: true })
    .click();
  await expect(
    page.getByText("Waiting for Mr Tan to review", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mr Tan’s controls", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm stop sharing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Caregiver preview", exact: true })
    .click();
  await expect(
    page.getByText("Mr Tan has not connected a caregiver.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mr Tan’s trip", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Family", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Set up family support", exact: true }),
  ).toBeVisible();
});

test("permissions independently hide trip updates and appointment editing", async ({
  page,
}) => {
  await page.goto("/");
  await linkFamily(page, false, true);
  await page
    .getByRole("button", { name: "Caregiver preview", exact: true })
    .click();
  await expect(
    page.getByText("Trip updates are not shared.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Suggest appointment change",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mr Tan’s controls", exact: true })
    .click();
  await page
    .getByLabel("Allow appointment suggestions", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save permissions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Caregiver preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Suggest appointment change",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("active journey cannot be replaced by appointment editing", async ({
  page,
}) => {
  await page.goto("/");
  await mode(page, "elder");
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I’m here — show next step", exact: true })
    .click();
  await appointment(page);
  await expect(
    page.getByRole("button", {
      name: "Save appointment and plan",
      exact: true,
    }),
  ).toBeDisabled();
  await mode(page, "elder");
  await expect(
    page.getByRole("heading", { name: "Take the lift to the platform" }),
  ).toBeVisible();
});

test("the next fortnightly visit is created only after an explicit action", async ({
  page,
}) => {
  await page.goto("/");
  await mode(page, "elder");
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  for (const name of [
    "I’m here — show next step",
    "I’m here — show next step",
    "I’m here — show next step",
    "I’m here — show next step",
    "I’m here — finish journey",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await appointment(page);
  await expect(
    page.getByLabel("Appointment date", { exact: true }),
  ).toHaveValue("2026-09-21");
  await page
    .getByRole("button", { name: "Prepare next visit", exact: true })
    .click();
  await mode(page,"elder");
  await expect(
    page.getByRole("button", { name: "Start journey", exact: true }),
  ).toBeVisible();
  await appointment(page);
  await expect(
    page.getByLabel("Appointment date", { exact: true }),
  ).toHaveValue("2026-10-05");
});

test("Chinese appointment and family forms work at enlarged text size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.getByRole("button", { name: "显示设置", exact: true }).click();
  await page.getByRole("button", { name: "特大", exact: true }).click();
  await page.getByRole("button", { name: "预约", exact: true }).click();
  await expect(page.getByLabel("预约日期", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "家属", exact: true }).click();
  await page.getByRole("button", { name: "设置家属支持", exact: true }).click();
  await expect(
    page.getByLabel("分享行程进度", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("允许提出预约建议", { exact: true }),
  ).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
