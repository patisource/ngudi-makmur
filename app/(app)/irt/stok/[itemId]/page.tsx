import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumb } from "@/components/shell/crumb";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { IRT_MOVEMENT_LABEL, irtStock, irtStockCard } from "@/features/irt/queries";
import { requireRole } from "@/lib/auth/session";
import { formatIrtQty, pcsWithPack } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Kartu stok IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

// Kartu stok satu bahan/produk IRT: setiap mutasi dengan nomor dokumen dan saldo setelahnya.
export default async function IrtStockCardPage({ params }: PageProps<"/irt/stok/[itemId]">) {
  await requireRole(["pengurus_irt", "ketua"]);
  const { itemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const [{ data: items }, { data, error }] = await Promise.all([irtStock({ includeArchived: true }), irtStockCard(itemId)]);
  const item = (items ?? []).find((r) => r.item_id === itemId);
  if (!item) notFound();
  const qtyText = (q: number) => (item.kind === "produk" ? pcsWithPack(q, item.pack_size) : formatIrtQty(q, item.unit));

  return (
    <>
      <Crumb label={item.name} />
      <Link href="/irt/stok" className="w-fit text-sm text-text-muted hover:text-text">
        ← Stok IRT
      </Link>
      <PageHeader title={`Kartu stok · ${item.name}`} description={`Stok sekarang ${qtyText(Number(item.on_hand))} · nilai ${formatRupiah(item.value_rp)}`} />
      {error ? (
        <EmptyState title="Mutasi tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title="Belum ada mutasi">Stok berubah lewat bahan masuk, produksi, penjualan, atau koreksi.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Tanggal</Th>
              <Th>Jenis</Th>
              <Th num>Masuk</Th>
              <Th num>Keluar</Th>
              <Th num>Saldo</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.id}>
                <Td>
                  {day.format(new Date(`${m.business_date}T00:00:00+07:00`))}
                  <Sub>{m.doc_number}</Sub>
                </Td>
                <Td>
                  {IRT_MOVEMENT_LABEL[m.movement_type]}
                  {m.note && <Sub>{m.note}</Sub>}
                </Td>
                <Td num>{m.direction === "in" ? qtyText(Number(m.qty)) : ""}</Td>
                <Td num>{m.direction === "out" ? qtyText(Number(m.qty)) : ""}</Td>
                <Td num>{qtyText(Number(m.balance_after))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
