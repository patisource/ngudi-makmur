"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/features/master/actions";
import { requireAction } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { formatRupiah } from "@/lib/money";
import { runPosting, type PostingOutcome } from "@/lib/posting";
import { createClient } from "@/lib/supabase/server";
import {
  irtAdjustSchema,
  irtBatchSchema,
  irtItemSchema,
  irtReasonSchema,
  irtReceiveSchema,
  irtSaleSchema,
  type IrtAdjustInput,
  type IrtBatchInput,
  type IrtItemInput,
  type IrtReceiveInput,
  type IrtSaleInput,
} from "@/lib/validation/irt";

// Server action modul IRT (M10). Alur setiap mutasi (CLAUDE.md): requireAction → schema.strict().parse →
// runPosting/rpc (database cek peran, kunci saldo, audit) → mapDbError → revalidatePath. TANPA kas.
export type IrtState = FormState & { id?: string };
const uuid = z.uuid();
const bad = (): FormState => ({ error: "Data tidak valid" });

function zodErrors(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
  return { error: error.issues[0]?.message ?? "Periksa kembali isian.", fieldErrors };
}
const refresh = () => revalidatePath("/irt", "layout");
type Ok = Extract<PostingOutcome, { ok: true }>["result"];
const done = (res: PostingOutcome, msg: (r: Ok, already: boolean) => string): IrtState => {
  if (!res.ok) return { error: res.error.message };
  refresh();
  return { ok: true, message: msg(res.result, res.result.already === true || res.replayed), id: typeof res.result.id === "string" ? res.result.id : undefined };
};

// ---------------------------------------------------------------- bahan & produk
export async function saveIrtItem(itemId: string | null, raw: IrtItemInput): Promise<IrtState> {
  await requireAction("irt.kelola");
  if (itemId && !uuid.safeParse(itemId).success) return bad();
  const parsed = irtItemSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  const produk = d.kind === "produk";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("irt_save_item", {
    p_id: itemId,
    p_kind: d.kind,
    p_name: d.name,
    p_unit: produk ? "pcs" : d.unit,
    p_pack_size: produk ? d.packSize : null,
    p_price_pcs: produk ? d.pricePcs : null,
    p_price_pack: produk ? d.pricePack : null,
    p_min_stock: Number(d.minStock),
    p_kelompok_product: produk ? null : d.kelompokProductId,
  });
  if (error || !data) return { error: mapDbError(error ?? {}).message };
  refresh();
  return { ok: true, message: itemId ? `${d.name} diperbarui.` : `${d.name} ditambahkan.`, id: data };
}

export async function archiveIrtItem(itemId: string, archive: boolean): Promise<FormState> {
  await requireAction("irt.kelola");
  if (!uuid.safeParse(itemId).success) return bad();
  const supabase = await createClient();
  const { error } = await supabase.rpc("irt_archive_item", { p_id: itemId, p_archive: archive });
  if (error) return { error: mapDbError(error).message };
  refresh();
  return { ok: true, message: archive ? "Diarsipkan." : "Diaktifkan kembali." };
}

// ---------------------------------------------------------------- bahan masuk (IBM)
export async function receiveIrt(raw: IrtReceiveInput, key: string): Promise<IrtState> {
  await requireAction("irt.kelola");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = irtReceiveSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const res = await runPosting("irt.receive", key, d, () =>
    supabase.rpc("irt_receive", {
      p_date: d.businessDate,
      p_supplier: d.supplier ?? null,
      p_note: d.note ?? null,
      p_lines: d.lines.map((l) => ({ item_id: l.itemId, qty: l.qty, value_rp: l.valueRp })),
    }),
  );
  return done(res, (r) => `Bahan masuk dicatat sebagai ${String(r.doc_number)} (nilai ${formatRupiah(Number(r.total_value_rp ?? 0))}).`);
}

// ---------------------------------------------------------------- produksi (IPR)
export async function saveIrtBatch(batchId: string | null, raw: IrtBatchInput): Promise<IrtState> {
  await requireAction("irt.kelola");
  if (batchId && !uuid.safeParse(batchId).success) return bad();
  const parsed = irtBatchSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("irt_save_batch_draft", {
    p_id: batchId,
    p_date: d.businessDate,
    p_note: d.note ?? null,
    p_inputs: d.inputs.map((l) => ({ item_id: l.itemId, qty: l.qty })),
    p_outputs: d.outputs.map((l) => ({ item_id: l.itemId, qty: l.qty })),
  });
  if (error || !data) return { error: mapDbError(error ?? {}).message };
  refresh();
  return { ok: true, message: "Draft produksi disimpan. Stok belum berubah sampai dikonfirmasi.", id: data };
}

