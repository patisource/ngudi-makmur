import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { listProducts } from "@/features/master/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Produk & kemasan · Sistem Pengelolaan Jagung Desa Baturejo" };

// Produk v1 (PRD §4.0): TK, PP, TP — semua kg. Produk baru tidak dibuat dari aplikasi (keputusan domain, CLAUDE.md).
export default async function ProductsPage() {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canManage = canDo(user.roles, "master.kelola");
  const { data, error } = await listProducts();

  if (error) return <EmptyState title="Daftar produk tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>;
  if (!data?.length) return <EmptyState title="Belum ada produk">Data dasar produk dimuat lewat migrasi database.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <thead>
          <tr>
            <Th>Produk</Th>
            <Th>Kategori</Th>
            <Th num>Harga default / kg</Th>
            <Th num>Stok minimum</Th>
            <Th>Kemasan penjualan</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => {
            const conv = (p.product_packagings ?? []).filter((c) => !c.archived_at).sort((a, b) => Number(a.content_kg) - Number(b.content_kg));
            return (
              <tr key={p.id}>
                <Td>
                  {canManage ? (
                    <Link href={`/master/produk/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{p.name}</span>
                  )}
                  <Sub>
                    {p.code} · satuan {p.base_unit}
                  </Sub>
                </Td>
                <Td className="capitalize">{p.category}</Td>
                <Td num>{p.default_price_per_kg != null ? formatRupiah(p.default_price_per_kg) : <span className="text-text-subtle">Belum ditetapkan</span>}</Td>
                <Td num>{formatKg(dbKgToGrams(p.min_stock_kg))}</Td>
                <Td>
                  {conv.length ? (
                    <ul className="flex flex-col gap-0.5">
                      {conv.map((c) => (
                        <li key={c.id}>
                          {c.packagings?.name} {formatKg(dbKgToGrams(c.content_kg))}
                          <span className="text-text-subtle"> · {c.default_price != null ? formatRupiah(c.default_price) : "harga belum ada"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-text-subtle">Curah per kg</span>
                  )}
                </Td>
                <Td>{p.archived_at ? <Badge>Diarsip</Badge> : <Badge tone="ok">Aktif</Badge>}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="text-xs text-text-subtle">Kode, kategori, dan satuan kg terkunci karena dipakai aturan produksi. Produk baru perlu keputusan kelompok (PRD §4.0) dan ditambahkan lewat pembaruan sistem.</p>
    </div>
  );
}
