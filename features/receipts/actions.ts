"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/features/master/actions";
import { requireAction } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { hasExif, PROOF_EXT, PROOF_MAX_BYTES, sniffMime } from "@/lib/files";
import { withIdempotency } from "@/lib/idempotency";
import { createClient } from "@/lib/supabase/server";
import type { PostingResult } from "@/lib/supabase/types";
import { proofPathSchema, receiptSchema, voidReasonSchema } from "@/lib/validation/receipt";

export type ReceiptFormState = FormState & { id?: string };

const KEYS = ["businessDate", "sourceType", "memberId", "supplierName", "productId", "weightKg", "moisturePct", "acquisitionCost", "note"];
const pick = (fd: FormData) => Object.fromEntries(KEYS.map((k) => [k, fd.get(k) ?? undefined]));
const uuid = z.uuid();

function dbError(e: { code?: string; message?: string }): FormState {
  if (e.code === "23514") return { error: "Nilai tidak memenuhi aturan (mis. berat harus lebih dari 0)." };
  return { error: mapDbError(e).message };
}

function idemError(state: "conflict" | "busy"): FormState {
  return state === "busy"
    ? { error: "Permintaan sebelumnya masih diproses. Tunggu sebentar lalu muat ulang halaman." }
    : { error: "Permintaan ini sudah dipakai untuk data lain. Muat ulang halaman lalu coba lagi." };
}

const revalidate = (id?: string) => {
  revalidatePath("/jagung-masuk");
  if (id) revalidatePath(`/jagung-masuk/${id}`);
  revalidatePath("/stok", "layout");
};

// ---------------------------------------------------------------- draft (FR-RCV-01, FR-RCV-02)
export async function saveReceiptDraft(receiptId: string | null, _prev: ReceiptFormState, fd: FormData): Promise<ReceiptFormState> {
  await requireAction("penerimaan.kelola");
  if (receiptId && !uuid.safeParse(receiptId).success) return { error: "Data tidak valid" };
  const parsed = receiptSchema.safeParse(pick(fd));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "_")] ??= issue.message;
    return { error: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  const r = parsed.data;
  // Hanya kolom isian; status, nomor, dan kolom konfirmasi diisi database (Security.md §5.2).
  const row = {
    business_date: r.businessDate,
    source_type: r.sourceType,
    member_id: r.memberId ?? null,
    supplier_name: r.supplierName ?? null,
    product_id: r.productId,
    weight_kg: Number(r.weightKg),
    moisture_pct: r.moisturePct ? Number(r.moisturePct) : null,
    acquisition_cost: r.acquisitionCost,
    note: r.note ?? null,
  };
  const supabase = await createClient();
  if (receiptId) {
    const { data, error } = await supabase.from("receipts").update(row).eq("id", receiptId).eq("status", "draft").select("id");
    if (error) return dbError(error);
    if (!data?.length) return { error: "Draft tidak ditemukan atau sudah dikonfirmasi." };
    revalidate(receiptId);
    return { ok: true, message: "Draft disimpan.", id: receiptId };
  }
  const { data, error } = await supabase.from("receipts").insert(row).select("id").single();
  if (error || !data) return dbError(error ?? {});
  revalidate();
  return { ok: true, message: "Draft disimpan.", id: data.id };
}

export async function deleteReceiptDraft(receiptId: string): Promise<FormState> {
  await requireAction("penerimaan.kelola");
  if (!uuid.safeParse(receiptId).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { data: files } = await supabase.from("attachments").select("storage_path").eq("receipt_id", receiptId);
  const { data, error } = await supabase.from("receipts").delete().eq("id", receiptId).eq("status", "draft").select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: "Draft tidak ditemukan atau sudah dikonfirmasi." };
  // Baris bukti terhapus bersama draft (cascade) → file tidak lagi terdaftar dan boleh dihapus dari Storage.
  if (files?.length) await supabase.storage.from("proofs").remove(files.map((f) => f.storage_path));
  revalidate();
  return { ok: true, message: "Draft dihapus." };
}

