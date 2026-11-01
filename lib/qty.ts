// Berat dalam kg tanpa float: dihitung sebagai bilangan bulat gram (CLAUDE.md aturan 4 — jangan menjumlah stok dengan float).
// Database menyimpan numeric(14,3) kg = gram bulat, jadi konversi ini tepat.

/** "1,5" / "1.5" / "2" → gram (1500 / 1500 / 2000). null bila bukan angka atau > 3 desimal. */
export function parseKgToGrams(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const grams = Number(int) * 1000 + Number(frac.padEnd(3, "0"));
  return Number.isSafeInteger(grams) ? grams : null;
}

/** gram → string kg untuk database ("1.5"). */
export const gramsToKgString = (grams: number) => (grams / 1000).toFixed(3).replace(/\.?0+$/, "");

/** Nilai numeric dari database ("1.500" atau 1.5) → gram. */
export const dbKgToGrams = (v: string | number) => parseKgToGrams(v) ?? 0;

const kgFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
/** gram → "1,5 kg" (format Indonesia). */
export const formatKg = (grams: number) => `${kgFmt.format(grams / 1000)} kg`;

/**
 * Jumlah kemasan × isi kemasan → gram. Jumlah kemasan boleh desimal sampai 3 digit (mis. 1,5 karung);
 * hasil dibulatkan ke gram terdekat (setengah ke atas) — sama dengan round(qty * content_kg, 3) di database.
 */
export function packagingToGrams(qty: string | number, contentKg: string | number): number | null {
  const qtyMilli = parseKgToGrams(qty); // qty × 1000
  const contentGrams = parseKgToGrams(contentKg);
  if (qtyMilli === null || contentGrams === null) return null;
  return Math.round((qtyMilli * contentGrams) / 1000);
}
