import type { NextRequest } from "next/server";
import { z } from "zod";
import { orderReceipt, printCount } from "@/features/orders/receipt";
import { apiError, apiOk } from "@/lib/api";
import { canDo, hasAnyRole } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// GET /api/v1/orders/{id}/receipt (PRD §8.1, §6.1 langkah 9–10): nota dari transaksi tersimpan, tanpa membuat transaksi.
// ?cetak=1 (admin kelompok) mencatat satu cetakan di print_logs; nomor nota tetap, tanda "CETAK ULANG ke-n".
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/orders/[id]/receipt">) {
  const user = await getSessionUser();
  if (!user || !user.isActive) return apiError(401, { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." });
  if (!hasAnyRole(user.roles, ["admin_kelompok", "ketua"])) return apiError(403, { code: "FORBIDDEN", message: "Anda tidak berhak membuka nota." });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, { code: "NOT_FOUND", message: "Pesanan tidak ditemukan" });

  const prior = await printCount("order", id);
  const nota = await orderReceipt(id, prior);
  if (!nota) return apiError(404, { code: "NOT_FOUND", message: "Nota hanya untuk pesanan yang sudah dikonfirmasi" });

  let printNo: number | null = null;
  if (request.nextUrl.searchParams.get("cetak") === "1") {
    if (!canDo(user.roles, "penjualan.kelola")) return apiError(403, { code: "FORBIDDEN", message: "Nota dicetak oleh admin kelompok." });
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("log_print", { p_doc_type: "order", p_doc_id: id });
    if (error) return apiError(409, { code: "INVALID_STATE", message: mapDbError(error).message });
    printNo = data;
  }
  return apiOk({ ...nota.order, reprint: prior > 0 ? prior : null, printNo, lines: nota.lines.map((l) => l.text) });
}
