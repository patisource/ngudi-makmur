import type { NextRequest } from "next/server";
import { postRecordPayment } from "@/features/cash/posting";
import { postingResponse, preparePosting, validationError } from "@/lib/api-route";
import { todayWib } from "@/lib/validation/common";
import { paymentSchema } from "@/lib/validation/cash";

// POST /api/v1/orders/{id}/payments (PRD §8.1, §6.1, FR-CSH-02..04a): catat pembayaran; "verified": true menjalankan
// verifikasi dalam transaksi yang sama (kunci pesanan, cek tagihan tersisa, satu kas masuk, status bayar).
// Wajib Idempotency-Key: kirim ulang dengan kunci sama → hasil transaksi pertama, tanpa pembayaran/kas ganda.
// Body: { "method": "tunai"|"transfer", "accountId": uuid, "amountRp": 30000, "verified": true, "businessDate"?: "YYYY-MM-DD", "note"?: "…" }
export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/orders/[id]/payments">) {
  const { id } = await ctx.params;
  const req = await preparePosting(request, "kas.kelola", id, "Anda tidak berhak mencatat pembayaran.");
  if (!req.ok) return req.response;
  const parsed = paymentSchema.safeParse({ ...req.body, businessDate: req.body.businessDate ?? todayWib(), verified: req.body.verified ?? false });
  if (!parsed.success) return validationError(parsed.error);
  return postingResponse(await postRecordPayment(id, parsed.data, req.key));
}
