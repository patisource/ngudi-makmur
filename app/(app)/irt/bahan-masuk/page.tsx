import type { Metadata } from "next";
import { Badge, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { IrtReceiveButton } from "@/features/irt/components/receive-form";
import { irtReceipts, irtStock } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatIrtQty } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Bahan masuk IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

// Bahan masuk IRT (IBM): pembelian sendiri + tepung dari kelompok (otomatis saat pesanan IRT diserahkan). Tanpa kas.
export default async function IrtReceiptsPage() {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const canManage = canDo(user.roles, "irt.kelola");
  const [{ data, error }, stock] = await Promise.all([irtReceipts(), canManage ? irtStock() : Promise.resolve({ data: [] })]);
  const bahan = (stock.data ?? []).filter((r) => r.kind === "bahan");

  return (
    <>
      <PageHeader
        title="Bahan masuk"
        description="Tepung yang dibeli dari kelompok tercatat otomatis saat pesanan diserahkan. Bahan lain (gula, telur, minyak, kemasan) dicatat di sini. Harga beli hanya untuk HPP, bukan kas."
        actions={canManage ? <IrtReceiveButton bahan={bahan} /> : undefined}
      />
      {error ? (
        <EmptyState title="Bahan masuk tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title="Belum ada bahan masuk">{canManage ? "Catat pembelian bahan pertama, atau tunggu pesanan tepung dari kelompok diserahkan." : "Belum ada catatan dari pengurus IRT."}</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nomor</Th>
              <Th>Asal</Th>
              <Th>Isi</Th>
              <Th num>Nilai bahan</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <Td>
                  <span className="font-mono text-xs font-medium">{r.doc_number}</span>
                  <Sub>
                    {day.format(new Date(`${r.business_date}T00:00:00+07:00`))} · {r.created_by_name}
                  </Sub>
                </Td>
                <Td>
                  {r.source === "kelompok" ? <Badge tone="ok">Kelompok · {r.order_doc_number}</Badge> : <span>{r.supplier ?? "Dibeli"}</span>}
                  {r.note && <Sub>{r.note}</Sub>}
                </Td>
                <Td>
                  {[...r.irt_receipt_lines]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((l, i) => (
                      <span key={i} className="block">
                        {l.irt_items?.name} · {l.irt_items ? formatIrtQty(Number(l.qty), l.irt_items.unit) : l.qty}
                      </span>
                    ))}
                </Td>
                <Td num>{formatRupiah(r.total_value_rp)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
