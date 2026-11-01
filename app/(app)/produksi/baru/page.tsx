import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { BatchEditor } from "@/features/production/components/batch-editor";
import { batchTypeOptions } from "@/features/production/queries";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Catat batch · SIM Ngudi Makmur" };

export default async function NewBatchPage() {
  await requireAction("produksi.kelola");
  const options = await batchTypeOptions();

  return (
    <>
      <PageHeader
        title="Catat batch produksi"
        description="Pilih jenis batch, isi berat input dan output (kg), rincian sisa, dan biaya. Simpan sebagai draft; stok berubah setelah dikonfirmasi."
        actions={
          <Link href="/produksi" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali
          </Link>
        }
      />
      {options.length ? (
        <BatchEditor batchId={null} options={options} />
      ) : (
        <EmptyState title="Belum ada jenis batch">Aturan pemipilan dan penepungan dimuat lewat migrasi database.</EmptyState>
      )}
    </>
  );
}
