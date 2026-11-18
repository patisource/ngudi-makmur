import { ArrowRight, Banknote, Box, Factory, History, Inbox, ShoppingCart, TrendingDown, TrendingUp, User, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp } from "@/components/motion";
import { ChartLegend, ColumnChart, GroupedBarChart, MiniBars } from "@/components/shared/charts";
import { Card } from "@/components/ui/card";
import { Approvals } from "@/features/dashboard/components/approvals";
import { FLOUR_TARGET_KG_PER_DAY, type dashboardData, type recentActivity } from "@/features/dashboard/queries";
import type { Approval, PendingItem } from "@/features/shell/queries";
import { actionLabel, describeAudit, type AuditIcon } from "@/lib/audit-labels";
import { formatRupiah } from "@/lib/money";
import { bucketDays, periodShort, periodTitle, type Period } from "@/lib/period";
import { dbKgToGrams, formatKg } from "@/lib/qty";

const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const dayFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const pctText = (v: number | null | undefined) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);
const kgOne = (g: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(g / 1000)} kg`;
const kgShort = (g: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(g / 1000)} kg`;

// Warna per jenis aktivitas (palet merek dari logo: jagung, daun, terakota) — warna ikon, bukan teks.
const ICON: Record<AuditIcon, { I: LucideIcon; cls: string }> = {
  cart: { I: ShoppingCart, cls: "bg-leaf-soft text-leaf" },
  wallet: { I: Wallet, cls: "bg-leaf-soft text-leaf" },
  cash: { I: Banknote, cls: "bg-leaf-soft text-leaf" },
  inbox: { I: Inbox, cls: "bg-corn-soft text-warning" },
  factory: { I: Factory, cls: "bg-clay-soft text-clay" },
  box: { I: Box, cls: "bg-info-soft text-info" },
  user: { I: User, cls: "bg-surface-muted text-text-muted" },
  history: { I: History, cls: "bg-surface-muted text-text-muted" },
};

type Tone = "corn" | "leaf" | "clay" | "danger";
const STRIP: Record<Tone, string> = { corn: "bg-corn", leaf: "bg-leaf", clay: "bg-clay", danger: "bg-danger" };
const FILL: Record<Tone, string> = { corn: "bg-corn", leaf: "bg-leaf", clay: "bg-clay", danger: "bg-danger" };

