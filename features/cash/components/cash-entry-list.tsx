import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, Pagination, Sub, Table, Td, Th } from "@/components/ui/table";
import type { CashFilter } from "@/features/cash/queries";
import { PAGE_SIZE } from "@/features/master/queries";
import { formatRupiah } from "@/lib/money";

type Row = { id: string; docNumber: string; businessDate: string; category: string; account: string; amountRp: number; description: string; reference: string | null };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const inputCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm";

// Daftar pengeluaran / pemasukan lain dengan filter tanggal (Server Component).
export function CashEntryList({ kind, basePath, filter: f, rows, total, error }: { kind: "expense" | "income"; basePath: string; filter: CashFilter; rows: Row[]; total: number; error: boolean }) {
  const filtered = Boolean(f.from || f.to);
  const href = (page: number) => {
    const q = new URLSearchParams();
    if (f.from) q.set("dari", f.from);
    if (f.to) q.set("sampai", f.to);
    q.set("page", String(page));
    return `${basePath}?${q}`;
  };
  const label = kind === "expense" ? "pengeluaran" : "pemasukan lain";
  return (
    <>
      <Card className="p-4">
        <form method="get" className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(2,minmax(0,12rem))_auto]">
          <label className="flex flex-col gap-1 text-label">
            Dari
            <input type="date" name="dari" defaultValue={f.from ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Sampai
            <input type="date" name="sampai" defaultValue={f.to ?? ""} className={inputCls} />
          </label>
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <button type="submit" className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Terapkan
            </button>
            {filtered && (
              <Link href={basePath} className="inline-flex h-10 items-center rounded-md px-3 text-sm text-text-muted hover:bg-surface-muted">
                Reset
              </Link>
            )}
          </div>
        </form>
      </Card>
      {error ? (
        <EmptyState title={`Daftar ${label} tidak dapat dimuat`}>Coba muat ulang halaman.</EmptyState>
      ) : !rows.length ? (
        <EmptyState title={filtered ? `Tidak ada ${label} pada periode ini` : `Belum ada ${label}`}>{filtered ? "Ubah rentang tanggal." : "Catat lewat form di atas."}</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Nomor</Th>
                <Th>Kategori</Th>
                <Th>Akun</Th>
                <Th num>Jumlah</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{dateFmt.format(new Date(`${r.businessDate}T00:00:00+07:00`))}</Td>
                  <Td>
                    <span className="font-mono text-xs font-medium">{r.docNumber}</span>
                    <Sub>
                      {r.description}
                      {r.reference ? ` · ref. ${r.reference}` : ""}
                    </Sub>
                  </Td>
                  <Td>{r.category}</Td>
                  <Td>{r.account}</Td>
                  <Td num className={kind === "expense" ? "text-danger" : "text-accent"}>
                    {formatRupiah(r.amountRp)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={f.page} pageSize={PAGE_SIZE} total={total} href={href} />
        </>
      )}
    </>
  );
}
