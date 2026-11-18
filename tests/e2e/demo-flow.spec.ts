import { expect, test, type Page } from "@playwright/test";

// Alur utama (T9.4, bukti uji SRS §14) di lingkungan DEMO: pesanan → konfirmasi → serah → nota → laporan & HPP.
// Sistem tanpa kas (19 Nov 2026): tidak ada langkah pembayaran. Butuh seed_demo.sql (stok TP tersedia) dan E2E_ADMIN_EMAIL / E2E_KETUA_EMAIL / E2E_PASSWORD.
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

test("admin: pesanan 2 kg tepung → konfirmasi → serah → nota", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop", "alur transaksi cukup sekali (laptop); ponsel diuji di test berikut");
  await login(page, ADMIN ?? "");
  await page.goto("/penjualan/baru");
  await page.getByText("Langsung", { exact: true }).click();
  await page.locator("#customerId").fill("Sekar");
  await page.getByRole("option", { name: /IRT Sekar Arum/ }).first().click();
  await page.getByLabel("Produk baris 1").selectOption({ index: 3 });
  await page.getByLabel(/Jumlah baris 1/).fill("2");
  await page.getByRole("button", { name: "Simpan draft" }).click();
  await expect(page).toHaveURL(/\/penjualan\/[0-9a-f-]{36}\?simpan=baru/, { timeout: 30_000 });

  // aksi lewat dialog (desain 02): tombol di header → dialog dampak → tombol aksi
  await page.getByRole("button", { name: "Konfirmasi pesanan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Konfirmasi & reservasi" }).click();
  await expect(page.getByText(/Dikonfirmasi sebagai INV-/)).toBeVisible();

  // sistem tanpa kas: tidak ada tombol pembayaran; kartu kanan = nilai penjualan
  await expect(page.getByRole("button", { name: "Catat pembayaran" })).toHaveCount(0);
  await expect(page.getByText("Nilai penjualan")).toBeVisible();

  await page.getByRole("button", { name: "Serahkan barang" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Serahkan barang" }).click();
  await expect(page.getByText(/diserahkan\. Stok keluar dicatat/)).toBeVisible();

  const nota = await page.request.get(page.url().replace(/\/penjualan\/([^?]+).*/, "/api/v1/orders/$1/receipt"));
  expect(nota.status()).toBe(200);
  const body = await nota.json();
  expect(body.data.docNumber).toMatch(/^INV-/);
  expect(body.data.netRp).toBe(body.data.totalRp);
});

test("ketua: dashboard, laporan & HPP terbaca; parameter HPP hanya dibaca", async ({ page }) => {
  await login(page, KETUA ?? "");
  await expect(page.getByText("Omzet")).toBeVisible();
  await page.goto("/laporan/penjualan?periode=bulan-ini");
  await expect(page.getByRole("heading", { name: /Ringkasan/ })).toBeVisible();
  const csv = await page.request.get("/api/v1/reports/penjualan?format=csv&periode=bulan-ini");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  await page.goto("/hpp");
  await expect(page.getByRole("heading", { level: 1, name: "HPP & parameter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan parameter" })).toHaveCount(0);
  await page.goto("/kas");
  await expect(page.getByRole("heading", { name: "Halaman atau dokumen tidak ditemukan" })).toBeVisible();
});

test("admin: halaman HPP menampilkan parameter yang bisa diubah", async ({ page }) => {
  await login(page, ADMIN ?? "");
  await page.goto("/hpp");
  await expect(page.getByLabel("Harga bensin (Rp/liter)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan parameter" })).toBeVisible();
  await expect(page.getByText("HPP per kemasan & laba")).toBeVisible();
});
