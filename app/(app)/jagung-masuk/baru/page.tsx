import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { ReceiptForm } from "@/features/receipts/components/receipt-form";
import { receiptOptions } from "@/features/receipts/queries";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Catat jagung masuk · Sistem Pengelolaan Jagung Desa Baturejo" };

export default async function NewReceiptPage() {
  await requireAction("penerimaan.kelola");
  const { members, products } = await receiptOptions();

  return (
    <>
      <PageHeader
        title="Catat jagung masuk"
        description="Simpan sebagai draft dulu; stok bertambah setelah draft dikonfirmasi."
        actions={
          <Link href="/jagung-masuk" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali
          </Link>
        }
      />
      {products.length ? (
        <Card className="max-w-3xl">
          <ReceiptForm receiptId={null} members={members} products={products} />
        </Card>
      ) : (
        <EmptyState title="Belum ada produk mentah aktif">Produk tongkol dan pipilan dimuat lewat migrasi database; pastikan tidak diarsip.</EmptyState>
      )}
    </>
  );
}
