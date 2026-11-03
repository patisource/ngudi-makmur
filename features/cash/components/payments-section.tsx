"use client";

import { FileText, Paperclip, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formCls, Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Seg } from "@/components/ui/seg";
import { createRefund, recordPayment, rejectPayment, removePaymentProof, verifyPayment } from "@/features/cash/actions";
import { uploadPaymentProof } from "@/features/cash/proof-client";
import type { FormState } from "@/features/master/actions";
import { PROOF_ACCEPT } from "@/features/receipts/proof-client";
import { METHOD_LABEL, PAYMENT_LABEL, PAYMENT_TONE } from "@/lib/cash";
import { formatRupiah, parseRupiah } from "@/lib/money";
import type { CashAccountKind, PaymentMethod, PaymentStatus } from "@/lib/supabase/types";
import { todayWib } from "@/lib/validation/common";

export type AccountOption = { id: string; name: string; kind: CashAccountKind; balanceRp: number };
export type ProofRow = { id: string; url: string | null; mime: string };
export type PaymentRow = {
  id: string;
  docNumber: string | null;
  businessDate: string;
  createdAt: string;
  method: PaymentMethod;
  amountRp: number;
  status: PaymentStatus;
  note: string | null;
  rejectReason: string | null;
  accountName: string;
  proofs: ProofRow[];
};
export type RefundRow = { id: string; docNumber: string; businessDate: string; amountRp: number; reason: string; accountName: string };
export type Balance = { billRp: number; paidRp: number; refundedRp: number; outstandingRp: number; creditRp: number; pendingRp: number };

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const day = (d: string) => dateFmt.format(new Date(`${d}T00:00:00+07:00`));
const newKey = () => crypto.randomUUID();
const wibDate = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(ts));

type Open =
  | null
  | { kind: "pay"; key: string; method: PaymentMethod; accountId: string; amount: string; date: string; note: string; verified: boolean; file: File | null }
  | { kind: "verify"; key: string; p: PaymentRow }
  | { kind: "reject"; key: string; p: PaymentRow; reason: string }
  | { kind: "refund"; key: string; accountId: string; amount: string; date: string; reason: string; returnId: string };

