"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/features/master/actions";
import { postCancelOrder, postConfirmOrder, postFulfillOrder, postVerifyReturn, type PostingOutcome } from "@/features/orders/posting";
import { requireAction } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cancelOrderSchema, fulfillOrderSchema, orderDraftSchema, quickCustomerSchema, returnSchema, type FulfillOrderInput, type OrderDraftInput, type ReturnInput } from "@/lib/validation/order";

export type OrderFormState = FormState & { id?: string };
export type QuickCustomerState = FormState & { customer?: { id: string; name: string; type: "perorangan" | "usaha" } };

const uuid = z.uuid();

function dbError(e: { code?: string; message?: string }): FormState {
  if (e.code === "23514") return { error: "Nilai tidak memenuhi aturan (mis. diskon melebihi nilai baris)." };
  return { error: mapDbError(e).message };
}

const revalidate = (id?: string) => {
  revalidatePath("/penjualan");
  if (id) revalidatePath(`/penjualan/${id}`);
  revalidatePath("/stok", "layout");
};

const fromPosting = (res: PostingOutcome, okMessage: (docNumber: string, already: boolean) => string): FormState =>
  res.ok ? { ok: true, message: okMessage(res.result.doc_number ?? "", res.result.already || res.replayed) } : { error: res.error.message };

// ---------------------------------------------------------------- draft (FR-SAL-02, FR-SAL-02a, FR-SAL-03)
// Klien hanya mengirim produk, kemasan, jumlah, diskon, ongkir. Harga disalin dari katalog dan total dihitung database.
export async function saveOrderDraft(orderId: string | null, raw: OrderDraftInput): Promise<OrderFormState> {
  await requireAction("penjualan.kelola");
  if (orderId && !uuid.safeParse(orderId).success) return { error: "Data tidak valid" };
  const parsed = orderDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    return { error: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_order_draft", {
    p_id: orderId,
    p_date: d.businessDate,
    p_customer: d.customerId,
    p_channel: d.channel,
    p_note: d.note ?? null,
    p_shipping_rp: d.shippingRp,
    p_items: d.items.map((it) => ({ product_id: it.productId, product_packaging_id: it.packagingId, qty: it.qty, discount_rp: it.discountRp })),
  });
  if (error || !data) return dbError(error ?? {});
  revalidate(data);
  return { ok: true, message: "Draft pesanan disimpan.", id: data };
}

export async function deleteOrderDraft(orderId: string): Promise<FormState> {
  await requireAction("penjualan.kelola");
  if (!uuid.safeParse(orderId).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_order_draft", { p_id: orderId });
  if (error) return dbError(error);
  revalidate();
  return { ok: true, message: "Draft pesanan dihapus." };
}

// ---------------------------------------------------------------- transisi status — idempoten (Security.md §6)
export async function confirmOrder(orderId: string, idemKey: string): Promise<FormState> {
  await requireAction("penjualan.kelola");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(idemKey).success) return { error: "Data tidak valid" };
  const res = await postConfirmOrder(orderId, idemKey);
  if (res.ok) revalidate(orderId);
  return fromPosting(res, (doc, already) => (already ? `Sudah dikonfirmasi sebelumnya sebagai ${doc}.` : `Dikonfirmasi sebagai ${doc}${res.ok && res.result.total_rp != null ? ` · tagihan ${formatRupiah(res.result.total_rp)}` : ""}. Stok direservasi.`));
}

export async function cancelOrder(orderId: string, reason: string, idemKey: string): Promise<FormState> {
  await requireAction("penjualan.kelola");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(idemKey).success) return { error: "Data tidak valid" };
  const parsed = cancelOrderSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Alasan tidak valid" };
  const res = await postCancelOrder(orderId, parsed.data.reason, idemKey);
  if (res.ok) revalidate(orderId);
  return fromPosting(res, (doc, already) => (already ? `${doc} sudah dibatalkan sebelumnya.` : `${doc} dibatalkan. Reservasi stok dilepas.`));
}

export async function fulfillOrder(orderId: string, raw: FulfillOrderInput, idemKey: string): Promise<FormState> {
  await requireAction("penjualan.kelola");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(idemKey).success) return { error: "Data tidak valid" };
  const parsed = fulfillOrderSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data serah barang tidak valid" };
  const res = await postFulfillOrder(orderId, parsed.data, idemKey);
  if (res.ok) revalidate(orderId);
  return fromPosting(res, (doc, already) => (already ? `${doc} sudah diserahkan sebelumnya.` : `${doc} diserahkan. Stok keluar dicatat.`));
}

// ---------------------------------------------------------------- retur (FR-SAL-10, T6.7, PRD Q7)
// Dicatat admin kelompok sebagai draft (tanpa efek stok); stok baru bertambah saat ketua memverifikasi fisik.
export async function createReturn(orderId: string, raw: ReturnInput): Promise<FormState> {
  await requireAction("retur.catat");
  if (!uuid.safeParse(orderId).success) return { error: "Data tidak valid" };
  const parsed = returnSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    return { error: parsed.error.issues[0]?.message ?? "Periksa kembali isian retur.", fieldErrors };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_return", {
    p_order: orderId,
    p_date: d.businessDate,
    p_reason: d.reason,
    p_items: d.items.map((it) => ({ order_item_id: it.orderItemId, qty_kg: it.qtyKg })),
  });
  if (error) return dbError(error);
  revalidate(orderId);
  return { ok: true, message: "Retur dicatat sebagai draft. Stok bertambah setelah ketua memverifikasi barang fisik." };
}

export async function deleteReturnDraft(orderId: string, returnId: string): Promise<FormState> {
  await requireAction("retur.catat");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(returnId).success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_return_draft", { p_id: returnId });
  if (error) return dbError(error);
  revalidate(orderId);
  return { ok: true, message: "Draft retur dihapus." };
}

export async function verifyReturn(orderId: string, returnId: string, idemKey: string): Promise<FormState> {
  await requireAction("retur.verifikasi");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(returnId).success || !uuid.safeParse(idemKey).success) return { error: "Data tidak valid" };
  const res = await postVerifyReturn(returnId, idemKey);
  if (res.ok) revalidate(orderId);
  return fromPosting(res, (doc, already) => (already ? `Retur sudah diverifikasi sebelumnya sebagai ${doc}.` : `Retur diverifikasi sebagai ${doc}. Barang masuk kembali ke stok.`));
}

// ---------------------------------------------------------------- tambah cepat pelanggan (T6.2)
export async function quickAddCustomer(raw: { name: string; type: string }): Promise<QuickCustomerState> {
  await requireAction("master.kelola");
  const parsed = quickCustomerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data pelanggan tidak valid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").insert({ name: parsed.data.name, type: parsed.data.type }).select("id, name, type").single();
  if (error || !data) return dbError(error ?? {});
  revalidatePath("/master/pelanggan");
  return { ok: true, message: `Pelanggan ${data.name} ditambahkan.`, customer: data };
}
