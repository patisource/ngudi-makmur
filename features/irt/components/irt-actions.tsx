"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formCls } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Seg } from "@/components/ui/seg";
import { adjustIrt, voidIrtSale } from "@/features/irt/actions";
import { formatIrtQty } from "@/lib/irt";
import { todayWib } from "@/lib/today";
import type { IrtUnit } from "@/lib/supabase/types";

// Batal penjualan IRT: alasan wajib, stok kembali; tidak ada kas yang perlu dikembalikan.
export function IrtVoidSaleButton({ saleId, docNumber }: { saleId: string; docNumber: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button kind="ghost" onClick={() => setOpen(true)}>
        Batalkan penjualan
      </Button>
      {open && (
        <ConfirmDialog
          title={`Batalkan ${docNumber}`}
          confirmLabel="Batalkan penjualan"
          danger
          disabled={reason.trim().length < 5}
          onClose={() => setOpen(false)}
          onConfirm={(key) => voidIrtSale(saleId, reason, key)}
        >
          <p className="text-sm text-text-muted">Produk kembali ke stok senilai saat keluar. Nomor dokumen tidak dipakai ulang.</p>
          <Field label="Alasan pembatalan *" htmlFor="ijl-void">
            <textarea id="ijl-void" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Salah catat jumlah" className={formCls.textarea} />
          </Field>
        </ConfirmDialog>
      )}
    </>
  );
}

// Koreksi stok IRT (rusak, kedaluwarsa, salah hitung): langsung berlaku, alasan wajib, tercatat di audit.
export function IrtAdjustButton({ item }: { item: { item_id: string; name: string; unit: IrtUnit; on_hand: number } }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayWib);
  const show = () => {
    setDirection("out");
    setQty("");
    setReason("");
    setDate(todayWib());
    setOpen(true);
  };
  return (
    <>
      <Button size="sm" kind="ghost" onClick={show}>
        Koreksi
      </Button>
      {open && (
        <ConfirmDialog
          title={`Koreksi stok ${item.name}`}
          description={`Stok tercatat ${formatIrtQty(Number(item.on_hand), item.unit)}`}
          confirmLabel="Simpan koreksi"
          disabled={!qty.trim() || reason.trim().length < 5}
          onClose={() => setOpen(false)}
          onConfirm={(key) => adjustIrt({ itemId: item.item_id, direction, qty, reason, businessDate: date }, key)}
        >
          <Seg
            label="Arah koreksi"
            value={direction}
            onChange={setDirection}
            options={[
              ["out", "Kurangi stok"],
              ["in", "Tambah stok"],
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Jumlah (${item.unit}) *`} htmlFor="iks-qty">
              <Input id="iks-qty" inputMode={item.unit === "pcs" ? "numeric" : "decimal"} value={qty} onChange={(e) => setQty(e.target.value)} className={formCls.input} />
            </Field>
            <Field label="Tanggal *" htmlFor="iks-date">
              <Input id="iks-date" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} className={formCls.input} />
            </Field>
          </div>
          <Field label="Alasan *" htmlFor="iks-reason">
            <textarea id="iks-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. 5 pcs kemasan rusak terkena air" className={formCls.textarea} />
          </Field>
          <p className="text-xs text-text-subtle">Koreksi langsung berlaku dan tercatat di log audit (ketua dapat melihatnya).</p>
        </ConfirmDialog>
      )}
    </>
  );
}
