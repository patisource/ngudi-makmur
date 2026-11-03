import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CountUp } from "@/components/motion";
import { BarLineChart, ColumnChart } from "@/components/shared/charts";
import { PeriodFilter } from "@/components/shared/period-filter";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { dashboardData, FLOUR_TARGET_KG_PER_DAY, recentActivity } from "@/features/dashboard/queries";
import { actionLabel } from "@/lib/audit-labels";
import { canOpen, hasAnyRole, homeFor } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { parsePeriod } from "@/lib/period";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Dashboard · SIM Ngudi Makmur" };

const timeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });
const pctText = (v: number | null | undefined) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);

function Kpi({ label, value, children, wide }: { label: string; value: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <Card className={`gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-label text-text-muted">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      {children && <div className="text-xs text-text-muted">{children}</div>}
    </Card>
  );
}

function Todo({ href, count, children }: { href: string; count: number; children: ReactNode }) {
  if (count <= 0) return null;
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:border-border-strong">
      <span>{children}</span>
      <span className="rounded-sm bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning tabular-nums">{count}</span>
    </Link>
  );
}

// Dashboard (FR-DASH, StyleGuide §8.2): KPI sesuai peran, produksi tepung harian vs target ≥ 50 kg/hari,
// jagung masuk vs terjual, stok perlu perhatian, menunggu tindakan, aktivitas terbaru. Angka dari fungsi SQL yang sama
// dengan laporan; data terbaru setiap kali halaman dibuka (aksi transaksi me-revalidate halaman terkait).
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  if (!canOpen(user.roles, "/dashboard")) redirect(homeFor(user.roles));
  const finance = hasAnyRole(user.roles, ["admin_kelompok", "ketua"]);
  const isAdmin = user.roles.includes("admin_kelompok");
  const isKetua = user.roles.includes("ketua");
  const period = parsePeriod(await searchParams);
  const [{ kpi, daily, stock, error }, activity] = await Promise.all([dashboardData(period), isKetua ? recentActivity() : Promise.resolve([])]);

  const targetG = FLOUR_TARGET_KG_PER_DAY * 1000;
  const flourG = dbKgToGrams(kpi.flour_kg ?? 0);
  const flourPerDay = kpi.days > 0 ? Math.round(flourG / kpi.days) : 0;
  const lowStock = stock.filter((s) => s.below_min);

  return (
    <>
      <PageHeader title="Ringkasan" description={`Halo, ${user.fullName}. Angka dari transaksi sah saja; omzet berbeda dengan uang yang diterima.`} />
      <PeriodFilter period={period} basePath="/dashboard" />

      {error ? (
        <EmptyState title="Ringkasan tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {finance && (
              <Kpi label="Omzet" value={<CountUp value={kpi.omzet_rp} format="rp" />} wide>
                {kpi.orders_delivered} pesanan diserahkan · terjual {formatKg(dbKgToGrams(kpi.sold_kg))}
                {kpi.returns_rp > 0 && ` · retur ${formatRupiah(kpi.returns_rp)}`}
                <br />
                Penjualan digital {pctText(kpi.digital_share_pct)} · porsi jagung mentah {pctText(kpi.raw_share_pct)}
              </Kpi>
            )}
            <Kpi label="Jagung masuk" value={<CountUp value={dbKgToGrams(kpi.receipts_kg) / 1000} format="kg" />}>
              {kpi.receipts_count} penerimaan{finance ? ` · ${formatRupiah(kpi.receipts_rp)}` : ""}
            </Kpi>
            <Kpi label="Produksi tepung" value={<CountUp value={flourG / 1000} format="kg" />}>
              rata-rata {formatKg(flourPerDay)}/hari vs target {FLOUR_TARGET_KG_PER_DAY} kg/hari · susut {pctText(kpi.loss_pct)}
            </Kpi>
            {finance && (
              <Kpi label="Saldo kas" value={<CountUp value={kpi.cash_balance_rp} format="rp" />}>
                periode ini: masuk {formatRupiah(kpi.cash_in_rp)} · keluar {formatRupiah(kpi.cash_out_rp)}
              </Kpi>
            )}
            {finance && (
              <Kpi label="Piutang" value={<CountUp value={kpi.receivable_rp} format="rp" />}>
                {kpi.receivable_orders} pesanan belum lunas{kpi.credit_rp > 0 ? ` · kelebihan bayar ${formatRupiah(kpi.credit_rp)}` : ""}
              </Kpi>
            )}
            {!finance && (
              <Kpi label="Stok di bawah minimum" value={String(lowStock.length)}>
                dari {stock.length} produk aktif
              </Kpi>
            )}
          </div>

          {kpi.days >= 2 && (
            <div className={`grid items-start gap-5 ${finance ? "lg:grid-cols-2" : ""}`}>
              <Card>
                <h2 className="font-semibold">Produksi tepung harian</h2>
                <ColumnChart title="Produksi tepung (kg)" target={targetG} data={daily.map((d) => ({ day: d.day, a: d.flour }))} />
              </Card>
              {finance && (
                <Card>
                  <h2 className="font-semibold">Jagung masuk vs terjual (kg)</h2>
                  <BarLineChart title="Jagung masuk vs terjual (kg)" aLabel="Jagung masuk" bLabel="Terjual" data={daily.map((d) => ({ day: d.day, a: d.receipts, b: d.sales }))} />
                </Card>
              )}
            </div>
          )}

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Stok perlu perhatian</h2>
              {lowStock.length === 0 ? (
                <p className="text-sm text-text-muted">Semua produk di atas stok minimum.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {lowStock.map((s) => {
                    const avail = dbKgToGrams(s.available_kg);
                    const min = dbKgToGrams(s.min_stock_kg);
                    const ratio = min > 0 ? Math.max(0, Math.min(1, avail / min)) : 0;
                    return (
                      <li key={s.product_id} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <Link href={`/stok/${s.product_id}`} className="font-medium underline-offset-4 hover:underline">
                            {s.name}
                          </Link>
                          <span className="text-xs text-text-muted tabular-nums">
                            tersedia {formatKg(avail)} / minimum {formatKg(min)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-warning-soft" role="meter" aria-valuemin={0} aria-valuemax={min / 1000} aria-valuenow={avail / 1000} aria-label={`${s.name} tersedia`}>
                          <div className="h-full rounded-full bg-warning" style={{ width: `${Math.round(ratio * 100)}%` }} />
                        </div>
                        <span className="text-xs text-text-subtle">
                          fisik {formatKg(dbKgToGrams(s.on_hand_kg))} · reservasi {formatKg(dbKgToGrams(s.reserved_kg))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {(isAdmin || isKetua) && (
              <Card>
                <h2 className="font-semibold">Menunggu tindakan</h2>
                <div className="flex flex-col gap-2">
                  {isAdmin && (
                    <>
                      <Todo href="/kas/pembayaran?status=pending" count={kpi.pending_payments}>
                        Pembayaran menunggu verifikasi
                      </Todo>
                      <Todo href="/penjualan?status=confirmed" count={kpi.orders_to_deliver}>
                        Pesanan belum diserahkan
                      </Todo>
                    </>
                  )}
                  {isKetua && (
                    <>
                      <Todo href="/penjualan?status=delivered" count={kpi.pending_returns}>
                        Retur menunggu verifikasi fisik
                      </Todo>
                      <Todo href="/kas/koreksi" count={kpi.pending_corrections}>
                        Koreksi kas menunggu keputusan
                      </Todo>
                      <Todo href="/produksi?status=pending_void" count={kpi.pending_batch_voids}>
                        Pembatalan batch menunggu persetujuan
                      </Todo>
                    </>
                  )}
                  {kpi.pending_payments + kpi.orders_to_deliver + kpi.pending_returns + kpi.pending_corrections + kpi.pending_batch_voids === 0 && (
                    <p className="text-sm text-text-muted">Tidak ada yang menunggu.</p>
                  )}
                </div>
              </Card>
            )}
          </div>

          {activity.length > 0 && (
            <Card>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Aktivitas terbaru</h2>
                <Link href="/audit" className="text-xs text-text-muted underline-offset-4 hover:underline">
                  Log audit lengkap
                </Link>
              </div>
              <ul className="flex flex-col divide-y divide-border">
                {activity.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium">{actionLabel(a.action)}</span>
                      <span className="text-text-muted"> · {a.actor_name ?? "Sistem"}</span>
                      {a.reason && <span className="text-text-subtle"> · {a.reason}</span>}
                    </span>
                    <span className="text-xs text-text-subtle tabular-nums">{timeFmt.format(new Date(a.at))}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
