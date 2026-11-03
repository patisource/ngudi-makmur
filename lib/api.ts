import "server-only";
import { mapDbError } from "@/lib/errors";

// Bentuk respons standar API (PRD §8.1): { data, error }. Pesan galat tidak pernah memuat detail SQL (Security.md).
export type ApiError = { code: string; message: string; fields?: Record<string, string> };

export const apiOk = <T>(data: T, init?: ResponseInit) => Response.json({ data, error: null }, init);
export const apiError = (status: number, error: ApiError) => Response.json({ data: null, error }, { status });

/** Galat fungsi database → status HTTP + kode API. Kode bisnis (mis. INSUFFICIENT_STOCK) dibawa lewat HINT. */
export function dbErrorToApi(e: { code?: string; message?: string; hint?: string | null }): { status: number; error: ApiError } {
  const { message } = mapDbError(e);
  switch (e.code) {
    case "42501":
      return { status: 403, error: { code: "FORBIDDEN", message } };
    case "P0002":
      return { status: 404, error: { code: "NOT_FOUND", message } };
    case "22023":
      return { status: 422, error: { code: "VALIDATION_ERROR", message } };
    case "P0001":
      return { status: 409, error: { code: e.hint && /^[A-Z_]{3,40}$/.test(e.hint) ? e.hint : "INVALID_STATE", message } };
    default:
      return { status: 500, error: { code: "INTERNAL", message } };
  }
}
