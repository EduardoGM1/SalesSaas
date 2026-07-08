import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "5173";
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "4000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_SERVERS
    ? undefined
    : [
        {
          command: "npm run dev:api",
          url: `http://localhost:${apiPort}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
          env: {
            ...process.env,
            NEXT_PUBLIC_SUPABASE_URL: "",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
          },
        },
        {
          command: "npm run dev:web",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
          env: {
            ...process.env,
            VITE_SUPABASE_URL: "",
            VITE_SUPABASE_ANON_KEY: "",
          },
        },
      ],
});
