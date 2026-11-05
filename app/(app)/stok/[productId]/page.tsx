import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { getStockProduct, listStockCard, MOVEMENT_LABEL, MOVEMENT_TYPES } from "@/features/stock/queries";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Kartu stok · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const inputCls = "h-10 rounded-md border border-border bg-surface px-3 text-sm";

// Kartu stok (FR-STK-02): tanggal, jenis, nomor dokumen, masuk, keluar, saldo berjalan; filter tanggal & jenis.
export default async function StockCardPage({ params, searchParams }: PageProps<"/stok/[productId]">) {
  await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const { productId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) notFound();
  const sp = await searchParams;
  const [{ data: product }, { data: rows, error }] = await Promise.all([getStockProduct(productId), listStockCard(productId, { from: sp.dari, to: sp.sampai, type: sp.jenis })]);
  if (!product) notFound();
  const filtered = Boolean(sp.dari || sp.sampai || sp.jenis);

  return (
    <>
      <PageHeader
        title={`Kartu stok · ${product.name}`}
        description={`${product.code} · fisik ${formatKg(dbKgToGrams(product.on_hand_kg))}, reservasi ${formatKg(dbKgToGrams(product.reserved_kg))}, tersedia ${formatKg(dbKgToGrams(product.available_kg))}`}
        actions={
          <Link href="/stok" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali ke stok
          </Link>
        }
      />
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-label">
            Dari
            <input type="date" name="dari" defaultValue={typeof sp.dari === "string" ? sp.dari : ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Sampai
            <input type="date" name="sampai" defaultValue={typeof sp.sampai === "string" ? sp.sampai : ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Jenis
            <select name="jenis" defaultValue={typeof sp.jenis === "string" ? sp.jenis : ""} className={inputCls}>
              <option value="">Semua jenis</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MOVEMENT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Terapkan
          </button>
        </form>
      </Card>
      {error ? (
        <EmptyState title="Mutasi tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !rows?.length ? (
        <EmptyState title={filtered ? "Tidak ada mutasi yang cocok" : "Belum ada mutasi"}>
          {filtered ? "Ubah rentang tanggal atau jenis." : "Mutasi muncul setelah jagung masuk, produksi, atau penjualan dikonfirmasi."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Tanggal</Th>
              <Th>Jenis</Th>
              <Th>Nomor dokumen</Th>
              <Th num>Masuk</Th>
              <Th num>Keluar</Th>
              <Th num>Saldo</Th>
              <Th num>Nilai</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap">{dateFmt.format(new Date(m.business_date + "T00:00:00+07:00"))}</Td>
                <Td>
                  {MOVEMENT_LABEL[m.movement_type]}
                  {m.note && <Sub>{m.note}</Sub>}
                </Td>
                <Td className="font-mono text-xs">{m.doc_number ?? "—"}</Td>
                <Td num>{m.direction === "in" ? formatKg(dbKgToGrams(m.qty_kg)) : ""}</Td>
                <Td num>{m.direction === "out" ? formatKg(dbKgToGrams(m.qty_kg)) : ""}</Td>
                <Td num className="font-medium">
                  {formatKg(dbKgToGrams(m.balance_after_kg))}
                </Td>
                <Td num className="text-text-muted">
                  {formatRupiah(m.value_rp)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
