"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { formCls, Notice } from "@/components/shared/notice";
import { createExpense, createIncome, createTransfer, decideCorrection, requestCorrection, setOpeningBalance } from "@/features/cash/actions";
import type { FormState } from "@/features/master/actions";
import { formatRupiah } from "@/lib/money";
import { todayWib } from "@/lib/validation/common";

type Account = { id: string; name: string; balanceRp: number };
type DialogProps = { inDialog?: boolean; onDone?: (message: string) => void };

/** Kartu biasa, atau isi polos saat form dipakai di dalam dialog (desain 06). */
function Shell({ inDialog, children }: { inDialog?: boolean; children: React.ReactNode }) {
  return inDialog ? <div className="flex flex-col gap-4">{children}</div> : <Card>{children}</Card>;
}
type Category = { code: string; name: string };
const newKey = () => crypto.randomUUID();

/** Satu kunci idempotensi per isian form; diganti setelah berhasil agar entri berikutnya tidak dianggap ulangan. */
function useSubmit() {
  const router = useRouter();
  const [key, setKey] = useState(newKey);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const submit = (fn: (key: string) => Promise<FormState>, onOk?: (res: FormState) => void) =>
    start(async () => {
      const res = await fn(key);
      setState(res);
      if (res.ok) {
        setKey(newKey());
        onOk?.(res);
        router.refresh();
      }
    });
  return { state, pending, submit, fe: state.fieldErrors ?? {} };
}

// ---------------------------------------------------------------- pengeluaran / pemasukan lain (FR-CSH-05, 05a)
export function CashEntryForm({ kind, categories, accounts, inDialog, onDone }: { kind: "expense" | "income"; categories: Category[]; accounts: Account[] } & DialogProps) {
  const empty = { date: todayWib(), category: categories[0]?.code ?? "", accountId: accounts[0]?.id ?? "", amount: "", description: "", reference: "" };
  const [v, setV] = useState(empty);
  const { state, pending, submit, fe } = useSubmit();
  const isExpense = kind === "expense";
  const acc = accounts.find((a) => a.id === v.accountId);

  return (
    <Shell inDialog={inDialog}>
      {!inDialog && <h2 className="font-semibold">{isExpense ? "Catat pengeluaran" : "Catat pemasukan lain"}</h2>}
      <p className="text-sm text-text-muted">
        {isExpense
          ? "Uang yang benar-benar keluar (bahan baku, upah, kemasan, listrik/BBM). Catat sekali di sini; biaya batch cukup merujuk nomornya, tanpa kas kedua."
          : "Uang masuk di luar pembayaran pesanan, mis. iuran anggota atau bantuan."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kategori *" htmlFor={`${kind}-cat`} error={fe.category}>
          <select id={`${kind}-cat`} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} className={formCls.select}>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jumlah (Rp) *" htmlFor={`${kind}-amount`} error={fe.amountRp}>
          <Input id={`${kind}-amount`} inputMode="numeric" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="mis. 40000" className={formCls.input} />
        </Field>
        <Field label={isExpense ? "Dari akun *" : "Masuk ke akun *"} htmlFor={`${kind}-acc`} error={fe.accountId} hint={acc ? `Saldo ${formatRupiah(acc.balanceRp)}` : undefined}>
          <select id={`${kind}-acc`} value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })} className={formCls.select}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tanggal *" htmlFor={`${kind}-date`} error={fe.businessDate}>
          <Input id={`${kind}-date`} type="date" max={todayWib()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={formCls.input} />
        </Field>
        <Field label="Keterangan *" htmlFor={`${kind}-desc`} error={fe.description}>
          <Input id={`${kind}-desc`} maxLength={500} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder={isExpense ? "mis. Upah giling 2 hari" : "mis. Iuran November"} className={formCls.input} />
        </Field>
        {isExpense && (
          <Field label="Referensi dokumen" htmlFor="expense-ref" error={fe.reference} hint="Opsional: nomor RCV/PRD yang dibayar.">
            <Input id="expense-ref" maxLength={60} value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} placeholder="mis. PRD-20261103-01" className={formCls.input} />
          </Field>
        )}
      </div>
      <Notice state={state} />
      <Button
        kind="primary"
        className="w-full sm:w-fit"
        disabled={pending || !categories.length || !accounts.length}
        onClick={() =>
          submit(
            (key) =>
              isExpense
                ? createExpense({ businessDate: v.date, category: v.category, accountId: v.accountId, amountRp: v.amount, description: v.description, reference: v.reference }, key)
                : createIncome({ businessDate: v.date, category: v.category, accountId: v.accountId, amountRp: v.amount, description: v.description }, key),
            (res) => {
              setV({ ...empty, category: v.category, accountId: v.accountId });
              onDone?.(res.message ?? "Tersimpan.");
            },
          )
        }
      >
        {pending ? "Menyimpan…" : isExpense ? "Simpan pengeluaran" : "Simpan pemasukan"}
      </Button>
    </Shell>
  );
}

