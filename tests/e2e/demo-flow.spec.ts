import { expect, test, type Page } from "@playwright/test";

// Alur utama (T9.4, bukti uji SRS §14) di lingkungan DEMO: pesanan → konfirmasi → bayar cicilan → serah → nota →
// laporan. Butuh seed_demo.sql (stok TP tersedia) dan E2E_ADMIN_EMAIL / E2E_KETUA_EMAIL / E2E_PASSWORD.
// Tanpa variabel itu seluruh berkas dilewati. Jangan arahkan ke proyek data nyata.
const ADMIN = process.env.E2E_ADMIN_EMAIL;
const KETUA = process.env.E2E_KETUA_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
test.skip(!ADMIN || !KETUA || !PASSWORD, "Isi E2E_ADMIN_EMAIL, E2E_KETUA_EMAIL, E2E_PASSWORD untuk lingkungan DEMO");
test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD ?? "");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("admin: pesanan 2 kg tepung → konfirmasi → bayar 2× → serah → nota", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop", "alur transaksi cukup sekali (laptop); ponsel diuji di test berikut");
  await login(page, ADMIN ?? "");
  await page.goto("/penjualan/baru");
  await page.getByText("Langsung", { exact: true }).click();
  await page.locator("#customerId").selectOption({ label: "IRT Sekar Arum (usaha)" });
  await page.getByLabel("Produk baris 1").selectOption({ index: 3 });
  await page.getByLabel(/Jumlah baris 1/).fill("2");
  await page.getByRole("button", { name: "Simpan draft" }).click();
  await expect(page).toHaveURL(/\/penjualan\/[0-9a-f-]{36}\?simpan=baru/, { timeout: 30_000 });

  // aksi lewat dialog (desain 02): tombol di header → dialog dampak → tombol aksi
  await page.getByRole("button", { name: "Konfirmasi pesanan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Konfirmasi & reservasi" }).click();
  await expect(page.getByText(/Dikonfirmasi sebagai INV-/)).toBeVisible();

  // cicilan 1: tunai Rp5.000 langsung terverifikasi; cicilan 2: sisa tagihan
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  await page.getByRole("dialog").getByLabel("Jumlah", { exact: true }).fill("5000");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan pembayaran" }).click();
  await expect(page.getByText(/Pembayaran Rp5\.000 diverifikasi/)).toBeVisible();
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan pembayaran" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); // "Lunas" juga muncul di pratinjau dialog
  await expect(page.getByText("Lunas").first()).toBeVisible();

  await page.getByRole("button", { name: "Serahkan barang" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Serahkan barang" }).click();
  await expect(page.getByText(/diserahkan\. Stok keluar dicatat/)).toBeVisible();

  const nota = await page.request.get(page.url().replace(/\/penjualan\/([^?]+).*/, "/api/v1/orders/$1/receipt"));
  expect(nota.status()).toBe(200);
  const body = await nota.json();
  expect(body.data.docNumber).toMatch(/^INV-/);
  expect(body.data.outstandingRp).toBe(0);
});

test("ketua: dashboard & laporan terbaca, tidak bisa mencatat pembayaran", async ({ page }) => {
  await login(page, KETUA ?? "");
  await expect(page.getByText("Omzet")).toBeVisible();
  await page.goto("/laporan/penjualan?periode=bulan-ini");
  await expect(page.getByRole("heading", { name: /Ringkasan/ })).toBeVisible();
  const csv = await page.request.get("/api/v1/reports/penjualan?format=csv&periode=bulan-ini");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const res = await page.request.post("/api/v1/orders/3f1c2b8e-5d6a-4c1e-9f0a-1b2c3d4e5f60/payments", {
    headers: { "Idempotency-Key": "3f1c2b8e-5d6a-4c1e-9f0a-1b2c3d4e5f60" },
    data: { method: "tunai", accountId: "3f1c2b8e-5d6a-4c1e-9f0a-1b2c3d4e5f60", amountRp: 1 },
  });
  expect(res.status()).toBe(403);
});
