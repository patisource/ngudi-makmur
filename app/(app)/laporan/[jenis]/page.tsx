import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Table, Td, Th } from "@/components/ui/table";
import { CustomRange, PeriodFilter } from "@/components/shared/period-filter";
import { isReportType, REPORTS, reportsFor, type ReportData } from "@/features/reports/definitions";
import { MasterTabs } from "@/features/master/components/tabs";
import { requireRole } from "@/lib/auth/session";
import type { Cell, ColumnType } from "@/lib/csv";
import { formatRupiah } from "@/lib/money";
import { parsePeriod, periodLabel, periodQuery } from "@/lib/period";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Laporan · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const MAX_ROWS_ON_SCREEN = 500;

function display(type: ColumnType, v: Cell): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (type === "rp") return formatRupiah(v);
    if (type === "kg") return `${v < 0 ? "−" : ""}${formatKg(dbKgToGrams(Math.abs(v)))}`;
    return String(v);
  }
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dateFmt.format(new Date(`${v}T00:00:00+07:00`));
  return v;
}

// Laporan (FR-RPT-04..06): filter periode, ringkasan, tabel detail, dan ekspor CSV (dibuat server, tunduk hak akses).
export default async function ReportPage({ params, searchParams }: PageProps<"/laporan/[jenis]">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const { jenis } = await params;
  if (!isReportType(jenis)) notFound();
  const def = REPORTS[jenis];
  if (!def.roles.some((r) => user.roles.includes(r))) redirect("/403");
  const period = parsePeriod(await searchParams);
  const tabs = reportsFor(user.roles).map((r) => ({ href: `/laporan/${r.type}`, label: r.label }));

  let data: ReportData | null = null;
  try {
    data = await def.load(period);
  } catch {
    data = null;
  }
  const csvHref = `/api/v1/reports/${jenis}?format=csv&${periodQuery(period)}`;

  return (
    <>
      <PageHeader
        title="Laporan"
        description="Rekap dari transaksi sah saja (terkonfirmasi/terverifikasi). Total ringkasan sama dengan jumlah baris detail untuk periode yang sama."
        actions={
          data && data.rows.length > 0 ? (
            <a href={csvHref} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Unduh CSV
            </a>
          ) : null
        }
      />
      <MasterTabs label="Jenis laporan" tabs={tabs} />
      {def.usesPeriod && (
        <div className="flex flex-wrap items-end gap-3">
          <PeriodFilter period={period} basePath={`/laporan/${jenis}`} />
          <CustomRange period={period} basePath={`/laporan/${jenis}`} />
          <span className="text-sm text-text-muted">{periodLabel(period)}</span>
        </div>
      )}

      {!data ? (
        <EmptyState title="Laporan tidak dapat dimuat">Coba muat ulang halaman; bila berulang, hubungi admin teknis.</EmptyState>
      ) : (
        <>
          <Card>
            <h2 className="font-semibold">Ringkasan · {def.label}</h2>
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {data.summary.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border py-1 text-sm last:border-0">
                  <dt className="text-text-muted">{k}</dt>
                  <dd className="text-right font-medium tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {data.note && <p className="text-xs text-text-subtle">{data.note}</p>}
          </Card>
          {data.rows.length === 0 ? (
            <EmptyState title="Tidak ada transaksi pada periode ini">Pilih periode lain.</EmptyState>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    {data.columns.map((c) => (
                      <Th key={c.key} num={c.type === "kg" || c.type === "rp" || c.type === "int"}>
                        {c.label}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, MAX_ROWS_ON_SCREEN).map((r, i) => (
                    <tr key={i}>
                      {data.columns.map((c) => (
                        <Td key={c.key} num={c.type === "kg" || c.type === "rp" || c.type === "int"} className={c.type === "date" ? "whitespace-nowrap" : undefined}>
                          {display(c.type, r[c.key])}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {data.rows.length > MAX_ROWS_ON_SCREEN && (
                <p className="text-sm text-text-muted">
                  Menampilkan {MAX_ROWS_ON_SCREEN} dari {data.rows.length} baris; unduh CSV untuk semua baris. Ringkasan di atas sudah menghitung semua baris.
                </p>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
