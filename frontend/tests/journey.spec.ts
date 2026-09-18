import { test, expect } from "@playwright/test";

// Catches lost progress or a network-only shell after an offline reopen.
test("saved journey and confirmed progress survive a real offline reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start journey", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I'm at the station", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Take the lift to the platform" }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved for offline use", { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Take the lift to the platform" }),
  ).toBeVisible();
  await expect(
    page.getByText("Connection unavailable", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});

// Catches replacing an active plan without the traveller accepting it.
test("a proposed route stays separate until accepted", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  await page.getByText("Demo scenarios", { exact: true }).click();
  await page.getByRole("button", { name: "Route change", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A change to your journey" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review updated route", exact: true })
    .click();
  await expect(
    page.getByText("9:43–9:53", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use updated route", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Walk to Ang Mo Kio station" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("9:43–9:53", { exact: true }).first(),
  ).toBeVisible();
});

// Catches dropping language selection or overflowing at the larger text setting.
test("Chinese and large text persist on a narrow screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "开始行程", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "显示设置", exact: true }).click();
  await page.getByRole("button", { name: "特大", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "开始行程", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

// Catches allowing forward travel on a route reported as inaccessible.
test("no accessible route offers help instead of continuing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Demo scenarios", { exact: true }).click();
  await page
    .getByRole("button", { name: "No accessible route", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "We cannot confirm a step-free route" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start journey", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Get help", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Let’s find your next step" }),
  ).toBeVisible();
});

// Catches automatically claiming arrival or notifying an unlinked caregiver.
test("arrival requires confirming the final step", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  for (const name of [
    "I'm at the station",
    "I'm on the platform",
    "I've reached Novena",
    "I'm at the concourse",
    "I have arrived",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "You’ve arrived, Mr Tan" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Arrival saved on this phone. No caregiver has been notified.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "You’ve arrived, Mr Tan" }),
  ).toBeVisible();
});
