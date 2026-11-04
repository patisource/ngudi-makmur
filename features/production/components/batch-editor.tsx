"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { saveProductionDraft, type BatchFormState } from "@/features/production/actions";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { COST_CATEGORY_LABEL, summarizeBatch } from "@/lib/production";
import { dbKgToGrams, formatKg, parseKgToGrams } from "@/lib/qty";
import type { BatchCostCategory } from "@/lib/supabase/types";
import { todayWib } from "@/lib/today";

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

const selectCls = "h-11 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:h-10 sm:text-sm";
const inputCls = "h-11 text-base sm:h-10 sm:text-sm";
const iconBtn = "grid size-10 shrink-0 place-items-center rounded-md text-text-subtle hover:bg-surface-muted hover:text-text disabled:opacity-40";
const card = "flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-5";
const kgNum = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

const grams = (s: string) => parseKgToGrams(s) ?? 0;

function Row({ label, value, strong, tone, extra }: { label: string; value: ReactNode; strong?: boolean; tone?: "warn" | "err" | "ok"; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="flex items-center gap-2">
        {extra}
        <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone === "err" ? "text-danger" : tone === "warn" ? "text-warning" : tone === "ok" ? "text-accent" : ""}`}>{value}</span>
      </span>
    </div>
  );
}

// Editor batch (desain 03, FR-PRD-01..05, StyleGuide §8.3): jenis batch dulu; produk input/output mengikuti jenis
// (nama dari master). Semua berat kg. Ringkasan menempel di kanan: total, susut vs batas, nilai bahan, biaya, HPP.
export function BatchEditor({
  batchId,
  options,
  defaults,
  header,
  actions,
}: {
  batchId: string | null;
  options: EditorTypeOption[];
  defaults?: BatchDefaults;
  header: { title: string; subtitle: string };
  /** tombol tambahan di header (hapus draft, konfirmasi) — hanya untuk draft yang sudah tersimpan */
  actions?: ReactNode;
}) {
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
  const inName = opt?.input?.name ?? "Bahan";
  const outName = opt?.output?.name ?? "Hasil";

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

  const lineValue = (v: string) => (v.trim() !== "" && opt?.inputAvgCost != null ? formatRupiah(Math.round((grams(v) * opt.inputAvgCost) / 1000)) : "—");

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/produksi" className="inline-flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text">
          <ArrowLeft size={15} strokeWidth={1.75} /> Produksi
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{header.title}</h1>
              <Badge>Draft</Badge>
            </div>
            <p className="text-sm text-text-muted">{header.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button type="submit" kind={actions ? "secondary" : "primary"} disabled={pending || !opt}>
              {pending ? "Menyimpan…" : "Simpan draft"}
            </Button>
          </div>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
          {fe._ ?? state.error}
        </p>
      )}
      {state.ok && state.message && <Notice state={state} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className={card}>
            <h2 className="font-semibold">Info batch</h2>
            <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Field label="Tanggal produksi" htmlFor="businessDate" error={fe.businessDate}>
                <Input id="businessDate" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Jenis batch" htmlFor="batchType" hint={batchId ? "Jenis batch tidak bisa diubah setelah disimpan." : undefined}>
                <select id="batchType" value={type} disabled={Boolean(batchId)} onChange={(e) => setType(e.target.value)} className={selectCls}>
                  {options.map((o) => (
                    <option key={o.batchType} value={o.batchType}>
                      {o.name} ({o.input?.name.toLowerCase() ?? "?"} → {o.output?.name.toLowerCase() ?? "?"})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Catatan" htmlFor="note" error={fe.note}>
              <Input id="note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional, mis. mesin penepung 2" className={inputCls} />
            </Field>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Bahan (input)</h2>
              <span className="text-xs text-text-subtle">Nilai = rata-rata biaya stok saat ini</span>
            </div>
            <div className="hidden grid-cols-[minmax(0,1fr)_140px_120px_40px] gap-3 border-b border-border pb-2 text-xs text-text-muted sm:grid">
              <span>Produk</span>
              <span>Qty (kg)</span>
              <span className="text-right">Nilai</span>
              <span />
            </div>
            {inputs.map((v, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-border pb-3">
                <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_140px_120px_40px]">
                  <span className="col-span-2 flex h-10 items-center rounded-md border border-border bg-surface-muted px-3 text-sm sm:col-span-1">{inName}</span>
                  <Input
                    inputMode="decimal"
                    value={v}
                    onChange={(e) => setInputs(inputs.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="kg"
                    aria-label={`Berat ${inName} baris ${i + 1} (kg)`}
                    aria-invalid={Boolean(fe[`inputs.${i}`])}
                    className={inputCls}
                  />
                  <span className="hidden text-right text-sm tabular-nums sm:block">{lineValue(v)}</span>
                  <button type="button" className={iconBtn} disabled={inputs.length === 1} onClick={() => setInputs(inputs.filter((_, j) => j !== i))} aria-label={`Hapus baris bahan ${i + 1}`}>
                    <Trash2 size={17} strokeWidth={1.75} />
                  </button>
                </div>
                {i === 0 && (
                  <span className="text-xs text-text-subtle">
                    Tersedia {formatKg(availableG)}
                    {opt?.inputAvgCost != null && ` · rata-rata ${formatRupiah(opt.inputAvgCost)}/kg`}
                  </span>
                )}
                {fe[`inputs.${i}`] && <p className="text-xs text-danger">{fe[`inputs.${i}`]}</p>}
              </div>
            ))}
            <Button size="sm" kind="ghost" className="w-fit" disabled={inputs.length >= 50} onClick={() => setInputs([...inputs, ""])}>
              <Plus size={15} /> Tambah baris
            </Button>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Hasil (output)</h2>
              <span className="text-xs text-text-subtle">Hanya hasil layak jual yang masuk stok</span>
            </div>
            <div className="hidden grid-cols-[minmax(0,1fr)_140px_120px_40px] gap-3 border-b border-border pb-2 text-xs text-text-muted sm:grid">
              <span>Produk</span>
              <span>Qty (kg)</span>
              <span>Jenis</span>
              <span />
            </div>
            {outputs.map((v, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-border pb-3">
                <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_140px_120px_40px]">
                  <span className="col-span-2 flex h-10 items-center rounded-md border border-border bg-surface-muted px-3 text-sm sm:col-span-1">{outName}</span>
                  <Input
                    inputMode="decimal"
                    value={v}
                    onChange={(e) => setOutputs(outputs.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="kg"
                    aria-label={`Berat ${outName} baris ${i + 1} (kg)`}
                    aria-invalid={Boolean(fe[`outputs.${i}`])}
                    className={inputCls}
                  />
                  <span className="hidden sm:block">
                    <Badge tone="ok">Hasil utama</Badge>
                  </span>
                  <button type="button" className={iconBtn} disabled={outputs.length === 1} onClick={() => setOutputs(outputs.filter((_, j) => j !== i))} aria-label={`Hapus baris hasil ${i + 1}`}>
                    <Trash2 size={17} strokeWidth={1.75} />
                  </button>
                </div>
                {fe[`outputs.${i}`] && <p className="text-xs text-danger">{fe[`outputs.${i}`]}</p>}
              </div>
            ))}
            <Button size="sm" kind="ghost" className="w-fit" disabled={outputs.length >= 50} onClick={() => setOutputs([...outputs, ""])}>
              <Plus size={15} /> Tambah baris
            </Button>
            <Field
              label="Sisa terukur (kg)"
              htmlFor="residueKg"
              error={fe.residueKg}
              hint={`Bagian sisa yang ditimbang (mis. janggel/dedak; tidak masuk stok). Sisanya dihitung susut. Maks. ${formatKg(s.lossGrams)}.`}
            >
              <Input id="residueKg" inputMode="decimal" value={residue} onChange={(e) => setResidue(e.target.value)} className={`${inputCls} sm:max-w-48`} aria-invalid={residueG > s.lossGrams} />
            </Field>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Biaya produksi</h2>
              <span className="text-xs text-text-subtle">Alokasi HPP — tidak menambah atau mengurangi kas</span>
            </div>
            {costs.length > 0 && (
              <div className="hidden grid-cols-[160px_minmax(0,1fr)_140px_40px] gap-3 border-b border-border pb-2 text-xs text-text-muted sm:grid">
                <span>Komponen</span>
                <span>Keterangan</span>
                <span>Jumlah</span>
                <span />
              </div>
            )}
            {costs.length === 0 && <p className="text-sm text-text-muted">Belum ada biaya. Tambahkan tenaga kerja, solar/listrik, kemasan, atau alokasi lain.</p>}
            {costs.map((c, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-border pb-3">
                <div className="grid grid-cols-[minmax(0,1fr)_40px] items-start gap-3 sm:grid-cols-[160px_minmax(0,1fr)_140px_40px]">
                  <select
                    aria-label={`Komponen biaya ${i + 1}`}
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
                  <button type="button" className={`${iconBtn} sm:hidden`} onClick={() => setCosts(costs.filter((_, j) => j !== i))} aria-label={`Hapus biaya ${i + 1}`}>
                    <Trash2 size={17} strokeWidth={1.75} />
                  </button>
                  <Input
                    value={c.note}
                    maxLength={500}
                    onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                    placeholder="mis. 2 orang × 1 hari"
                    aria-label={`Keterangan biaya ${i + 1}`}
                    className={`${inputCls} col-span-2 sm:col-span-1`}
                  />
                  <Input
                    inputMode="numeric"
                    value={c.amount}
                    onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    placeholder="Rp"
                    aria-label={`Jumlah biaya ${i + 1} (Rp)`}
                    aria-invalid={Boolean(fe[`costs.${i}.amountRp`])}
                    className={`${inputCls} col-span-2 sm:col-span-1`}
                  />
                  <button type="button" className={`${iconBtn} hidden sm:grid`} onClick={() => setCosts(costs.filter((_, j) => j !== i))} aria-label={`Hapus biaya ${i + 1}`}>
                    <Trash2 size={17} strokeWidth={1.75} />
                  </button>
                </div>
                {fe[`costs.${i}.amountRp`] && <p className="text-xs text-danger">{fe[`costs.${i}.amountRp`]}</p>}
              </div>
            ))}
            <Button size="sm" kind="ghost" className="w-fit" disabled={costs.length >= 20} onClick={() => setCosts([...costs, { category: "tenaga_kerja", amount: "", sourceRef: "", note: "" }])}>
              <Plus size={15} /> Tambah baris
            </Button>
          </section>
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <section className={card}>
            <h2 className="font-semibold">Ringkasan batch</h2>
            <div className="flex flex-col gap-2.5">
              <Row label="Total input" value={formatKg(s.inputGrams)} />
              <Row label="Total output" value={formatKg(s.outputGrams)} tone={s.outputExceedsInput ? "err" : undefined} />
              <Row
                label="Susut"
                value={`${kgNum.format(s.lossGrams / 1000)} kg${s.lossPct != null ? ` · ${String(s.lossPct).replace(".", ",")}%` : ""}`}
                tone={lossTooHigh ? "warn" : undefined}
                extra={
                  opt?.maxLossPct != null && s.lossPct != null ? (
                    <Badge tone={lossTooHigh ? "warn" : "ok"}>
                      {lossTooHigh ? "Melebihi" : "Normal"} · batas {String(opt.maxLossPct).replace(".", ",")}%
                    </Badge>
                  ) : undefined
                }
              />
              <div className="my-1 border-t border-border" />
              <Row label="Nilai bahan" value={formatRupiah(s.materialRp)} />
              <Row label="Biaya produksi" value={formatRupiah(s.otherRp)} />
              <Row label="Total dibebankan" value={formatRupiah(s.totalRp)} strong />
            </div>
            <div className="rounded-lg bg-surface-muted px-4 py-3.5">
              <span className="block text-xs text-text-muted">HPP {outName}</span>
              {s.hpp != null ? (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{formatRupiah(s.hpp)}</span>
                  <span className="text-sm text-text-muted">/ kg</span>
                </span>
              ) : (
                <span className="block py-1 text-sm">Data belum cukup untuk menghitung HPP</span>
              )}
              <span className="block text-xs text-text-subtle">Perkiraan · dikunci saat konfirmasi</span>
            </div>
            {s.outputExceedsInput && <p className="text-xs text-danger">Output melebihi input — periksa timbangan.</p>}
            {s.inputGrams > availableG && <p className="text-xs text-warning">Input melebihi stok tersedia; konfirmasi akan ditolak.</p>}
          </section>

          <section className={card}>
            <h2 className="font-semibold">Dampak saat dikonfirmasi</h2>
            <div className="flex flex-col gap-2">
              <Row label={inName} value={s.inputGrams > 0 ? `−${formatKg(s.inputGrams)}` : formatKg(0)} tone={s.inputGrams > 0 ? "err" : undefined} />
              <Row label={outName} value={s.outputGrams > 0 ? `+${formatKg(s.outputGrams)}` : formatKg(0)} tone={s.outputGrams > 0 ? "ok" : undefined} />
            </div>
            <p className="text-xs text-text-subtle">Mutasi stok dan kode batch PRD dibuat bersamaan dalam satu transaksi. Batch terkonfirmasi tidak bisa diedit.</p>
          </section>

          <div className="rounded-xl bg-surface-muted px-5 py-4 text-sm">
            <span className="block text-xs text-text-muted">Catatan</span>
            {options.map((o) => `${o.name}: ${o.input?.name ?? "?"} → ${o.output?.name ?? "?"}`).join(". ")}. Biaya batch hanya alokasi HPP dan tidak membuat kas.
          </div>
        </div>
      </div>
    </form>
  );
}
