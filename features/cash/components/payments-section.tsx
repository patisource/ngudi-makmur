"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { formCls, Notice } from "@/components/shared/notice";
import { createRefund, recordPayment, rejectPayment, verifyPayment } from "@/features/cash/actions";
import type { FormState } from "@/features/master/actions";
import { METHOD_LABEL, PAYMENT_LABEL, PAYMENT_TONE } from "@/lib/cash";
import { formatRupiah, parseRupiah } from "@/lib/money";
import type { CashAccountKind, PaymentMethod, PaymentStatus } from "@/lib/supabase/types";
import { todayWib } from "@/lib/validation/common";

export type AccountOption = { id: string; name: string; kind: CashAccountKind; balanceRp: number };
export type PaymentRow = { id: string; docNumber: string | null; businessDate: string; method: PaymentMethod; amountRp: number; status: PaymentStatus; note: string | null; rejectReason: string | null; accountName: string };
export type RefundRow = { id: string; docNumber: string; businessDate: string; amountRp: number; reason: string; accountName: string };
export type Balance = { billRp: number; paidRp: number; refundedRp: number; outstandingRp: number; creditRp: number; pendingRp: number };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const day = (d: string) => dateFmt.format(new Date(`${d}T00:00:00+07:00`));
const newKey = () => crypto.randomUUID();

type Panel =
  | null
  | { kind: "pay"; key: string; method: PaymentMethod; accountId: string; amount: string; date: string; note: string; verified: boolean }
  | { kind: "verify"; key: string; id: string }
  | { kind: "reject"; key: string; id: string; reason: string }
  | { kind: "refund"; key: string; accountId: string; amount: string; date: string; reason: string; returnId: string };

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

