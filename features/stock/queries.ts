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

// ---------------------------------------------------------------- opname & koreksi stok (T9.1, T9.2)
export async function countableProducts() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_stock_balance").select("product_id, name, on_hand_kg, archived_at").order("code");
  return (data ?? []).filter((p) => !p.archived_at || p.on_hand_kg > 0).map((p) => ({ id: p.product_id, name: p.name, onHandKg: p.on_hand_kg }));
}

export async function listOpnames() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_opnames")
    .select("id, doc_number, status, business_date, note, created_by_name, posted_at, stock_opname_lines(diff_kg)")
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getOpname(id: string) {
  const supabase = await createClient();
  const [o, lines] = await Promise.all([
    supabase.from("stock_opnames").select("*").eq("id", id).maybeSingle(),
    supabase.from("stock_opname_lines").select("id, product_id, physical_kg, system_kg, diff_kg, value_rp, products(name, code)").eq("opname_id", id),
  ]);
  return { opname: o.data, lines: lines.data ?? [] };
}

export async function listAdjustments() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_adjustments")
    .select("id, doc_number, product_id, direction, qty_kg, reason, business_date, status, value_rp, requested_by, requested_by_name, decided_by_name, decision_note, products(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}
