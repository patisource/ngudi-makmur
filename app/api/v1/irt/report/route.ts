import type { NextRequest } from "next/server";
import { irtReport } from "@/features/irt/queries";
import { apiError, apiOk } from "@/lib/api";
import { canOpen } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { toCsv, type Column } from "@/lib/csv";
import { parsePeriod } from "@/lib/period";

// GET /api/v1/irt/report?periode=…&format=csv — ringkasan IRT per produk (M10). Pengurus IRT & ketua; tanpa kas.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.isActive) return apiError(401, { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." });
  if (!canOpen(user.roles, "/irt")) return apiError(403, { code: "FORBIDDEN", message: "Anda tidak berhak membuka laporan IRT." });
  const period = parsePeriod(Object.fromEntries(request.nextUrl.searchParams));
  const { rows, totals, error } = await irtReport(period);
  if (error) return apiError(500, { code: "INTERNAL", message: "Laporan IRT tidak dapat dimuat." });

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const columns: Column[] = [
      { key: "name", label: "Produk", type: "text" },
      { key: "produced", label: "Diproduksi (pcs)", type: "int" },
      { key: "sold", label: "Terjual (pcs)", type: "int" },
      { key: "omzet", label: "Omzet (Rp)", type: "rp" },
      { key: "hpp", label: "HPP per pcs (Rp)", type: "rp" },
      { key: "stock", label: "Stok (pcs)", type: "int" },
    ];
    const data = rows.map((r) => ({
      name: r.name,
      produced: Number(r.produced_pcs),
      sold: Number(r.sold_pcs),
      omzet: Number(r.omzet_rp),
      hpp: r.produced_pcs > 0 ? Math.round(r.hpp_rp / r.produced_pcs) : null,
      stock: Number(r.stock_pcs),
    }));
    return new Response(toCsv(columns, data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="irt-${period.from}_${period.to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return apiOk({ period: { from: period.from, to: period.to }, totals, products: rows });
}
