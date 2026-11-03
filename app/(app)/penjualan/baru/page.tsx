import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { OrderForm } from "@/features/orders/components/order-form";
import { orderFormOptions } from "@/features/orders/queries";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Catat pesanan · SIM Ngudi Makmur" };

export default async function NewOrderPage() {
  await requireAction("penjualan.kelola");
  const { error, ...options } = await orderFormOptions();

  return (
    <>
      <PageHeader
        title="Catat pesanan"
        description="Pilih saluran dan pelanggan, lalu isi item per kemasan atau kg curah. Simpan sebagai draft; stok direservasi setelah dikonfirmasi."
        actions={
          <Link href="/penjualan" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali
          </Link>
        }
      />
      {error ? (
        <EmptyState title="Data pilihan tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !options.products.length || !options.channels.length ? (
        <EmptyState title="Produk atau saluran penjualan belum tersedia">Lengkapi di menu Anggota &amp; produk sebelum mencatat pesanan.</EmptyState>
      ) : (
        <OrderForm orderId={null} options={options} />
      )}
    </>
  );
}
