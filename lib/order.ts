// Pratinjau pesanan (FR-SAL-03) untuk form — hanya tampilan. Angka sah (harga snapshot, kg, total) dihitung
// save_order_draft di database dengan rumus yang sama: gross = round(qty × harga), kg = round(qty × isi kg, 3).
// Berat dalam gram bulat & uang dalam BigInt saat dikalikan, agar tidak ada galat float (CLAUDE.md aturan 4).
import { packagingToGrams, parseKgToGrams } from "@/lib/qty";
import type { OrderPaymentStatus, OrderStatus } from "@/lib/supabase/types";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  confirmed: "Terkonfirmasi",
  delivered: "Diserahkan",
  cancelled: "Dibatalkan",
};
export const ORDER_STATUS_TONE: Record<OrderStatus, "neutral" | "ok" | "warn" | "err" | "info"> = {
  draft: "neutral",
  confirmed: "info",
  delivered: "ok",
  cancelled: "err",
};
export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  unpaid: "Belum bayar",
  partial: "Sebagian",
  paid: "Lunas",
  refunded: "Dikembalikan",
};
// StyleGuide §2.3: partial = warning, paid = accent; unpaid baru merah bila jatuh tempo (belum ada di v1) → netral.
export const PAYMENT_STATUS_TONE: Record<OrderPaymentStatus, "neutral" | "ok" | "warn" | "err" | "info"> = {
  unpaid: "neutral",
  partial: "warn",
  paid: "ok",
  refunded: "neutral",
};

/** Berat baris dalam gram: kemasan → qty × isi kg; kg curah (contentKg null) → qty itu sendiri. */
export function itemGrams(qty: string, contentKg: string | number | null): number | null {
  return contentKg === null ? parseKgToGrams(qty) : packagingToGrams(qty, contentKg);
}

/** Nilai kotor baris = round(qty × harga satuan) rupiah. null bila qty tidak valid. */
export function lineGross(qty: string, price: number): number | null {
  const milli = parseKgToGrams(qty); // qty × 1000, bilangan bulat
  if (milli === null || !Number.isSafeInteger(price) || price < 0) return null;
  return Number((BigInt(milli) * BigInt(price) + BigInt(500)) / BigInt(1000));
}

export type PreviewItem = { qty: string; price: number | null; contentKg: string | number | null; discountRp: number };
export type PreviewLine = { grams: number; grossRp: number; totalRp: number; missingPrice: boolean; discountTooHigh: boolean };
export type OrderSummary = { lines: PreviewLine[]; subtotalRp: number; discountRp: number; shippingRp: number; totalRp: number; grams: number; complete: boolean };

export function summarizeOrder(items: PreviewItem[], shippingRp: number): OrderSummary {
  let subtotalRp = 0;
  let discountRp = 0;
  let grams = 0;
  let complete = true;
  const lines = items.map((it) => {
    const g = itemGrams(it.qty, it.contentKg) ?? 0;
    const gross = it.price === null ? 0 : (lineGross(it.qty, it.price) ?? 0);
    const missingPrice = it.price === null;
    const discountTooHigh = it.discountRp > gross;
    if (missingPrice || discountTooHigh || g <= 0) complete = false;
    subtotalRp += gross;
    discountRp += Math.min(it.discountRp, gross);
    grams += g;
    return { grams: g, grossRp: gross, totalRp: Math.max(0, gross - it.discountRp), missingPrice, discountTooHigh };
  });
  return { lines, subtotalRp, discountRp, shippingRp, totalRp: subtotalRp - discountRp + shippingRp, grams, complete };
}
