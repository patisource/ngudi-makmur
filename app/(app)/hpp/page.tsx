import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CustomRange, PeriodFilter } from "@/components/shared/period-filter";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { HppSettingsForm, PackagingCostInput } from "@/features/hpp/components/hpp-forms";
import { hppOverview, hppSettings } from "@/features/hpp/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { marginPct, markupPct, packagingUnitCost, pctText } from "@/lib/hpp";
import { formatRupiah } from "@/lib/money";
import { parsePeriod, periodQuery, periodTitle } from "@/lib/period";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "HPP & parameter · Sistem Pengelolaan Jagung Desa Baturejo" };

const timeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const pct1 = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`text-right tabular-nums ${strong ? "font-semibold" : ""}`}>{children}</span>
    </div>
  );
}

// HPP kelompok (keputusan pengguna 19 Nov 2026, Tahap A & B): HPP per jenis batch dengan rincian komponen
// (bahan, BBM, tenaga, kemasan & lain, biaya tetap bulanan), rendemen aktual vs target, HPP per kemasan dengan
// laba/margin/markup terhadap harga katalog, dan parameter yang bisa diedit admin kelompok. Sistem tanpa kas.
export default async function HppPage({ searchParams }: PageProps<"/hpp">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canManage = canDo(user.roles, "hpp.kelola");
  const period = parsePeriod(await searchParams);
  const [settings, data] = await Promise.all([hppSettings(), hppOverview(period.from, period.to)]);

  // per jenis batch: jumlahkan komponen (rupiah bulat) & berat (gram bulat)
  type Agg = { name: string; outputProductId: string | null; n: number; inG: number; outG: number; material: number; bbm: number; labor: number; other: number; fixed: number; total: number };
  const byType = new Map<string, Agg>();
  for (const b of data.batches) {
    const a = byType.get(b.batch_type) ?? { name: b.batch_type_rules?.name ?? b.batch_type, outputProductId: b.batch_type_rules?.output_product_id ?? null, n: 0, inG: 0, outG: 0, material: 0, bbm: 0, labor: 0, other: 0, fixed: 0, total: 0 };
    const cost = (cats: string[]) => (b.batch_costs ?? []).filter((c) => cats.includes(c.category)).reduce((s, c) => s + c.amount_rp, 0);
    a.n += 1;
    a.inG += dbKgToGrams(b.input_kg);
    a.outG += dbKgToGrams(b.output_kg);
    a.material += b.material_cost ?? 0;
    a.bbm += cost(["listrik_bbm"]);
    a.labor += cost(["tenaga_kerja"]);
    a.other += cost(["kemasan", "lain"]);
    a.fixed += b.fixed_cost_rp;
    a.total += b.total_cost ?? 0;
    byType.set(b.batch_type, a);
  }
  const types = [...byType.entries()].map(([type, a]) => ({ type, ...a, hpp: a.outG > 0 ? Math.round((a.total * 1000) / a.outG) : null }));
  const target: Record<string, number | undefined> = { pemipilan: settings?.rendemen_pipil_pct, penepungan: settings?.rendemen_tepung_pct };
  const perKg = (rp: number, g: number) => (g > 0 ? formatRupiah(Math.round((rp * 1000) / g)) : "—");

  // HPP per kemasan: HPP periode (bila ada batch) atau rata-rata nilai stok saat ini, + biaya kemasan & desain.
  const hppByProduct = new Map<string, number>();
  for (const t of types) if (t.outputProductId && t.hpp != null) hppByProduct.set(t.outputProductId, t.hpp);
  const stockAvg = new Map(data.stock.map((s) => [s.product_id, s.avg_cost_per_kg]));
  const packs = data.packs
    .filter((p) => p.products)
    .map((p) => {
      const periodHpp = hppByProduct.get(p.product_id);
      const hppKg = periodHpp ?? stockAvg.get(p.product_id) ?? null;
      const unitCost = packagingUnitCost(hppKg, dbKgToGrams(p.content_kg), p.cost_rp);
      const price = p.default_price ?? (p.products?.default_price_per_kg != null ? Math.round((p.products.default_price_per_kg * dbKgToGrams(p.content_kg)) / 1000) : null);
      return { ...p, hppKg, source: periodHpp != null ? "periode" : "stok", unitCost, price };
    });

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">HPP & parameter</h1>
          <p className="text-sm text-text-muted">{periodTitle(period)} · harga pokok produksi kelompok · sistem tanpa kas</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <PeriodFilter period={period} basePath="/hpp" />
          <Link href={`/laporan/hpp?${periodQuery(period)}`} className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Rincian per batch
          </Link>
        </div>
      </div>
      <CustomRange period={period} basePath="/hpp" />

      {data.error ? (
        <EmptyState title="Data HPP tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">HPP per jenis batch</h2>
              {!types.length ? (
                <EmptyState title="Belum ada batch terkonfirmasi di periode ini">Pilih periode lain atau konfirmasi batch produksi.</EmptyState>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {types.map((t) => {
                    const yieldPct = pct1(t.outG, t.inG);
                    const tgt = target[t.type];
                    return (
                      <Card key={t.type} className="gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-label text-text-muted">
                            {t.name} · {t.n} batch
                          </span>
                          {yieldPct != null && tgt != null && <Badge tone={yieldPct >= tgt ? "ok" : "warn"}>Rendemen {pctText(yieldPct)}</Badge>}
                        </div>
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{t.hpp != null ? formatRupiah(t.hpp) : "—"}</span>
                          <span className="text-sm text-text-muted">/ kg</span>
                        </span>
                        <div className="flex flex-col gap-1.5">
                          <Row label="Bahan">{perKg(t.material, t.outG)}/kg</Row>
                          <Row label="BBM">{perKg(t.bbm, t.outG)}/kg</Row>
                          <Row label="Tenaga">{perKg(t.labor, t.outG)}/kg</Row>
                          <Row label="Kemasan & lain">{perKg(t.other, t.outG)}/kg</Row>
                          <Row label="Biaya tetap bulanan">{perKg(t.fixed, t.outG)}/kg</Row>
                          <div className="my-0.5 border-t border-border" />
                          <Row label={`Input → output`}>
                            {formatKg(t.inG)} → {formatKg(t.outG)}
                          </Row>
                          {tgt != null && <Row label="Rendemen target">{pctText(tgt)}</Row>}
                          <Row label="Total biaya" strong>
                            {formatRupiah(t.total)}
                          </Row>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="font-semibold">HPP per kemasan & laba</h2>
                <p className="text-xs text-text-muted">
                  HPP per unit = HPP/kg × isi + biaya kemasan & desain. Margin = laba ÷ harga jual; markup = laba ÷ HPP (untung 50% = markup 50% = margin 33,3%).
                </p>
              </div>
              {!packs.length ? (
                <EmptyState title="Belum ada kemasan">Tambahkan kemasan di Anggota & produk → Produk.</EmptyState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Kemasan</Th>
                      <Th num>HPP/kg</Th>
                      <Th num>Biaya kemasan</Th>
                      <Th num>HPP/unit</Th>
                      <Th num>Harga jual</Th>
                      <Th num>Laba</Th>
                      <Th num>Margin · markup</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {packs.map((p) => {
                      const label = `${p.products?.name ?? "Produk"} ${p.packagings?.name?.toLowerCase() ?? "kemasan"} ${formatKg(dbKgToGrams(p.content_kg))}`;
                      const lab = p.price != null && p.unitCost != null ? p.price - p.unitCost : null;
                      return (
                        <tr key={p.id}>
                          <Td>
                            <span className="font-medium">{label}</span>
                            <Sub>{p.hppKg != null ? (p.source === "periode" ? "HPP batch periode ini" : "rata-rata nilai stok") : "belum ada HPP"}</Sub>
                          </Td>
                          <Td num>{p.hppKg != null ? formatRupiah(p.hppKg) : "—"}</Td>
                          <Td num>{canManage ? <PackagingCostInput id={p.id} cost={p.cost_rp} label={label} /> : formatRupiah(p.cost_rp)}</Td>
                          <Td num className="font-medium">
                            {p.unitCost != null ? formatRupiah(p.unitCost) : "—"}
                          </Td>
                          <Td num>{p.price != null ? formatRupiah(p.price) : "—"}</Td>
                          <Td num className={lab != null && lab < 0 ? "text-danger" : undefined}>
                            {lab != null ? formatRupiah(lab) : "—"}
                          </Td>
                          <Td num>
                            {pctText(marginPct(p.price, p.unitCost))} · {pctText(markupPct(p.price, p.unitCost))}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
              {packs.some((p) => p.price != null && p.unitCost != null && p.price < p.unitCost) && (
                <p className="text-sm text-danger">Ada kemasan yang harga jualnya di bawah HPP. Periksa harga katalog di Anggota & produk.</p>
              )}
            </section>

            {data.runs.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-semibold">Hitung ulang HPP terakhir</h2>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {data.runs.map((r) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-x-3 text-text-muted">
                      <span>{r.reason}</span>
                      <span className="tabular-nums">{timeFmt.format(new Date(r.run_at))}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-subtle">Setiap hitung ulang mencatat nilai sebelum → sesudah (log hitung ulang HPP di database).</p>
              </section>
            )}
          </div>

          <Card className="gap-4 lg:sticky lg:top-6">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-semibold">Parameter HPP</h2>
              <p className="text-xs text-text-muted">
                {settings?.updated_by_name ? `Terakhir diubah ${settings.updated_by_name} · ${timeFmt.format(new Date(settings.updated_at))}` : "Nilai awal: harga pasar Pati & Sukolilo, 19 Nov 2026"}
              </p>
            </div>
            {settings ? <HppSettingsForm settings={settings} canManage={canManage} /> : <p className="text-sm text-text-muted">Parameter tidak dapat dimuat.</p>}
          </Card>
        </div>
      )}
    </>
  );
}
