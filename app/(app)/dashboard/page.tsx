import { ArrowRight, Banknote, Box, Download, Factory, History, Inbox, ShoppingCart, User, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CountUp } from "@/components/motion";
import { ChartLegend, ColumnChart, GroupedBarChart, MiniBars } from "@/components/shared/charts";
import { CustomRange, PeriodFilter } from "@/components/shared/period-filter";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { Approvals } from "@/features/dashboard/components/approvals";
import { dashboardData, FLOUR_TARGET_KG_PER_DAY, recentActivity } from "@/features/dashboard/queries";
import { ketuaApprovals, pendingFor } from "@/features/shell/queries";
import { actionLabel, describeAudit, type AuditIcon } from "@/lib/audit-labels";
import { canOpen, hasAnyRole, homeFor } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { bucketDays, parsePeriod, periodQuery, periodShort, periodTitle } from "@/lib/period";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Dashboard · SIM Ngudi Makmur" };

const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const dayFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const pctText = (v: number | null | undefined) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);
const juta = (rp: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(rp / 1_000_000)} jt`;
const kgOne = (g: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(g / 1000)} kg`;
const kgShort = (g: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(g / 1000)} kg`;
const ICON: Record<AuditIcon, LucideIcon> = { cart: ShoppingCart, wallet: Wallet, inbox: Inbox, factory: Factory, box: Box, user: User, cash: Banknote, history: History };

/** Kartu KPI (desain 01): label kecil, angka, keterangan, garis pemisah, catatan rumus/pembanding. */
function Kpi({ label, value, sub, foot, badge, className }: { label: string; value: ReactNode; sub?: ReactNode; foot?: ReactNode; badge?: ReactNode; className?: string }) {
  return (
    <Card className={`gap-2 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-label text-text-muted">{label}</span>
        {badge}
      </div>
      <span className="text-[22px] font-semibold leading-tight tracking-tight tabular-nums">{value}</span>
      {sub && <div className="text-sm text-text-muted">{sub}</div>}
      {foot && <div className="mt-auto border-t border-border pt-3 text-xs text-text-subtle">{foot}</div>}
    </Card>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "neutral"; children: ReactNode }) {
  const cls = tone === "ok" ? "bg-accent-soft text-accent" : tone === "warn" ? "bg-warning-soft text-warning" : "bg-surface-muted text-text-muted";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

// Dashboard (FR-DASH, StyleGuide §8.2, desain 01 & 07): angka dari fungsi SQL yang sama dengan laporan (PRD §5.9);
// pembanding = periode nyata sebelumnya (FR-DASH-07). Kartu mengikuti peran; operator tanpa penjualan/kas.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  if (!canOpen(user.roles, "/dashboard")) redirect(homeFor(user.roles));
  const finance = hasAnyRole(user.roles, ["admin_kelompok", "ketua"]);
  const isAdmin = user.roles.includes("admin_kelompok");
  const isKetua = user.roles.includes("ketua");
  const period = parsePeriod(await searchParams);
  const [{ kpi, prev, daily, sold, cash, stock, error }, activity, approvals, pending] = await Promise.all([
    dashboardData(period, { finance }),
    isKetua ? recentActivity() : Promise.resolve([]),
    isKetua ? ketuaApprovals() : Promise.resolve([]),
    pendingFor(user.roles),
  ]);

  const prevLabel = periodShort(prev);
  const flourG = dbKgToGrams(kpi.flour_kg ?? 0);
  const flourPerDay = kpi.days > 0 ? Math.round(flourG / kpi.days) : 0;
  const lowStock = stock.filter((s) => s.below_min);
  const omzetDelta = prev.kpi.omzet_rp > 0 ? ((kpi.omzet_rp - prev.kpi.omzet_rp) / prev.kpi.omzet_rp) * 100 : null;
  const tunai = cash.filter((c) => c.kind === "tunai").reduce((s, c) => s + c.balance_rp, 0);
  const bank = cash.filter((c) => c.kind === "bank").reduce((s, c) => s + c.balance_rp, 0);
  const buckets = bucketDays(daily, (rows) => ({ a: rows.reduce((s, r) => s + r.receipts, 0), b: rows.reduce((s, r) => s + r.sales, 0) }));
  const adminTodo = pending.filter((p) => !p.approval && p.count > 0);

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Ringkasan</h1>
          <p className="text-sm text-text-muted">
            {periodTitle(period)} · dibanding {periodTitle(prev)} · hanya transaksi sah (terkonfirmasi)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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

      {error ? (
        <EmptyState title="Ringkasan tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : (
        <>
          {isKetua && approvals.length > 0 && (
            <Card className="gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-semibold">Menunggu persetujuan ketua</h2>
                  <p className="text-xs text-text-muted">Koreksi stok, koreksi kas, retur fisik, dan pembatalan batch berlaku setelah Anda setujui.</p>
                </div>
                <Pill tone="warn">{approvals.length}</Pill>
              </div>
              <Approvals items={approvals} />
            </Card>
          )}

          {isAdmin && adminTodo.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {adminTodo.map((p) => (
                <Link key={p.key} href={p.href} className="inline-flex items-center gap-2 rounded-lg bg-warning-soft px-3.5 py-2 text-sm text-text hover:opacity-90">
                  <span className="font-semibold tabular-nums text-warning">{p.count}</span>
                  {p.label.toLowerCase()}
                  <ArrowRight size={14} strokeWidth={1.75} className="text-text-muted" />
                </Link>
              ))}
            </div>
          )}

          <div className={`grid gap-3 sm:grid-cols-2 ${finance ? "xl:grid-cols-[1.45fr_1fr_1fr_1fr_1fr]" : "xl:grid-cols-3"}`}>
            {finance && (
              <Card className="gap-2 sm:col-span-2 xl:col-span-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-label text-text-muted">Omzet (barang diserahkan)</span>
                  <Pill tone="ok">{kpi.orders_delivered} nota</Pill>
                </div>
                <span className="flex items-baseline gap-1.5 font-semibold tracking-tight tabular-nums">
                  <span className="text-base text-text-muted">Rp</span>
                  <span className="text-[34px] leading-tight sm:text-[40px]">
                    <CountUp value={kpi.omzet_rp} format="int" />
                  </span>
                </span>
                {daily.length > 1 && (
                  <MiniBars values={daily.map((d) => d.omzet)} labels={daily.map((d) => dayFmt.format(new Date(`${d.day}T00:00:00Z`)))} title="Omzet harian" format={formatRupiah} />
                )}
                <p className="text-xs leading-relaxed text-text">
                  {sold.length > 0 && `${sold.slice(0, 2).map((s) => `${s.name} ${kgShort(s.grams)}`).join(" · ")} · `}
                  vs {prevLabel}: {formatRupiah(prev.kpi.omzet_rp)}
                  {omzetDelta != null && (
                    <>
                      {" ("}
                      <span className={omzetDelta >= 0 ? "text-accent" : "text-danger"}>
                        {omzetDelta >= 0 ? "+" : "−"}
                        {pctText(Math.abs(Math.round(omzetDelta * 10) / 10))}
                      </span>
                      {")"}
                    </>
                  )}
                  {kpi.returns_rp > 0 && ` · retur ${formatRupiah(kpi.returns_rp)}`}
                </p>
              </Card>
            )}
            <Kpi
              label="Jagung masuk"
              value={<CountUp value={dbKgToGrams(kpi.receipts_kg) / 1000} format="kg" />}
              sub={finance ? formatRupiah(kpi.receipts_rp) : `${kpi.receipts_count} penerimaan`}
              foot={`${prevLabel}: ${formatKg(dbKgToGrams(prev.kpi.receipts_kg ?? 0))}`}
            />
            <Kpi
              label="Produksi tepung"
              value={<CountUp value={flourG / 1000} format="kg" />}
              sub={`${kpi.batches} batch · rata-rata ${kgOne(flourPerDay)}/hari`}
              foot={`Target ≥ ${FLOUR_TARGET_KG_PER_DAY} kg/hari · susut ${pctText(kpi.loss_pct)}`}
            />
            {finance && (
              <Kpi
                label="Saldo kas"
                value={<CountUp value={kpi.cash_balance_rp} format="rp" />}
                sub={`Tunai ${juta(tunai)} · Bank ${juta(bank)}`}
                foot="Bayar terverifikasi + pemasukan lain − pengeluaran − refund"
              />
            )}
            {finance && (
              <Kpi
                label="Piutang"
                value={<CountUp value={kpi.receivable_rp} format="rp" />}
                sub={`${kpi.receivable_orders} nota belum lunas${kpi.credit_rp > 0 ? ` · kelebihan bayar ${formatRupiah(kpi.credit_rp)}` : ""}`}
                foot="Tagihan sah − bayar bersih terverifikasi"
              />
            )}
            {!finance && (
              <Kpi label="Stok di bawah minimum" value={String(lowStock.length)} sub={`dari ${stock.length} produk aktif`} foot="Tersedia = fisik − reservasi" />
            )}
          </div>

          <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_360px]">
            {finance ? (
              <Card className="gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-semibold">Jagung masuk vs terjual</h2>
                    <p className="text-xs text-text-muted">
                      kg per {daily.length > 14 ? "minggu" : "hari"} · {periodTitle(period)}
                    </p>
                  </div>
                  <ChartLegend
                    items={[
                      { label: "Jagung masuk", tone: "muted" },
                      { label: "Terjual", tone: "accent" },
                    ]}
                  />
                </div>
                <GroupedBarChart title="Jagung masuk vs terjual (kg)" aLabel="Jagung masuk" bLabel="Terjual" data={buckets} />
              </Card>
            ) : (
              <Card className="gap-4">
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-semibold">Produksi tepung harian</h2>
                  <p className="text-xs text-text-muted">kg per hari · target ≥ {FLOUR_TARGET_KG_PER_DAY} kg/hari</p>
                </div>
                <ColumnChart title="Produksi tepung (kg)" target={FLOUR_TARGET_KG_PER_DAY * 1000} data={daily.map((d) => ({ day: d.day, a: d.flour }))} />
              </Card>
            )}

            <Card className="gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-semibold">Stok perlu perhatian</h2>
                  <p className="text-xs text-text-muted">Tersedia = fisik − reservasi · di bawah minimum</p>
                </div>
                {lowStock.length > 0 && <Pill tone="warn">{lowStock.length} produk</Pill>}
              </div>
              {lowStock.length === 0 ? (
                <p className="text-sm text-text-muted">Semua produk di atas stok minimum.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {lowStock.map((s) => {
                    const avail = dbKgToGrams(s.available_kg);
                    const min = dbKgToGrams(s.min_stock_kg);
                    const ratio = min > 0 ? Math.max(0, Math.min(1, avail / min)) : 0;
                    return (
                      <li key={s.product_id} className="flex flex-col gap-2 py-3.5 first:pt-0">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <Link href={`/stok/${s.product_id}`} className="font-medium underline-offset-4 hover:underline">
                            {s.name}
                          </Link>
                          <span className="text-xs text-text-muted tabular-nums">
                            {kgShort(Math.max(avail, 0))} / {kgShort(min)}
                          </span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
                          role="meter"
                          aria-valuemin={0}
                          aria-valuemax={min / 1000}
                          aria-valuenow={avail / 1000}
                          aria-label={`${s.name}: tersedia ${formatKg(avail)} dari minimum ${formatKg(min)}`}
                        >
                          <div className="bar-fill h-full rounded-full bg-warning" style={{ ["--p" as string]: Math.round(ratio * 100) }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link href="/stok" className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
                Lihat semua stok <ArrowRight size={15} strokeWidth={1.75} />
              </Link>
            </Card>
          </div>

          {activity.length > 0 && (
            <Card className="gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Aktivitas terbaru</h2>
                <Link href="/audit" className="text-sm text-text-muted underline-offset-4 hover:underline">
                  Lihat log
                </Link>
              </div>
              <ul className="flex flex-col divide-y divide-border">
                {activity.map((a, i) => {
                  const d = describeAudit(a);
                  const I = ICON[d.icon];
                  return (
                    <li key={a.id} className="fade-in flex items-center gap-3.5 py-3" style={{ ["--delay" as string]: `${Math.min(i, 7) * 30}ms` }}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-text-muted">
                        <I size={17} strokeWidth={1.75} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {d.object ? `${d.object} · ` : ""}
                          {actionLabel(a.action)}
                        </span>
                        <span className="truncate text-xs text-text-subtle">{[d.change, a.actor_name ?? "Sistem"].filter(Boolean).join(" · ")}</span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        {d.amount && <span className="text-sm font-medium tabular-nums">{d.amount}</span>}
                        <span className="text-xs text-text-subtle tabular-nums">{timeFmt.format(new Date(a.at))}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