// ---------------------------------------------------------------- saldo awal (FR-CSH-01)
export function OpeningForm({ accountId, name }: { accountId: string; name: string }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayWib());
  const [confirming, setConfirming] = useState(false);
  const { state, pending, submit, fe } = useSubmit();
  return (
    <div className={formCls.panel}>
      <p className="text-sm">
        Saldo awal <strong className="font-semibold">{name}</strong> belum diisi. Isi sekali sesuai uang/rekening saat mulai memakai aplikasi; perubahan sesudahnya hanya lewat koreksi kas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Saldo awal (Rp)" htmlFor={`op-${accountId}`} error={fe.amountRp}>
          <Input id={`op-${accountId}`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={formCls.input} />
        </Field>
        <Field label="Per tanggal" htmlFor={`opd-${accountId}`} error={fe.businessDate}>
          <Input id={`opd-${accountId}`} type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} className={formCls.input} />
        </Field>
      </div>
      <Notice state={state} />
      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button kind="primary" disabled={pending} onClick={() => submit((key) => setOpeningBalance({ accountId, amountRp: amount || "0", businessDate: date }, key))}>
            {pending ? "Menyimpan…" : "Ya, simpan saldo awal"}
          </Button>
          <Button disabled={pending} onClick={() => setConfirming(false)}>
            Periksa lagi
          </Button>
        </div>
      ) : (
        <Button className="w-fit" onClick={() => setConfirming(true)}>
          Simpan saldo awal
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- koreksi kas (FR-CSH-11)
export function CorrectionForm({ accounts, inDialog, onDone }: { accounts: Account[] } & DialogProps) {
  const empty = { accountId: accounts[0]?.id ?? "", direction: "in" as "in" | "out", amount: "", reason: "", date: todayWib() };
  const [v, setV] = useState(empty);
  const { state, pending, submit, fe } = useSubmit();
  return (
    <Shell inDialog={inDialog}>
      {!inDialog && <h2 className="font-semibold">Ajukan koreksi kas</h2>}
      <p className="text-sm text-text-muted">Untuk selisih uang fisik vs catatan. Saldo baru berubah setelah ketua menyetujui.</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-label font-medium">Arah</legend>
        <div className="grid max-w-sm grid-cols-2 gap-2">
          {(
            [
              ["in", "Tambah saldo"],
              ["out", "Kurangi saldo"],
            ] as const
          ).map(([d, l]) => (
            <label key={d} className={formCls.chip}>
              <input type="radio" name="direction" className="sr-only" checked={v.direction === d} onChange={() => setV({ ...v, direction: d })} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Akun *" htmlFor="cor-acc" error={fe.accountId}>
          <select id="cor-acc" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })} className={formCls.select}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jumlah (Rp) *" htmlFor="cor-amount" error={fe.amountRp}>
          <Input id="cor-amount" inputMode="numeric" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} className={formCls.input} />
        </Field>
        <Field label="Tanggal *" htmlFor="cor-date" error={fe.businessDate}>
          <Input id="cor-date" type="date" max={todayWib()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={formCls.input} />
        </Field>
      </div>
      <label htmlFor="cor-reason" className="text-label font-medium">
        Alasan *
      </label>
      <textarea id="cor-reason" rows={2} maxLength={500} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="mis. Selisih hitung uang laci 3 November" className={formCls.textarea} />
      {fe.reason && <p className="text-xs text-danger">{fe.reason}</p>}
      <Notice state={state} />
      <Button
        kind="primary"
        className="w-full sm:w-fit"
        disabled={pending || v.reason.trim().length < 5}
        onClick={() =>
          submit(
            (key) => requestCorrection({ accountId: v.accountId, direction: v.direction, amountRp: v.amount, reason: v.reason, businessDate: v.date }, key),
            (res) => {
              setV(empty);
              onDone?.(res.message ?? "Koreksi diajukan.");
            },
          )
        }
      >
        {pending ? "Mengajukan…" : "Ajukan koreksi"}
      </Button>
    </Shell>
  );
}

export function CorrectionDecision({ id, summary }: { id: string; summary: string }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [note, setNote] = useState("");
  const { state, pending, submit } = useSubmit();
  return (
    <div className="flex flex-col gap-2">
      {!mode && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" kind="primary" onClick={() => setMode("approve")}>
            Setujui
          </Button>
          <Button size="sm" kind="ghost" onClick={() => setMode("reject")}>
            Tolak
          </Button>
        </div>
      )}
      {mode && (
        <div className={formCls.panel}>
          <p className="text-sm">{mode === "approve" ? `Setujui koreksi ${summary}? Satu mutasi kas dicatat dan tidak bisa dibatalkan.` : `Tolak koreksi ${summary}? Saldo tidak berubah.`}</p>
          <label htmlFor={`dec-${id}`} className="text-label font-medium">
            {mode === "approve" ? "Catatan (opsional)" : "Alasan penolakan *"}
          </label>
          <textarea id={`dec-${id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={formCls.textarea} />
          <div className="flex flex-wrap gap-2">
            <Button
              kind={mode === "approve" ? "primary" : "danger"}
              disabled={pending || (mode === "reject" && note.trim().length < 5)}
              onClick={() => submit((key) => decideCorrection(id, { approve: mode === "approve", note }, key), () => setMode(null))}
            >
              {pending ? "Menyimpan…" : mode === "approve" ? "Setujui koreksi" : "Tolak koreksi"}
            </Button>
            <Button disabled={pending} onClick={() => setMode(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}
      <Notice state={state} />
    </div>
  );
}

// ---------------------------------------------------------------- transfer antar akun (FR-CSH-09)
export function TransferForm({ accounts, inDialog, onDone }: { accounts: Account[] } & DialogProps) {
  const empty = { from: accounts[0]?.id ?? "", to: accounts[1]?.id ?? "", amount: "", note: "", date: todayWib() };
  const [v, setV] = useState(empty);
  const { state, pending, submit, fe } = useSubmit();
  const from = accounts.find((a) => a.id === v.from);
  return (
    <Shell inDialog={inDialog}>
      {!inDialog && <h2 className="font-semibold">Transfer antar akun</h2>}
      <p className="text-sm text-text-muted">Memindahkan uang sendiri, mis. setor tunai ke rekening. Kas total tidak berubah dan tidak dihitung sebagai kas masuk/keluar.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dari akun *" htmlFor="trf-from" error={fe.fromAccountId} hint={from ? `Saldo ${formatRupiah(from.balanceRp)}` : undefined}>
          <select id="trf-from" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} className={formCls.select}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ke akun *" htmlFor="trf-to" error={fe.toAccountId}>
          <select id="trf-to" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} className={formCls.select}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jumlah (Rp) *" htmlFor="trf-amount" error={fe.amountRp}>
          <Input id="trf-amount" inputMode="numeric" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="mis. 5000000" className={formCls.input} />
        </Field>
        <Field label="Tanggal *" htmlFor="trf-date" error={fe.businessDate}>
          <Input id="trf-date" type="date" max={todayWib()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={formCls.input} />
        </Field>
      </div>
      <Field label="Keterangan *" htmlFor="trf-note" error={fe.note}>
        <Input id="trf-note" maxLength={500} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="mis. Setor ke BRI" className={formCls.input} />
      </Field>
      <Notice state={state} />
      <Button
        kind="primary"
        className="w-full sm:w-fit"
        disabled={pending || accounts.length < 2 || v.note.trim().length < 1}
        onClick={() =>
          submit(
            (key) => createTransfer({ businessDate: v.date, fromAccountId: v.from, toAccountId: v.to, amountRp: v.amount, note: v.note }, key),
            (res) => {
              setV({ ...empty, from: v.from, to: v.to });
              onDone?.(res.message ?? "Transfer dicatat.");
            },
          )
        }
      >
        {pending ? "Menyimpan…" : "Simpan transfer"}
      </Button>
    </Shell>
  );
}
