"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formCls, Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Seg } from "@/components/ui/seg";
import { toastResult } from "@/components/ui/toast";
import { createIrtSale, type IrtState } from "@/features/irt/actions";
import { linePcs, parseWhole, pcsWithPack, unitPrice, type SaleUnit } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";
import { todayWib } from "@/lib/today";

export type SaleProduct = { item_id: string; name: string; pack_size: number | null; price_pcs: number | null; price_pack: number | null; on_hand: number };
type Line = { itemId: string; unit: SaleUnit; qty: string };
const empty = (): Line => ({ itemId: "", unit: "pcs", qty: "" });

// Penjualan IRT (IJL): per pcs atau per pack; harga dari daftar produk, total final dihitung server. TANPA kas.
export function IrtSaleForm({ products }: { products: SaleProduct[] }) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState(todayWib);
  const [buyer, setBuyer] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([empty()]);
  const [state, setState] = useState<IrtState>({});
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};

  const productOf = (id: string) => products.find((p) => p.item_id === id);
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const calc = (l: Line) => {
    const p = productOf(l.itemId);
    const qty = parseWhole(l.qty);
    if (!p || qty == null) return null;
    const pcs = linePcs(l.unit, qty, p.pack_size);
    const price = unitPrice(l.unit, { packSize: p.pack_size, pricePcs: p.price_pcs, pricePack: p.price_pack });
    return pcs == null || price == null ? null : { pcs, price, total: qty * price };
  };
  const rows = lines.map(calc);
  const total = rows.reduce((s, r) => s + (r?.total ?? 0), 0);
  const totalPcs = rows.reduce((s, r) => s + (r?.pcs ?? 0), 0);
  // pcs yang diminta per produk (beberapa baris bisa produk sama) dibanding stok
  const need = new Map<string, number>();
  lines.forEach((l, i) => rows[i] && need.set(l.itemId, (need.get(l.itemId) ?? 0) + rows[i].pcs));
  const short = [...need].filter(([id, pcs]) => pcs > Number(productOf(id)?.on_hand ?? 0)).map(([id]) => productOf(id)?.name);

  const save = () =>
    start(async () => {
      const res = await createIrtSale({ businessDate: date, buyer, note, lines: lines.filter((l) => l.itemId || l.qty) }, key);
      setState(res);
      toastResult(res);
      if (res.ok && res.id) router.push(`/irt/penjualan/${res.id}`);
    });

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tanggal *" htmlFor="ijl-date" error={fe.businessDate}>
              <Input id="ijl-date" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} className={formCls.input} />
            </Field>
            <Field label="Pembeli" htmlFor="ijl-buyer" error={fe.buyer} hint="Opsional, mis. nama warung atau pelanggan.">
              <Input id="ijl-buyer" maxLength={120} value={buyer} onChange={(e) => setBuyer(e.target.value)} className={formCls.input} />
            </Field>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">Produk</h2>
          {lines.map((l, i) => {
            const p = productOf(l.itemId);
            const r = rows[i];
            return (
              <div key={i} className="flex flex-col gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <Field label={`Produk ${i + 1}`} htmlFor={`ijl-item-${i}`} error={fe[`lines.${i}.itemId`]} hint={p ? `Stok ${pcsWithPack(Number(p.on_hand), p.pack_size)}` : undefined}>
                    <select id={`ijl-item-${i}`} value={l.itemId} onChange={(e) => set(i, { itemId: e.target.value, unit: productOf(e.target.value)?.pack_size ? l.unit : "pcs" })} className={formCls.select}>
                      <option value="">Pilih produk</option>
                      {products.map((o) => (
                        <option key={o.item_id} value={o.item_id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    aria-label={`Hapus baris ${i + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="grid size-11 place-items-center rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40 sm:size-10"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  {p?.pack_size ? (
                    <Seg
                      label={`Satuan baris ${i + 1}`}
                      value={l.unit}
                      onChange={(unit) => set(i, { unit })}
                      options={[
                        ["pcs", "Per pcs"],
                        ["pack", `Per pack (${p.pack_size} pcs)`],
                      ]}
                    />
                  ) : (
                    <span className="pb-2 text-sm text-text-muted">Per pcs</span>
                  )}
                  <div className="w-32">
                    <Field label={l.unit === "pack" ? "Jumlah pack" : "Jumlah pcs"} htmlFor={`ijl-qty-${i}`} error={fe[`lines.${i}.qty`]}>
                      <Input id={`ijl-qty-${i}`} inputMode="numeric" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} className={formCls.input} />
                    </Field>
                  </div>
                  <span className="pb-2 text-sm tabular-nums text-text-muted">
                    {r ? `${r.pcs} pcs · @${formatRupiah(r.price)} · ${formatRupiah(r.total)}` : p && p.price_pcs == null ? "Harga belum diisi" : ""}
                  </span>
                </div>
              </div>
            );
          })}
          <Button size="sm" kind="ghost" className="w-fit" disabled={lines.length >= 30} onClick={() => setLines([...lines, empty()])}>
            <Plus size={14} strokeWidth={1.75} />
            Tambah produk
          </Button>
        </Card>
        <Card>
          <Field label="Catatan" htmlFor="ijl-note" error={fe.note}>
            <Input id="ijl-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={formCls.input} />
          </Field>
        </Card>
      </div>
      <Card className="gap-3 lg:sticky lg:top-4">
        <h2 className="font-semibold">Ringkasan</h2>
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-text-muted">Jumlah keluar</span>
          <span className="tabular-nums">{totalPcs} pcs</span>
        </div>
        <div className="rounded-lg bg-surface-muted px-4 py-3">
          <span className="block text-xs text-text-muted">Total penjualan</span>
          <span className="text-xl font-semibold tabular-nums">{formatRupiah(total)}</span>
          <span className="block text-xs text-text-subtle">Dihitung ulang server dari daftar harga</span>
        </div>
        {short.length > 0 && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            Stok {short.join(", ")} tidak cukup.
          </p>
        )}
        <Notice state={state.ok ? {} : state} />
        <Button kind="primary" disabled={pending} onClick={save}>
          {pending ? "Menyimpan…" : "Simpan penjualan"}
        </Button>
        <p className="text-xs text-text-subtle">Stok produk langsung berkurang. Penjualan IRT tidak mencatat kas; pembatalan wajib beralasan.</p>
      </Card>
    </div>
  );
}
