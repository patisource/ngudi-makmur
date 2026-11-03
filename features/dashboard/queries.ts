import "server-only";
import type { Period } from "@/lib/period";
import { dbKgToGrams } from "@/lib/qty";
import { createClient } from "@/lib/supabase/server";

// Data dashboard (FR-DASH, PRD §5.9) dari fungsi SQL yang sama dengan laporan (rpt_kpi, rpt_daily, rpt_stock),
// jadi angka dashboard = angka laporan. RLS membatasi per peran (operator: tanpa penjualan/kas).
export type Kpi = {
  days: number;
  omzet_rp: number;
  returns_rp: number;
  orders_delivered: number;
  sold_kg: number;
  raw_share_pct: number | null;
  digital_share_pct: number | null;
  receipts_kg: number;
  receipts_rp: number;
  receipts_count: number;
  flour_kg: number;
  batches: number;
  loss_pct: number | null;
  cash_in_rp: number;
  cash_out_rp: number;
  cash_balance_rp: number;
  receivable_rp: number;
  receivable_orders: number;
  credit_rp: number;
  pending_payments: number;
  pending_corrections: number;
  pending_returns: number;
  pending_batch_voids: number;
  orders_to_deliver: number;
  stock_below_min: number;
};

export const FLOUR_TARGET_KG_PER_DAY = 50; // target proposal (G6), pembanding — bukan angka yang diisi otomatis

export async function dashboardData(p: Period) {
  const supabase = await createClient();
  const [kpi, daily, stock] = await Promise.all([
    supabase.rpc("rpt_kpi", { p_from: p.from, p_to: p.to }),
    supabase.rpc("rpt_daily", { p_from: p.from, p_to: p.to }),
    supabase.from("v_stock_balance").select("product_id, code, name, on_hand_kg, reserved_kg, available_kg, min_stock_kg, below_min").is("archived_at", null).order("code"),
  ]);
  const k = (kpi.data ?? {}) as unknown as Kpi;
  return {
    kpi: k,
    daily: (daily.data ?? []).map((d) => ({ day: d.day, receipts: dbKgToGrams(d.receipts_kg), flour: dbKgToGrams(d.flour_kg), sales: dbKgToGrams(d.sales_kg) })),
    stock: stock.data ?? [],
    error: kpi.error ?? daily.error ?? stock.error,
  };
}

export async function recentActivity() {
  const supabase = await createClient();
  // RLS: hanya ketua & admin teknis membaca audit; peran lain menerima daftar kosong (bagian disembunyikan).
  const { data } = await supabase.from("audit_logs").select("id, at, actor_name, action, entity, reason").order("at", { ascending: false }).limit(8);
  return data ?? [];
}
