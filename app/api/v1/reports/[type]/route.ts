import type { NextRequest } from "next/server";
import { isReportType, REPORTS } from "@/features/reports/definitions";
import { apiError, apiOk } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { parsePeriod } from "@/lib/period";

// GET /api/v1/reports/{type}?periode=…&dari=…&sampai=…[&format=csv] (PRD §8.1, FR-RPT-05/06).
// Hanya membaca transaksi sah; hak akses per jenis laporan (403) + RLS database. CSV: UTF-8 BOM, pemisah ";".
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/reports/[type]">) {
  const user = await getSessionUser();
  if (!user || !user.isActive) return apiError(401, { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." });
  const { type } = await ctx.params;
  if (!isReportType(type)) return apiError(404, { code: "NOT_FOUND", message: "Jenis laporan tidak dikenal" });
  const def = REPORTS[type];
  if (!def.roles.some((r) => user.roles.includes(r))) return apiError(403, { code: "FORBIDDEN", message: "Anda tidak berhak membuka laporan ini." });

  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const period = parsePeriod(sp);
  let data;
  try {
    data = await def.load(period);
  } catch {
    return apiError(500, { code: "INTERNAL", message: "Laporan tidak dapat dimuat. Coba lagi." });
  }

  if (sp.format === "csv") {
    const name = def.usesPeriod ? `laporan-${type}-${period.from}_${period.to}.csv` : `laporan-${type}-${period.to}.csv`;
    return new Response(toCsv(data.columns, data.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return apiOk({ type, period, ...data });
}