// Pembayaran pesanan (FR-CSH-02..06, desain 02): daftar ringkas + dialog catat/verifikasi/tolak/refund. Tunai langsung
// terverifikasi atau transfer menunggu verifikasi; bukti transfer opsional. Hanya pembayaran terverifikasi membuat kas.
export function PaymentsSection({
  orderId,
  docNumber,
  customerName,
  open: acceptsPayment,
  delivered,
  balance,
  payments,
  refunds,
  accounts,
  returns,
  canManage,
}: {
  orderId: string;
  docNumber: string | null;
  customerName: string;
  /** pesanan confirmed/delivered (boleh menerima pembayaran) */
  open: boolean;
  delivered: boolean;
  balance: Balance;
  payments: PaymentRow[];
  refunds: RefundRow[];
  accounts: AccountOption[];
  returns: Array<{ id: string; label: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [state, setState] = useState<FormState>({});
  const [shake, setShake] = useState(0);
  const [pending, start] = useTransition();
  // Penyegaran data setelah aksi: tombol tetap nonaktif sampai saldo/tagihan terbaru tampil, supaya jumlah bawaan
  // dialog berikutnya tidak memakai tagihan lama.
  const [refreshing, startRefresh] = useTransition();
  const busy = pending || refreshing;
  const netPaid = balance.paidRp - balance.refundedRp;
  const fe = state.fieldErrors ?? {};

  const accountFor = (kind: CashAccountKind) => accounts.find((a) => a.kind === kind)?.id ?? accounts[0]?.id ?? "";
  const show = (o: Open) => {
    setState({});
    setOpen(o);
  };
  const close = () => setOpen(null);
  const finish = (res: FormState) => {
    setState(res);
    if (res.ok) {
      setOpen(null);
      startRefresh(() => router.refresh());
    } else setShake((n) => n + 1);
  };

  const savePayment = () => {
    if (open?.kind !== "pay") return;
    const o = open;
    start(async () => {
      const res = await recordPayment(orderId, { businessDate: o.date, method: o.method, accountId: o.accountId, amountRp: o.amount, note: o.note, verified: o.verified }, o.key);
      if (res.ok && res.id && o.file) {
        const err = await uploadPaymentProof(orderId, res.id, o.file);
        if (err) return finish({ ok: true, message: `${res.message ?? "Pembayaran dicatat."} Bukti belum terlampir: ${err} Lampirkan ulang dari daftar pembayaran.` });
      }
      finish(res);
    });
  };

  const addProof = (p: PaymentRow, file: File) =>
    start(async () => {
      const err = await uploadPaymentProof(orderId, p.id, file);
      setState(err ? { error: err } : { ok: true, message: "Bukti transfer dilampirkan." });
      startRefresh(() => router.refresh());
    });

  const amount = open?.kind === "pay" ? (parseRupiah(open.amount) ?? 0) : 0;
  const after =
    open?.kind === "pay"
      ? open.verified
        ? `Status bayar → ${amount >= balance.outstandingRp ? "Lunas" : "Sebagian"} · kas masuk ${formatRupiah(amount)} dibuat satu kali · status barang ${delivered ? "tetap diserahkan" : "tetap direservasi sampai diserahkan"}`
        : `Pembayaran menunggu verifikasi · kas belum berubah sampai diverifikasi · status barang ${delivered ? "tetap diserahkan" : "tetap direservasi"}`
      : "";

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Pembayaran</h2>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {netPaid > 0 && (
              <Button size="sm" kind="ghost" disabled={busy} onClick={() => show({ kind: "refund", key: newKey(), accountId: accountFor("tunai"), amount: String(balance.creditRp || netPaid || ""), date: todayWib(), reason: "", returnId: "" })}>
                Catat refund
              </Button>
            )}
            {acceptsPayment && balance.outstandingRp > 0 && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => show({ kind: "pay", key: newKey(), method: "tunai", accountId: accountFor("tunai"), amount: String(balance.outstandingRp), date: todayWib(), note: "", verified: true, file: null })}
              >
                Catat pembayaran
              </Button>
            )}
          </div>
        )}
      </div>

      {payments.length === 0 && refunds.length === 0 ? (
        <p className="text-sm text-text-muted">Belum ada pembayaran. Kas bertambah hanya dari pembayaran terverifikasi.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {p.docNumber ?? "Belum bernomor"} · {METHOD_LABEL[p.method]}
                  </span>
                  <span className="text-xs text-text-subtle">
                    {wibDate(p.createdAt) === p.businessDate ? when.format(new Date(p.createdAt)) : day(p.businessDate)} · {p.accountName}
                    {p.note && ` · ${p.note}`}
                    {p.rejectReason && ` · ditolak: ${p.rejectReason}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_LABEL[p.status]}</Badge>
                  <span className="font-medium tabular-nums">{formatRupiah(p.amountRp)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {p.proofs.map((f, i) => (
                  <span key={f.id} className="inline-flex items-center gap-1">
                    <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm bg-surface-muted px-2 py-1 text-text-muted hover:text-text">
                      {f.mime === "application/pdf" ? <FileText size={13} strokeWidth={1.75} /> : <Paperclip size={13} strokeWidth={1.75} />}
                      Bukti {p.proofs.length > 1 ? i + 1 : ""}
                    </a>
                    {canManage && p.status === "pending" && (
                      <button type="button" disabled={pending} onClick={() => start(async () => finish(await removePaymentProof(orderId, f.id)))} className="rounded-sm px-1 text-danger hover:bg-danger-soft" aria-label="Hapus bukti">
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {canManage && p.status !== "rejected" && p.proofs.length < 3 && (
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-text-muted hover:bg-surface-muted hover:text-text has-[:disabled]:opacity-50">
                    <input
                      type="file"
                      accept={PROOF_ACCEPT}
                      className="sr-only"
                      disabled={pending}
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (file) addProof(p, file);
                      }}
                    />
                    <Upload size={13} strokeWidth={1.75} />
                    {p.proofs.length ? "Tambah bukti" : "Lampirkan bukti"}
                  </label>
                )}
                {p.status === "verified" && (
                  <Link href={`/print/kuitansi/${p.id}`} target="_blank" className="rounded-sm px-2 py-1 text-text-muted underline-offset-4 hover:underline">
                    Kuitansi
                  </Link>
                )}
                {canManage && p.status === "pending" && (
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" kind="ghost" disabled={busy} onClick={() => show({ kind: "reject", key: newKey(), p, reason: "" })}>
                      Tolak
                    </Button>
                    <Button size="sm" kind="primary" disabled={busy} onClick={() => show({ kind: "verify", key: newKey(), p })}>
                      Verifikasi
                    </Button>
                  </span>
                )}
              </div>
            </li>
          ))}
          {refunds.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 last:pb-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{r.docNumber} · Refund</span>
                <span className="text-xs text-text-subtle">
                  {day(r.businessDate)} · {r.accountName} · {r.reason}
                </span>
              </div>
              <span className="font-medium tabular-nums">−{formatRupiah(r.amountRp)}</span>
            </li>
          ))}
        </ul>
      )}
      {!open && <Notice state={state} />}

      {open?.kind === "pay" && (
        <Dialog
          title="Catat pembayaran"
          description={`${docNumber ?? ""} · ${customerName}`}
          onClose={close}
          shakeKey={shake}
          footer={
            <>
              <p className="mr-auto hidden max-w-[220px] text-xs text-text-subtle sm:block">Tersimpan sekali. Menekan ulang tidak membuat pembayaran ganda.</p>
              <Button disabled={pending} onClick={close}>
                Batal
              </Button>
              <Button kind="primary" disabled={pending} onClick={savePayment}>
                {pending ? "Menyimpan…" : "Simpan pembayaran"}
              </Button>
            </>
          }
        >
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-4 py-3.5">
            <span className="text-sm text-text-muted">Tagihan tersisa</span>
            <span className="text-lg font-semibold tabular-nums">{formatRupiah(balance.outstandingRp)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tanggal" htmlFor="pay-date" error={fe.businessDate}>
              <Input id="pay-date" type="date" max={todayWib()} value={open.date} onChange={(e) => setOpen({ ...open, date: e.target.value })} className={formCls.input} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium">Metode</span>
              <Seg
                full
                label="Metode pembayaran"
                value={open.method}
                onChange={(m) => setOpen({ ...open, method: m, accountId: accountFor(m === "tunai" ? "tunai" : "bank"), verified: m === "tunai", file: m === "tunai" ? null : open.file })}
                options={[
                  ["tunai", "Tunai"],
                  ["transfer", "Transfer"],
                ]}
              />
            </div>
          </div>
          <Field label="Akun kas" htmlFor="pay-account" error={fe.accountId}>
            <select id="pay-account" value={open.accountId} onChange={(e) => setOpen({ ...open, accountId: e.target.value })} className={formCls.select}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jumlah" htmlFor="pay-amount" error={fe.amountRp} hint={`Maksimal ${formatRupiah(balance.outstandingRp)} (tagihan tersisa)`}>
            <Input id="pay-amount" inputMode="numeric" value={open.amount} onChange={(e) => setOpen({ ...open, amount: e.target.value })} className={formCls.input} aria-invalid={Boolean(fe.amountRp) || amount > balance.outstandingRp} />
          </Field>
          {open.method === "transfer" && (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border-strong px-4 py-3.5 hover:bg-surface-muted has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-info-soft">
              <input type="file" accept={PROOF_ACCEPT} capture="environment" className="sr-only" onChange={(e) => setOpen({ ...open, file: e.currentTarget.files?.[0] ?? null })} />
              <Upload size={18} strokeWidth={1.75} className="shrink-0 text-text-muted" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{open.file ? open.file.name : "Unggah bukti transfer (opsional)"}</span>
                <span className="text-xs text-text-subtle">{open.file ? `${Math.max(1, Math.round(open.file.size / 1024))} KB · klik untuk ganti` : "JPG, PNG, atau PDF · maks. 5 MB"}</span>
              </span>
            </label>
          )}
          <Field label="Catatan" htmlFor="pay-note" error={fe.note}>
            <Input id="pay-note" maxLength={500} value={open.note} onChange={(e) => setOpen({ ...open, note: e.target.value })} placeholder={open.method === "transfer" ? "mis. transfer BRI a.n. …" : "Opsional"} className={formCls.input} />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={open.verified} onChange={(e) => setOpen({ ...open, verified: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-accent" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Sudah diverifikasi admin</span>
              <span className="text-xs text-text-muted">
                {open.method === "tunai" ? "Uang tunai sudah diterima dan dihitung." : "Mutasi rekening sudah dicek."} Kas masuk hanya dibuat untuk pembayaran terverifikasi.
              </span>
            </span>
          </label>
          <div className="rounded-lg bg-accent-soft px-4 py-3">
            <span className="block text-xs text-accent">Setelah disimpan</span>
            <span className="text-sm">{after}</span>
          </div>
          {amount > balance.outstandingRp && <p className="text-xs text-warning">Jumlah melebihi tagihan tersisa; akan ditolak.</p>}
          <Notice state={state} />
        </Dialog>
      )}

      {open?.kind === "verify" && (
        <Dialog
          title="Verifikasi pembayaran"
          description={`${METHOD_LABEL[open.p.method]} · ${open.p.accountName}`}
          onClose={close}
          shakeKey={shake}
          footer={
            <>
              <Button disabled={pending} onClick={close}>
                Batal
              </Button>
              <Button kind="primary" disabled={pending} onClick={() => start(async () => finish(await verifyPayment(orderId, open.p.id, open.key)))}>
                {pending ? "Memverifikasi…" : "Verifikasi pembayaran"}
              </Button>
            </>
          }
        >
          <p className="text-sm">
            Uang <strong className="font-semibold">{formatRupiah(open.p.amountRp)}</strong> sudah masuk ke {open.p.accountName}?
          </p>
          {open.p.proofs.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {open.p.proofs.map((f, i) => (
                <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className="rounded-sm bg-surface-muted px-2 py-1 underline-offset-4 hover:underline">
                  Lihat bukti {i + 1}
                </a>
              ))}
            </div>
          )}
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm">Nomor PAY terbit dan kas masuk dicatat satu kali.</p>
          <Notice state={state} />
        </Dialog>
      )}

      {open?.kind === "reject" && (
        <Dialog
          title="Tolak pembayaran"
          description={`${formatRupiah(open.p.amountRp)} · ${METHOD_LABEL[open.p.method]}`}
          onClose={close}
          shakeKey={shake}
          footer={
            <>
              <Button disabled={pending} onClick={close}>
                Batal
              </Button>
              <Button kind="danger" disabled={pending || open.reason.trim().length < 5} onClick={() => start(async () => finish(await rejectPayment(orderId, open.p.id, open.reason, open.key)))}>
                {pending ? "Menolak…" : "Tolak pembayaran"}
              </Button>
            </>
          }
        >
          <Field label="Alasan penolakan *" htmlFor="reject-reason">
            <textarea id="reject-reason" rows={2} maxLength={500} value={open.reason} onChange={(e) => setOpen({ ...open, reason: e.target.value })} placeholder="mis. Mutasi rekening tidak ditemukan" className={formCls.textarea} />
          </Field>
          <p className="text-sm text-text-muted">Kas tidak berubah; tagihan tetap seperti sebelumnya.</p>
          <Notice state={state} />
        </Dialog>
      )}

      {open?.kind === "refund" && (
        <Dialog
          title="Catat refund"
          description={`Maksimal pembayaran bersih ${formatRupiah(netPaid)}`}
          onClose={close}
          shakeKey={shake}
          footer={
            <>
              <Button disabled={pending} onClick={close}>
                Batal
              </Button>
              <Button
                kind="danger"
                disabled={pending || open.reason.trim().length < 5}
                onClick={() => start(async () => finish(await createRefund(orderId, { businessDate: open.date, accountId: open.accountId, amountRp: open.amount, reason: open.reason, returnId: open.returnId }, open.key)))}
              >
                {pending ? "Menyimpan…" : "Catat refund"}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jumlah refund *" htmlFor="rf-amount" error={fe.amountRp}>
              <Input id="rf-amount" inputMode="numeric" value={open.amount} onChange={(e) => setOpen({ ...open, amount: e.target.value })} className={formCls.input} />
            </Field>
            <Field label="Tanggal" htmlFor="rf-date" error={fe.businessDate}>
              <Input id="rf-date" type="date" max={todayWib()} value={open.date} onChange={(e) => setOpen({ ...open, date: e.target.value })} className={formCls.input} />
            </Field>
          </div>
          <Field label="Dari akun *" htmlFor="rf-account" error={fe.accountId}>
            <select id="rf-account" value={open.accountId} onChange={(e) => setOpen({ ...open, accountId: e.target.value })} className={formCls.select}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · saldo {formatRupiah(a.balanceRp)}
                </option>
              ))}
            </select>
          </Field>
          {returns.length > 0 && (
            <Field label="Terkait retur" htmlFor="rf-return">
              <select id="rf-return" value={open.returnId} onChange={(e) => setOpen({ ...open, returnId: e.target.value })} className={formCls.select}>
                <option value="">Tidak terkait retur</option>
                {returns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Alasan refund *" htmlFor="rf-reason">
            <textarea id="rf-reason" rows={2} maxLength={500} value={open.reason} onChange={(e) => setOpen({ ...open, reason: e.target.value })} placeholder="mis. Pengembalian uang retur 1 kg" className={formCls.textarea} />
          </Field>
          <p className="text-sm text-text-muted">Uang dikembalikan ke pelanggan dan dicatat sebagai kas keluar.</p>
          <Notice state={state} />
        </Dialog>
      )}
    </Card>
  );
}
