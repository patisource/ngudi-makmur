import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { IrtArchiveButton, IrtItemButton, type IrtItemRow } from "@/features/irt/components/item-form";
import { irtKelompokProducts, irtStock } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatIrtQty, pcsWithPack } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Bahan & produk IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

// Master IRT (M10): produk jadi (pcs + isi pack + harga) dan bahan (satuan, terhubung produk kelompok atau dibeli).
export default async function IrtItemsPage({ searchParams }: PageProps<"/irt/produk">) {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const canManage = canDo(user.roles, "irt.kelola");
  const sp = await searchParams;
  const showArchived = sp.arsip === "1";
  const [{ data, error }, products] = await Promise.all([irtStock({ includeArchived: showArchived }), canManage ? irtKelompokProducts() : Promise.resolve([])]);
  const rows = (data ?? []) as IrtItemRow[];
  const produk = rows.filter((r) => r.kind === "produk");
  const bahan = rows.filter((r) => r.kind === "bahan");
  const productName = new Map(products.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader
        title="Bahan & produk"
        description="Daftar produk jadi IRT (dijual per pcs atau pack) dan bahan bakunya. Harga jual di sini dipakai otomatis saat mencatat penjualan."
        actions={
          canManage ? (
            <>
              <IrtItemButton kind="bahan" products={products} />
              <IrtItemButton kind="produk" products={products} />
            </>
          ) : undefined
        }
      />
      <Link href={showArchived ? "/irt/produk" : "/irt/produk?arsip=1"} className="w-fit text-sm text-text-muted underline underline-offset-4">
        {showArchived ? "Sembunyikan yang diarsip" : "Tampilkan yang diarsip"}
      </Link>
      {error ? (
        <EmptyState title="Data tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Produk jadi</h2>
            {!produk.length ? (
              <EmptyState title="Belum ada produk">{canManage ? "Tambahkan produk jadi beserta harga per pcs dan isi per pack." : "Pengurus IRT belum menambahkan produk."}</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Produk</Th>
                    <Th num>Harga / pcs</Th>
                    <Th num>Isi pack</Th>
                    <Th num>Harga / pack</Th>
                    <Th num>Stok</Th>
                    {canManage && <Th num>Aksi</Th>}
                  </tr>
                </thead>
                <tbody>
                  {produk.map((r) => (
                    <tr key={r.item_id}>
                      <Td>
                        <span className="font-medium">{r.name}</span>
                        {r.archived_at && (
                          <span className="ml-2">
                            <Badge>Diarsip</Badge>
                          </span>
                        )}
                        <Sub>minimum {r.min_stock} pcs</Sub>
                      </Td>
                      <Td num>{r.price_pcs != null ? formatRupiah(r.price_pcs) : "—"}</Td>
                      <Td num>{r.pack_size ? `${r.pack_size} pcs` : "—"}</Td>
                      <Td num>{r.pack_size ? formatRupiah(r.price_pack ?? (r.price_pcs ?? 0) * r.pack_size) : "—"}</Td>
                      <Td num>{pcsWithPack(Number(r.on_hand), r.pack_size)}</Td>
                      {canManage && (
                        <Td num>
                          <span className="inline-flex gap-1">
                            <IrtItemButton item={r} kind="produk" products={products} />
                            <IrtArchiveButton item={r} />
                          </span>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Bahan</h2>
            {!bahan.length ? (
              <EmptyState title="Belum ada bahan">{canManage ? "Tambahkan tepung (hubungkan ke produk kelompok), gula, telur, minyak, dan kemasan." : "Pengurus IRT belum menambahkan bahan."}</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Bahan</Th>
                    <Th>Asal</Th>
                    <Th num>Stok</Th>
                    {canManage && <Th num>Aksi</Th>}
                  </tr>
                </thead>
                <tbody>
                  {bahan.map((r) => (
                    <tr key={r.item_id}>
                      <Td>
                        <span className="font-medium">{r.name}</span>
                        {r.archived_at && (
                          <span className="ml-2">
                            <Badge>Diarsip</Badge>
                          </span>
                        )}
                        <Sub>
                          satuan {r.unit} · minimum {formatIrtQty(Number(r.min_stock), r.unit)}
                        </Sub>
                      </Td>
                      <Td>{r.kelompok_product_id ? <Badge tone="ok">Dari kelompok{productName.get(r.kelompok_product_id) ? ` · ${productName.get(r.kelompok_product_id)}` : ""}</Badge> : "Dibeli dari luar"}</Td>
                      <Td num>{formatIrtQty(Number(r.on_hand), r.unit)}</Td>
                      {canManage && (
                        <Td num>
                          <span className="inline-flex gap-1">
                            <IrtItemButton item={r} kind="bahan" products={products} />
                            <IrtArchiveButton item={r} />
                          </span>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </>
      )}
    </>
  );
}
