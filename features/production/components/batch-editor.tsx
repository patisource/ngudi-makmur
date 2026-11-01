"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { saveProductionDraft, type BatchFormState } from "@/features/production/actions";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { COST_CATEGORY_LABEL, summarizeBatch } from "@/lib/production";
import { dbKgToGrams, formatKg, parseKgToGrams } from "@/lib/qty";
import type { BatchCostCategory } from "@/lib/supabase/types";
import { todayWib } from "@/lib/validation/common";

type Product = { id: string; code: string; name: string } | null;
export type EditorTypeOption = {
  batchType: string;
  name: string;
  maxLossPct: number | null;
  input: Product;
  output: Product;
  inputAvailableKg: number;
  inputAvgCost: number | null;
};
type CostRow = { category: BatchCostCategory; amount: string; sourceRef: string; note: string };
export type BatchDefaults = { batchType: string; businessDate: string; note: string; residueKg: string; inputs: string[]; outputs: string[]; costs: CostRow[] };

const chipCls =
  "flex min-h-10 cursor-pointer flex-col items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-fg has-[:disabled]:cursor-default has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-info-soft";
const selectCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft";
const iconBtn = "grid size-10 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-40";

const grams = (s: string) => parseKgToGrams(s) ?? 0;

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warn" | "err" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone === "err" ? "text-danger" : tone === "warn" ? "text-warning" : ""}`}>{value}</span>
    </div>
  );
}

