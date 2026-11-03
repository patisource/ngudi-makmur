import { defineConfig, devices } from "@playwright/test";

// E2E (T0.10, T9.4). Jalankan `pnpm build` dulu; Playwright menyalakan `pnpm start` di port 3107 bila belum ada.
// tests/e2e/smoke.spec.ts  → tanpa akun (selalu bisa jalan).
// tests/e2e/demo-flow.spec.ts → alur DEMO lengkap; butuh lingkungan DEMO (supabase/seed_demo.sql) dan
//   E2E_ADMIN_EMAIL, E2E_KETUA_EMAIL, E2E_PASSWORD. Tanpa variabel itu test dilewati (skip), bukan gagal.
//   JANGAN arahkan ke proyek data nyata: alur ini membuat transaksi sungguhan.
const PORT = 3107;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  // reducedMotion: splash & animasi masuk dilewati agar test stabil; splash sendiri diuji terpisah (smoke.spec.ts).
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "id-ID", timezoneId: "Asia/Jakarta", contextOptions: { reducedMotion: "reduce" } },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "ponsel", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: `pnpm start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
});
