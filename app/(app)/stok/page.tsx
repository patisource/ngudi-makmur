import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { listStockBalances } from "@/features/stock/queries";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Stok · Sistem Pengelolaan Jagung Desa Baturejo" };

// Daftar stok (FR-STK-01): fisik tercatat, reservasi, tersedia, nilai persediaan, tanda di bawah minimum.
export default async function StockPage() {
  await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const { data, error } = await listStockBalances();
  const rows = (data ?? []).filter((r) => !r.archived_at || dbKgToGrams(r.on_hand_kg) > 0);
  const totalValue = rows.reduce((s, r) => s + r.value_rp, 0);

  return (
    <>
      <PageHeader
        title="Stok"
        description="Fisik tercatat = mutasi masuk − keluar. Tersedia = fisik tercatat − reservasi pesanan aktif. Semua dalam kg; nilai memakai rata-rata bergerak."
        actions={
          <>
            <Link href="/stok/opname" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Stok opname
            </Link>
            <Link href="/stok/koreksi" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Koreksi stok
            </Link>
          </>
        }
      />
      {error ? (
        <EmptyState title="Stok tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !rows.length ? (
        <EmptyState title="Belum ada produk">Produk dasar dimuat lewat migrasi database.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Produk</Th>
                <Th num>Fisik tercatat</Th>
                <Th num>Reservasi</Th>
                <Th num>Tersedia</Th>
                <Th num>Nilai persediaan</Th>
                <Th num>Rata-rata / kg</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id}>
                  <Td>
                    <Link href={`/stok/${r.product_id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <Sub>
                      {r.code} · minimum {formatKg(dbKgToGrams(r.min_stock_kg))}
                    </Sub>
                  </Td>
                  <Td num>{formatKg(dbKgToGrams(r.on_hand_kg))}</Td>
                  <Td num>{formatKg(dbKgToGrams(r.reserved_kg))}</Td>
                  <Td num>
                    <strong className="font-semibold">{formatKg(dbKgToGrams(r.available_kg))}</strong>
                    {r.below_min && (
                      <span className="mt-1 block">
                        <Badge tone="warn">Di bawah minimum</Badge>
                      </span>
                    )}
                  </Td>
                  <Td num>{formatRupiah(r.value_rp)}</Td>
                  <Td num>{r.avg_cost_per_kg != null ? formatRupiah(r.avg_cost_per_kg) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-sm text-text-muted">
            Total nilai persediaan: <strong className="font-semibold text-text">{formatRupiah(totalValue)}</strong>. Stok berubah hanya lewat jagung masuk, produksi,
            penjualan, retur, opname, dan koreksi — tidak pernah diubah langsung.
          </p>
        </>
      )}
    </>
  );
}
