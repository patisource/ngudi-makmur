"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog, ImpactNote } from "@/components/shared/confirm-dialog";
import { formCls, Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { toastResult } from "@/components/ui/toast";
import { confirmIrtBatch, deleteIrtBatch, saveIrtBatch, type IrtState } from "@/features/irt/actions";
import { formatIrtQty, parseWhole } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";
import { parseKgToGrams } from "@/lib/qty";
import { todayWib } from "@/lib/today";
import type { IrtUnit } from "@/lib/supabase/types";

export type BahanOpt = { item_id: string; name: string; unit: IrtUnit; on_hand: number; avg_cost: number | null };
export type ProdukOpt = { item_id: string; name: string; pack_size: number | null };
type Line = { itemId: string; qty: string };
export type BatchDefaults = { id: string; date: string; note: string; inputs: Line[]; outputs: Line[] };

const empty = (): Line => ({ itemId: "", qty: "" });
/** Jumlah bahan desimal (koma/titik) → angka; null bila kosong/tidak valid. */
const dec = (s: string) => {
  const g = parseKgToGrams(s);
  return g == null || g <= 0 ? null : g / 1000;
};

// Editor batch produksi IRT (IPR): bahan (jumlah sesuai satuan) → hasil produk jadi (pcs bulat). Draft dulu, lalu
// konfirmasi: bahan keluar, hasil masuk, HPP per pcs terkunci. Perkiraan di kanan memakai rata-rata biaya stok saat ini.
export function IrtBatchEditor({ defaults, bahan, produk }: { defaults?: BatchDefaults; bahan: BahanOpt[]; produk: ProdukOpt[] }) {
  const router = useRouter();
  const [date, setDate] = useState(defaults?.date ?? todayWib());
  const [note, setNote] = useState(defaults?.note ?? "");
  const [inputs, setInputs] = useState<Line[]>(defaults?.inputs.length ? defaults.inputs : [empty()]);
  const [outputs, setOutputs] = useState<Line[]>(defaults?.outputs.length ? defaults.outputs : [empty()]);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<IrtState>({});
  const [dialog, setDialog] = useState<null | "confirm" | "delete">(null);
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};

  const bahanOf = (id: string) => bahan.find((b) => b.item_id === id);
  const estInput = inputs.reduce((s, l) => s + (dec(l.qty) ?? 0) * (bahanOf(l.itemId)?.avg_cost ?? 0), 0);
  const pcs = outputs.reduce((s, l) => s + (parseWhole(l.qty) ?? 0), 0);
  const short = inputs.filter((l) => {
    const b = bahanOf(l.itemId);
    const q = dec(l.qty);
    return b && q != null && q > Number(b.on_hand);
  });

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
  };
  const setLine = (which: "in" | "out", i: number, patch: Partial<Line>) => {
    const list = which === "in" ? inputs : outputs;
    const next = list.map((l, j) => (j === i ? { ...l, ...patch } : l));
    if (which === "in") setInputs(next);
    else setOutputs(next);
    setDirty(true);
  };

  const save = () =>
    start(async () => {
      const res = await saveIrtBatch(defaults?.id ?? null, {
        businessDate: date,
        note,
        inputs: inputs.filter((l) => l.itemId || l.qty),
        outputs: outputs.filter((l) => l.itemId || l.qty),
      });
      setState(res);
      toastResult(res);
      if (res.ok) {
        setDirty(false);
        if (!defaults && res.id) router.replace(`/irt/produksi/${res.id}`);
        else router.refresh();
      }
    });

  const lineRow = (which: "in" | "out", l: Line, i: number) => {
    const isIn = which === "in";
    const b = isIn ? bahanOf(l.itemId) : undefined;
    const list = isIn ? inputs : outputs;
    const key = isIn ? "inputs" : "outputs";
    return (
      <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field label={isIn ? `Bahan ${i + 1}` : `Produk ${i + 1}`} htmlFor={`${which}-item-${i}`} error={fe[`${key}.${i}.itemId`]}>
          <select id={`${which}-item-${i}`} value={l.itemId} onChange={(e) => setLine(which, i, { itemId: e.target.value })} className={formCls.select}>
            <option value="">{isIn ? "Pilih bahan" : "Pilih produk"}</option>
            {(isIn ? bahan : produk).map((o) => (
              <option key={o.item_id} value={o.item_id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          aria-label={`Hapus baris ${isIn ? "bahan" : "hasil"} ${i + 1}`}
          disabled={list.length === 1}
          onClick={() => {
            if (isIn) setInputs(inputs.filter((_, j) => j !== i));
            else setOutputs(outputs.filter((_, j) => j !== i));
            setDirty(true);
          }}
          className="grid size-11 place-items-center self-end rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40 sm:order-last sm:size-10"
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
        <Field
          label={isIn ? `Jumlah${b ? ` (${b.unit})` : ""}` : "Hasil (pcs)"}
          htmlFor={`${which}-qty-${i}`}
          error={fe[`${key}.${i}.qty`]}
          hint={b ? `Tersedia ${formatIrtQty(Number(b.on_hand), b.unit)}` : undefined}
        >
          <Input id={`${which}-qty-${i}`} inputMode={isIn ? "decimal" : "numeric"} value={l.qty} onChange={(e) => setLine(which, i, { qty: e.target.value })} className={formCls.input} />
        </Field>
      </div>
    );
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-5">
        <Card>
          <h2 className="font-semibold">Info batch</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tanggal produksi *" htmlFor="ipr-date" error={fe.businessDate}>
              <Input id="ipr-date" type="date" max={todayWib()} value={date} onChange={(e) => edit(setDate)(e.target.value)} className={formCls.input} />
            </Field>
            <Field label="Catatan" htmlFor="ipr-note" error={fe.note}>
              <Input id="ipr-note" maxLength={500} value={note} onChange={(e) => edit(setNote)(e.target.value)} placeholder="mis. adonan pagi" className={formCls.input} />
            </Field>
          </div>
        </Card>
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Bahan dipakai</h2>
            <span className="text-xs text-text-muted">Nilai = rata-rata harga beli stok saat ini</span>
          </div>
          {inputs.map((l, i) => lineRow("in", l, i))}
          <Button size="sm" kind="ghost" className="w-fit" disabled={inputs.length >= 30} onClick={() => edit(setInputs)([...inputs, empty()])}>
            <Plus size={14} strokeWidth={1.75} />
            Tambah bahan
          </Button>
        </Card>
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Hasil produk jadi</h2>
            <span className="text-xs text-text-muted">Hanya yang layak jual, dalam pcs</span>
          </div>
          {outputs.map((l, i) => lineRow("out", l, i))}
          <Button size="sm" kind="ghost" className="w-fit" disabled={outputs.length >= 30} onClick={() => edit(setOutputs)([...outputs, empty()])}>
            <Plus size={14} strokeWidth={1.75} />
            Tambah hasil
          </Button>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card className="gap-3">
          <h2 className="font-semibold">Ringkasan</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Nilai bahan (perkiraan)</dt>
              <dd className="tabular-nums">{formatRupiah(Math.round(estInput))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Hasil</dt>
              <dd className="tabular-nums">{pcs} pcs</dd>
            </div>
          </dl>
          <div className="rounded-lg bg-surface-muted px-4 py-3">
            <span className="block text-xs text-text-muted">HPP per pcs</span>
            <span className="text-xl font-semibold tabular-nums">{pcs > 0 && estInput > 0 ? formatRupiah(Math.round(estInput / pcs)) : "—"}</span>
            <span className="block text-xs text-text-subtle">Perkiraan · dikunci saat konfirmasi</span>
          </div>
          {short.length > 0 && (
            <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
              Stok {short.map((l) => bahanOf(l.itemId)?.name).join(", ")} kurang; konfirmasi akan ditolak.
            </p>
          )}
          <Notice state={state.ok ? {} : state} />
          <div className="flex flex-wrap gap-2">
            <Button kind={defaults ? "secondary" : "primary"} disabled={pending} onClick={save}>
              {pending ? "Menyimpan…" : "Simpan draft"}
            </Button>
            {defaults && (
              <Button kind="primary" disabled={pending || dirty} title={dirty ? "Simpan draft dulu" : undefined} onClick={() => setDialog("confirm")}>
                <Check size={16} strokeWidth={1.75} />
                Konfirmasi produksi
              </Button>
            )}
            {defaults && (
              <Button kind="ghost" disabled={pending} onClick={() => setDialog("delete")}>
                Hapus draft
              </Button>
            )}
          </div>
          {dirty && defaults && <p className="text-xs text-text-subtle">Ada perubahan yang belum disimpan.</p>}
        </Card>
      </div>

      {dialog === "confirm" && defaults && (
        <ConfirmDialog
          title="Konfirmasi produksi"
          description="Nomor IPR terbit dan batch dikunci."
          confirmLabel="Konfirmasi produksi"
          onClose={() => setDialog(null)}
          onConfirm={(key) => confirmIrtBatch(defaults.id, key)}
        >
          <ImpactNote>
            Bahan berkurang, {pcs} pcs produk jadi masuk stok, dan HPP per pcs dihitung dari nilai bahan yang benar-benar keluar. Ditolak bila stok bahan kurang.
          </ImpactNote>
        </ConfirmDialog>
      )}
      {dialog === "delete" && defaults && (
        <ConfirmDialog title="Hapus draft produksi" confirmLabel="Hapus draft" danger onClose={() => setDialog(null)} onConfirm={() => deleteIrtBatch(defaults.id)} onDone={() => router.push("/irt/produksi")}>
          <p className="text-sm text-text-muted">Draft dihapus. Stok belum berubah.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
