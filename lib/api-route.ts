import "server-only";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { canDo, type ActionKey } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import type { PostingOutcome } from "@/lib/posting";

// Langkah awal bersama Route Handler posting (PRD §8.1, Security.md §4.1 & §6): sesi aktif (401), peran (403),
// id UUID (404), header Idempotency-Key UUID (400), body JSON objek ≤ 10 KB (400/413).
export type PostingRequest = { ok: true; key: string; body: Record<string, unknown> } | { ok: false; response: Response };

export async function preparePosting(request: Request, action: ActionKey, id: string, forbidden: string): Promise<PostingRequest> {
  const user = await getSessionUser();
  if (!user || !user.isActive) return { ok: false, response: apiError(401, { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." }) };
  if (!canDo(user.roles, action)) return { ok: false, response: apiError(403, { code: "FORBIDDEN", message: forbidden }) };
  if (!z.uuid().safeParse(id).success) return { ok: false, response: apiError(404, { code: "NOT_FOUND", message: "Data tidak ditemukan" }) };
  const key = request.headers.get("idempotency-key") ?? "";
  if (!z.uuid().safeParse(key).success) return { ok: false, response: apiError(400, { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Header Idempotency-Key (UUID) wajib diisi." }) };

  const text = await request.text();
  if (text.length > 10_000) return { ok: false, response: apiError(413, { code: "PAYLOAD_TOO_LARGE", message: "Isi permintaan terlalu besar." }) };
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, response: apiError(400, { code: "INVALID_JSON", message: "Isi permintaan bukan JSON yang valid." }) };
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, response: apiError(400, { code: "INVALID_JSON", message: "Isi permintaan harus objek JSON." }) };
  return { ok: true, key, body: body as Record<string, unknown> };
}

export function validationError(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
  return apiError(422, { code: "VALIDATION_FAILED", message: "Periksa kembali isian.", fields });
}

export function postingResponse(res: PostingOutcome) {
  if (!res.ok) return apiError(res.status, res.error);
  return apiOk(res.result, { headers: res.replayed ? { "Idempotent-Replayed": "true" } : undefined });
}
