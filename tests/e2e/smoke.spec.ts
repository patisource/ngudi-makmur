import { expect, test } from "@playwright/test";

// Smoke tanpa akun: halaman login terbaca (termasuk ponsel 360 px), halaman bersesi dialihkan ke login,
// API menolak tanpa sesi dengan bentuk respons PRD §8.1.

test("halaman login tampil dan terbaca tanpa geser horizontal", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Kata sandi")).toBeVisible();
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("login salah memberi pesan generik (tidak membocorkan email terdaftar)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("bukan.akun@contoh.test");
  await page.getByLabel("Kata sandi").fill("salah-sekali-123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Email atau kata sandi salah.")).toBeVisible();
});

for (const path of ["/dashboard", "/penjualan", "/kas/buku", "/laporan/penjualan", "/stok/opname", "/akun"]) {
  test(`tanpa sesi ${path} dialihkan ke login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`));
  });
}

test("API posting tanpa sesi → 401 JSON { data: null, error }", async ({ request }) => {
  const id = "3f1c2b8e-5d6a-4c1e-9f0a-1b2c3d4e5f60";
  const res = await request.post(`/api/v1/orders/${id}/payments`, { headers: { "Idempotency-Key": id }, data: { amountRp: 1 } });
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ data: null, error: { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." } });
});
