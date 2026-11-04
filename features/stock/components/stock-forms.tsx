"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog, ImpactNote } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { formCls, Notice } from "@/components/shared/notice";
import type { FormState } from "@/features/master/actions";
import { deleteOpname, postOpname, requestAdjustment, requestBatchVoid, saveOpname } from "@/features/stock/actions";
import { dbKgToGrams, formatKg, parseKgToGrams } from "@/lib/qty";
import { todayWib } from "@/lib/today";

type Product = { id: string; name: string; onHandKg: number };

// ---------------------------------------------------------------- stok opname (T9.1): hitung fisik per produk
export function OpnameForm({ opnameId, products, defaults }: { opnameId: string | null; products: Product[]; defaults?: { date: string; note: string; physical: Record<string, string> } }) {
  const router = useRouter();
  const [date, setDate] = useState(defaults?.date ?? todayWib());
  const [note, setNote] = useState(defaults?.note ?? "");
  const [physical, setPhysical] = useState<Record<string, string>>(defaults?.physical ?? {});
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const filled = products.filter((p) => (physical[p.id] ?? "").trim() !== "");

  return (
    <Card>
      <h2 className="font-semibold">{opnameId ? "Ubah hitungan" : "Hitung stok fisik"}</h2>
      <p className="text-sm text-text-muted">Isi berat hasil timbang untuk produk yang dihitung (kosongkan yang tidak dihitung). Selisih dihitung saat diposting, terhadap stok tercatat saat itu.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tanggal hitung *" htmlFor="opn-date">
          <Input id="opn-date" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} className={formCls.input} />
        </Field>
        <Field label="Catatan" htmlFor="opn-note">
          <Input id="opn-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Opname akhir bulan gudang utama" className={formCls.input} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        {products.map((p) => {
          const g = parseKgToGrams(physical[p.id] ?? "");
          const diff = g === null ? null : g - dbKgToGrams(p.onHandKg);
          return (
            <div key={p.id} className="grid items-center gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_10rem_9rem]">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-text-subtle">tercatat {formatKg(dbKgToGrams(p.onHandKg))}</div>
              </div>
              <Input
                inputMode="decimal"
                aria-label={`Berat fisik ${p.name} (kg)`}
                value={physical[p.id] ?? ""}
                onChange={(e) => setPhysical({ ...physical, [p.id]: e.target.value })}
                placeholder="kg fisik"
                className={formCls.input}
              />
              <span className={`text-sm tabular-nums ${diff === null || diff === 0 ? "text-text-muted" : diff > 0 ? "text-accent" : "text-danger"}`}>
                {diff === null ? "—" : `selisih ${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatKg(Math.abs(diff))}`}
              </span>
            </div>
          );
        })}
      </div>
      <Notice state={state} />
      <Button
        kind="primary"
        className="w-full sm:w-fit"
        disabled={pending || filled.length === 0}
        onClick={() =>
          start(async () => {
            const res = await saveOpname(opnameId, { businessDate: date, note, lines: filled.map((p) => ({ productId: p.id, physicalKg: physical[p.id] })) });
            setState(res);
            if (res.ok && res.id) {
              if (opnameId) router.refresh();
              else router.push(`/stok/opname/${res.id}`);
            }
          })
        }
      >
        {pending ? "Menyimpan…" : "Simpan draft opname"}
      </Button>
    </Card>
  );
}

