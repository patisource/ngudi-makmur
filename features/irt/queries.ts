import "server-only";
import type { Period } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import type { IrtMovementType } from "@/lib/supabase/types";

// Bacaan modul IRT (M10). Semua lewat RLS: pengurus IRT & ketua membaca data IRT; pengurus IRT hanya melihat stok
// kelompok untuk produk yang dihubungkan ke bahan IRT.
export const IRT_MOVEMENT_LABEL: Record<IrtMovementType, string> = {
  bahan_masuk: "Bahan masuk",
  retur_kelompok: "Retur ke kelompok",
  produksi_bahan: "Dipakai produksi",
  produksi_hasil: "Hasil produksi",
  penjualan: "Penjualan",
  penjualan_batal: "Penjualan dibatalkan",
  koreksi: "Koreksi",
};

export async function irtSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("irt_settings").select("name, customer_id").eq("id", 1).maybeSingle();
  return data ?? { name: "IRT Sekar Arum", customer_id: null };
}

/** Bahan & produk beserta stok (view v_irt_stock). */
export async function irtStock(opts: { includeArchived?: boolean } = {}) {
  const supabase = await createClient();
  let q = supabase.from("v_irt_stock").select("*").order("kind").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  return q;
}

/** Produk kelompok yang bisa dihubungkan ke bahan IRT (pemilih di form bahan). */
export async function irtKelompokProducts() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("irt_kelompok_products");
  return data ?? [];
}

/** Stok kelompok untuk produk yang dihubungkan (baca saja; RLS menyaring). */
export async function irtKelompokStock() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_stock_balance").select("product_id, code, name, on_hand_kg, reserved_kg, available_kg").is("archived_at", null).order("code");
  return data ?? [];
}

export async function irtReceipts(limit = 100) {
  const supabase = await createClient();
  return supabase
    .from("irt_receipts")
    .select("id, doc_number, source, order_doc_number, business_date, supplier, note, total_value_rp, created_by_name, created_at, irt_receipt_lines(qty, value_rp, sort_order, irt_items(name, unit))")
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function irtBatches(limit = 100) {
  const supabase = await createClient();
  return supabase
    .from("irt_batches")
    .select("id, doc_number, status, business_date, note, input_value_rp, output_pcs, hpp_per_pcs, created_by_name, created_at, irt_batch_lines(role, qty, sort_order, irt_items(name, unit))")
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function irtBatch(id: string) {
  const supabase = await createClient();
  return supabase
    .from("irt_batches")
    .select("*, irt_batch_lines(id, item_id, role, qty, value_rp, sort_order, irt_items(name, unit, pack_size))")
    .eq("id", id)
    .maybeSingle();
}

export async function irtSales(limit = 100) {
  const supabase = await createClient();
  return supabase
    .from("irt_sales")
    .select("id, doc_number, status, business_date, buyer_name, total_pcs, total_rp, created_by_name, created_at")
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function irtSale(id: string) {
  const supabase = await createClient();
  return supabase
    .from("irt_sales")
    .select("*, irt_sale_lines(id, unit, qty_input, qty_pcs, price_snapshot, line_total_rp, sort_order, irt_items(name, pack_size))")
    .eq("id", id)
    .maybeSingle();
}

export async function irtAdjustments(limit = 50) {
  const supabase = await createClient();
  return supabase
    .from("irt_adjustments")
    .select("id, doc_number, business_date, direction, qty, reason, created_by_name, irt_items(name, unit)")
    .order("created_at", { ascending: false })
    .limit(limit);
}

/** Kartu stok satu item IRT: mutasi terbaru di atas. */
export async function irtStockCard(itemId: string, limit = 200) {
  const supabase = await createClient();
  return supabase
    .from("irt_movements")
    .select("id, movement_type, direction, qty, value_rp, balance_after, doc_number, business_date, note")
    .eq("item_id", itemId)
    .order("id", { ascending: false })
    .limit(limit);
}

/** Ringkasan periode (dashboard + CSV): per produk dan total. TANPA kas: omzet = nilai penjualan IRT. */
export async function irtReport(p: Period) {
  const supabase = await createClient();
  const [report, stock, receipts] = await Promise.all([
    supabase.rpc("irt_report", { p_from: p.from, p_to: p.to }),
    supabase.from("v_irt_stock").select("item_id, kind, name, unit, pack_size, on_hand, min_stock, below_min, archived_at").is("archived_at", null).order("name"),
    supabase.from("irt_receipts").select("total_value_rp").gte("business_date", p.from).lte("business_date", p.to),
  ]);
  const rows = report.data ?? [];
  const totals = rows.reduce(
    (t, r) => ({ produced: t.produced + Number(r.produced_pcs), sold: t.sold + Number(r.sold_pcs), omzet: t.omzet + Number(r.omzet_rp), hpp: t.hpp + Number(r.hpp_rp) }),
    { produced: 0, sold: 0, omzet: 0, hpp: 0 },
  );
  return {
    rows,
    totals: { ...totals, hppPerPcs: totals.produced > 0 ? Math.round(totals.hpp / totals.produced) : null, bahanRp: (receipts.data ?? []).reduce((s, r) => s + r.total_value_rp, 0) },
    stock: stock.data ?? [],
    error: report.error ?? stock.error ?? receipts.error,
  };
}
