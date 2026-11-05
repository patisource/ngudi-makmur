import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Pagination, Sub, Table, Td, Th } from "@/components/ui/table";
import { PAGE_SIZE } from "@/features/master/queries";
import { listChannels, listOrders, parseOrderFilter } from "@/features/orders/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/order";
import type { OrderPaymentStatus, OrderStatus } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Penjualan · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const inputCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm";
const NOTICE: Record<string, string> = { hapus: "Draft pesanan dihapus." };

// Daftar pesanan (FR-SAL-07, T6.5): status barang & status bayar sebagai dua badge terpisah; filter saluran,
// status, tanggal; cari nomor INV atau nama pelanggan.
export default async function OrdersPage({ searchParams }: PageProps<"/penjualan">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canManage = canDo(user.roles, "penjualan.kelola");
  const sp = await searchParams;
  const f = parseOrderFilter(sp);
  const [{ data, count, error }, channels] = await Promise.all([listOrders(f), listChannels()]);
  const filtered = Boolean(f.q || f.status || f.pay || f.channel || f.from || f.to);
  const href = (page: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, status: f.status, bayar: f.pay, saluran: f.channel, dari: f.from, sampai: f.to })) if (v) q.set(k, v);
    q.set("page", String(page));
    return `/penjualan?${q}`;
  };
  const notice = typeof sp.simpan === "string" ? NOTICE[sp.simpan] : undefined;

  return (
    <>
      <PageHeader
        title="Penjualan"
        description="Pesanan pelanggan. Draft belum mengubah stok; konfirmasi menerbitkan nomor INV dan mereservasi stok; serah barang mengeluarkan stok. Status bayar terpisah dari status barang."
        actions={
          canManage && (
            <Link href="/penjualan/baru" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
              Catat pesanan
            </Link>
          )
        }
      />
      {notice && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          {notice}
        </p>
      )}

      <Card className="p-4">
        <form method="get" className="grid grid-cols-2 items-end gap-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))_auto]">
          <label className="col-span-2 flex flex-col gap-1 text-label md:col-span-3 xl:col-span-1">
            Cari
            <input type="search" name="q" defaultValue={f.q} placeholder="Nomor INV atau pelanggan" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Barang
            <select name="status" defaultValue={f.status ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Bayar
            <select name="bayar" defaultValue={f.pay ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {(Object.keys(PAYMENT_STATUS_LABEL) as OrderPaymentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Saluran
            <select name="saluran" defaultValue={f.channel ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {channels.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Dari
            <input type="date" name="dari" defaultValue={f.from ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Sampai
            <input type="date" name="sampai" defaultValue={f.to ?? ""} className={inputCls} />
          </label>
          <div className="col-span-2 flex gap-2 md:col-span-1">
            <button type="submit" className="h-10 flex-1 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Terapkan
            </button>
            {filtered && (
              <Link href="/penjualan" className="inline-flex h-10 items-center rounded-md px-3 text-sm text-text-muted hover:bg-surface-muted">
                Reset
              </Link>
            )}
          </div>
        </form>
      </Card>

      {error ? (
        <EmptyState title="Daftar pesanan tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={filtered ? "Tidak ada pesanan yang cocok" : "Belum ada pesanan"}>
          {filtered ? "Ubah kata kunci, rentang tanggal, atau filter." : canManage ? "Klik Catat pesanan untuk mencatat penjualan pertama." : "Admin kelompok belum mencatat pesanan."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Nomor</Th>
                <Th>Saluran</Th>
                <Th num>Total</Th>
                <Th>Barang</Th>
                <Th>Bayar</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap">{dateFmt.format(new Date(`${o.business_date}T00:00:00+07:00`))}</Td>
                  <Td>
                    <Link href={`/penjualan/${o.id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
                      {o.doc_number ?? "Draft"}
                    </Link>
                    <Sub>{o.customer_name}</Sub>
                  </Td>
                  <Td>{o.sales_channels?.name ?? o.channel}</Td>
                  <Td num>{formatRupiah(o.total_rp)}</Td>
                  <Td>
                    <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                  </Td>
                  <Td>{o.status === "draft" || o.status === "cancelled" ? <span className="text-text-subtle">—</span> : <Badge tone={PAYMENT_STATUS_TONE[o.payment_status]}>{PAYMENT_STATUS_LABEL[o.payment_status]}</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={f.page} pageSize={PAGE_SIZE} total={count ?? 0} href={href} />
        </>
      )}
    </>
  );
}
