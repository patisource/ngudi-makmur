import { expect, test, type Page } from "@playwright/test";

// Modul IRT Sekar Arum (M10) di lingkungan DEMO: pengurus IRT mendarat di Dashboard IRT (tanpa kas), mencatat
// penjualan per pack, stok berkurang; admin kelompok tidak bisa membuka modul IRT; ketua hanya membaca.
// Butuh seed_demo.sql + E2E_IRT_EMAIL, E2E_ADMIN_EMAIL, E2E_KETUA_EMAIL, E2E_PASSWORD. Jangan arahkan ke data nyata.
const IRT = process.env.E2E_IRT_EMAIL;
const ADMIN = process.env.E2E_ADMIN_EMAIL;
const KETUA = process.env.E2E_KETUA_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD ?? "";
test.skip(!IRT || !ADMIN || !KETUA || !PASSWORD, "Isi E2E_IRT_EMAIL, E2E_ADMIN_EMAIL, E2E_KETUA_EMAIL, E2E_PASSWORD (lingkungan DEMO)");
test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test("pengurus IRT: mendarat di Dashboard IRT tanpa kas, hanya menu IRT", async ({ page }) => {
  await login(page, IRT ?? "");
  await expect(page).toHaveURL(/\/irt$/);
  await expect(page.getByRole("heading", { level: 1, name: "IRT Sekar Arum" })).toBeVisible();
  await expect(page.getByText("Omzet penjualan")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Menu utama" });
  await expect(nav.getByRole("link", { name: "Pembayaran & kas" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Penjualan IRT" })).toHaveCount(1);
  await page.goto("/kas");
  await expect(page).toHaveURL(/\/403/);
});

test("pengurus IRT: jual 1 pack kue → IJL, stok berkurang 10 pcs", async ({ page }, info) => {
  test.skip(info.project.name !== "laptop", "transaksi cukup sekali (laptop)");
  await login(page, IRT ?? "");
  await page.goto("/irt/stok");
  const row = page.getByRole("row", { name: /Kue kering jagung/ });
  const before = Number((await row.getByRole("cell").nth(1).innerText()).match(/^([\d.]+) pcs/)?.[1].replace(/\./g, "") ?? "NaN");

  await page.goto("/irt/penjualan/baru");
  await page.getByLabel("Produk 1").selectOption({ label: "Kue kering jagung" });
  await page.getByRole("button", { name: /Per pack/ }).click();
  await page.getByLabel("Jumlah pack").fill("1");
  await expect(page.getByText("Rp14.000").first()).toBeVisible();
  await page.getByRole("button", { name: "Simpan penjualan" }).click();
  await expect(page).toHaveURL(/\/irt\/penjualan\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: /^IJL-/ })).toBeVisible();

  await page.goto("/irt/stok");
  const after = Number((await page.getByRole("row", { name: /Kue kering jagung/ }).getByRole("cell").nth(1).innerText()).match(/^([\d.]+) pcs/)?.[1].replace(/\./g, "") ?? "NaN");
  expect(after).toBe(before - 10);
});

test("admin kelompok tidak bisa membuka modul IRT; ketua membaca tanpa tombol catat", async ({ browser }) => {
  const admin = await browser.newPage();
  await login(admin, ADMIN ?? "");
  await admin.goto("/irt");
  await expect(admin).toHaveURL(/\/403/);
  await admin.close();

  const ketua = await browser.newPage();
  await login(ketua, KETUA ?? "");
  await ketua.goto("/irt/penjualan");
  await expect(ketua.getByRole("heading", { level: 1, name: "Penjualan IRT" })).toBeVisible();
  await expect(ketua.getByRole("link", { name: "Catat penjualan" })).toHaveCount(0);
  await ketua.close();
});
