import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, Pagination, Sub, Table, Td, Th } from "@/components/ui/table";
import { listPayments } from "@/features/cash/queries";
import { PAGE_SIZE } from "@/features/master/queries";
import { requireRole } from "@/lib/auth/session";
import { METHOD_LABEL, PAYMENT_LABEL, PAYMENT_TONE } from "@/lib/cash";
import { formatRupiah } from "@/lib/money";
import type { PaymentStatus } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Pembayaran · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

// Daftar pembayaran semua pesanan; filter "Menunggu verifikasi" untuk transfer yang perlu dicek di mutasi rekening.
// Pencatatan & verifikasi dilakukan di detail pesanan (konteks tagihan terlihat).
export default async function PaymentsPage({ searchParams }: PageProps<"/kas/pembayaran">) {
  await requireRole(["admin_kelompok", "ketua"]);
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in PAYMENT_LABEL ? (sp.status as PaymentStatus) : undefined;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const { data, count, error } = await listPayments({ status, page });

  return (
    <>
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-label">
            Status
            <select name="status" defaultValue={status ?? ""} className="h-10 rounded-md border border-border bg-surface px-3 text-sm">
              <option value="">Semua</option>
              {(Object.keys(PAYMENT_LABEL) as PaymentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Terapkan
          </button>
        </form>
        <p className="text-xs text-text-subtle">Catat, verifikasi, atau tolak pembayaran dari halaman detail pesanan.</p>
      </Card>
      {error ? (
        <EmptyState title="Daftar pembayaran tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={status ? "Tidak ada pembayaran dengan status ini" : "Belum ada pembayaran"}>Pembayaran dicatat dari halaman detail pesanan.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Pesanan</Th>
                <Th>Metode</Th>
                <Th num>Jumlah</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{dateFmt.format(new Date(`${p.business_date}T00:00:00+07:00`))}</Td>
                  <Td>
                    <Link href={`/penjualan/${p.order_id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
                      {p.orders?.doc_number ?? "—"}
                    </Link>
                    <Sub>
                      {p.orders?.customer_name}
                      {p.doc_number ? ` · ${p.doc_number}` : ""}
                    </Sub>
                  </Td>
                  <Td>
                    {METHOD_LABEL[p.method]}
                    <Sub>{p.cash_accounts?.name}</Sub>
                  </Td>
                  <Td num>{formatRupiah(p.amount_rp)}</Td>
                  <Td>
                    <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_LABEL[p.status]}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(n) => `/kas/pembayaran?${new URLSearchParams({ ...(status ? { status } : {}), page: String(n) })}`} />
        </>
      )}
    </>
  );
}
