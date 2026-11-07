import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { IrtBatchEditor } from "@/features/irt/components/batch-editor";
import { irtStock } from "@/features/irt/queries";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Catat produksi IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

export default async function NewIrtBatchPage() {
  await requireAction("irt.kelola");
  const { data, error } = await irtStock();
  const bahan = (data ?? []).filter((r) => r.kind === "bahan");
  const produk = (data ?? []).filter((r) => r.kind === "produk");

  return (
    <>
      <PageHeader title="Catat produksi" description="Simpan sebagai draft dulu; stok berubah setelah dikonfirmasi." />
      {error ? (
        <EmptyState title="Data tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !bahan.length || !produk.length ? (
        <EmptyState title="Bahan atau produk belum ada">
          Tambahkan dulu bahan dan produk jadi di{" "}
          <Link href="/irt/produk" className="underline underline-offset-4">
            Bahan &amp; produk
          </Link>
          .
        </EmptyState>
      ) : (
        <IrtBatchEditor
          bahan={bahan.map((b) => ({ item_id: b.item_id, name: b.name, unit: b.unit, on_hand: Number(b.on_hand), avg_cost: b.avg_cost }))}
          produk={produk.map((p) => ({ item_id: p.item_id, name: p.name, pack_size: p.pack_size }))}
        />
      )}
    </>
  );
}