// ---------------------------------------------------------------- posting (FR-RCV-03, FR-RCV-05) — idempoten
export async function confirmReceipt(receiptId: string, idemKey: string): Promise<FormState> {
  await requireAction("penerimaan.kelola");
  if (!uuid.safeParse(receiptId).success || !uuid.safeParse(idemKey).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  try {
    const res = await withIdempotency(idemKey, "receipt.confirm", { receiptId }, async () => {
      const { data, error } = await supabase.rpc("confirm_receipt", { p_id: receiptId });
      if (error) throw error;
      return data;
    });
    if (res.state !== "done") return idemError(res.state);
    const out = res.result as PostingResult;
    revalidate(receiptId);
    return { ok: true, message: out.already ? `Sudah dikonfirmasi sebelumnya sebagai ${out.doc_number}.` : `Dikonfirmasi sebagai ${out.doc_number}. Stok bertambah.` };
  } catch (e) {
    return dbError(e as { code?: string; message?: string });
  }
}

export async function voidReceipt(receiptId: string, reason: string, idemKey: string): Promise<FormState> {
  await requireAction("penerimaan.kelola");
  if (!uuid.safeParse(receiptId).success || !uuid.safeParse(idemKey).success) return { error: "Data tidak valid" };
  const parsed = voidReasonSchema.safeParse(reason);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Alasan tidak valid", fieldErrors: { reason: parsed.error.issues[0]?.message ?? "" } };
  const supabase = await createClient();
  try {
    const res = await withIdempotency(idemKey, "receipt.void", { receiptId, reason: parsed.data }, async () => {
      const { data, error } = await supabase.rpc("void_receipt", { p_id: receiptId, p_reason: parsed.data });
      if (error) throw error;
      return data;
    });
    if (res.state !== "done") return idemError(res.state);
    revalidate(receiptId);
    return { ok: true, message: "Penerimaan dibatalkan; stok dikurangi kembali." };
  } catch (e) {
    return dbError(e as { code?: string; message?: string });
  }
}

// ---------------------------------------------------------------- bukti (Security.md §8)
// Peramban mengunggah langsung ke Storage (policy: admin kelompok, path uuid); server lalu memverifikasi isi file
// (magic bytes, ukuran, tanpa EXIF) sebelum mencatatnya. File yang gagal verifikasi dihapus.
export async function registerProof(receiptId: string, path: string): Promise<FormState> {
  await requireAction("penerimaan.kelola");
  if (!uuid.safeParse(receiptId).success || !proofPathSchema.safeParse(path).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const reject = async (error: string) => {
    await supabase.storage.from("proofs").remove([path]);
    return { error };
  };

  const { data: blob, error } = await supabase.storage.from("proofs").download(path);
  if (error || !blob) return { error: "File bukti tidak ditemukan. Coba unggah lagi." };
  if (blob.size > PROOF_MAX_BYTES) return reject("Ukuran bukti maksimal 5 MB.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || !path.endsWith(`.${PROOF_EXT[mime]}`)) return reject("Bukti harus foto (JPG, PNG, WebP) atau PDF.");
  if (hasExif(bytes, mime)) return reject("Foto masih berisi metadata lokasi. Unggah ulang lewat formulir ini.");

  const { error: insErr } = await supabase.from("attachments").insert({ receipt_id: receiptId, storage_path: path, mime_type: mime, size_bytes: bytes.length });
  if (insErr) return reject(dbError(insErr).error ?? "Bukti tidak dapat disimpan.");
  revalidate(receiptId);
  return { ok: true, message: "Bukti ditambahkan." };
}

export async function removeProof(attachmentId: string): Promise<FormState> {
  await requireAction("penerimaan.kelola");
  if (!uuid.safeParse(attachmentId).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("attachments").delete().eq("id", attachmentId).select("receipt_id, storage_path");
  if (error) return dbError(error);
  const row = data?.[0];
  if (!row) return { error: "Bukti tidak ditemukan." };
  await supabase.storage.from("proofs").remove([row.storage_path]);
  revalidate(row.receipt_id ?? undefined);
  return { ok: true, message: "Bukti dihapus." };
}
