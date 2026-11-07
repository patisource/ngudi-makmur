import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";
import { CountUp } from "@/components/motion";
import { CustomRange, PeriodFilter } from "@/components/shared/period-filter";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, Table, Td, Th } from "@/components/ui/table";
import { irtKelompokStock, irtReport, irtSettings } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatIrtQty, pcsWithPack } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";
import { parsePeriod, periodQuery, periodTitle } from "@/lib/period";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Dashboard IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="gap-2">
      <span className="text-label text-text-muted">{label}</span>
      <span className="text-[22px] font-semibold leading-tight tracking-tight tabular-nums">{value}</span>
      {sub && <span className="text-sm text-text-muted">{sub}</span>}
    </Card>
  );
}

// Dashboard IRT (M10): omzet & jumlah terjual, produksi & HPP, stok perlu perhatian, stok tepung kelompok.
// TANPA kas (keputusan pengguna 6 Nov 2026): tidak ada saldo, pembayaran, atau piutang di sini.
export default async function IrtDashboardPage({ searchParams }: PageProps<"/irt">) {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const canManage = canDo(user.roles, "irt.kelola");
  const period = parsePeriod(await searchParams);
  const [settings, report, kelompok] = await Promise.all([irtSettings(), irtReport(period), canManage ? irtKelompokStock() : Promise.resolve([])]);
  const { rows, totals, stock, error } = report;
  const low = stock.filter((s) => s.below_min);
  const tepung = stock.filter((s) => s.kind === "bahan");

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{settings.name}</h1>
          <p className="text-sm text-text-muted">{periodTitle(period)} · produksi, penjualan, dan stok usaha IRT · tanpa kas</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <PeriodFilter period={period} basePath="/irt" />
          <a
            href={`/api/v1/irt/report?format=csv&${periodQuery(period)}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            <Download size={16} strokeWidth={1.75} />
            Unduh CSV
          </a>
        </div>
      </div>
      <CustomRange period={period} basePath="/irt" />

      {error ? (
        <EmptyState title="Ringkasan IRT tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Omzet penjualan" value={<CountUp value={totals.omzet} format="rp" />} sub={`${totals.sold} pcs terjual`} />
            <Kpi label="Produksi" value={`${totals.produced} pcs`} sub={totals.hppPerPcs != null ? `HPP rata-rata ${formatRupiah(totals.hppPerPcs)}/pcs` : "Belum ada batch terkonfirmasi"} />
            <Kpi label="Nilai bahan masuk" value={<CountUp value={totals.bahanRp} format="rp" />} sub="Untuk HPP, bukan kas" />
            <Kpi label="Stok perlu perhatian" value={String(low.length)} sub={`dari ${stock.length} bahan & produk`} />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="flex min-w-0 flex-col gap-3">
              <h2 className="font-semibold">Per produk</h2>
              {!rows.length ? (
                <EmptyState title="Belum ada produk">
                  {canManage ? (
                    <>
                      Mulai dari{" "}
                      <Link href="/irt/produk" className="underline underline-offset-4">
                        Bahan &amp; produk
                      </Link>
                      .
                    </>
                  ) : (
                    "Pengurus IRT belum menambahkan produk."
                  )}
                </EmptyState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Produk</Th>
                      <Th num>Diproduksi</Th>
                      <Th num>Terjual</Th>
                      <Th num>Omzet</Th>
                      <Th num>HPP / pcs</Th>
                      <Th num>Stok</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.item_id}>
                        <Td className="font-medium">{r.name}</Td>
                        <Td num>{r.produced_pcs} pcs</Td>
                        <Td num>{r.sold_pcs} pcs</Td>
                        <Td num>{formatRupiah(r.omzet_rp)}</Td>
                        <Td num>{r.produced_pcs > 0 ? formatRupiah(Math.round(r.hpp_rp / r.produced_pcs)) : "—"}</Td>
                        <Td num>{pcsWithPack(Number(r.stock_pcs), r.pack_size)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </section>

            <div className="flex min-w-0 flex-col gap-5">
              <Card className="gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">Stok perlu perhatian</h2>
                  {low.length > 0 && <Badge tone="warn">{low.length}</Badge>}
                </div>
                {!low.length ? (
                  <p className="text-sm text-text-muted">Semua bahan dan produk di atas stok minimum.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {low.map((s) => (
                      <li key={s.item_id} className="flex justify-between gap-3">
                        <span>{s.name}</span>
                        <span className="tabular-nums text-warning">
                          {s.kind === "produk" ? `${Number(s.on_hand)} pcs` : formatIrtQty(Number(s.on_hand), s.unit)} / {formatIrtQty(Number(s.min_stock), s.unit)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/irt/stok" className="w-fit text-sm text-text-muted underline underline-offset-4">
                  Lihat semua stok
                </Link>
              </Card>
              <Card className="gap-3">
                <h2 className="font-semibold">Bahan IRT</h2>
                {!tepung.length ? (
                  <p className="text-sm text-text-muted">Belum ada bahan.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {tepung.map((s) => (
                      <li key={s.item_id} className="flex justify-between gap-3">
                        <span>{s.name}</span>
                        <span className="tabular-nums">{formatIrtQty(Number(s.on_hand), s.unit)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {kelompok.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <span className="text-xs text-text-muted">Tersedia di kelompok (baca saja)</span>
                    <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
                      {kelompok.map((k) => (
                        <li key={k.product_id} className="flex justify-between gap-3">
                          <span>{k.name}</span>
                          <span className="font-medium tabular-nums">{formatKg(dbKgToGrams(k.available_kg))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
