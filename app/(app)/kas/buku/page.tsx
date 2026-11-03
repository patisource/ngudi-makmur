import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, Pagination, Sub, Table, Td, Th } from "@/components/ui/table";
import { OpeningForm } from "@/features/cash/components/cash-forms";
import { cashFlowSummary, listAccounts, listCashTransactions, parseCashFilter } from "@/features/cash/queries";
import { PAGE_SIZE } from "@/features/master/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { CASH_SOURCE_LABEL } from "@/lib/cash";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Buku kas · SIM Ngudi Makmur" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const inputCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm";

// Saldo per akun + buku kas (FR-CSH-01, FR-CSH-07): masuk, keluar, saldo setelah mutasi, dan dokumen sumber.
export default async function CashBookPage({ searchParams }: PageProps<"/kas/buku">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canManage = canDo(user.roles, "kas.kelola");
  const f = parseCashFilter(await searchParams);
  const [accounts, { data, count, error }, flow] = await Promise.all([listAccounts(), listCashTransactions(f), cashFlowSummary(f)]);
  const total = accounts.filter((a) => !a.archived_at).reduce((s, a) => s + a.balance_rp, 0);
  const filtered = Boolean(f.account || f.from || f.to);
  const href = (page: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ akun: f.account, dari: f.from, sampai: f.to })) if (v) q.set(k, v);
    q.set("page", String(page));
    return `/kas/buku?${q}`;
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-1">
          <span className="text-xs text-text-muted">Saldo kas total</span>
          <span className="text-2xl font-semibold tabular-nums">{formatRupiah(total)}</span>
        </Card>
        {accounts
          .filter((a) => !a.archived_at)
          .map((a) => (
            <Card key={a.account_id} className="gap-1">
              <span className="text-xs text-text-muted">{a.name}</span>
              <span className="text-xl font-semibold tabular-nums">{formatRupiah(a.balance_rp)}</span>
              {!a.opening_set_at && <span className="text-xs text-warning">Saldo awal belum diisi</span>}
            </Card>
          ))}
      </div>

      {canManage &&
        accounts
          .filter((a) => !a.archived_at && !a.opening_set_at)
          .map((a) => <OpeningForm key={a.account_id} accountId={a.account_id} name={a.name} />)}

      <Card className="p-4">
        <form method="get" className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <label className="col-span-2 flex flex-col gap-1 text-label sm:col-span-1">
            Akun
            <select name="akun" defaultValue={f.account ?? ""} className={inputCls}>
              <option value="">Semua akun</option>
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name}
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
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <button type="submit" className="h-10 flex-1 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Terapkan
            </button>
            {filtered && (
              <Link href="/kas/buku" className="inline-flex h-10 items-center rounded-md px-3 text-sm text-text-muted hover:bg-surface-muted">
                Reset
              </Link>
            )}
          </div>
        </form>
        <p className="text-sm text-text-muted">
          {filtered ? "Periode/akun terpilih" : "Semua periode"}: masuk <strong className="font-medium text-text tabular-nums">{formatRupiah(flow.inRp)}</strong> · keluar{" "}
          <strong className="font-medium text-text tabular-nums">{formatRupiah(flow.outRp)}</strong> · bersih{" "}
          <strong className="font-medium text-text tabular-nums">{formatRupiah(flow.inRp - flow.outRp)}</strong>
        </p>
      </Card>

      {error ? (
        <EmptyState title="Buku kas tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={filtered ? "Tidak ada mutasi kas yang cocok" : "Belum ada mutasi kas"}>
          {filtered ? "Ubah akun atau rentang tanggal." : "Mutasi muncul setelah saldo awal, pembayaran terverifikasi, pengeluaran, atau pemasukan dicatat."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Dokumen</Th>
                <Th>Akun</Th>
                <Th num>Masuk</Th>
                <Th num>Keluar</Th>
                <Th num>Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap">{dateFmt.format(new Date(`${t.business_date}T00:00:00+07:00`))}</Td>
                  <Td>
                    <span className="font-mono text-xs font-medium">{t.doc_number ?? CASH_SOURCE_LABEL[t.source_type]}</span>
                    <Sub>
                      {CASH_SOURCE_LABEL[t.source_type]}
                      {t.note ? ` · ${t.note}` : ""}
                    </Sub>
                  </Td>
                  <Td>{t.cash_accounts?.name ?? "—"}</Td>
                  <Td num className="text-accent">
                    {t.direction === "in" ? formatRupiah(t.amount_rp) : ""}
                  </Td>
                  <Td num className="text-danger">
                    {t.direction === "out" ? formatRupiah(t.amount_rp) : ""}
                  </Td>
                  <Td num>{formatRupiah(t.balance_after_rp)}</Td>
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
