import type { NextRequest } from "next/server";
import { postVerifyPayment } from "@/features/cash/posting";
import { postingResponse, preparePosting } from "@/lib/api-route";

// POST /api/v1/payments/{id}/verify (PRD §6.1): verifikasi transfer yang dicek belakangan — langkah 2–7 sequence
// pembayaran (kunci pesanan, cek tagihan, nomor PAY, satu kas masuk, status bayar). Wajib Idempotency-Key.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/payments/[id]/verify">) {
  const { id } = await ctx.params;
  const req = await preparePosting(request, "kas.kelola", id, "Anda tidak berhak memverifikasi pembayaran.");
  if (!req.ok) return req.response;
  return postingResponse(await postVerifyPayment(id, req.key));
}