export function OpnameActions({ id, impact }: { id: string; impact: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "post" | "delete">(null);
  const close = () => setOpen(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button kind="ghost" onClick={() => setOpen("delete")}>
          Hapus draft
        </Button>
        <Button kind="primary" onClick={() => setOpen("post")}>
          Posting opname
        </Button>
      </div>
      {open === "post" && (
        <ConfirmDialog title="Posting stok opname" description="Nomor OPN terbit; hasil hitung tidak bisa diubah lagi." confirmLabel="Posting opname" onClose={close} onConfirm={(key) => postOpname(id, key)}>
          <ImpactNote label="Setelah diposting">{impact}. Selisih dicatat sebagai mutasi stok opname.</ImpactNote>
        </ConfirmDialog>
      )}
      {open === "delete" && (
        <ConfirmDialog title="Hapus draft opname" confirmLabel="Hapus draft" danger onClose={close} onConfirm={() => deleteOpname(id)} onDone={() => router.push("/stok/opname")}>
          <p className="text-sm text-text-muted">Draft opname dihapus. Stok belum berubah.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

// ---------------------------------------------------------------- koreksi stok (T9.2)
export function AdjustmentForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const empty = { productId: products[0]?.id ?? "", direction: "out" as "in" | "out", qty: "", reason: "", date: todayWib() };
  const [v, setV] = useState(empty);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};
  return (
    <Card>
      <h2 className="font-semibold">Ajukan koreksi stok</h2>
      <p className="text-sm text-text-muted">Untuk kejadian di luar transaksi (rusak, hilang, salah catat). Stok baru berubah setelah ketua menyetujui.</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-label font-medium">Arah</legend>
        <div className="grid max-w-sm grid-cols-2 gap-2">
          {(
            [
              ["out", "Kurangi stok"],
              ["in", "Tambah stok"],
            ] as const
          ).map(([d, l]) => (
            <label key={d} className={formCls.chip}>
              <input type="radio" name="adj-direction" className="sr-only" checked={v.direction === d} onChange={() => setV({ ...v, direction: d })} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Produk *" htmlFor="adj-product" error={fe.productId}>
          <select id="adj-product" value={v.productId} onChange={(e) => setV({ ...v, productId: e.target.value })} className={formCls.select}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatKg(dbKgToGrams(p.onHandKg))}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Berat (kg) *" htmlFor="adj-qty" error={fe.qtyKg}>
          <Input id="adj-qty" inputMode="decimal" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} className={formCls.input} />
        </Field>
        <Field label="Tanggal *" htmlFor="adj-date" error={fe.businessDate}>
          <Input id="adj-date" type="date" max={todayWib()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={formCls.input} />
        </Field>
      </div>
      <label htmlFor="adj-reason" className="text-label font-medium">
        Alasan *
      </label>
      <textarea id="adj-reason" rows={2} maxLength={500} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="mis. 2 kg tepung lembap dibuang" className={formCls.textarea} />
      <Notice state={state} />
      <Button
        kind="primary"
        className="w-full sm:w-fit"
        disabled={pending || v.reason.trim().length < 5}
        onClick={() =>
          start(async () => {
            const res = await requestAdjustment({ productId: v.productId, direction: v.direction, qtyKg: v.qty, reason: v.reason, businessDate: v.date }, key);
            setState(res);
            toastResult(res);
            if (res.ok) {
              setKey(crypto.randomUUID());
              setV(empty);
              router.refresh();
            }
          })
        }
      >
        {pending ? "Mengajukan…" : "Ajukan koreksi"}
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------- ajukan pembatalan batch (T5.7)
export function BatchVoidRequest({ batchId, docNumber }: { batchId: string; docNumber: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button kind="ghost" className="w-fit" onClick={() => setOpen(true)}>
        Ajukan pembatalan batch
      </Button>
      {open && (
        <ConfirmDialog
          title={`Ajukan pembatalan ${docNumber}`}
          confirmLabel="Ajukan pembatalan"
          danger
          disabled={reason.trim().length < 5}
          onClose={() => setOpen(false)}
          onConfirm={(key) => requestBatchVoid(batchId, reason, key)}
        >
          <p className="text-sm text-text-muted">Butuh persetujuan ketua. Bila disetujui, hasil batch dikeluarkan dan bahan dikembalikan ke stok; ditolak bila hasil sudah terpakai/terjual.</p>
          <Field label="Alasan *" htmlFor="void-reason">
            <textarea id="void-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Salah pilih jenis batch" className={formCls.textarea} />
          </Field>
        </ConfirmDialog>
      )}
    </>
  );
}
