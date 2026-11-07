import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { IrtAdjustButton } from "@/features/irt/components/irt-actions";
import { irtAdjustments, irtKelompokStock, irtStock } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatIrtQty, pcsWithPack } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Stok IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

// Stok IRT: produk jadi (pcs + pack) dan bahan; koreksi langsung beralasan; stok tepung kelompok sebagai acuan (baca saja).
export default async function IrtStockPage() {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const canManage = canDo(user.roles, "irt.kelola");
  const [{ data, error }, kelompok, adjustments] = await Promise.all([irtStock(), canManage ? irtKelompokStock() : Promise.resolve([]), irtAdjustments(20)]);
  const rows = data ?? [];
  const produk = rows.filter((r) => r.kind === "produk");
  const bahan = rows.filter((r) => r.kind === "bahan");

  const table = (list: typeof rows, title: string) => (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{title}</h2>
      {!list.length ? (
        <EmptyState title={`Belum ada ${title.toLowerCase()}`}>Tambahkan di menu Bahan &amp; produk.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nama</Th>
              <Th num>Stok</Th>
              <Th num>Nilai</Th>
              <Th num>Rata-rata</Th>
              {canManage && <Th num>Aksi</Th>}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.item_id}>
                <Td>
                  <Link href={`/irt/stok/${r.item_id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                  <Sub>minimum {formatIrtQty(Number(r.min_stock), r.unit)}</Sub>
                </Td>
                <Td num>
                  <strong className="font-semibold">{r.kind === "produk" ? pcsWithPack(Number(r.on_hand), r.pack_size) : formatIrtQty(Number(r.on_hand), r.unit)}</strong>
                  {r.below_min && (
                    <span className="mt-1 block">
                      <Badge tone="warn">Di bawah minimum</Badge>
                    </span>
                  )}
                </Td>
                <Td num>{formatRupiah(r.value_rp)}</Td>
                <Td num>{r.avg_cost != null ? `${formatRupiah(r.avg_cost)}/${r.unit}` : "—"}</Td>
                {canManage && (
                  <Td num>
                    <IrtAdjustButton item={{ item_id: r.item_id, name: r.name, unit: r.unit, on_hand: Number(r.on_hand) }} />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );

  return (
    <>
      <PageHeader
        title="Stok IRT"
        description="Stok berubah hanya lewat bahan masuk, produksi, penjualan, dan koreksi. Produk jadi dihitung per pcs; pack = isi pcs tetap per produk."
      />
      {error ? (
        <EmptyState title="Stok tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : (
        <>
          {table(produk, "Produk jadi")}
          {table(bahan, "Bahan")}
          {canManage && kelompok.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Stok kelompok (baca saja)</h2>
              <p className="text-sm text-text-muted">Acuan sebelum memesan ke kelompok. Tersedia = stok fisik − pesanan yang sudah dipesan pelanggan lain.</p>
              <Table>
                <thead>
                  <tr>
                    <Th>Produk kelompok</Th>
                    <Th num>Tersedia</Th>
                  </tr>
                </thead>
                <tbody>
                  {kelompok.map((k) => (
                    <tr key={k.product_id}>
                      <Td>{k.name}</Td>
                      <Td num>
                        <strong className="font-semibold">{formatKg(dbKgToGrams(k.available_kg))}</strong>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          )}
          {(adjustments.data ?? []).length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Koreksi terakhir</h2>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
                {(adjustments.data ?? []).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span>
                      <span className="font-mono text-xs">{a.doc_number}</span> · {a.irt_items?.name}{" "}
                      <span className={a.direction === "out" ? "text-danger" : "text-accent"}>
                        {a.direction === "out" ? "−" : "+"}
                        {a.irt_items ? formatIrtQty(Number(a.qty), a.irt_items.unit) : a.qty}
                      </span>
                    </span>
                    <span className="text-xs text-text-muted">
                      {a.reason} · {day.format(new Date(`${a.business_date}T00:00:00+07:00`))} · {a.created_by_name}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