// Editor batch (FR-PRD-01..05, StyleGuide §8.3): pilih jenis batch dulu; produk input/output mengikuti jenis tersebut
// (nama dari master). Semua berat kg. Panel ringkasan menempel di kanan: total, susut %, biaya, perkiraan HPP.
export function BatchEditor({ batchId, options, defaults }: { batchId: string | null; options: EditorTypeOption[]; defaults?: BatchDefaults }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<BatchFormState>({});
  const [type, setType] = useState(defaults?.batchType ?? options[0]?.batchType ?? "");
  const [date, setDate] = useState(defaults?.businessDate ?? todayWib());
  const [note, setNote] = useState(defaults?.note ?? "");
  const [residue, setResidue] = useState(defaults?.residueKg ?? "0");
  const [inputs, setInputs] = useState<string[]>(defaults?.inputs.length ? defaults.inputs : [""]);
  const [outputs, setOutputs] = useState<string[]>(defaults?.outputs.length ? defaults.outputs : [""]);
  const [costs, setCosts] = useState<CostRow[]>(defaults?.costs ?? []);

  const opt = options.find((o) => o.batchType === type);
  const s = summarizeBatch(inputs.map(grams), outputs.map(grams), costs.map((c) => parseRupiah(c.amount) ?? 0), opt?.inputAvgCost ?? null);
  const residueG = grams(residue);
  const lossTooHigh = opt?.maxLossPct != null && s.lossPct != null && s.lossPct > opt.maxLossPct;
  const availableG = dbKgToGrams(opt?.inputAvailableKg ?? 0);
  const fe = state.fieldErrors ?? {};

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const res = await saveProductionDraft(batchId, {
        batchType: type,
        businessDate: date,
        note,
        residueKg: residue,
        // baris kosong di akhir diabaikan agar operator bisa menyimpan sebagian
        inputs: inputs.filter((v) => v.trim() !== ""),
        outputs: outputs.filter((v) => v.trim() !== ""),
        costs: costs.filter((c) => c.amount.trim() !== "").map((c) => ({ category: c.category, amountRp: c.amount, sourceRef: c.sourceRef, note: c.note })),
      });
      setState(res);
      if (res.error || !res.id) return;
      if (batchId) router.refresh();
      else router.push(`/produksi/${res.id}?simpan=baru`);
    });
  }

  const qtyRows = (dir: "inputs" | "outputs", rows: string[], set: (r: string[]) => void, product: Product) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full flex-wrap items-baseline justify-between gap-2 text-label font-medium">
        <span>
          {dir === "inputs" ? "Input (bahan)" : "Output (hasil layak jual)"} · {product?.name ?? "—"}
        </span>
        {dir === "inputs" && <span className="text-xs font-normal text-text-subtle">Tersedia {formatKg(availableG)}</span>}
      </legend>
      {rows.map((v, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              value={v}
              onChange={(e) => set(rows.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="kg, mis. 60"
              aria-label={`${dir === "inputs" ? "Berat input" : "Berat output"} baris ${i + 1} (kg)`}
              aria-invalid={Boolean(fe[`${dir}.${i}`])}
            />
            <button type="button" className={iconBtn} disabled={rows.length === 1} onClick={() => set(rows.filter((_, j) => j !== i))} aria-label={`Hapus baris ${i + 1}`}>
              <X size={16} />
            </button>
          </div>
          {fe[`${dir}.${i}`] && <p className="text-xs text-danger">{fe[`${dir}.${i}`]}</p>}
        </div>
      ))}
      <Button size="sm" kind="ghost" className="w-fit" disabled={rows.length >= 50} onClick={() => set([...rows, ""])}>
        <Plus size={14} /> Tambah baris
      </Button>
    </fieldset>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-label font-medium">Jenis batch</legend>
            <div className="grid grid-cols-2 gap-2 sm:max-w-md">
              {options.map((o) => (
                <label key={o.batchType} className={chipCls}>
                  <input type="radio" name="batchType" value={o.batchType} checked={type === o.batchType} disabled={Boolean(batchId)} onChange={() => setType(o.batchType)} className="sr-only" />
                  {o.name}
                  <span className="text-xs font-normal opacity-80">
                    {o.input?.code ?? "?"} → {o.output?.code ?? "?"}
                  </span>
                </label>
              ))}
            </div>
            {batchId && <p className="text-xs text-text-subtle">Jenis batch tidak bisa diubah setelah disimpan.</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal produksi" htmlFor="businessDate" error={fe.businessDate}>
              <Input id="businessDate" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Catatan" htmlFor="note" error={fe.note}>
              <Input id="note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="grid gap-6 sm:grid-cols-2">
            {qtyRows("inputs", inputs, setInputs, opt?.input ?? null)}
            {qtyRows("outputs", outputs, setOutputs, opt?.output ?? null)}
          </div>
          <Field
            label="Rincian sisa (kg)"
            htmlFor="residueKg"
            error={fe.residueKg}
            hint={`Bagian sisa yang bisa ditimbang (mis. janggel/kulit; tidak masuk stok). Sisanya dihitung susut. Maks. ${formatKg(s.lossGrams)}.`}
          >
            <Input id="residueKg" inputMode="decimal" value={residue} onChange={(e) => setResidue(e.target.value)} className="sm:max-w-48" aria-invalid={residueG > s.lossGrams} />
          </Field>
        </Card>

        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Biaya batch</h2>
            <span className="text-xs text-text-subtle">Hanya alokasi HPP — tidak menambah atau mengurangi kas.</span>
          </div>
          {costs.length === 0 && <p className="text-sm text-text-muted">Belum ada biaya. Tambahkan upah, kemasan, listrik/BBM, atau alokasi lain.</p>}
          {costs.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start sm:border-0 sm:p-0">
              <select
                aria-label={`Kategori biaya ${i + 1}`}
                value={c.category}
                onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, category: e.target.value as BatchCostCategory } : x)))}
                className={selectCls}
              >
                {(Object.keys(COST_CATEGORY_LABEL) as BatchCostCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {COST_CATEGORY_LABEL[k]}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-1">
                <Input
                  inputMode="numeric"
                  value={c.amount}
                  onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                  placeholder="Rp, mis. 60000"
                  aria-label={`Nilai biaya ${i + 1} (Rp)`}
                  aria-invalid={Boolean(fe[`costs.${i}.amountRp`])}
                />
                {fe[`costs.${i}.amountRp`] && <p className="text-xs text-danger">{fe[`costs.${i}.amountRp`]}</p>}
              </div>
              <Input
                value={c.sourceRef}
                maxLength={60}
                onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, sourceRef: e.target.value } : x)))}
                placeholder="Sumber, mis. no. pengeluaran"
                aria-label={`Sumber biaya ${i + 1}`}
              />
              <button type="button" className={iconBtn} onClick={() => setCosts(costs.filter((_, j) => j !== i))} aria-label={`Hapus biaya ${i + 1}`}>
                <X size={16} />
              </button>
            </div>
          ))}
          <Button size="sm" kind="ghost" className="w-fit" disabled={costs.length >= 20} onClick={() => setCosts([...costs, { category: "tenaga_kerja", amount: "", sourceRef: "", note: "" }])}>
            <Plus size={14} /> Tambah biaya
          </Button>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-8">
        <Card>
          <h2 className="font-semibold">Ringkasan</h2>
          <div className="flex flex-col gap-2">
            <Row label="Total input" value={formatKg(s.inputGrams)} />
            <Row label="Total output" value={formatKg(s.outputGrams)} tone={s.outputExceedsInput ? "err" : undefined} />
            <Row
              label="Sisa/susut"
              value={`${formatKg(s.lossGrams)}${s.lossPct != null ? ` · ${String(s.lossPct).replace(".", ",")}%` : ""}`}
              tone={lossTooHigh ? "warn" : undefined}
            />
            <div className="my-1 border-t border-border" />
            <Row label="Bahan (perkiraan)" value={formatRupiah(s.materialRp)} />
            <Row label="Biaya batch" value={formatRupiah(s.otherRp)} />
            <Row label="Total biaya" value={formatRupiah(s.totalRp)} strong />
            <div className="mt-1 rounded-md bg-surface-muted px-3 py-2.5">
              <span className="block text-xs text-text-muted">HPP per kg (perkiraan)</span>
              <span className="text-xl font-semibold tabular-nums">{s.hpp != null ? formatRupiah(s.hpp) : "—"}</span>
              {s.hpp == null && <span className="block text-xs text-text-muted">Data belum cukup untuk menghitung HPP</span>}
            </div>
          </div>
          {s.outputExceedsInput && <p className="text-xs text-danger">Output melebihi input — periksa timbangan.</p>}
          {lossTooHigh && <p className="text-xs text-warning">Susut melebihi ambang {opt?.maxLossPct}% untuk jenis batch ini.</p>}
          {s.inputGrams > availableG && <p className="text-xs text-warning">Input melebihi stok tersedia; konfirmasi akan ditolak.</p>}
          <p className="text-xs text-text-subtle">Biaya bahan memakai rata-rata saat ini; angka final dikunci saat konfirmasi.</p>
        </Card>
        {state.error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
            {fe._ ?? state.error}
          </p>
        )}
        {state.ok && state.message && (
          <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
            {state.message}
          </p>
        )}
        <Button type="submit" kind={batchId ? "secondary" : "primary"} disabled={pending || !opt}>
          {pending ? "Menyimpan…" : batchId ? "Simpan perubahan draft" : "Simpan draft"}
        </Button>
      </div>
    </form>
  );
}
