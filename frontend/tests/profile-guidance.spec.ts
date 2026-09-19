import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const plan = JSON.parse(
  readFileSync(
    new URL("../../docs/api-examples/plan.json", import.meta.url),
    "utf8",
  ),
);
plan.steps[0].legId = "walk-1";
plan.routeGeometry.features[0].properties.legId = "walk-1";
async function setup(page: Page) {
  await page.route("**/api/journeys/plan", (r) => r.fulfill({ json: plan }));
  await page.route("**/api/geocode?**", (r) =>
    r.fulfill({
      json: {
        results: [
          {
            name: "New home",
            lat: 1.35,
            lon: 103.85,
            address: "123 Test Road",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "English", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Use sample: Ang Mo Kio home → TTSH",
      exact: true,
    })
    .click();
}
async function finish(page: Page) {
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan his route", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start journey", exact: true }),
  ).toBeVisible();
}
test("saved places drive planning and profile edits persist without replacing an active trip", async ({
  page,
}) => {
  let body: Record<string, unknown> = {};
  await setup(page);
  await page.route("**/api/journeys/plan", (r) => {
    body = r.request().postDataJSON();
    return r.fulfill({ json: plan });
  });
  await page.getByLabel("Home address", { exact: true }).fill("123");
  await page.getByRole("button", { name: /New home/ }).click();
  await finish(page);
  expect(body.origin).toMatchObject({ name: "New home", lat: 1.35 });
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Display settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Dad’s profile", exact: true })
    .click();
  await expect(page.getByLabel("Home address", { exact: true })).toHaveValue(
    "New home",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Walker", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Walk to Ang Mo Kio station",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Display settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Dad’s profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Walker", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("location checks distant arrival, allows deliberate override, and never auto advances", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition(success: (p: unknown) => void) {
          (
            window as unknown as {
              sendPosition: (
                lat: number,
                lon: number,
                accuracy?: number,
              ) => void;
            }
          ).sendPosition = (lat, lon, accuracy = 8) =>
            success({
              coords: { latitude: lat, longitude: lon, accuracy },
              timestamp: Date.now(),
            });
          return 1;
        },
        clearWatch() {},
      },
    });
  });
  await setup(page);
  await finish(page);
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enable location guidance", exact: true })
    .click();
  await page.evaluate(() =>
    (
      window as unknown as { sendPosition: (a: number, b: number) => void }
    ).sendPosition(1.372, 103.843),
  );
  await page
    .getByRole("button", { name: "I’m here — show next step", exact: true })
    .click();
  await expect(
    page.getByText("You still seem far from this stop.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Walk to Ang Mo Kio station",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "I checked the landmark — continue",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Take the lift to the platform",
      exact: true,
    }),
  ).toBeVisible();
});

