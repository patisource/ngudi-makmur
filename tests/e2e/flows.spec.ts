import { expect, test, type Page } from "@playwright/test";

// Alur lintas peran di lingkungan DEMO (T9.4): koreksi stok (operator → ketua), transfer antar akun, ganti kata sandi,
// halaman 404. Butuh seed_demo.sql + E2E_*; tanpa variabel itu dilewati. JANGAN arahkan ke proyek data nyata.
const ADMIN = process.env.E2E_ADMIN_EMAIL;
const KETUA = process.env.E2E_KETUA_EMAIL;
const OPERATOR = process.env.E2E_OPERATOR_EMAIL;
const TEKNIS = process.env.E2E_TEKNIS_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD ?? "";
test.skip(!ADMIN || !KETUA || !OPERATOR || !PASSWORD, "Isi E2E_ADMIN_EMAIL, E2E_KETUA_EMAIL, E2E_OPERATOR_EMAIL, E2E_PASSWORD (lingkungan DEMO)");
test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

const reason = `Uji e2e koreksi ${Date.now()}`;

test("operator mengajukan koreksi stok → ketua menyetujui lewat dialog", async ({ browser }, info) => {
  test.skip(info.project.name !== "laptop", "alur transaksi cukup sekali (laptop)");
  const op = await browser.newPage();
  await login(op, OPERATOR ?? "");
  await op.goto("/stok/koreksi");
  await op.getByText("Tambah stok", { exact: true }).click();
  await op.getByLabel("Berat (kg) *").fill("0,5");
  await op.getByLabel("Alasan *").fill(reason);
  await op.getByRole("button", { name: "Ajukan koreksi" }).click();
  await expect(op.getByRole("status").filter({ hasText: /Koreksi ADJ-.* diajukan/ }).first()).toBeVisible();
  await op.close();

  const ketua = await browser.newPage();
  await login(ketua, KETUA ?? "");
  await ketua.goto("/stok/koreksi");
  const card = ketua.getByText(reason).locator("xpath=ancestor::*[.//button][1]");
  await card.getByRole("button", { name: "Setujui koreksi" }).click();
  const dialog = ketua.getByRole("dialog");
  await expect(dialog).toContainText("tidak bisa dibatalkan");
  await dialog.getByRole("button", { name: "Setujui koreksi" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(ketua.getByText(reason).locator("xpath=ancestor::*[.//*[contains(., 'Disetujui')]][1]")).toContainText("Disetujui");
  await ketua.close();
});

test("admin: transfer antar akun lewat dialog → toast nomor TRF", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop", "alur transaksi cukup sekali (laptop)");
  await login(page, ADMIN ?? "");
  await page.goto("/kas");
  await page.getByRole("button", { name: "Transfer antar akun" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ke akun *").selectOption({ index: 1 });
  await dialog.getByLabel("Jumlah (Rp) *").fill("1000");
  await dialog.getByLabel("Keterangan *").fill("Uji e2e setor tunai ke bank");
  await dialog.getByRole("button", { name: "Simpan transfer" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /Transfer TRF-.* dicatat/ })).toBeVisible();
});

test("ganti kata sandi sendiri (FR-AUTH-07) lalu kembalikan", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop" || !TEKNIS, "butuh E2E_TEKNIS_EMAIL; cukup sekali (laptop)");
  const temp = `uji-${Date.now()}-sandi`;
  await login(page, TEKNIS ?? "");
  await page.goto("/akun");
  // terlalu pendek → ditolak sebelum menyentuh Supabase
  await page.getByLabel("Kata sandi saat ini *", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Kata sandi baru *", { exact: true }).fill("pendek");
  await page.getByLabel("Ulangi kata sandi baru *", { exact: true }).fill("pendek");
  await page.getByRole("button", { name: "Ganti kata sandi" }).click();
  await expect(page.getByText(/Minimal 8 karakter|minimal 8/i).first()).toBeVisible();

  await page.getByLabel("Kata sandi baru *", { exact: true }).fill(temp);
  await page.getByLabel("Ulangi kata sandi baru *", { exact: true }).fill(temp);
  await page.getByRole("button", { name: "Ganti kata sandi" }).click();
  await expect(page.getByText("Kata sandi diganti.", { exact: false })).toBeVisible();

  // masuk ulang dengan sandi baru, lalu kembalikan agar akun DEMO tetap bisa dipakai
  await page.context().clearCookies();
  await login(page, TEKNIS ?? "", temp);
  await page.goto("/akun");
  await page.getByLabel("Kata sandi saat ini *", { exact: true }).fill(temp);
  await page.getByLabel("Kata sandi baru *", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Ulangi kata sandi baru *", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ganti kata sandi" }).click();
  await expect(page.getByText("Kata sandi diganti.", { exact: false })).toBeVisible();
});

test("dokumen yang tidak ada → halaman 404 berbahasa Indonesia", async ({ page }) => {
  await login(page, ADMIN ?? "");
  await page.goto("/penjualan/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Halaman atau dokumen tidak ditemukan" })).toBeVisible();
  await page.goto("/kas/tidak-ada");
  await expect(page.getByRole("heading", { name: "Halaman atau dokumen tidak ditemukan" })).toBeVisible();
});
