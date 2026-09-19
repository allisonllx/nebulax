import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "profile-guidance.spec.ts",
    "calm-ui.spec.ts",
    "substeps.spec.ts",
  ],
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4180",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command:
      "VITE_MAPTILER_KEY= VITE_API_MODE=live npm run dev -- --host 127.0.0.1 --port 4180",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
  },
});
