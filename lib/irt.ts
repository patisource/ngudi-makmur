// Aturan tampilan & hitung modul IRT (PRD §4.10). Stok produk jadi disimpan dalam pcs; pack = isi pcs tetap per produk.
// Harga & total final tetap dihitung server (irt_create_sale); fungsi di sini hanya untuk pratinjau dan tampilan.
import type { IrtUnit } from "@/lib/supabase/types";

export const IRT_UNITS: readonly IrtUnit[] = ["kg", "gram", "liter", "ml", "butir", "pcs"];

const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

/** Jumlah bahan/produk dengan satuannya, mis. "2,5 kg", "10 butir", "30 pcs". */
export const formatIrtQty = (qty: number, unit: IrtUnit) => `${num.format(qty)} ${unit}`;

/** "125 pcs (12 pack + 5 pcs)" — bagian pack hanya bila produk punya isi pack dan stok ≥ 1 pack. */
export function pcsWithPack(pcs: number, packSize: number | null): string {
  const base = `${num.format(pcs)} pcs`;
  if (!packSize || pcs < packSize) return base;
  const packs = Math.floor(pcs / packSize);
  const rest = pcs - packs * packSize;
  return `${base} (${num.format(packs)} pack${rest > 0 ? ` + ${num.format(rest)} pcs` : ""})`;
}

export type SaleUnit = "pcs" | "pack";
export type PricedItem = { packSize: number | null; pricePcs: number | null; pricePack: number | null };

/** pcs yang keluar untuk satu baris jual; null bila jual per pack tapi produk tak punya isi pack. */
export function linePcs(unit: SaleUnit, qty: number, packSize: number | null): number | null {
  if (!Number.isInteger(qty) || qty < 1) return null;
  if (unit === "pcs") return qty;
  return packSize ? qty * packSize : null;
}

/** Harga satuan sama dengan server: pack = harga pack bila diisi, selain itu isi × harga pcs. */
export function unitPrice(unit: SaleUnit, item: PricedItem): number | null {
  if (unit === "pcs") return item.pricePcs;
  if (!item.packSize) return null;
  return item.pricePack ?? (item.pricePcs == null ? null : item.pricePcs * item.packSize);
}

/** Bilangan bulat positif dari isian ("3" → 3; "1,5"/"" → null). */
export function parseWhole(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 ? n : null;
}