/** Meter tipis berwarna (porsi 0–1) + keterangan; hanya untuk perbandingan nyata (bukan dekorasi). */
function Meter({ ratio, tone, label }: { ratio: number; tone: Tone; label: string }) {
  const p = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={label}>
        <div className={`bar-fill h-full rounded-full ${FILL[tone]}`} style={{ ["--p" as string]: p }} />
      </div>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

/** Kartu KPI (desain 01): strip warna di atas menandai jenis angka (jagung/produksi/HPP/stok); angka tetap warna teks. */
function Kpi({ tone, label, value, valueCls, sub, meter, foot }: { tone: Tone; label: string; value: ReactNode; valueCls?: string; sub?: ReactNode; meter?: ReactNode; foot?: ReactNode }) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-surface p-5 pt-6">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${STRIP[tone]}`} />
      <span className="text-label font-medium text-text-muted">{label}</span>
      <span className={`min-w-0 break-words text-[26px] font-semibold leading-tight tracking-tight tabular-nums ${valueCls ?? ""}`}>{value}</span>
      {sub && <div className="text-sm text-text-muted">{sub}</div>}
      {meter && <div className="mt-1">{meter}</div>}
      {foot && <div className="mt-auto border-t border-border pt-3 text-xs text-text-subtle">{foot}</div>}
    </div>
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

type Data = Awaited<ReturnType<typeof dashboardData>>;

/**
 * Isi dashboard (FR-DASH, StyleGuide §8.2, desain 01 & 07) — presentasi saja, data dari page.tsx. Warna merek dari
 * logo (19 Nov 2026): kartu omzet hijau daun tua, strip & grafik kuning jagung / hijau / terakota.
 */
export function DashboardView({
  data,
  period,
  finance,
  isAdmin,
  isKetua,
  approvals,
  pending,
  activity,
}: {
  data: Omit<Data, "error">;
  period: Period;
  finance: boolean;
  isAdmin: boolean;
  isKetua: boolean;
  approvals: Approval[];
  pending: PendingItem[];
  activity: Awaited<ReturnType<typeof recentActivity>>;
}) {
  const { kpi, hpp, prev, daily, sold, stock } = data;
  const prevLabel = periodShort(prev);
  const flourG = dbKgToGrams(kpi.flour_kg ?? 0);
  const flourPerDay = kpi.days > 0 ? Math.round(flourG / kpi.days) : 0;
  const receiptsG = dbKgToGrams(kpi.receipts_kg ?? 0);
  const processedG = daily.reduce((s, d) => s + d.processed, 0);
  const lowStock = stock.filter((s) => s.below_min);
  const omzetDelta = prev.kpi.omzet_rp > 0 ? ((kpi.omzet_rp - prev.kpi.omzet_rp) / prev.kpi.omzet_rp) * 100 : null;
  const buckets = bucketDays(daily, (rows) => ({ a: rows.reduce((s, r) => s + r.receipts, 0), b: rows.reduce((s, r) => s + r.processed, 0) }));
  const adminTodo = pending.filter((p) => !p.approval && p.count > 0);

  return (
    <div className="@container flex flex-col gap-5">
      {isKetua && approvals.length > 0 && (
        <Card className="gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-semibold">Menunggu persetujuan ketua</h2>
              <p className="text-xs text-text-muted">Koreksi stok, retur fisik, dan pembatalan batch berlaku setelah Anda setujui.</p>
            </div>
            <Pill tone="warn">{approvals.length}</Pill>
          </div>
          <Approvals items={approvals} />
        </Card>
      )}

      {isAdmin && adminTodo.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {adminTodo.map((p) => (
            <Link key={p.key} href={p.href} className="inline-flex items-center gap-2 rounded-lg bg-corn-soft px-3.5 py-2 text-sm text-text hover:opacity-90">
              <span className="font-semibold tabular-nums text-warning">{p.count}</span>
              {p.label.toLowerCase()}
              <ArrowRight size={14} strokeWidth={1.75} className="text-text-muted" />
            </Link>
          ))}
        </div>
      )}

      <div className={`grid gap-3 @xl:grid-cols-2 ${finance ? "@4xl:grid-cols-[1.25fr_1fr_1fr]" : "@4xl:grid-cols-4"}`}>
        {finance && (
          <div className="flex min-w-0 flex-col gap-3 rounded-xl bg-leaf-deep p-5 text-white @xl:col-span-2 @4xl:col-span-1 @4xl:row-span-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-label font-medium text-white/80">Omzet (barang diserahkan)</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-white/15 px-2 py-0.5 text-xs font-medium tabular-nums">
                <span aria-hidden className="size-1.5 rounded-full bg-corn" />
                {kpi.orders_delivered} nota
              </span>
            </div>
            <span className="flex items-baseline gap-1.5 font-semibold tracking-tight tabular-nums">
              <span className="text-base text-white/70">Rp</span>
              <span className="text-[34px] leading-tight @md:text-[40px]">
                <CountUp value={kpi.omzet_rp} format="int" />
              </span>
            </span>
            {daily.length > 1 && (
              <MiniBars onDark values={daily.map((d) => d.omzet)} labels={daily.map((d) => dayFmt.format(new Date(`${d.day}T00:00:00Z`)))} title="Omzet harian" format={formatRupiah} />
            )}
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-white/75">vs {prevLabel}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {formatRupiah(prev.kpi.omzet_rp)}
                  {omzetDelta != null && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-white/15 px-1.5 py-0.5 font-medium text-corn">
                      {omzetDelta >= 0 ? <TrendingUp size={13} strokeWidth={2} /> : <TrendingDown size={13} strokeWidth={2} />}
                      {omzetDelta >= 0 ? "+" : "−"}
                      {pctText(Math.abs(Math.round(omzetDelta * 10) / 10))}
                    </span>
                  )}
                </span>
              </div>
              {kpi.returns_rp > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/75">Retur sah</span>
                  <span className="tabular-nums">−{formatRupiah(kpi.returns_rp)}</span>
                </div>
              )}
            </div>
            {sold.length > 0 && (
              <div className="mt-auto flex flex-col gap-2.5 border-t border-white/15 pt-3.5">
                <span className="text-xs font-medium text-white/80">Terjual bersih per produk</span>
                {sold.slice(0, 3).map((x) => (
                  <div key={x.name} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span>{x.name}</span>
                      <span className="tabular-nums text-white/85">{kgShort(x.grams)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
                      <div className="bar-fill h-full rounded-full bg-corn" style={{ ["--p" as string]: Math.round((x.grams / sold[0].grams) * 100) }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <Kpi
          tone="corn"
          label="Jagung masuk"
          value={<CountUp value={receiptsG / 1000} format="kg" />}
          sub={finance ? formatRupiah(kpi.receipts_rp) : `${kpi.receipts_count} penerimaan`}
          meter={<Meter tone="corn" ratio={receiptsG > 0 ? processedG / receiptsG : 0} label={`Diolah ${kgShort(processedG)}${receiptsG > 0 ? ` · ${pctText(Math.round((processedG / receiptsG) * 1000) / 10)}` : ""}`} />}
          foot={`${prevLabel}: ${formatKg(dbKgToGrams(prev.kpi.receipts_kg ?? 0))}`}
        />
        <Kpi
          tone="leaf"
          label="Produksi tepung"
          value={<CountUp value={flourG / 1000} format="kg" />}
          sub={`${kpi.batches} batch · susut ${pctText(kpi.loss_pct)}`}
          meter={<Meter tone="leaf" ratio={flourPerDay / (FLOUR_TARGET_KG_PER_DAY * 1000)} label={`${kgOne(flourPerDay)}/hari · target ${FLOUR_TARGET_KG_PER_DAY} kg`} />}
          foot={`${prevLabel}: ${formatKg(dbKgToGrams(prev.kpi.flour_kg ?? 0))}`}
        />
        <Kpi
          tone="clay"
          label="HPP tepung"
          value={hpp.tepung != null ? <CountUp value={hpp.tepung} format="rp" /> : "—"}
          valueCls="text-clay"
          sub={`per kg · pipilan ${hpp.pipilan != null ? `${formatRupiah(hpp.pipilan)}/kg` : "—"}`}
          foot={
            <Link href="/hpp" className="inline-flex items-center gap-1 font-medium text-text-muted underline-offset-4 hover:underline">
              Rincian HPP & parameter <ArrowRight size={13} strokeWidth={1.75} />
            </Link>
          }
        />
        <Kpi
          tone={lowStock.length > 0 ? "danger" : "leaf"}
          label="Stok di bawah minimum"
          value={lowStock.length > 0 ? `${lowStock.length} produk` : "Aman"}
          valueCls={lowStock.length > 0 ? "text-danger" : "text-leaf"}
          sub={`dari ${stock.length} produk aktif`}
          foot={finance ? `${kpi.orders_to_deliver} pesanan menunggu diserahkan` : "Tersedia = fisik − reservasi"}
        />
      </div>

      <div className="grid items-stretch gap-5 @4xl:grid-cols-[minmax(0,1fr)_340px] @7xl:grid-cols-[minmax(0,1fr)_400px]">
        {finance ? (
          <Card className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="font-semibold">Jagung masuk vs jagung diolah</h2>
                <p className="text-xs text-text-muted">
                  kg per {daily.length > 14 ? "minggu" : "hari"} · {periodTitle(period)}
                </p>
              </div>
              <ChartLegend
                items={[
                  { label: "Jagung masuk", tone: "corn" },
                  { label: "Diolah (pemipilan)", tone: "leaf" },
                ]}
              />
            </div>
            <GroupedBarChart title="Jagung masuk vs jagung diolah (kg)" aLabel="Jagung masuk" bLabel="Diolah" data={buckets} />
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
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Stok tersedia</h2>
              {lowStock.length > 0 ? <Pill tone="warn">{lowStock.length} di bawah minimum</Pill> : <Pill tone="ok">Aman</Pill>}
            </div>
            <p className="text-xs text-text-muted">Fisik − reservasi · garis = stok minimum</p>
          </div>
          {stock.length === 0 ? (
            <p className="text-sm text-text-muted">Belum ada produk aktif.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {[...stock]
                .sort((x, y) => Number(y.below_min) - Number(x.below_min))
                .map((s) => {
                  const avail = Math.max(dbKgToGrams(s.available_kg), 0);
                  const min = dbKgToGrams(s.min_stock_kg);
                  const scale = Math.max(avail, min * 1.5, 1);
                  const fill = s.below_min ? (min > 0 && avail / min < 0.5 ? "bg-clay" : "bg-corn") : "bg-leaf";
                  return (
                    <li key={s.product_id} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <Link href={`/stok/${s.product_id}`} className="font-medium underline-offset-4 hover:underline">
                          {s.name}
                        </Link>
                        <span className={`text-xs tabular-nums ${s.below_min ? "font-medium text-danger" : "text-text-muted"}`}>
                          {kgShort(avail)}
                          {min > 0 && <span className="font-normal text-text-subtle"> / min {kgShort(min)}</span>}
                        </span>
                      </div>
                      <div
                        className="relative h-2 rounded-full bg-surface-muted"
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={scale / 1000}
                        aria-valuenow={avail / 1000}
                        aria-label={`${s.name}: tersedia ${formatKg(avail)}${min > 0 ? `, minimum ${formatKg(min)}` : ""}`}
                      >
                        <div className="h-full overflow-hidden rounded-full">
                          <div className={`bar-fill h-full rounded-full ${fill}`} style={{ ["--p" as string]: Math.round((avail / scale) * 100) }} />
                        </div>
                        {min > 0 && <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded-full bg-text-muted" style={{ left: `${Math.round((min / scale) * 100)}%` }} />}
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
              const { I, cls } = ICON[d.icon];
              return (
                <li key={a.id} className="fade-in flex items-center gap-3.5 py-3" style={{ ["--delay" as string]: `${Math.min(i, 7) * 30}ms` }}>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full ${cls}`}>
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
    </div>
  );
}
