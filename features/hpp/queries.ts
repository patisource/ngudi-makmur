import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HppSettings } from "@/lib/supabase/types";

/** Parameter HPP kelompok (satu baris). RLS: admin kelompok, operator produksi, ketua. */
export async function hppSettings(): Promise<HppSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("hpp_settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

/** Ringkasan HPP kelompok untuk periode: batch + rincian biaya, kemasan + nilai stok, riwayat hitung ulang. */
export async function hppOverview(from: string, to: string) {
  const supabase = await createClient();
  const [batches, packs, stock, runs] = await Promise.all([
    supabase
      .from("production_batches")
      .select("id, batch_type, input_kg, output_kg, material_cost, other_cost, fixed_cost_rp, total_cost, batch_type_rules(name, input_product_id, output_product_id), batch_costs(category, amount_rp)")
      .in("status", ["confirmed", "pending_void"])
      .gte("business_date", from)
      .lte("business_date", to)
      .limit(5000),
    supabase
      .from("product_packagings")
      .select("id, product_id, content_kg, default_price, cost_rp, products(code, name, default_price_per_kg), packagings(name)")
      .is("archived_at", null)
      .order("content_kg"),
    supabase.from("v_stock_balance").select("product_id, code, name, on_hand_kg, avg_cost_per_kg").is("archived_at", null).order("code"),
    supabase.from("hpp_recalc_runs").select("id, reason, run_at").order("id", { ascending: false }).limit(5),
  ]);
  return {
    batches: batches.data ?? [],
    packs: packs.data ?? [],
    stock: stock.data ?? [],
    runs: runs.data ?? [],
    error: batches.error ?? packs.error ?? stock.error,
  };
}
