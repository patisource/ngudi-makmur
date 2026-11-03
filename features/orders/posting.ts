import "server-only";
import { dbErrorToApi, type ApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

// Transisi status pesanan yang mengubah stok (konfirmasi, batal, serah). Dipakai server action (UI) dan Route Handler
// (/api/v1/orders/{id}/…) dengan nama endpoint & payload idempotensi yang sama, sehingga kunci yang sama dari jalur
// mana pun tidak menjalankan posting dua kali (Security.md §6). Peran sudah dicek pemanggil; database mengecek ulang.

export type OrderPostingResult = { id: string; doc_number: string | null; status: string; already: boolean; total_rp?: number; released?: number };
export type PostingOutcome = { ok: true; result: OrderPostingResult; replayed: boolean } | { ok: false; status: number; error: ApiError };

async function post(endpoint: string, key: string, payload: Record<string, unknown>, call: () => PromiseLike<{ data: Json | null; error: { code?: string; message?: string; hint?: string | null } | null }>): Promise<PostingOutcome> {
  try {
    const res = await withIdempotency(key, endpoint, payload, async () => {
      const { data, error } = await call();
      if (error) throw error;
      return data ?? {};
    });
    if (res.state !== "done")
      return res.state === "busy"
        ? { ok: false, status: 409, error: { code: "REQUEST_IN_PROGRESS", message: "Permintaan sebelumnya masih diproses. Tunggu sebentar lalu muat ulang halaman." } }
        : { ok: false, status: 409, error: { code: "IDEMPOTENCY_CONFLICT", message: "Permintaan ini sudah dipakai untuk data lain. Muat ulang halaman lalu coba lagi." } };
    return { ok: true, result: res.result as unknown as OrderPostingResult, replayed: res.replayed };
  } catch (e) {
    return { ok: false, ...dbErrorToApi(e as { code?: string; message?: string; hint?: string }) };
  }
}

export async function postConfirmOrder(orderId: string, key: string) {
  const supabase = await createClient();
  return post("orders.confirm", key, { orderId }, () => supabase.rpc("confirm_order", { p_id: orderId }));
}

export async function postCancelOrder(orderId: string, reason: string, key: string) {
  const supabase = await createClient();
  return post("orders.cancel", key, { orderId, reason }, () => supabase.rpc("cancel_order", { p_id: orderId, p_reason: reason }));
}

export async function postFulfillOrder(orderId: string, input: { recipient?: string; deliveredOn: string }, key: string) {
  const supabase = await createClient();
  const recipient = input.recipient ?? null;
  return post("orders.fulfill", key, { orderId, recipient, deliveredOn: input.deliveredOn }, () =>
    supabase.rpc("fulfill_order", { p_id: orderId, p_recipient: recipient, p_date: input.deliveredOn }),
  );
}
