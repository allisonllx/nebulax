import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const trip = JSON.parse(
  readFileSync(
    new URL("../../docs/fixtures/plan.substeps.json", import.meta.url),
    "utf8",
  ),
);
for (const outcome of [
  "replacement_available",
  "no_accessible_route",
  "unknown",
  "failure",
]) {
  test(`simple disruption demo handles ${outcome} on the main page`, async ({
    page,
  }) => {
    let active: string | null = null;
    let refreshes = 0;
    const replacement = {
      ...trip,
      version: 2,
      routeGeometry: {
        ...trip.routeGeometry,
        features: [
          ...trip.routeGeometry.features,
          {
            ...trip.routeGeometry.features[0],
            properties: {
              ...trip.routeGeometry.features[0].properties,
              role: "previous",
            },
          },
        ],
      },
      dataMode: "simulated",
      departureTime: "2026-09-21T08:30:00+08:00",
      steps: trip.steps.filter((s: { mode: string }) => s.mode !== "train"),
      summary: {
        en: "Take the bus to avoid the lift outage and crowded platform.",
        zh: "改搭巴士，避开维修电梯与拥挤站台。",
      },
    };
    await page.route("**/api/scenarios**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/activate")) {
        expect(path).toContain("/hard_for_him/");
        if (outcome === "failure") {
          await route.fulfill({ status: 503, json: { detail: "Unavailable" } });
          return;
        }
        active = "hard_for_him";
      }
      if (path.endsWith("/deactivate")) active = null;
      await route.fulfill({
        json: {
          active,
          scenarios: [
            {
              name: "hard_for_him",
              title: { en: "Lift outage and crowding", zh: "电梯维修和拥挤" },
            },
          ],
        },
      });
    });
    await page.route("**/api/journeys/plan", (route) =>
      route.fulfill({ json: trip }),
    );
    await page.route("**/api/journeys/*/refresh", (route) => {
      refreshes++;
      return route.fulfill({
        json:
          outcome === "unknown"
            ? {
                status: "unchanged",
                checkedAt: trip.updatedAt,
                dataFreshness: "unknown",
              }
            : outcome === "no_accessible_route"
              ? {
                  status: outcome,
                  message: { en: "Please seek help", zh: "请寻求帮助" },
                }
              : { status: outcome, journey: replacement },
      });
    });
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "English", exact: true })
      .click();
    await page.getByText("Presentation demo", { exact: true }).click();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await page
      .getByRole("button", { name: "1. Show original route", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Planned route", exact: true }),
    ).toContainText(trip.origin.name.en);
    const activate = page.getByRole("button", {
      name: "2. Lift outage + crowded platform",
      exact: true,
    });
    await expect(activate).toBeEnabled();
    await expect(activate).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByRole("button", { name: "1. Show original route", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    expect(
      await activate.evaluate((el) => {
        const s = getComputedStyle(el);
        return s.color !== s.backgroundColor;
      }),
    ).toBe(true);
    await activate.click();
    if (outcome === "replacement_available") {
      await expect(activate).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", {
          name: "1. Show original route",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator(".simulation-banner")).toHaveCount(0);
      await expect(
        page.getByText(
          "Route updated to avoid the crowded platform and the lift under maintenance.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Planned route", exact: true }),
      ).toContainText(replacement.summary.en);
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("nebulax:journey:live:1")!),
      );
      expect(saved.journey.version).toBe(2);
      expect(
        saved.journey.routeGeometry.features.some(
          (f: { properties: { role?: string } }) =>
            f.properties.role === "previous",
        ),
      ).toBe(false);
      expect(saved.journey.origin).toEqual(trip.origin);
      expect(saved.journey.destination).toEqual(trip.destination);
      expect(saved.proposal).toBeNull();
      expect(saved.phase).toBe("planned");
      await expect(
        page.getByRole("button", { name: "Use updated route", exact: true }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Planned route", exact: true }),
      ).toContainText(replacement.summary.en);
    } else {
      await expect(
        page.getByText(
          outcome === "unknown"
            ? /Some condition data is unavailable/
            : outcome === "failure"
              ? /Could not complete the demo action/
              : "We cannot confirm a step-free route",
          { exact: outcome === "no_accessible_route" },
        ),
      ).toBeVisible();
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("nebulax:journey:live:1")!),
      );
      expect(saved.journey.version).toBe(trip.version);
    }
    expect(refreshes).toBe(outcome === "failure" ? 0 : 1);
  });
}
