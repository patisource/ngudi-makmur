import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MovementType } from "@/lib/supabase/types";

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  receipt_in: "Jagung masuk",
  production_out: "Bahan produksi",
  production_in: "Hasil produksi",
  sale_out: "Serah barang",
  return_in: "Retur",
  opname_adjust: "Stok opname",
  correction: "Koreksi",
  reversal: "Pembalikan",
};
export const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABEL) as MovementType[];

export async function listStockBalances() {
  const supabase = await createClient();
  return supabase.from("v_stock_balance").select("*").order("code");
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Kartu stok (FR-STK-02): mutasi satu produk, terbaru di atas; saldo berjalan = balance_after_kg saat posting.
export async function listStockCard(productId: string, f: { from?: unknown; to?: unknown; type?: unknown; limit?: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("stock_movements")
    .select("id, movement_type, direction, qty_kg, value_rp, balance_after_kg, doc_number, business_date, note, created_at")
    .eq("product_id", productId)
    .order("id", { ascending: false })
    .limit(f.limit ?? 200);
  if (isDate(f.from)) q = q.gte("business_date", f.from);
  if (isDate(f.to)) q = q.lte("business_date", f.to);
  if (typeof f.type === "string" && (MOVEMENT_TYPES as string[]).includes(f.type)) q = q.eq("movement_type", f.type as MovementType);
  return q;
}

export async function getStockProduct(productId: string) {
  const supabase = await createClient();
  return supabase.from("v_stock_balance").select("*").eq("product_id", productId).maybeSingle();
}
