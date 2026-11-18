// Hitungan laba/HPP untuk laporan HPP (keputusan 19 Nov 2026). Uang rupiah bulat; persen 1 desimal.
// Margin = laba ÷ harga jual; markup = laba ÷ HPP. "Untung 50%" yang dimaksud pengguna = markup 50% (margin 33,3%).

/** Laba per unit; null bila salah satu tidak diketahui. */
export const profit = (price: number | null, cost: number | null) => (price == null || cost == null ? null : price - cost);

const pct1 = (n: number) => Math.round(n * 1000) / 10;

/** Margin % dari harga jual. */
export function marginPct(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null || price <= 0) return null;
  return pct1((price - cost) / price);
}

/** Markup % dari HPP. */
export function markupPct(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null || cost <= 0) return null;
  return pct1((price - cost) / cost);
}

/** Harga saran = HPP × (1 + markup target), dibulatkan ke atas ke kelipatan `step` rupiah (default Rp100). */
export function suggestedPrice(cost: number | null, targetMarkupPct: number | null, step = 100): number | null {
  if (cost == null || targetMarkupPct == null) return null;
  return Math.ceil((cost * (1 + targetMarkupPct / 100)) / step) * step;
}

/** HPP per unit kemasan = HPP/kg × isi kg + biaya kemasan & desain. */
export function packagingUnitCost(hppPerKg: number | null, contentGrams: number, packagingCostRp: number): number | null {
  if (hppPerKg == null) return null;
  return Math.round((hppPerKg * contentGrams) / 1000) + packagingCostRp;
}

export const pctText = (n: number | null) => (n == null ? "—" : `${String(n).replace(".", ",")}%`);
