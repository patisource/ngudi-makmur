import "server-only";
import { runPosting } from "@/lib/posting";
import { createClient } from "@/lib/supabase/server";

// Transisi status pesanan & retur yang mengubah stok/kas (konfirmasi, batal, serah, verifikasi retur). Lihat lib/posting.
export type { PostingOutcome } from "@/lib/posting";

export async function postConfirmOrder(orderId: string, key: string) {
  const supabase = await createClient();
  return runPosting("orders.confirm", key, { orderId }, () => supabase.rpc("confirm_order", { p_id: orderId }));
}

/** Batal; bila pesanan sudah dibayar, refund penuh dicatat dari akun kas yang dipilih dalam transaksi yang sama. */
export async function postCancelOrder(orderId: string, reason: string, refundAccountId: string | null, key: string) {
  const supabase = await createClient();
  return runPosting("orders.cancel", key, { orderId, reason, refundAccountId }, () =>
    supabase.rpc("cancel_order", { p_id: orderId, p_reason: reason, p_refund_account: refundAccountId }),
  );
}

export async function postVerifyReturn(returnId: string, key: string) {
  const supabase = await createClient();
  return runPosting("returns.verify", key, { returnId }, () => supabase.rpc("verify_return", { p_id: returnId }));
}

export async function postFulfillOrder(orderId: string, input: { recipient?: string; deliveredOn: string }, key: string) {
  const supabase = await createClient();
  const recipient = input.recipient ?? null;
  return runPosting("orders.fulfill", key, { orderId, recipient, deliveredOn: input.deliveredOn }, () =>
    supabase.rpc("fulfill_order", { p_id: orderId, p_recipient: recipient, p_date: input.deliveredOn }),
  );
}
