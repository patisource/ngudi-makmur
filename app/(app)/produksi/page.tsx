import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Pagination, Sub, Table, Td, Th } from "@/components/ui/table";
import { PAGE_SIZE } from "@/features/master/queries";
import { BATCH_STATUS_LABEL, BATCH_STATUS_TONE, batchTypeOptions, listBatches, parseBatchFilter } from "@/features/production/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";
import type { ProductionStatus } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Produksi · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const inputCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm";
const NOTICE: Record<string, string> = { hapus: "Draft batch dihapus." };

const lossPct = (input: number, loss: number) => {
  const i = dbKgToGrams(input);
  return i > 0 ? `${String(Math.round((dbKgToGrams(loss) / i) * 1000) / 10).replace(".", ",")}%` : "—";
};

// Daftar batch (FR-PRD-09): jenis, input, output, sisa/susut, HPP/kg, operator; filter tanggal, jenis, status.
export default async function ProductionPage({ searchParams }: PageProps<"/produksi">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canManage = canDo(user.roles, "produksi.kelola");
  const sp = await searchParams;
  const f = parseBatchFilter(sp);
  const [{ data, count, error }, types] = await Promise.all([listBatches(f), batchTypeOptions()]);
  const filtered = Boolean(f.from || f.to || f.type || f.status);
  const href = (page: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ dari: f.from, sampai: f.to, jenis: f.type, status: f.status })) if (v) q.set(k, v);
    q.set("page", String(page));
    return `/produksi?${q}`;
  };
  const notice = typeof sp.simpan === "string" ? NOTICE[sp.simpan] : undefined;

  return (
    <>
      <PageHeader
        title="Produksi"
        description="Batch pemipilan dan penepungan. Draft belum mengubah stok; konfirmasi memindahkan bahan menjadi hasil dan mengunci HPP."
        actions={
          canManage && (
            <Link href="/produksi/baru" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
              Catat batch
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
        <form method="get" className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <label className="flex flex-col gap-1 text-label">
            Dari
            <input type="date" name="dari" defaultValue={f.from ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Sampai
            <input type="date" name="sampai" defaultValue={f.to ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Jenis
            <select name="jenis" defaultValue={f.type ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {types.map((t) => (
                <option key={t.batchType} value={t.batchType}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Status
            <select name="status" defaultValue={f.status ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {(Object.keys(BATCH_STATUS_LABEL) as ProductionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {BATCH_STATUS_LABEL[s]}
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
        <EmptyState title="Daftar batch tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={filtered ? "Tidak ada batch yang cocok" : "Belum ada batch produksi"}>
          {filtered ? "Ubah rentang tanggal atau filter." : canManage ? "Klik Catat batch untuk mencatat pemipilan atau penepungan pertama." : "Operator produksi belum mencatat batch."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Nomor</Th>
                <Th>Jenis</Th>
                <Th num>Input</Th>
                <Th num>Output</Th>
                <Th num>Sisa/susut</Th>
                <Th num>HPP/kg</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap">{dateFmt.format(new Date(`${b.business_date}T00:00:00+07:00`))}</Td>
                  <Td>
                    <Link href={`/produksi/${b.id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
                      {b.doc_number ?? "Draft"}
                    </Link>
                    <Sub>{b.operator_name}</Sub>
                  </Td>
                  <Td>{b.batch_type_rules?.name ?? b.batch_type}</Td>
                  <Td num>{formatKg(dbKgToGrams(b.input_kg))}</Td>
                  <Td num>{formatKg(dbKgToGrams(b.output_kg))}</Td>
                  <Td num>
                    {formatKg(dbKgToGrams(b.loss_kg))}
                    <Sub>{lossPct(b.input_kg, b.loss_kg)}</Sub>
                  </Td>
                  <Td num>{b.hpp_per_kg != null ? formatRupiah(b.hpp_per_kg) : "—"}</Td>
                  <Td>
                    <Badge tone={BATCH_STATUS_TONE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</Badge>
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
