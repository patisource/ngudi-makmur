"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/features/master/actions";
import { requireAction } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { runPosting, type PostingOutcome } from "@/lib/posting";
import { createClient } from "@/lib/supabase/server";
import { decisionSchema } from "@/lib/validation/cash";
import { adjustmentSchema, opnameSchema, reasonSchema, type AdjustmentInput, type OpnameInput } from "@/lib/validation/stock";

export type OpnameState = FormState & { id?: string };
const uuid = z.uuid();
const bad = (): FormState => ({ error: "Data tidak valid" });

function zodErrors(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
  return { error: error.issues[0]?.message ?? "Periksa kembali isian.", fieldErrors };
}

const revalidateStock = () => {
  revalidatePath("/stok", "layout");
  revalidatePath("/dashboard");
};
const done = (res: PostingOutcome, msg: (doc: string, already: boolean, r: Extract<PostingOutcome, { ok: true }>["result"]) => string): FormState => {
  if (!res.ok) return { error: res.error.message };
  revalidateStock();
  return { ok: true, message: msg(res.result.doc_number ?? "", res.result.already || res.replayed, res.result) };
};

// ---------------------------------------------------------------- stok opname (T9.1)
export async function saveOpname(opnameId: string | null, raw: OpnameInput): Promise<OpnameState> {
  await requireAction("stok.hitung");
  if (opnameId && !uuid.safeParse(opnameId).success) return bad();
  const parsed = opnameSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_opname_draft", {
    p_id: opnameId,
    p_date: parsed.data.businessDate,
    p_note: parsed.data.note ?? null,
    p_lines: parsed.data.lines.map((l) => ({ product_id: l.productId, physical_kg: l.physicalKg })),
  });
  if (error || !data) return { error: mapDbError(error ?? {}).message };
  revalidatePath("/stok/opname");
  return { ok: true, message: "Draft opname disimpan. Stok belum berubah sampai diposting.", id: data };
}

export async function deleteOpname(opnameId: string): Promise<FormState> {
  await requireAction("stok.hitung");
  if (!uuid.safeParse(opnameId).success) return bad();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_opname_draft", { p_id: opnameId });
  if (error) return { error: mapDbError(error).message };
  revalidatePath("/stok/opname");
  return { ok: true, message: "Draft opname dihapus." };
}

export async function postOpname(opnameId: string, key: string): Promise<FormState> {
  await requireAction("stok.hitung");
  if (!uuid.safeParse(opnameId).success || !uuid.safeParse(key).success) return bad();
  const supabase = await createClient();
  const res = await runPosting("opname.post", key, { opnameId }, () => supabase.rpc("post_opname", { p_id: opnameId }));
  return done(res, (doc, already, r) => (already ? `Sudah diposting sebagai ${doc}.` : `Opname diposting sebagai ${doc}: ${String(r.adjustments ?? 0)} penyesuaian stok.`));
}

// ---------------------------------------------------------------- koreksi stok (T9.2)
export async function requestAdjustment(raw: AdjustmentInput, key: string): Promise<FormState> {
  await requireAction("stok.hitung");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = adjustmentSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const res = await runPosting("stock_adjustments.request", key, d, () =>
    supabase.rpc("request_stock_adjustment", { p_product: d.productId, p_direction: d.direction, p_qty: Number(d.qtyKg), p_reason: d.reason, p_date: d.businessDate }),
  );
  return done(res, (doc) => `Koreksi ${doc} diajukan. Stok berubah setelah ketua menyetujui.`);
}

export async function decideAdjustment(adjustmentId: string, raw: { approve: boolean; note: string }, key: string): Promise<FormState> {
  await requireAction("stok.putuskan");
  if (!uuid.safeParse(adjustmentId).success || !uuid.safeParse(key).success) return bad();
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const supabase = await createClient();
  const res = await runPosting("stock_adjustments.decide", key, { adjustmentId, ...parsed.data }, () =>
    supabase.rpc("decide_stock_adjustment", { p_id: adjustmentId, p_approve: parsed.data.approve, p_note: parsed.data.note ?? null }),
  );
  return done(res, (doc, _a, r) => (r.status === "approved" ? `Koreksi ${doc} disetujui; mutasi stok dicatat.` : `Koreksi ${doc} ditolak.`));
}

// ---------------------------------------------------------------- pembatalan batch (T5.7, FR-PRD-08)
export async function requestBatchVoid(batchId: string, reason: string, key: string): Promise<FormState> {
  await requireAction("produksi.batal.ajukan");
  if (!uuid.safeParse(batchId).success || !uuid.safeParse(key).success) return bad();
  const parsed = reasonSchema.safeParse({ reason });
  if (!parsed.success) return zodErrors(parsed.error);
  const supabase = await createClient();
  const res = await runPosting("production.void_request", key, { batchId, reason: parsed.data.reason }, () =>
    supabase.rpc("request_production_void", { p_id: batchId, p_reason: parsed.data.reason }),
  );
  if (res.ok) revalidatePath(`/produksi/${batchId}`);
  return done(res, (doc) => `Pembatalan ${doc} diajukan; menunggu persetujuan ketua.`);
}

export async function decideBatchVoid(batchId: string, raw: { approve: boolean; note: string }, key: string): Promise<FormState> {
  await requireAction("produksi.batal.putuskan");
  if (!uuid.safeParse(batchId).success || !uuid.safeParse(key).success) return bad();
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const supabase = await createClient();
  const res = await runPosting("production.void_decide", key, { batchId, ...parsed.data }, () =>
    supabase.rpc("decide_production_void", { p_id: batchId, p_approve: parsed.data.approve, p_note: parsed.data.note ?? null }),
  );
  if (res.ok) {
    revalidatePath("/produksi");
    revalidatePath(`/produksi/${batchId}`);
  }
  return done(res, (doc, _a, r) => (r.status === "void" ? `${doc} dibatalkan; bahan dikembalikan dan hasil dikeluarkan dari stok.` : `Pembatalan ${doc} ditolak; batch tetap terkonfirmasi.`));
}
