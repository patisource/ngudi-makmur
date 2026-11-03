import type { NextRequest } from "next/server";
import { z } from "zod";
import { postFulfillOrder } from "@/features/orders/posting";
import { apiError, apiOk } from "@/lib/api";
import { canDo } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { fulfillOrderSchema } from "@/lib/validation/order";
import { todayWib } from "@/lib/validation/common";

// POST /api/v1/orders/{id}/fulfill (PRD §8.1, FR-SAL-05): serahkan barang; reservasi → mutasi sale_out.
// Wajib header Idempotency-Key (UUID). Body opsional: { "recipient": "…", "deliveredOn": "YYYY-MM-DD" }.
// Tidak bergantung status bayar. Peran dicek di sini (403) dan diulang di fungsi database.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/orders/[id]/fulfill">) {
  const user = await getSessionUser();
  if (!user || !user.isActive) return apiError(401, { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." });
  if (!canDo(user.roles, "penjualan.kelola")) return apiError(403, { code: "FORBIDDEN", message: "Anda tidak berhak mencatat serah barang." });

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, { code: "NOT_FOUND", message: "Pesanan tidak ditemukan" });
  const key = request.headers.get("idempotency-key") ?? "";
  if (!z.uuid().safeParse(key).success) return apiError(400, { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Header Idempotency-Key (UUID) wajib diisi." });

  let body: unknown = {};
  const text = await request.text();
  if (text.length > 10_000) return apiError(413, { code: "PAYLOAD_TOO_LARGE", message: "Isi permintaan terlalu besar." });
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return apiError(400, { code: "INVALID_JSON", message: "Isi permintaan bukan JSON yang valid." });
    }
  }
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  // Kunci lain ikut diteruskan agar schema .strict() menolaknya (mis. klien mencoba mengirim status/qty).
  const parsed = fulfillOrderSchema.safeParse({ ...raw, deliveredOn: raw.deliveredOn ?? todayWib() });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return apiError(422, { code: "VALIDATION_ERROR", message: "Periksa kembali isian.", fields });
  }

  const res = await postFulfillOrder(id, parsed.data, key);
  if (!res.ok) return apiError(res.status, res.error);
  return apiOk(res.result, { headers: res.replayed ? { "Idempotent-Replayed": "true" } : undefined });
}
