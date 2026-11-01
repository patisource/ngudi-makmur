import "server-only";
import { PAGE_SIZE } from "@/features/master/queries";
import { createClient } from "@/lib/supabase/server";
import type { ProductionStatus } from "@/lib/supabase/types";

export const BATCH_STATUS_LABEL: Record<ProductionStatus, string> = {
  draft: "Draft",
  confirmed: "Terkonfirmasi",
  pending_void: "Menunggu pembatalan",
  void: "Dibatalkan",
};
export const BATCH_STATUS_TONE: Record<ProductionStatus, "neutral" | "ok" | "warn" | "err"> = { draft: "neutral", confirmed: "ok", pending_void: "warn", void: "err" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type BatchFilter = { from?: string; to?: string; type?: string; status?: ProductionStatus; page: number };

export function parseBatchFilter(sp: Record<string, string | string[] | undefined>): BatchFilter {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const status = s("status");
  return {
    from: DATE.test(s("dari") ?? "") ? s("dari") : undefined,
    to: DATE.test(s("sampai") ?? "") ? s("sampai") : undefined,
    type: /^[a-z_]{3,40}$/.test(s("jenis") ?? "") ? s("jenis") : undefined,
    status: status && status in BATCH_STATUS_LABEL ? (status as ProductionStatus) : undefined,
    page: Math.max(1, Math.min(10_000, Number.parseInt(s("page") ?? "1", 10) || 1)),
  };
}

export async function listBatches(f: BatchFilter) {
  const supabase = await createClient();
  let query = supabase
    .from("production_batches")
    .select("id, doc_number, status, batch_type, business_date, operator_name, input_kg, output_kg, loss_kg, hpp_per_kg, batch_type_rules(name)", { count: "exact" })
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.from) query = query.gte("business_date", f.from);
  if (f.to) query = query.lte("business_date", f.to);
  if (f.type) query = query.eq("batch_type", f.type);
  if (f.status) query = query.eq("status", f.status);
  return query;
}

/** Jenis batch + nama produk input/output (dari master, bukan hardcode) + rata-rata biaya bahan input & stok tersedia. */
export async function batchTypeOptions() {
  const supabase = await createClient();
  const [{ data: rules }, { data: stock }] = await Promise.all([
    supabase
      .from("batch_type_rules")
      .select("batch_type, name, max_loss_pct, input:products!batch_type_rules_input_product_id_fkey(id, code, name), output:products!batch_type_rules_output_product_id_fkey(id, code, name)")
      .order("batch_type"),
    supabase.from("v_stock_balance").select("product_id, available_kg, avg_cost_per_kg"),
  ]);
  const byProduct = new Map((stock ?? []).map((s) => [s.product_id, s]));
  return (rules ?? []).map((r) => ({
    batchType: r.batch_type,
    name: r.name,
    maxLossPct: r.max_loss_pct,
    input: r.input,
    output: r.output,
    inputAvailableKg: r.input ? (byProduct.get(r.input.id)?.available_kg ?? 0) : 0,
    inputAvgCost: r.input ? (byProduct.get(r.input.id)?.avg_cost_per_kg ?? null) : null,
  }));
}
export type BatchTypeOption = Awaited<ReturnType<typeof batchTypeOptions>>[number];

export async function getBatch(id: string) {
  const supabase = await createClient();
  const [batch, lines, costs] = await Promise.all([
    supabase.from("production_batches").select("*, batch_type_rules(name, max_loss_pct)").eq("id", id).maybeSingle(),
    supabase.from("production_lines").select("id, direction, qty_kg, value_rp, sort_order, products(code, name)").eq("batch_id", id).order("sort_order"),
    supabase.from("batch_costs").select("id, category, amount_rp, source_ref, note, sort_order").eq("batch_id", id).order("sort_order"),
  ]);
  return { batch: batch.data, lines: lines.data ?? [], costs: costs.data ?? [], error: batch.error };
}
