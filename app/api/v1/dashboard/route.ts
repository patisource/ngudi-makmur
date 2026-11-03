import type { NextRequest } from "next/server";
import { dashboardData, FLOUR_TARGET_KG_PER_DAY } from "@/features/dashboard/queries";
import { apiError, apiOk } from "@/lib/api";
import { canOpen, hasAnyRole } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { toCsv, type Column } from "@/lib/csv";
import { parsePeriod } from "@/lib/period";

// GET /api/v1/dashboard?periode=…&dari=…&sampai=… (PRD §8.1, T8.1): agregat sesuai peran, rumus PRD §5.9.
// Operator produksi hanya menerima indikator produksi & stok (penjualan/kas juga ditutup RLS di database).
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.isActive) return apiError(401, { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." });
  if (!canOpen(user.roles, "/dashboard")) return apiError(403, { code: "FORBIDDEN", message: "Anda tidak berhak membuka dashboard." });
  const period = parsePeriod(Object.fromEntries(request.nextUrl.searchParams));
  const finance = hasAnyRole(user.roles, ["admin_kelompok", "ketua"]);
  const { kpi, daily, stock, error } = await dashboardData(period, { finance });
  if (error) return apiError(500, { code: "INTERNAL", message: "Ringkasan tidak dapat dimuat." });

  // Ekspor CSV (tombol "Ekspor CSV" di dashboard): seri harian periode ini, kolom keuangan hanya untuk admin/ketua.
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const columns: Column[] = [
      { key: "day", label: "Tanggal", type: "date" },
      { key: "receipts", label: "Jagung masuk (kg)", type: "kg" },
      { key: "flour", label: "Produksi tepung (kg)", type: "kg" },
      ...(finance
        ? ([
            { key: "sales", label: "Terjual bersih (kg)", type: "kg" },
            { key: "omzet", label: "Omzet (Rp)", type: "rp" },
          ] as Column[])
        : []),
    ];
    const rows = daily.map((d) => ({ day: d.day, receipts: d.receipts / 1000, flour: d.flour / 1000, sales: d.sales / 1000, omzet: d.omzet }));
    return new Response(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ringkasan-${period.from}_${period.to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const production = {
    receipts_kg: kpi.receipts_kg,
    receipts_count: kpi.receipts_count,
    flour_kg: kpi.flour_kg,
    flour_target_kg_per_day: FLOUR_TARGET_KG_PER_DAY,
    batches: kpi.batches,
    loss_pct: kpi.loss_pct,
    stock_below_min: kpi.stock_below_min,
  };
  return apiOk({
    period,
    kpi: finance ? { ...kpi, flour_target_kg_per_day: FLOUR_TARGET_KG_PER_DAY } : production,
    daily: daily.map((d) => ({ day: d.day, receipts_kg: d.receipts / 1000, flour_kg: d.flour / 1000, ...(finance ? { sales_kg: d.sales / 1000 } : {}) })),
    stock: stock.map((s) => ({ code: s.code, name: s.name, on_hand_kg: s.on_hand_kg, reserved_kg: s.reserved_kg, available_kg: s.available_kg, below_min: s.below_min })),
  });
}
