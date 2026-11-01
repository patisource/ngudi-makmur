import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

// Idempotensi posting (Security.md §6): klien membuat kunci UUID saat dialog dibuka dan memakainya ulang untuk retry.
// Kunci sama + isi sama → hasil tersimpan dikembalikan tanpa menjalankan aksi lagi; isi berbeda → 409.

export type IdemResult<T> = { state: "done"; result: T; replayed: boolean } | { state: "conflict" | "busy" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** JSON stabil (kunci diurutkan) → sha256; payload sama dengan urutan kunci berbeda menghasilkan hash yang sama. */
export function hashPayload(payload: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

export async function withIdempotency<T extends Json>(key: string, endpoint: string, payload: unknown, run: () => Promise<T>): Promise<IdemResult<T>> {
  if (!UUID.test(key)) throw new Error("Idempotency-Key harus UUID");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("idem_begin", { p_key: key, p_endpoint: endpoint, p_hash: hashPayload(payload) });
  if (error) throw error;
  const begin = data as { state: "new" | "done" | "conflict" | "busy"; response?: T };
  if (begin.state === "done") return { state: "done", result: begin.response as T, replayed: true };
  if (begin.state !== "new") return { state: begin.state };

  try {
    const result = await run();
    await supabase.rpc("idem_finish", { p_key: key, p_response: result });
    return { state: "done", result, replayed: false };
  } catch (e) {
    await supabase.rpc("idem_abort", { p_key: key }); // gagal → kunci dilepas agar bisa dicoba lagi
    throw e;
  }
}
