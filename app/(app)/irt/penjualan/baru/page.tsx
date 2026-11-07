import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { IrtSaleForm } from "@/features/irt/components/sale-form";
import { irtStock } from "@/features/irt/queries";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Catat penjualan IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

export default async function NewIrtSalePage() {
  await requireAction("irt.kelola");
  const { data, error } = await irtStock();
  const products = (data ?? []).filter((r) => r.kind === "produk");

  return (
    <>
      <PageHeader title="Catat penjualan" description="Pilih produk, satuan (pcs atau pack), dan jumlah. Harga diambil dari daftar produk." />
      {error ? (
        <EmptyState title="Data tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !products.length ? (
        <EmptyState title="Belum ada produk jadi">
          Tambahkan produk dan harganya di{" "}
          <Link href="/irt/produk" className="underline underline-offset-4">
            Bahan &amp; produk
          </Link>
          , lalu catat produksi.
        </EmptyState>
      ) : (
        <IrtSaleForm
          products={products.map((p) => ({ item_id: p.item_id, name: p.name, pack_size: p.pack_size, price_pcs: p.price_pcs, price_pack: p.price_pack, on_hand: Number(p.on_hand) }))}
        />
      )}
    </>
  );
}
