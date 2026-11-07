import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { irtSales } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Penjualan IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

// Penjualan IRT (IJL): jumlah & omzet per pcs/pack, tanpa pembayaran atau kas.
export default async function IrtSalesPage() {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const canManage = canDo(user.roles, "irt.kelola");
  const { data, error } = await irtSales();

  return (
    <>
      <PageHeader
        title="Penjualan IRT"
        description="Penjualan produk jadi per pcs atau per pack. Yang dicatat jumlah dan omzet; tidak ada pembayaran atau kas."
        actions={
          canManage ? (
            <Link href="/irt/penjualan/baru" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
              Catat penjualan
            </Link>
          ) : undefined
        }
      />
      {error ? (
        <EmptyState title="Daftar penjualan tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title="Belum ada penjualan">{canManage ? "Catat penjualan pertama setelah ada stok produk jadi." : "Belum ada catatan dari pengurus IRT."}</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nomor</Th>
              <Th>Pembeli</Th>
              <Th num>Jumlah</Th>
              <Th num>Total</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className={s.status === "void" ? "text-text-muted" : undefined}>
                <Td>
                  <Link href={`/irt/penjualan/${s.id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
                    {s.doc_number}
                  </Link>
                  {s.status === "void" && (
                    <span className="ml-2">
                      <Badge tone="err">Dibatalkan</Badge>
                    </span>
                  )}
                  <Sub>
                    {day.format(new Date(`${s.business_date}T00:00:00+07:00`))} · {s.created_by_name}
                  </Sub>
                </Td>
                <Td>{s.buyer_name ?? "—"}</Td>
                <Td num>{s.total_pcs} pcs</Td>
                <Td num>{s.status === "void" ? <s>{formatRupiah(s.total_rp)}</s> : formatRupiah(s.total_rp)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
