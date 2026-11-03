import "server-only";
import { previousPeriod, type Period } from "@/lib/period";
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

export async function dashboardData(p: Period, opts: { finance?: boolean } = {}) {
  const supabase = await createClient();
  const prev = previousPeriod(p);
  const [kpi, prevKpi, daily, stock, sales, cash] = await Promise.all([
    supabase.rpc("rpt_kpi", { p_from: p.from, p_to: p.to }),
    supabase.rpc("rpt_kpi", { p_from: prev.from, p_to: prev.to }),
    supabase.rpc("rpt_daily", { p_from: p.from, p_to: p.to }),
    supabase.from("v_stock_balance").select("product_id, code, name, on_hand_kg, reserved_kg, available_kg, min_stock_kg, below_min").is("archived_at", null).order("code"),
    opts.finance ? supabase.rpc("rpt_sales", { p_from: p.from, p_to: p.to }) : Promise.resolve({ data: [], error: null }),
    opts.finance ? supabase.from("v_cash_balance").select("account_id, name, kind, balance_rp").is("archived_at", null).order("sort_order") : Promise.resolve({ data: [], error: null }),
  ]);
  const k = (kpi.data ?? {}) as unknown as Kpi;
  // Omzet per hari (penjualan + ongkir − retur, sama dengan rpt_kpi) & kg terjual per produk (bersih retur).
  const omzetByDay = new Map<string, number>();
  const soldByProduct = new Map<string, { name: string; grams: number }>();
  for (const r of sales.data ?? []) {
    omzetByDay.set(r.business_date, (omzetByDay.get(r.business_date) ?? 0) + Number(r.value_rp));
    if (r.kind !== "ongkir" && r.product_id) {
      const cur = soldByProduct.get(r.product_id) ?? { name: r.product_name, grams: 0 };
      cur.grams += dbKgToGrams(r.qty_kg);
      soldByProduct.set(r.product_id, cur);
    }
  }
  return {
    kpi: k,
    prev: { ...prev, kpi: (prevKpi.data ?? {}) as unknown as Kpi },
    daily: (daily.data ?? []).map((d) => ({
      day: d.day,
      receipts: dbKgToGrams(d.receipts_kg),
      flour: dbKgToGrams(d.flour_kg),
      sales: dbKgToGrams(d.sales_kg),
      omzet: omzetByDay.get(d.day) ?? 0,
    })),
    sold: [...soldByProduct.values()].filter((x) => x.grams > 0).sort((a, b) => b.grams - a.grams),
    cash: cash.data ?? [],
    stock: stock.data ?? [],
    error: kpi.error ?? daily.error ?? stock.error ?? sales.error ?? cash.error,
  };
}

export async function recentActivity() {
  const supabase = await createClient();
  // RLS: hanya ketua & admin teknis membaca audit; peran lain menerima daftar kosong (bagian disembunyikan).
  // Masuk/keluar, draft, master data & akun tidak ditampilkan di ringkasan (tetap ada di log audit lengkap).
  const { data } = await supabase
    .from("audit_logs")
    .select("id, at, actor_name, action, entity, entity_id, reason, before, after")
    .not("action", "in", '("auth.login","auth.logout","receipt.draft_created","receipt.draft_updated","order.draft_created","order.draft_updated","production.draft_created","production.draft_updated")')
    .not("entity", "in", "(members,customers,products,packagings,product_packagings,sales_channels,member_contacts,user,cash_account)")
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .limit(8);
  return data ?? [];
}
