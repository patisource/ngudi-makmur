import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { irtBatches } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Produksi IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

// Daftar batch produksi IRT (IPR): bahan → produk jadi (pcs), HPP per pcs.
export default async function IrtBatchesPage() {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const canManage = canDo(user.roles, "irt.kelola");
  const { data, error } = await irtBatches();

  return (
    <>
      <PageHeader
        title="Produksi IRT"
        description="Setiap batch mencatat bahan yang dipakai dan hasil produk jadi dalam pcs. HPP per pcs = nilai bahan ÷ jumlah pcs, dikunci saat dikonfirmasi."
        actions={
          canManage ? (
            <Link href="/irt/produksi/baru" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
              Catat produksi
            </Link>
          ) : undefined
        }
      />
      {error ? (
        <EmptyState title="Daftar produksi tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title="Belum ada produksi">{canManage ? "Catat batch pertama: bahan yang dipakai dan jumlah pcs yang jadi." : "Belum ada catatan dari pengurus IRT."}</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Batch</Th>
              <Th>Hasil</Th>
              <Th num>Nilai bahan</Th>
              <Th num>HPP / pcs</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => {
              const hasil = b.irt_batch_lines.filter((l) => l.role === "hasil").sort((x, y) => x.sort_order - y.sort_order);
              return (
                <tr key={b.id}>
                  <Td>
                    <Link href={`/irt/produksi/${b.id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
                      {b.doc_number ?? "Draft"}
                    </Link>
                    <span className="ml-2">
                      <Badge tone={b.status === "confirmed" ? "ok" : "neutral"}>{b.status === "confirmed" ? "Terkonfirmasi" : "Draft"}</Badge>
                    </span>
                    <Sub>
                      {day.format(new Date(`${b.business_date}T00:00:00+07:00`))} · {b.created_by_name}
                    </Sub>
                  </Td>
                  <Td>
                    {hasil.map((l, i) => (
                      <span key={i} className="block">
                        {l.irt_items?.name} · {Number(l.qty)} pcs
                      </span>
                    ))}
                  </Td>
                  <Td num>{b.input_value_rp != null ? formatRupiah(b.input_value_rp) : "—"}</Td>
                  <Td num>{b.hpp_per_pcs != null ? <strong className="font-semibold">{formatRupiah(b.hpp_per_pcs)}</strong> : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
