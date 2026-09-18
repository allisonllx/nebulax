import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: { viewport: { width: 390, height: 844 } },
  projects: [
    {
      name: "demo",
      testMatch: ["journey.spec.ts", "family.spec.ts"],
      use: { baseURL: "http://127.0.0.1:4173" },
    },
    {
      name: "api",
      testMatch: "api.spec.ts",
      use: { baseURL: "http://127.0.0.1:4174" },
    },
  ],
  webServer: [
    {
      command:
        "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_API_MODE=live vite build --outDir dist-live && vite preview --outDir dist-live --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
    },
  ],
});
