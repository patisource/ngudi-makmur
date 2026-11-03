import type { NextRequest } from "next/server";
import { postFulfillOrder } from "@/features/orders/posting";
import { postingResponse, preparePosting, validationError } from "@/lib/api-route";
import { fulfillOrderSchema } from "@/lib/validation/order";
import { todayWib } from "@/lib/validation/common";

// POST /api/v1/orders/{id}/fulfill (PRD §8.1, FR-SAL-05): serahkan barang; reservasi → mutasi sale_out.
// Wajib header Idempotency-Key (UUID). Body opsional: { "recipient": "…", "deliveredOn": "YYYY-MM-DD" }.
// Tidak bergantung status bayar. Peran dicek di sini (403) dan diulang di fungsi database.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/orders/[id]/fulfill">) {
  const { id } = await ctx.params;
  const req = await preparePosting(request, "penjualan.kelola", id, "Anda tidak berhak mencatat serah barang.");
  if (!req.ok) return req.response;
  // Kunci lain ikut diteruskan agar schema .strict() menolaknya (mis. klien mencoba mengirim status/qty).
  const parsed = fulfillOrderSchema.safeParse({ ...req.body, deliveredOn: req.body.deliveredOn ?? todayWib() });
  if (!parsed.success) return validationError(parsed.error);
  return postingResponse(await postFulfillOrder(id, parsed.data, req.key));
}
