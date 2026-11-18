import type { Metadata } from "next";
import { CustomRange, PeriodFilter } from "@/components/shared/period-filter";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { IrtItemCostsForm, IrtRecipeForm } from "@/features/irt/components/hpp-forms";
import { irtHppSummary, irtRecipes, irtStock } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { marginPct, markupPct, pctText, suggestedPrice } from "@/lib/hpp";
import { formatRupiah } from "@/lib/money";
import { parsePeriod, periodTitle } from "@/lib/period";

export const metadata: Metadata = { title: "HPP & resep IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const rp = (n: number | null | undefined) => (n == null ? "—" : formatRupiah(Math.round(n)));

// HPP IRT (keputusan pengguna 19 Nov 2026, Tahap A, C, D, E): per produk HPP standar (resep × harga standar bahan +
// gas per resep, dibagi hasil per resep, + upah & kemasan per pcs) vs HPP aktual dari batch periode; harga jual,
// laba, margin, markup, dan harga saran dari target markup. Resep & tarif dikelola pengurus IRT. Tanpa kas.
export default async function IrtHppPage({ searchParams }: PageProps<"/irt/hpp">) {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const canManage = canDo(user.roles, "irt.kelola");
  const period = parsePeriod(await searchParams);
  const [summary, recipes, stock] = await Promise.all([irtHppSummary(period), irtRecipes(), irtStock()]);
  const items = (stock.data ?? []).filter((i) => i.archived_at === null);
  const bahan = items.filter((i) => i.kind === "bahan");
  const produk = items.filter((i) => i.kind === "produk");

  const rows = summary.rows.map((r) => {
    const actual = r.pcs > 0 ? r.total_rp / r.pcs : null;
    const basis = actual ?? r.std_hpp_per_pcs; // laba dihitung dari HPP aktual bila ada batch, selain itu standar
    return {
      ...r,
      actual,
      basis,
      margin: marginPct(r.price_pcs, basis != null ? Math.round(basis) : null),
      markup: markupPct(r.price_pcs, basis != null ? Math.round(basis) : null),
      suggested: suggestedPrice(basis != null ? Math.round(basis) : null, r.target_markup_pct),
    };
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">HPP & resep IRT</h1>
          <p className="text-sm text-text-muted">{periodTitle(period)} · HPP standar vs aktual, harga saran · tanpa kas</p>
        </div>
        <PeriodFilter period={period} basePath="/irt/hpp" />
      </div>
      <CustomRange period={period} basePath="/irt/hpp" />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-semibold">HPP per produk</h2>
          <p className="text-xs text-text-muted">
            Standar = resep × harga standar bahan + gas per resep, dibagi hasil per resep, + upah & kemasan per pcs. Aktual = total biaya batch periode ÷ pcs. Margin = laba ÷
            harga; markup = laba ÷ HPP.
          </p>
        </div>
        {summary.error ? (
          <EmptyState title="HPP IRT tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
        ) : !rows.length ? (
          <EmptyState title="Belum ada produk IRT">Tambahkan produk di Bahan &amp; produk.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produk</Th>
                <Th num>HPP standar</Th>
                <Th num>HPP aktual</Th>
                <Th num>Harga jual</Th>
                <Th num>Laba</Th>
                <Th num>Margin · markup</Th>
                <Th num>Harga saran</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lab = r.price_pcs != null && r.basis != null ? r.price_pcs - Math.round(r.basis) : null;
                return (
                  <tr key={r.product_id}>
                    <Td>
                      <span className="font-medium">{r.name}</span>
                      <Sub>
                        {r.recipe_yield != null ? `resep ${String(r.recipe_yield).replace(".", ",")} pcs · gas ${rp(r.recipe_gas_rp)}` : "belum ada resep"} · upah {rp(r.labor_cost_pcs)} · kemasan{" "}
                        {rp(r.packaging_cost_pcs)}/pcs
                      </Sub>
                    </Td>
                    <Td num>
                      {rp(r.std_hpp_per_pcs)}
                      {r.std_material_per_pcs != null && <Sub>bahan {rp(r.std_material_per_pcs)}</Sub>}
                      {r.std_missing_price && <Sub>ada bahan tanpa harga</Sub>}
                    </Td>
                    <Td num>
                      {rp(r.actual)}
                      {r.pcs > 0 && (
                        <Sub>
                          {Number(r.pcs)} pcs · {Number(r.batches)} batch
                        </Sub>
                      )}
                    </Td>
                    <Td num>{rp(r.price_pcs)}</Td>
                    <Td num className={lab != null && lab < 0 ? "text-danger" : undefined}>
                      {rp(lab)}
                    </Td>
                    <Td num>
                      {pctText(r.margin)} · {pctText(r.markup)}
                    </Td>
                    <Td num>
                      {rp(r.suggested)}
                      {r.target_markup_pct != null && <Sub>markup {pctText(Number(r.target_markup_pct))}</Sub>}
                      {r.suggested != null && r.price_pcs != null && r.price_pcs < r.suggested && (
                        <span className="mt-1 inline-block">
                          <Badge tone="warn">Di bawah target</Badge>
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {rows.some((r) => r.price_pcs != null && r.basis != null && r.price_pcs < r.basis) && (
          <p className="text-sm text-danger">Ada produk yang harga jualnya di bawah HPP. Ubah harga di Bahan &amp; produk.</p>
        )}
      </section>

      {canManage ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Resep</h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {produk.map((p) => {
                const r = recipes.find((x) => x.product_id === p.item_id);
                return (
                  <Card key={p.item_id} className="gap-3">
                    <h3 className="font-medium">{p.name}</h3>
                    <IrtRecipeForm
                      productId={p.item_id}
                      productName={p.name}
                      bahan={bahan.map((b) => ({ item_id: b.item_id, name: b.name, unit: b.unit }))}
                      recipe={r ? { yield_pcs: Number(r.yield_pcs), gas_rp: r.gas_rp, note: r.note, lines: r.irt_recipe_lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })) } : null}
                    />
                  </Card>
                );
              })}
            </div>
          </section>

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Card className="gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="font-semibold">Biaya per pcs produk</h2>
                <p className="text-xs text-text-muted">Upah & kemasan otomatis masuk HPP setiap batch (mis. mie: kemasan Rp800, upah Rp1.625 = Rp65.000 ÷ 40 bungkus/hari).</p>
              </div>
              {produk.map((p) => (
                <div key={p.item_id} className="flex flex-col gap-1.5 border-t border-border pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                  <span className="text-sm font-medium">{p.name}</span>
                  <IrtItemCostsForm
                    item={{ id: p.item_id, kind: "produk", name: p.name, unit: p.unit, std_price: null, packaging_cost_pcs: p.packaging_cost_pcs, labor_cost_pcs: p.labor_cost_pcs, target_markup_pct: p.target_markup_pct }}
                  />
                </div>
              ))}
            </Card>
            <Card className="gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="font-semibold">Harga standar bahan</h2>
                <p className="text-xs text-text-muted">Untuk HPP standar & harga saran. HPP aktual tetap memakai harga beli sebenarnya (rata-rata stok).</p>
              </div>
              {bahan.map((b) => (
                <IrtItemCostsForm
                  key={b.item_id}
                  item={{ id: b.item_id, kind: "bahan", name: b.name, unit: b.unit, std_price: b.std_price, packaging_cost_pcs: 0, labor_cost_pcs: 0, target_markup_pct: null }}
                />
              ))}
            </Card>
          </div>
        </>
      ) : (
        <p className="text-sm text-text-muted">Resep dan tarif dikelola pengurus IRT.</p>
      )}
    </>
  );
}
