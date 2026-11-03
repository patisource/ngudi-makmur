import "server-only";
import { dbErrorToApi, type ApiError } from "@/lib/api";
import { withIdempotency } from "@/lib/idempotency";
import type { Json } from "@/lib/supabase/types";

// Jalankan satu fungsi posting database di balik kunci idempotensi (Security.md §6). Dipakai server action (UI) dan
// Route Handler (/api/v1/…) dengan nama endpoint & payload yang sama, sehingga kunci yang sama dari jalur mana pun tidak
// memposting dua kali. Peran sudah dicek pemanggil; database mengecek ulang.

export type PostingResult = { id: string; doc_number: string | null; status: string; already: boolean } & Record<string, Json | undefined>;
export type PostingOutcome = { ok: true; result: PostingResult; replayed: boolean } | { ok: false; status: number; error: ApiError };

type RpcCall = () => PromiseLike<{ data: Json | null; error: { code?: string; message?: string; hint?: string | null } | null }>;

export async function runPosting(endpoint: string, key: string, payload: Record<string, unknown>, call: RpcCall): Promise<PostingOutcome> {
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
    return { ok: true, result: res.result as unknown as PostingResult, replayed: res.replayed };
  } catch (e) {
    return { ok: false, ...dbErrorToApi(e as { code?: string; message?: string; hint?: string }) };
  }
}
