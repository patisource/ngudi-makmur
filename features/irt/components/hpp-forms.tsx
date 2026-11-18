"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formCls, Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toastResult } from "@/components/ui/toast";
import { saveIrtItemCosts, saveIrtRecipe } from "@/features/irt/actions";
import type { FormState } from "@/features/master/actions";
import type { IrtUnit } from "@/lib/supabase/types";

const dec = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/** Biaya HPP satu item IRT: bahan → harga standar per satuan; produk → kemasan, upah per pcs, target markup. */
export function IrtItemCostsForm({
  item,
}: {
  item: { id: string; kind: "bahan" | "produk"; name: string; unit: IrtUnit; std_price: number | null; packaging_cost_pcs: number; labor_cost_pcs: number; target_markup_pct: number | null };
}) {
  const router = useRouter();
  const [v, setV] = useState({
    stdPrice: item.std_price != null ? String(item.std_price) : "",
    packagingCostPcs: String(item.packaging_cost_pcs),
    laborCostPcs: String(item.labor_cost_pcs),
    targetMarkupPct: dec(item.target_markup_pct),
  });
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};
  const save = () =>
    start(async () => {
      const res = await saveIrtItemCosts(item.id, v);
      setState(res);
      toastResult(res);
      if (res.ok) router.refresh();
    });
  const id = (k: string) => `cost-${item.id}-${k}`;
  return (
    <div className="flex flex-col gap-2">
      {item.kind === "bahan" ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <Field label={`${item.name} (Rp per ${item.unit})`} htmlFor={id("std")} error={fe.stdPrice}>
            <Input id={id("std")} inputMode="numeric" value={v.stdPrice} onChange={(e) => setV({ ...v, stdPrice: e.target.value })} placeholder="Harga standar" className={formCls.input} />
          </Field>
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? "…" : "Simpan"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
          <Field label="Kemasan & desain (Rp/pcs)" htmlFor={id("pack")} error={fe.packagingCostPcs}>
            <Input id={id("pack")} inputMode="numeric" value={v.packagingCostPcs} onChange={(e) => setV({ ...v, packagingCostPcs: e.target.value })} className={formCls.input} />
          </Field>
          <Field label="Upah (Rp/pcs)" htmlFor={id("labor")} error={fe.laborCostPcs}>
            <Input id={id("labor")} inputMode="numeric" value={v.laborCostPcs} onChange={(e) => setV({ ...v, laborCostPcs: e.target.value })} className={formCls.input} />
          </Field>
          <Field label="Target markup (%)" htmlFor={id("markup")} error={fe.targetMarkupPct}>
            <Input id={id("markup")} inputMode="decimal" value={v.targetMarkupPct} onChange={(e) => setV({ ...v, targetMarkupPct: e.target.value })} placeholder="mis. 50" className={formCls.input} />
          </Field>
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? "…" : "Simpan"}
          </Button>
        </div>
      )}
      {state.error && <Notice state={state} />}
    </div>
  );
}

type Bahan = { item_id: string; name: string; unit: IrtUnit };
type Line = { itemId: string; qty: string };

/** Resep satu produk: bahan per 1 resep, hasil pcs per resep, gas per resep. Simpan = ganti resep lama. */
export function IrtRecipeForm({
  productId,
  productName,
  bahan,
  recipe,
}: {
  productId: string;
  productName: string;
  bahan: Bahan[];
  recipe: { yield_pcs: number; gas_rp: number; note: string | null; lines: Array<{ item_id: string; qty: number }> } | null;
}) {
  const router = useRouter();
  const [yieldPcs, setYield] = useState(dec(recipe?.yield_pcs));
  const [gas, setGas] = useState(recipe ? String(recipe.gas_rp) : "0");
  const [note, setNote] = useState(recipe?.note ?? "");
  const [lines, setLines] = useState<Line[]>(recipe?.lines.length ? recipe.lines.map((l) => ({ itemId: l.item_id, qty: dec(l.qty) })) : [{ itemId: "", qty: "" }]);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};
  const unitOf = (id: string) => bahan.find((b) => b.item_id === id)?.unit;
  const pre = `recipe-${productId}`;

  const save = () =>
    start(async () => {
      const res = await saveIrtRecipe({ productId, yieldPcs, gasRp: gas, note, lines: lines.filter((l) => l.itemId || l.qty) });
      setState(res);
      toastResult(res);
      if (res.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,2fr)]">
        <Field label="Hasil per resep (pcs)" htmlFor={`${pre}-yield`} error={fe.yieldPcs}>
          <Input id={`${pre}-yield`} inputMode="decimal" value={yieldPcs} onChange={(e) => setYield(e.target.value)} placeholder="mis. 2,77" className={formCls.input} />
        </Field>
        <Field label="Gas per resep (Rp)" htmlFor={`${pre}-gas`} error={fe.gasRp}>
          <Input id={`${pre}-gas`} inputMode="numeric" value={gas} onChange={(e) => setGas(e.target.value)} className={formCls.input} />
        </Field>
        <Field label="Catatan" htmlFor={`${pre}-note`} error={fe.note}>
          <Input id={`${pre}-note`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. air hangat 5 sdm" className={formCls.input} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label font-medium">Bahan per 1 resep · {productName}</span>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] items-end gap-2">
            <select
              aria-label={`Bahan resep ${i + 1}`}
              value={l.itemId}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
              className={formCls.select}
            >
              <option value="">Pilih bahan</option>
              {bahan.map((b) => (
                <option key={b.item_id} value={b.item_id}>
                  {b.name}
                </option>
              ))}
            </select>
            <Input
              aria-label={`Jumlah bahan resep ${i + 1}`}
              inputMode="decimal"
              value={l.qty}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
              placeholder={unitOf(l.itemId) ?? "jumlah"}
              aria-invalid={Boolean(fe[`lines.${i}.qty`])}
              className={formCls.input}
            />
            <button
              type="button"
              aria-label={`Hapus bahan resep ${i + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              className="grid size-11 place-items-center rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40 sm:size-10"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        ))}
        <p className="text-xs text-text-subtle">Jumlah dalam satuan bahan (kg, butir, …); 100 g = 0,1 kg, sejumput garam ≈ 0,002 kg.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" kind="ghost" disabled={lines.length >= 30} onClick={() => setLines([...lines, { itemId: "", qty: "" }])}>
          <Plus size={14} strokeWidth={1.75} /> Tambah bahan
        </Button>
        <Button size="sm" kind="primary" disabled={pending} onClick={save}>
          {pending ? "Menyimpan…" : recipe ? "Simpan resep" : "Buat resep"}
        </Button>
      </div>
      {state.error && <Notice state={state} />}
    </div>
  );
}