// Pembayaran pesanan (FR-CSH-02..06, PRD §6.1): cicilan, tunai langsung terverifikasi atau transfer menunggu verifikasi,
// tolak, dan refund. Hanya pembayaran terverifikasi mengurangi tagihan & membuat kas. Status bayar terpisah dari barang.
export function PaymentsSection({
  orderId,
  open,
  balance,
  payments,
  refunds,
  accounts,
  returns,
  canManage,
}: {
  orderId: string;
  /** pesanan confirmed/delivered (boleh menerima pembayaran) */
  open: boolean;
  balance: Balance;
  payments: PaymentRow[];
  refunds: RefundRow[];
  accounts: AccountOption[];
  returns: Array<{ id: string; label: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const netPaid = balance.paidRp - balance.refundedRp;
  const fe = state.fieldErrors ?? {};

  const show = (p: Panel) => {
    setState({});
    setPanel(p);
  };
  const accountFor = (kind: CashAccountKind) => accounts.find((a) => a.kind === kind)?.id ?? accounts[0]?.id ?? "";
  const openPay = () => {
    setState({});
    setPanel({ kind: "pay", key: newKey(), method: "tunai", accountId: accountFor("tunai"), amount: String(balance.outstandingRp || ""), date: todayWib(), note: "", verified: true });
  };
  const openRefund = () => {
    setState({});
    setPanel({ kind: "refund", key: newKey(), accountId: accountFor("tunai"), amount: String(balance.creditRp || netPaid || ""), date: todayWib(), reason: "", returnId: "" });
  };
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      const res = await fn();
      setState(res);
      if (res.ok) {
        setPanel(null);
        router.refresh();
      }
    });

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Pembayaran</h2>
        <span className="text-xs text-text-subtle">Kas bertambah hanya dari pembayaran terverifikasi.</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface-muted p-3">
          <Row label="Tagihan" value={formatRupiah(balance.billRp)} />
          <Row label="Dibayar (terverifikasi)" value={formatRupiah(balance.paidRp)} />
          {balance.refundedRp > 0 && <Row label="Refund" value={`−${formatRupiah(balance.refundedRp)}`} />}
          <Row label="Sisa tagihan" value={formatRupiah(balance.outstandingRp)} strong />
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface-muted p-3">
          <Row label="Menunggu verifikasi" value={formatRupiah(balance.pendingRp)} />
          <Row label="Kelebihan bayar (perlu refund)" value={formatRupiah(balance.creditRp)} strong={balance.creditRp > 0} />
        </div>
      </div>

      {payments.length === 0 && refunds.length === 0 && <p className="text-sm text-text-muted">Belum ada pembayaran.</p>}
      {payments.map((p) => (
        <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs font-medium">{p.docNumber ?? "Belum bernomor"}</span>
              <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_LABEL[p.status]}</Badge>
            </span>
            <span className="font-medium tabular-nums">{formatRupiah(p.amountRp)}</span>
          </div>
          <p className="text-xs text-text-subtle">
            {day(p.businessDate)} · {METHOD_LABEL[p.method]} · {p.accountName}
            {p.note && ` · ${p.note}`}
            {p.rejectReason && ` · ditolak: ${p.rejectReason}`}
            {p.status === "verified" && (
              <>
                {" · "}
                <Link href={`/print/kuitansi/${p.id}`} target="_blank" className="underline underline-offset-4">
                  Kuitansi
                </Link>
              </>
            )}
          </p>
          {canManage && p.status === "pending" && panel?.kind !== "verify" && panel?.kind !== "reject" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" kind="primary" onClick={() => show({ kind: "verify", key: newKey(), id: p.id })}>
                Verifikasi
              </Button>
              <Button size="sm" kind="ghost" onClick={() => show({ kind: "reject", key: newKey(), id: p.id, reason: "" })}>
                Tolak
              </Button>
            </div>
          )}
          {panel?.kind === "verify" && panel.id === p.id && (
            <div className={formCls.panel}>
              <p className="text-sm">
                Uang <strong className="font-semibold">{formatRupiah(p.amountRp)}</strong> sudah masuk ke {p.accountName}? Nomor PAY terbit dan kas masuk dicatat sekali.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button kind="primary" disabled={pending} onClick={() => run(() => verifyPayment(orderId, p.id, panel.key))}>
                  {pending ? "Memverifikasi…" : "Ya, verifikasi pembayaran"}
                </Button>
                <Button disabled={pending} onClick={() => setPanel(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          )}
          {panel?.kind === "reject" && panel.id === p.id && (
            <div className={formCls.panel}>
              <label htmlFor="reject-reason" className="text-label font-medium">
                Alasan penolakan *
              </label>
              <textarea id="reject-reason" rows={2} maxLength={500} value={panel.reason} onChange={(e) => setPanel({ ...panel, reason: e.target.value })} placeholder="mis. Mutasi rekening tidak ditemukan" className={formCls.textarea} />
              <div className="flex flex-wrap gap-2">
                <Button kind="danger" disabled={pending || panel.reason.trim().length < 5} onClick={() => run(() => rejectPayment(orderId, p.id, panel.reason, panel.key))}>
                  {pending ? "Menolak…" : "Tolak pembayaran"}
                </Button>
                <Button disabled={pending} onClick={() => setPanel(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      {refunds.map((r) => (
        <div key={r.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="font-mono text-xs font-medium">{r.docNumber}</span>
              <Badge tone="neutral">Refund</Badge>
            </span>
            <span className="font-medium tabular-nums">−{formatRupiah(r.amountRp)}</span>
          </div>
          <p className="text-xs text-text-subtle">
            {day(r.businessDate)} · {r.accountName} · {r.reason}
          </p>
        </div>
      ))}

      {canManage && !panel && (
        <div className="flex flex-wrap gap-2">
          {open && balance.outstandingRp > 0 && (
            <Button kind="primary" onClick={openPay}>
              Catat pembayaran
            </Button>
          )}
          {netPaid > 0 && (
            <Button kind={balance.creditRp > 0 ? "secondary" : "ghost"} onClick={openRefund}>
              Catat refund
            </Button>
          )}
        </div>
      )}

      {panel?.kind === "pay" && (
        <div className={formCls.panel}>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-label font-medium">Metode</legend>
            <div className="grid max-w-sm grid-cols-2 gap-2">
              {(["tunai", "transfer"] as const).map((m) => (
                <label key={m} className={formCls.chip}>
                  <input
                    type="radio"
                    name="method"
                    className="sr-only"
                    checked={panel.method === m}
                    onChange={() => setPanel({ ...panel, method: m, accountId: accountFor(m === "tunai" ? "tunai" : "bank"), verified: m === "tunai" })}
                  />
                  {METHOD_LABEL[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jumlah (Rp) *" htmlFor="pay-amount" error={fe.amountRp} hint={`Sisa tagihan ${formatRupiah(balance.outstandingRp)}`}>
              <Input id="pay-amount" inputMode="numeric" value={panel.amount} onChange={(e) => setPanel({ ...panel, amount: e.target.value })} className={formCls.input} aria-invalid={Boolean(fe.amountRp)} />
            </Field>
            <Field label="Masuk ke akun *" htmlFor="pay-account" error={fe.accountId}>
              <select id="pay-account" value={panel.accountId} onChange={(e) => setPanel({ ...panel, accountId: e.target.value })} className={formCls.select}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal bayar *" htmlFor="pay-date" error={fe.businessDate}>
              <Input id="pay-date" type="date" max={todayWib()} value={panel.date} onChange={(e) => setPanel({ ...panel, date: e.target.value })} className={formCls.input} />
            </Field>
            <Field label="Catatan" htmlFor="pay-note" error={fe.note}>
              <Input id="pay-note" maxLength={500} value={panel.note} onChange={(e) => setPanel({ ...panel, note: e.target.value })} placeholder={panel.method === "transfer" ? "mis. transfer BRI a.n. …" : "Opsional"} className={formCls.input} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={panel.verified} onChange={(e) => setPanel({ ...panel, verified: e.target.checked })} className="mt-0.5 size-5 shrink-0" />
            <span>
              {panel.method === "tunai" ? "Uang tunai sudah diterima dan dihitung" : "Transfer sudah dicek di mutasi rekening"} — verifikasi sekarang.
              <span className="block text-xs text-text-subtle">Bila tidak dicentang, pembayaran disimpan sebagai menunggu verifikasi dan belum menambah kas.</span>
            </span>
          </label>
          {(parseRupiah(panel.amount) ?? 0) > balance.outstandingRp && <p className="text-xs text-warning">Jumlah melebihi sisa tagihan; akan ditolak.</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              kind="primary"
              disabled={pending}
              onClick={() =>
                run(() => recordPayment(orderId, { businessDate: panel.date, method: panel.method, accountId: panel.accountId, amountRp: panel.amount, note: panel.note, verified: panel.verified }, panel.key))
              }
            >
              {pending ? "Menyimpan…" : panel.verified ? "Simpan & verifikasi" : "Simpan, verifikasi nanti"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {panel?.kind === "refund" && (
        <div className={formCls.panel}>
          <p className="text-sm">Uang dikembalikan ke pelanggan dan dicatat sebagai kas keluar. Maksimal pembayaran bersih {formatRupiah(netPaid)}.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jumlah refund (Rp) *" htmlFor="rf-amount" error={fe.amountRp}>
              <Input id="rf-amount" inputMode="numeric" value={panel.amount} onChange={(e) => setPanel({ ...panel, amount: e.target.value })} className={formCls.input} />
            </Field>
            <Field label="Dari akun *" htmlFor="rf-account" error={fe.accountId}>
              <select id="rf-account" value={panel.accountId} onChange={(e) => setPanel({ ...panel, accountId: e.target.value })} className={formCls.select}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · saldo {formatRupiah(a.balanceRp)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal" htmlFor="rf-date" error={fe.businessDate}>
              <Input id="rf-date" type="date" max={todayWib()} value={panel.date} onChange={(e) => setPanel({ ...panel, date: e.target.value })} className={formCls.input} />
            </Field>
            {returns.length > 0 && (
              <Field label="Terkait retur" htmlFor="rf-return">
                <select id="rf-return" value={panel.returnId} onChange={(e) => setPanel({ ...panel, returnId: e.target.value })} className={formCls.select}>
                  <option value="">Tidak terkait retur</option>
                  {returns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <label htmlFor="rf-reason" className="text-label font-medium">
            Alasan refund *
          </label>
          <textarea id="rf-reason" rows={2} maxLength={500} value={panel.reason} onChange={(e) => setPanel({ ...panel, reason: e.target.value })} placeholder="mis. Pengembalian uang retur 1 kg" className={formCls.textarea} />
          <div className="flex flex-wrap gap-2">
            <Button
              kind="danger"
              disabled={pending || panel.reason.trim().length < 5}
              onClick={() => run(() => createRefund(orderId, { businessDate: panel.date, accountId: panel.accountId, amountRp: panel.amount, reason: panel.reason, returnId: panel.returnId }, panel.key))}
            >
              {pending ? "Menyimpan…" : "Catat refund"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      <Notice state={state} />
    </Card>
  );
}