async function fakeGps(page: Page, denied = false) {
  await page.addInitScript(
    ({ denied }) => {
      Object.defineProperty(navigator, "geolocation", {
        value: {
          watchPosition(
            success: (p: unknown) => void,
            error: (error: { code: number }) => void,
          ) {
            (
              window as unknown as { sendLocationError: (code: number) => void }
            ).sendLocationError = (code) => error({ code });
            if (denied) queueMicrotask(() => error({ code: 1 }));
            (
              window as unknown as {
                sendFix: (
                  lat: number,
                  lon: number,
                  accuracy: number,
                  age: number,
                ) => void;
              }
            ).sendFix = (lat, lon, accuracy, age) =>
              success({
                coords: { latitude: lat, longitude: lon, accuracy },
                timestamp: Date.now() - age,
              });
            return 1;
          },
          clearWatch() {},
        },
      });
    },
    { denied },
  );
  await setup(page);
  await finish(page);
  await page
    .getByRole("button", { name: "Start journey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enable location guidance", exact: true })
    .click();
}
async function fix(
  page: Page,
  lat: number,
  lon: number,
  accuracy = 8,
  age = 0,
) {
  await page.evaluate(
    ({ lat, lon, accuracy, age }) =>
      (
        window as unknown as {
          sendFix: (a: number, b: number, c: number, d: number) => void;
        }
      ).sendFix(lat, lon, accuracy, age),
    { lat, lon, accuracy, age },
  );
}
test("nearby position never automatically advances and weak location remains manual", async ({
  page,
}) => {
  await fakeGps(page);
  await fix(page, 1.37, 103.8496);
  await expect(
    page.getByText("You’re near the stop. Check its name.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Walk to Ang Mo Kio station",
      exact: true,
    }),
  ).toBeVisible();
  await fix(page, 1.4, 103.9, 150);
  await expect(
    page.getByText("Your location is approximate", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I’m here — show next step", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Take the lift to the platform",
      exact: true,
    }),
  ).toBeVisible();
});
test("off-route alert requires sustained readings and clears when back on route", async ({
  page,
}) => {
  await fakeGps(page);
  await fix(page, 1.4, 103.9, 8, 10000);
  await expect(
    page.getByText("Let’s check your walking route", { exact: true }),
  ).toHaveCount(0);
  await fix(page, 1.4, 103.9, 8, 5000);
  await fix(page, 1.4, 103.9, 8, 0);
  await expect(
    page.getByText("Let’s check your walking route", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Help me find my way", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/location-guidance.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await fix(page, 1.372, 103.843);
  await expect(
    page.getByText("Let’s check your walking route", { exact: true }),
  ).toHaveCount(0);
});
test("denied permission keeps manual progression available", async ({
  page,
}) => {
  await fakeGps(page, true);
  await expect(
    page.getByText("Location permission is off", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I’m here — show next step", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Take the lift to the platform",
      exact: true,
    }),
  ).toBeVisible();
});
test("unconfirmed addresses cannot continue and multiple saved places survive editing", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Home address", { exact: true }).fill("123");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /New home/ }).click();
  await page
    .getByRole("button", { name: "Add another destination", exact: true })
    .click();
  await page.getByLabel("Destination 2", { exact: true }).fill("123");
  await page.getByRole("button", { name: /New home/ }).click();
  await page.screenshot({
    path: "test-results/saved-places.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await finish(page);
  await page
    .getByRole("button", { name: "Display settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Dad’s profile", exact: true })
    .click();
  await expect(page.getByLabel("Destination 2", { exact: true })).toHaveValue(
    "New home",
  );
  await page
    .getByRole("button", { name: "Remove destination 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Dad’s profile", exact: true })
    .click();
  await expect(page.getByLabel("Destination 2", { exact: true })).toHaveValue(
    "New home",
  );
});

test("location status explains waiting, timeout, device errors and stale readings, with retry", async ({
  page,
}) => {
  await fakeGps(page);
  await expect(
    page.getByText("Finding your location…", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { sendLocationError: (code: number) => void }
    ).sendLocationError(3),
  );
  await expect(
    page.getByText("Getting your location is taking longer", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try location again", exact: true })
    .click();
  await expect(
    page.getByText("Finding your location…", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { sendLocationError: (code: number) => void }
    ).sendLocationError(2),
  );
  await expect(
    page.getByText("Your device couldn’t find its location", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try location again", exact: true })
    .click();
  await fix(page, 1.372, 103.843, 150);
  await expect(
    page.getByText("Your location is approximate", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/accuracy of about 150 metres/)).toBeVisible();
  await fix(page, 1.372, 103.843, 8, 20000);
  await expect(
    page.getByText("Waiting for a fresh location…", { exact: true }),
  ).toBeVisible();
  await fix(page, 1.372, 103.843);
  await expect(
    page.getByText("Location guidance is on", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Turn off location", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enable location guidance", exact: true })
    .click();
  await expect(
    page.getByText("Finding your location…", { exact: true }),
  ).toBeVisible();
  await fix(page, 1.372, 103.843, 150);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByText("目前只能获取大致位置", { exact: true }),
  ).toBeVisible();
  const copy = await page.locator(".location-status-copy").boundingBox();
  const button = await page
    .getByRole("button", { name: "关闭定位", exact: true })
    .boundingBox();
  expect(button!.y).toBeGreaterThan(copy!.y + copy!.height);
  await page
    .locator(".location-status")
    .screenshot({ path: "test-results/location-status.png" });
});

test("exact walking minutes survive profile editing and drive planning", async ({
  page,
}) => {
  await setup(page);
  let factor = 0;
  await page.route("**/api/journeys/plan", (route) => {
    factor = route.request().postDataJSON().walkingSpeedFactor;
    return route.fulfill({ json: plan });
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("spinbutton").fill("22");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan his route", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start journey", exact: true }),
  ).toBeVisible();
  expect(factor).toBeCloseTo(0.396);
  await page.reload();
  await page
    .getByRole("button", { name: "Display settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Dad’s profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("spinbutton")).toHaveValue("22");
});
