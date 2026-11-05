import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SegLinks } from "@/components/ui/seg";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { CashActions } from "@/features/cash/components/cash-actions";
import { OpeningForm } from "@/features/cash/components/cash-forms";
import { cashOverview, listAccounts, listCategories } from "@/features/cash/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { CASH_SOURCE_LABEL, CORRECTION_LABEL, CORRECTION_TONE } from "@/lib/cash";
import { formatRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { todayWib } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Pembayaran & kas · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const day = (d: string) => dateFmt.format(new Date(`${d}T00:00:00+07:00`));
const stamp = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const juta = (rp: number) => (Math.abs(rp) < 1_000_000 ? formatRupiah(rp) : `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(rp / 1_000_000)} jt`);

function Kpi({ label, value, sub, foot }: { label: string; value: string; sub?: ReactNode; foot?: ReactNode }) {
  return (
    <Card className="gap-2">
      <span className="text-label text-text-muted">{label}</span>
      <span className="text-[22px] font-semibold leading-tight tracking-tight tabular-nums">{value}</span>
      {sub && <span className="text-sm text-text-muted">{sub}</span>}
      {foot && <div className="mt-auto border-t border-border pt-3 text-xs text-text-subtle">{foot}</div>}
    </Card>
  );
}

// Pembayaran & kas (desain 06, PRD §5.8): saldo per akun, total kas, piutang, pembayaran menunggu verifikasi,
// koreksi kas, dan mutasi terbaru. Entri baru lewat dialog (admin kelompok); ketua hanya melihat & memutuskan koreksi.
export default async function CashPage({ searchParams }: PageProps<"/kas">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canManage = canDo(user.roles, "kas.kelola");
  const sp = await searchParams;
  const accounts = (await listAccounts()).filter((a) => !a.archived_at);
  const filterKind = sp.akun === "tunai" || sp.akun === "bank" ? sp.akun : undefined;
  const filterAccount = filterKind ? accounts.find((a) => a.kind === filterKind)?.account_id : undefined;
  const today = todayWib();
  const supabase = await createClient();
  const [overview, categories, kpi] = await Promise.all([
    cashOverview(filterAccount),
    canManage ? listCategories() : Promise.resolve({ expense: [], income: [] }),
    supabase.rpc("rpt_kpi", { p_from: `${today.slice(0, 8)}01`, p_to: today }),
  ]);
  const k = (kpi.data ?? {}) as { cash_in_rp?: number; cash_out_rp?: number; receivable_rp?: number; pending_payments?: number };
  const total = accounts.reduce((s, a) => s + a.balance_rp, 0);
  const tunai = accounts.filter((a) => a.kind === "tunai");
  const bank = accounts.filter((a) => a.kind === "bank");
  const pendingPayments = k.pending_payments ?? 0;
  const formAccounts = accounts.map((a) => ({ id: a.account_id, name: a.name, balanceRp: a.balance_rp }));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Pembayaran &amp; kas</h1>
          <p className="max-w-[64ch] text-sm text-text-muted">
            Kas = saldo awal + pembayaran terverifikasi + pemasukan lain − pengeluaran − refund ± koreksi kas (disetujui ketua). Tunai dan transfer masuk ke akunnya masing-masing.
          </p>
        </div>
        {canManage && <CashActions accounts={formAccounts} expenseCategories={categories.expense} incomeCategories={categories.income} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tunai.map((a) => (
          <Kpi
            key={a.account_id}
            label={a.name}
            value={formatRupiah(a.balance_rp)}
            sub={a.opening_set_at ? `Saldo awal ${formatRupiah(overview.opening.get(a.account_id) ?? 0)}` : "Saldo awal belum diisi"}
            foot="Pembayaran tunai masuk ke sini"
          />
        ))}
        {bank.map((a) => (
          <Kpi
            key={a.account_id}
            label={a.name}
            value={formatRupiah(a.balance_rp)}
            sub={a.opening_set_at ? "Pembayaran transfer masuk ke sini" : "Saldo awal belum diisi"}
            foot="Setor tunai lewat Transfer antar akun"
          />
        ))}
        <Kpi label="Total kas" value={formatRupiah(total)} sub={`Bulan ini: masuk ${juta(k.cash_in_rp ?? 0)} · keluar ${juta(k.cash_out_rp ?? 0)}`} foot="Biaya batch tidak membuat kas sendiri" />
        <Kpi label="Piutang" value={formatRupiah(k.receivable_rp ?? 0)} sub={`${pendingPayments} pembayaran menunggu verifikasi`} foot="Tagihan sah − pembayaran bersih" />
      </div>

      {pendingPayments > 0 && (
        <Link href="/kas/pembayaran?status=pending" className="flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3.5 text-sm hover:opacity-90">
          <span>
            {pendingPayments} pembayaran menunggu verifikasi. Buka pesanannya di Penjualan &amp; nota untuk memverifikasi; kas baru masuk setelah diverifikasi.
          </span>
          <ArrowRight size={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        </Link>
      )}

      {canManage && accounts.filter((a) => !a.opening_set_at).map((a) => <OpeningForm key={a.account_id} accountId={a.account_id} name={a.name} />)}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 pb-3 pt-5">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-semibold">Koreksi kas</h2>
            <p className="text-xs text-text-muted">Wajib alasan; saldo berubah setelah disetujui ketua.</p>
          </div>
          <Link href="/kas/koreksi" className="text-sm text-text-muted underline-offset-4 hover:underline">
            Semua koreksi
          </Link>
        </div>
        {overview.corrections.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-text-muted">Belum ada koreksi kas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr className="bg-surface-muted text-xs text-text-muted">
                  <th className="py-2.5 pl-5 pr-3 text-left font-medium">Nomor</th>
                  <th className="px-3 py-2.5 text-left font-medium">Akun</th>
                  <th className="px-3 py-2.5 text-right font-medium">Selisih</th>
                  <th className="px-3 py-2.5 text-left font-medium">Alasan</th>
                  <th className="px-3 py-2.5 text-left font-medium">Pelaku</th>
                  <th className="py-2.5 pl-3 pr-5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.corrections.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="py-3 pl-5 pr-3 whitespace-nowrap">
                      {c.doc_number}
                      <span className="mt-0.5 block text-xs text-text-subtle">{stamp.format(new Date(c.created_at))}</span>
                    </td>
                    <td className="px-3 py-3">{c.cash_accounts?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {c.direction === "in" ? "+" : "−"}
                      {formatRupiah(c.amount_rp)}
                    </td>
                    <td className="px-3 py-3">
                      {c.reason}
                      {c.decision_note && <span className="mt-0.5 block text-xs text-text-subtle">{c.decision_note}</span>}
                    </td>
                    <td className="px-3 py-3">
                      {c.requested_by_name}
                      {c.decided_by_name && <span className="mt-0.5 block text-xs text-text-subtle">Diputuskan {c.decided_by_name}</span>}
                    </td>
                    <td className="py-3 pl-3 pr-5">
                      <Badge tone={CORRECTION_TONE[c.status]}>{CORRECTION_LABEL[c.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div className="flex items-baseline gap-3">
            <h2 className="font-semibold">Mutasi kas</h2>
            <Link href="/kas/buku" className="text-sm text-text-muted underline-offset-4 hover:underline">
              Buku kas lengkap
            </Link>
          </div>
          <SegLinks
            label="Akun"
            items={[
              { key: "semua", label: "Semua", href: "/kas", active: !filterKind },
              { key: "tunai", label: "Tunai", href: "/kas?akun=tunai", active: filterKind === "tunai" },
              { key: "bank", label: "Bank", href: "/kas?akun=bank", active: filterKind === "bank" },
            ]}
          />
        </div>
        {overview.error ? (
          <div className="px-5 pb-5">
            <EmptyState title="Mutasi kas tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
          </div>
        ) : overview.recent.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-text-muted">Belum ada mutasi kas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr className="bg-surface-muted text-xs text-text-muted">
                  <th className="py-2.5 pl-5 pr-3 text-left font-medium">Tanggal</th>
                  <th className="px-3 py-2.5 text-left font-medium">Sumber</th>
                  <th className="px-3 py-2.5 text-left font-medium">Akun</th>
                  <th className="px-3 py-2.5 text-left font-medium">Nomor</th>
                  <th className="px-3 py-2.5 text-left font-medium">Keterangan</th>
                  <th className="px-3 py-2.5 text-right font-medium">Masuk</th>
                  <th className="py-2.5 pl-3 pr-5 text-right font-medium">Keluar</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((t) => (
                  <tr key={t.id} className="border-t border-border align-top">
                    <td className="py-3 pl-5 pr-3 whitespace-nowrap">{day(t.business_date)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{CASH_SOURCE_LABEL[t.source_type]}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{t.cash_accounts?.name ?? "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{t.doc_number ?? "—"}</td>
                    <td className="min-w-[200px] px-3 py-3 text-text-muted">{t.note ?? "—"}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{t.direction === "in" ? formatRupiah(t.amount_rp) : ""}</td>
                    <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">{t.direction === "out" ? formatRupiah(t.amount_rp) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
