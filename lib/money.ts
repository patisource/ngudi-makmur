// Uang = integer rupiah (CLAUDE.md aturan 4). Batas mengikuti Security.md §5.2: 0 ≤ x ≤ 10.000.000.000.
export const MAX_RUPIAH = 10_000_000_000;

/** "Rp 10.000" / "10000" / "10.000" → 10000. null bila kosong, berdesimal, negatif, atau melebihi batas. */
export function parseRupiah(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/^rp\.?\s*/i, "").replace(/[.\s]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n <= MAX_RUPIAH ? n : null;
}

const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
/** 10000 → "Rp10.000". */
export const formatRupiah = (n: number) => `Rp${fmt.format(n)}`;
