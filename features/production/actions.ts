"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/features/master/actions";
import { requireAction, requirePermission } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { createClient } from "@/lib/supabase/server";
import { productionDraftSchema, type ProductionDraftInput } from "@/lib/validation/production";

export type BatchFormState = FormState & { id?: string };

const uuid = z.uuid();

function dbError(e: { code?: string; message?: string }): FormState {
  if (e.code === "23514") return { error: "Nilai tidak memenuhi aturan (mis. output melebihi input)." };
  return { error: mapDbError(e).message };
}

const revalidate = (id?: string) => {
  revalidatePath("/produksi");
  if (id) revalidatePath(`/produksi/${id}`);
  revalidatePath("/stok", "layout");
};

// ---------------------------------------------------------------- draft (FR-PRD-01..05, FR-PRD-07)
// Kepala batch, baris input/output, dan biaya disimpan sekaligus (atomik) oleh save_production_draft. Produk baris
// ditentukan database dari jenis batch; klien hanya mengirim berat.
export async function saveProductionDraft(batchId: string | null, raw: ProductionDraftInput): Promise<BatchFormState> {
  await requireAction("produksi.kelola");
  if (batchId && !uuid.safeParse(batchId).success) return { error: "Data tidak valid" };
  const parsed = productionDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    // kunci galat baris: "inputs.0", "costs.1.amountRp" — editor menampilkannya di baris yang tepat
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    return { error: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_production_draft", {
    p_id: batchId,
    p_batch_type: d.batchType,
    p_date: d.businessDate,
    p_note: d.note ?? null,
    p_residue_kg: Number(d.residueKg),
    p_inputs: d.inputs.map(Number),
    p_outputs: d.outputs.map(Number),
    p_costs: d.costs.map((c) => ({ category: c.category, amount_rp: c.amountRp, source_ref: c.sourceRef ?? null, note: c.note ?? null })),
  });
  if (error || !data) return dbError(error ?? {});
  revalidate(data);
  return { ok: true, message: "Draft batch disimpan.", id: data };
}

export async function deleteProductionDraft(batchId: string): Promise<FormState> {
  await requireAction("produksi.kelola");
  if (!uuid.safeParse(batchId).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_production_draft", { p_id: batchId });
  if (error) return dbError(error);
  revalidate();
  return { ok: true, message: "Draft batch dihapus." };
}

// ---------------------------------------------------------------- konfirmasi (FR-PRD-06) — idempoten
export async function confirmProduction(batchId: string, idemKey: string): Promise<FormState> {
  await requirePermission("production.confirm");
  if (!uuid.safeParse(batchId).success || !uuid.safeParse(idemKey).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  try {
    const res = await withIdempotency(idemKey, "production.confirm", { batchId }, async () => {
      const { data, error } = await supabase.rpc("confirm_production", { p_id: batchId });
      if (error) throw error;
      return data;
    });
    if (res.state !== "done")
      return {
        error:
          res.state === "busy"
            ? "Konfirmasi sebelumnya masih diproses. Tunggu sebentar lalu muat ulang halaman."
            : "Permintaan ini sudah dipakai untuk data lain. Muat ulang halaman lalu coba lagi.",
      };
    const out = res.result as { doc_number: string; already: boolean };
    revalidate(batchId);
    return { ok: true, message: out.already ? `Sudah dikonfirmasi sebelumnya sebagai ${out.doc_number}.` : `Dikonfirmasi sebagai ${out.doc_number}. Stok & HPP diperbarui.` };
  } catch (e) {
    return dbError(e as { code?: string; message?: string });
  }
}
