"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formCls, Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { toastResult } from "@/components/ui/toast";
import { receiveIrt, type IrtState } from "@/features/irt/actions";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { todayWib } from "@/lib/today";
import type { IrtUnit } from "@/lib/supabase/types";

type Bahan = { item_id: string; name: string; unit: IrtUnit; kelompok_product_id: string | null };
type Line = { itemId: string; qty: string; valueRp: string };
const emptyLine = (): Line => ({ itemId: "", qty: "", valueRp: "" });

// Catat bahan yang dibeli IRT (IBM). Harga beli hanya untuk HPP — TIDAK membuat kas. Tepung dari kelompok tidak perlu
// dicatat di sini: masuk otomatis saat pesanan IRT diserahkan kelompok.
export function IrtReceiveButton({ bahan }: { bahan: Bahan[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | string>(null); // kunci idempotensi
  const [date, setDate] = useState(todayWib);
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [state, setState] = useState<IrtState>({});
  const [shake, setShake] = useState(0);
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};
  const unitOf = (id: string) => bahan.find((b) => b.item_id === id)?.unit ?? "";
  const total = lines.reduce((s, l) => s + (parseRupiah(l.valueRp) ?? 0), 0);

  const show = () => {
    setState({});
    setDate(todayWib());
    setSupplier("");
    setNote("");
    setLines([emptyLine()]);
    setOpen(crypto.randomUUID());
  };
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = () =>
    open &&
    start(async () => {
      const res = await receiveIrt({ businessDate: date, supplier, note, lines: lines.filter((l) => l.itemId || l.qty || l.valueRp) }, open);
      setState(res);
      toastResult(res);
      if (res.ok) {
        setOpen(null);
        router.refresh();
      } else setShake((n) => n + 1);
    });

  return (
    <>
      <Button kind="primary" onClick={show} disabled={!bahan.length} title={bahan.length ? undefined : "Tambahkan bahan dulu di menu Bahan & produk"}>
        <Plus size={16} strokeWidth={1.75} />
        Catat bahan masuk
      </Button>
      {open && (
        <Dialog
          wide
          title="Catat bahan masuk"
          description="Untuk bahan yang dibeli sendiri. Tepung dari kelompok masuk otomatis saat pesanan diserahkan."
          onClose={() => setOpen(null)}
          shakeKey={shake}
          footer={
            <>
              <Button disabled={pending} onClick={() => setOpen(null)}>
                Batal
              </Button>
              <Button kind="primary" disabled={pending} onClick={save}>
                {pending ? "Menyimpan…" : "Simpan bahan masuk"}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tanggal *" htmlFor="ibm-date" error={fe.businessDate}>
              <Input id="ibm-date" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} className={formCls.input} />
            </Field>
            <Field label="Pemasok" htmlFor="ibm-supplier" error={fe.supplier}>
              <Input id="ibm-supplier" maxLength={120} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="mis. Toko Makmur" className={formCls.input} />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <Field label={`Bahan ${i + 1}`} htmlFor={`ibm-item-${i}`} error={fe[`lines.${i}.itemId`]}>
                  <select id={`ibm-item-${i}`} value={l.itemId} onChange={(e) => set(i, { itemId: e.target.value })} className={formCls.select}>
                    <option value="">Pilih bahan</option>
                    {bahan.map((b) => (
                      <option key={b.item_id} value={b.item_id}>
                        {b.name} ({b.unit})
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  type="button"
                  aria-label={`Hapus baris ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  className="grid size-11 place-items-center self-end rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40 sm:order-last sm:size-10"
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
                <Field label={`Jumlah${unitOf(l.itemId) ? ` (${unitOf(l.itemId)})` : ""}`} htmlFor={`ibm-qty-${i}`} error={fe[`lines.${i}.qty`]}>
                  <Input id={`ibm-qty-${i}`} inputMode="decimal" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} className={formCls.input} />
                </Field>
                <Field label="Harga beli total (Rp)" htmlFor={`ibm-val-${i}`} error={fe[`lines.${i}.valueRp`]}>
                  <Input id={`ibm-val-${i}`} inputMode="numeric" value={l.valueRp} onChange={(e) => set(i, { valueRp: e.target.value })} className={formCls.input} />
                </Field>
              </div>
            ))}
            <Button size="sm" kind="ghost" className="w-fit" disabled={lines.length >= 30} onClick={() => setLines([...lines, emptyLine()])}>
              <Plus size={14} strokeWidth={1.75} />
              Tambah bahan
            </Button>
          </div>
          <Field label="Catatan" htmlFor="ibm-note" error={fe.note}>
            <Input id="ibm-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={formCls.input} />
          </Field>
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm">
            <span className="block text-xs text-accent">Setelah disimpan</span>
            Stok bahan bertambah dan nilai {formatRupiah(total)} masuk ke perhitungan HPP. Tidak ada kas yang tercatat.
          </p>
          <Notice state={state} />
        </Dialog>
      )}
    </>
  );
}
