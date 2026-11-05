import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/table";
import { BatchEditor } from "@/features/production/components/batch-editor";
import { batchTypeOptions } from "@/features/production/queries";
import { requireAction } from "@/lib/auth/session";
import { Crumb } from "@/components/shell/crumb";

export const metadata: Metadata = { title: "Catat batch · Sistem Pengelolaan Jagung Desa Baturejo" };

export default async function NewBatchPage() {
  const user = await requireAction("produksi.kelola");
  const options = await batchTypeOptions();

  return (
    <>
      <Crumb label="Batch baru" />
      {options.length ? (
        <BatchEditor batchId={null} options={options} header={{ title: "Batch produksi baru", subtitle: `Operator: ${user.fullName} · kode batch terbit saat dikonfirmasi` }} />
      ) : (
        <EmptyState title="Belum ada jenis batch">Aturan pemipilan dan penepungan dimuat lewat migrasi database.</EmptyState>
      )}
    </>
  );
}
