import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Pagination, Sub, Table, Td, Th } from "@/components/ui/table";
import { PAGE_SIZE } from "@/features/master/queries";
import { listReceipts, parseReceiptFilter, RECEIPT_STATUS_LABEL, receiptOptions } from "@/features/receipts/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";
import type { ReceiptStatus } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Jagung masuk · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const inputCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm";
const TONE: Record<ReceiptStatus, "neutral" | "ok" | "err"> = { draft: "neutral", confirmed: "ok", void: "err" };
const NOTICE: Record<string, string> = { hapus: "Draft dihapus." };

// Daftar penerimaan (FR-RCV-06): filter tanggal, sumber, anggota, jenis, status; paginasi di server.
export default async function ReceiptsPage({ searchParams }: PageProps<"/jagung-masuk">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canManage = canDo(user.roles, "penerimaan.kelola");
  const sp = await searchParams;
  const f = parseReceiptFilter(sp);
  const [{ data, count, error }, { members, products }] = await Promise.all([listReceipts(f), receiptOptions()]);
  const filtered = Boolean(f.from || f.to || f.source || f.memberId || f.productId || f.status);
  const href = (page: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ dari: f.from, sampai: f.to, sumber: f.source, anggota: f.memberId, jenis: f.productId, status: f.status }))
      if (v) q.set(k, v);
    q.set("page", String(page));
    return `/jagung-masuk?${q}`;
  };
  const notice = typeof sp.simpan === "string" ? NOTICE[sp.simpan] : undefined;

  return (
    <>
      <PageHeader
        title="Jagung masuk"
        description="Penerimaan jagung tongkol atau pipilan dari anggota dan pemasok luar. Draft belum mengubah stok; konfirmasi menambah stok dan mengunci dokumen."
        actions={
          canManage && (
            <Link href="/jagung-masuk/baru" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
              Catat jagung masuk
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
        <form method="get" className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
          <label className="flex flex-col gap-1 text-label">
            Dari
            <input type="date" name="dari" defaultValue={f.from ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Sampai
            <input type="date" name="sampai" defaultValue={f.to ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Sumber
            <select name="sumber" defaultValue={f.source ?? ""} className={inputCls}>
              <option value="">Semua</option>
              <option value="anggota">Anggota</option>
              <option value="luar">Pemasok luar</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Anggota
            <select name="anggota" defaultValue={f.memberId ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Jenis
            <select name="jenis" defaultValue={f.productId ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Status
            <select name="status" defaultValue={f.status ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {(Object.keys(RECEIPT_STATUS_LABEL) as ReceiptStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RECEIPT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="col-span-2 h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted sm:col-span-1">
            Terapkan
          </button>
        </form>
      </Card>

      {error ? (
        <EmptyState title="Daftar jagung masuk tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={filtered ? "Tidak ada penerimaan yang cocok" : "Belum ada jagung masuk"}>
          {filtered ? "Ubah rentang tanggal atau filter." : canManage ? "Klik Catat jagung masuk untuk mencatat penerimaan pertama." : "Admin kelompok belum mencatat penerimaan."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Nomor</Th>
                <Th>Sumber</Th>
                <Th>Jenis</Th>
                <Th num>Berat</Th>
                <Th num>Biaya perolehan</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{dateFmt.format(new Date(`${r.business_date}T00:00:00+07:00`))}</Td>
                  <Td>
                    <Link href={`/jagung-masuk/${r.id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
                      {r.doc_number ?? "Draft"}
                    </Link>
                  </Td>
                  <Td>
                    {r.source_type === "anggota" ? (r.members?.name ?? "—") : r.supplier_name}
                    <Sub>{r.source_type === "anggota" ? `Anggota ${r.members?.code ?? ""}` : "Pemasok luar"}</Sub>
                  </Td>
                  <Td>{r.products?.name ?? "—"}</Td>
                  <Td num>{formatKg(dbKgToGrams(r.weight_kg))}</Td>
                  <Td num>{formatRupiah(r.acquisition_cost)}</Td>
                  <Td>
                    <Badge tone={TONE[r.status]}>{RECEIPT_STATUS_LABEL[r.status]}</Badge>
                  </Td>
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