export async function deleteIrtBatch(batchId: string): Promise<FormState> {
  await requireAction("irt.kelola");
  if (!uuid.safeParse(batchId).success) return bad();
  const supabase = await createClient();
  const { error } = await supabase.rpc("irt_delete_batch_draft", { p_id: batchId });
  if (error) return { error: mapDbError(error).message };
  refresh();
  return { ok: true, message: "Draft produksi dihapus." };
}

export async function confirmIrtBatch(batchId: string, key: string): Promise<IrtState> {
  await requireAction("irt.kelola");
  if (!uuid.safeParse(batchId).success || !uuid.safeParse(key).success) return bad();
  const supabase = await createClient();
  const res = await runPosting("irt.batch.confirm", key, { batchId }, () => supabase.rpc("irt_confirm_batch", { p_id: batchId }));
  return done(res, (r, already) =>
    already ? `Sudah dikonfirmasi sebagai ${String(r.doc_number)}.` : `Produksi dikonfirmasi sebagai ${String(r.doc_number)}. HPP ${formatRupiah(Number(r.hpp_per_pcs ?? 0))}/pcs.`,
  );
}

// ---------------------------------------------------------------- penjualan (IJL) — tanpa kas
export async function createIrtSale(raw: IrtSaleInput, key: string): Promise<IrtState> {
  await requireAction("irt.kelola");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = irtSaleSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const res = await runPosting("irt.sale.create", key, d, () =>
    supabase.rpc("irt_create_sale", {
      p_date: d.businessDate,
      p_buyer: d.buyer ?? null,
      p_note: d.note ?? null,
      p_lines: d.lines.map((l) => ({ item_id: l.itemId, unit: l.unit, qty: l.qty })),
    }),
  );
  return done(res, (r) => `Penjualan ${String(r.doc_number)} dicatat: ${String(r.total_pcs)} pcs, ${formatRupiah(Number(r.total_rp ?? 0))}.`);
}

export async function voidIrtSale(saleId: string, reason: string, key: string): Promise<FormState> {
  await requireAction("irt.kelola");
  if (!uuid.safeParse(saleId).success || !uuid.safeParse(key).success) return bad();
  const parsed = irtReasonSchema.safeParse({ reason });
  if (!parsed.success) return zodErrors(parsed.error);
  const supabase = await createClient();
  const res = await runPosting("irt.sale.void", key, { saleId, reason: parsed.data.reason }, () =>
    supabase.rpc("irt_void_sale", { p_id: saleId, p_reason: parsed.data.reason }),
  );
  return done(res, (r, already) => (already ? `${String(r.doc_number)} sudah dibatalkan.` : `${String(r.doc_number)} dibatalkan; stok produk dikembalikan.`));
}

// ---------------------------------------------------------------- koreksi stok (IKS)
export async function adjustIrt(raw: IrtAdjustInput, key: string): Promise<FormState> {
  await requireAction("irt.kelola");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = irtAdjustSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const res = await runPosting("irt.adjust", key, d, () =>
    supabase.rpc("irt_adjust", { p_date: d.businessDate, p_item: d.itemId, p_direction: d.direction, p_qty: Number(d.qty), p_reason: d.reason }),
  );
  return done(res, (r) => `Koreksi ${String(r.doc_number)} dicatat dan langsung berlaku.`);
}

// ---------------------------------------------------------------- hubungkan pelanggan kelompok = IRT
export async function linkIrtCustomer(customerId: string | null): Promise<FormState> {
  await requireAction("irt.hubungkan");
  if (customerId && !uuid.safeParse(customerId).success) return bad();
  const supabase = await createClient();
  const { error } = await supabase.rpc("irt_set_customer", { p_customer: customerId });
  if (error) return { error: mapDbError(error).message };
  revalidatePath("/master/pelanggan");
  return {
    ok: true,
    message: customerId ? "Pelanggan IRT dihubungkan. Tepung pesanannya masuk ke bahan IRT saat diserahkan." : "Hubungan pelanggan IRT dilepas.",
  };
}
