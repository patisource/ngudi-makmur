import "server-only";
import { PAGE_SIZE } from "@/features/master/queries";
import { createClient } from "@/lib/supabase/server";
import type { ReceiptSource, ReceiptStatus } from "@/lib/supabase/types";

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = { draft: "Draft", confirmed: "Terkonfirmasi", void: "Dibatalkan" };
export const RECEIPT_SOURCE_LABEL: Record<ReceiptSource, string> = { anggota: "Anggota", luar: "Luar" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ReceiptFilter = { from?: string; to?: string; source?: ReceiptSource; memberId?: string; productId?: string; status?: ReceiptStatus; page: number };

/** Filter dari URL; nilai yang tidak sah diabaikan (FR-RCV-06). */
export function parseReceiptFilter(sp: Record<string, string | string[] | undefined>): ReceiptFilter {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const source = s("sumber");
  const status = s("status");
  return {
    from: DATE.test(s("dari") ?? "") ? s("dari") : undefined,
    to: DATE.test(s("sampai") ?? "") ? s("sampai") : undefined,
    source: source === "anggota" || source === "luar" ? source : undefined,
    memberId: UUID.test(s("anggota") ?? "") ? s("anggota") : undefined,
    productId: UUID.test(s("jenis") ?? "") ? s("jenis") : undefined,
    status: status === "draft" || status === "confirmed" || status === "void" ? status : undefined,
    page: Math.max(1, Math.min(10_000, Number.parseInt(s("page") ?? "1", 10) || 1)),
  };
}

export async function listReceipts(f: ReceiptFilter) {
  const supabase = await createClient();
  let query = supabase
    .from("receipts")
    .select("id, doc_number, status, business_date, source_type, supplier_name, weight_kg, acquisition_cost, members(code, name), products(code, name)", { count: "exact" })
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.from) query = query.gte("business_date", f.from);
  if (f.to) query = query.lte("business_date", f.to);
  if (f.source) query = query.eq("source_type", f.source);
  if (f.memberId) query = query.eq("member_id", f.memberId);
  if (f.productId) query = query.eq("product_id", f.productId);
  if (f.status) query = query.eq("status", f.status);
  return query;
}

/** Pilihan form & filter: anggota aktif dan produk mentah aktif (TK/PP; dirujuk lewat kategori, bukan nama). */
export async function receiptOptions() {
  const supabase = await createClient();
  const [members, products] = await Promise.all([
    supabase.from("members").select("id, code, name").is("archived_at", null).order("name"),
    supabase.from("products").select("id, code, name").eq("category", "mentah").is("archived_at", null).order("code"),
  ]);
  return { members: members.data ?? [], products: products.data ?? [] };
}

export async function getReceipt(id: string) {
  const supabase = await createClient();
  const { data: receipt, error } = await supabase
    .from("receipts")
    .select("*, members(code, name), products(code, name), attachments(id, storage_path, mime_type, size_bytes, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!receipt) return { receipt: null, proofs: [], error };

  // Bukti privat: signed URL 5 menit, dibuat setelah RLS memastikan pengguna boleh melihat dokumen induk (Security.md §8).
  const files = [...receipt.attachments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { data: signed } = files.length ? await supabase.storage.from("proofs").createSignedUrls(files.map((a) => a.storage_path), 300) : { data: [] };
  const proofs = files.map((a, i) => ({ ...a, url: signed?.[i]?.signedUrl ?? null }));
  return { receipt, proofs, error };
}
