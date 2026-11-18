import { Download } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomRange, PeriodFilter } from "@/components/shared/period-filter";
import { EmptyState } from "@/components/ui/table";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { dashboardData, recentActivity } from "@/features/dashboard/queries";
import { ketuaApprovals, pendingFor } from "@/features/shell/queries";
import { canOpen, hasAnyRole, homeFor } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { parsePeriod, periodQuery, periodTitle } from "@/lib/period";

export const metadata: Metadata = { title: "Dashboard · Sistem Pengelolaan Jagung Desa Baturejo" };

// Dashboard (FR-DASH, StyleGuide §8.2, desain 01 & 07): angka dari fungsi SQL yang sama dengan laporan (PRD §5.9);
// pembanding = periode nyata sebelumnya (FR-DASH-07). Kartu mengikuti peran; operator tanpa penjualan. Sistem tanpa kas.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  if (!canOpen(user.roles, "/dashboard")) redirect(homeFor(user.roles));
  const finance = hasAnyRole(user.roles, ["admin_kelompok", "ketua"]);
  const isAdmin = user.roles.includes("admin_kelompok");
  const isKetua = user.roles.includes("ketua");
  const period = parsePeriod(await searchParams);
  const [data, activity, approvals, pending] = await Promise.all([
    dashboardData(period, { finance }),
    isKetua ? recentActivity() : Promise.resolve([]),
    isKetua ? ketuaApprovals() : Promise.resolve([]),
    pendingFor(user.roles),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Ringkasan</h1>
          <p className="text-sm text-text-muted">
            {periodTitle(period)} · dibanding {periodTitle(data.prev)} · hanya transaksi sah (terkonfirmasi)
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <PeriodFilter period={period} basePath="/dashboard" />
          <a
            href={`/api/v1/dashboard?format=csv&${periodQuery(period)}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            <Download size={16} strokeWidth={1.75} />
            Ekspor CSV
          </a>
        </div>
      </div>
      <CustomRange period={period} basePath="/dashboard" />

      {data.error ? (
        <EmptyState title="Ringkasan tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : (
        <DashboardView data={data} period={period} finance={finance} isAdmin={isAdmin} isKetua={isKetua} approvals={approvals} pending={pending} activity={activity} />
      )}
    </>
  );
}
