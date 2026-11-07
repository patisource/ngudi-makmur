"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formCls, Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { toastResult } from "@/components/ui/toast";
import type { FormState } from "@/features/master/actions";
import { archiveIrtItem, saveIrtItem } from "@/features/irt/actions";
import { IRT_UNITS } from "@/lib/irt";
import type { IrtItemKind, IrtUnit } from "@/lib/supabase/types";

export type IrtItemRow = {
  item_id: string;
  kind: IrtItemKind;
  name: string;
  unit: IrtUnit;
  pack_size: number | null;
  price_pcs: number | null;
  price_pack: number | null;
  min_stock: number;
  kelompok_product_id: string | null;
  archived_at: string | null;
  on_hand: number;
};
type KelompokProduct = { id: string; code: string; name: string };

const blank = (kind: IrtItemKind) => ({ kind, name: "", unit: (kind === "produk" ? "pcs" : "kg") as IrtUnit, packSize: "", pricePcs: "", pricePack: "", minStock: "0", kelompokProductId: "" });

// Tambah/ubah bahan atau produk IRT (dialog). Produk selalu pcs; isi per pack mengubah stok pcs menjadi pack saat jual.
export function IrtItemButton({ item, kind, products, label }: { item?: IrtItemRow; kind: IrtItemKind; products: KelompokProduct[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank(kind));
  const [state, setState] = useState<FormState>({});
  const [shake, setShake] = useState(0);
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};

  const show = () => {
    setState({});
    setV(
      item
        ? {
            kind: item.kind,
            name: item.name,
            unit: item.unit,
            packSize: item.pack_size ? String(item.pack_size) : "",
            pricePcs: item.price_pcs != null ? String(item.price_pcs) : "",
            pricePack: item.price_pack != null ? String(item.price_pack) : "",
            minStock: String(item.min_stock).replace(".", ","),
            kelompokProductId: item.kelompok_product_id ?? "",
          }
        : blank(kind),
    );
    setOpen(true);
  };
  const save = () =>
    start(async () => {
      const res = await saveIrtItem(item?.item_id ?? null, { ...v, unit: v.kind === "produk" ? "pcs" : v.unit });
      setState(res);
      toastResult(res);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setShake((n) => n + 1);
    });

  const produk = v.kind === "produk";
  return (
    <>
      {item ? (
        <Button size="sm" kind="ghost" onClick={show}>
          Ubah
        </Button>
      ) : (
        <Button kind={kind === "produk" ? "primary" : "secondary"} onClick={show}>
          <Plus size={16} strokeWidth={1.75} />
          {label ?? (kind === "produk" ? "Tambah produk" : "Tambah bahan")}
        </Button>
      )}
      {open && (
        <Dialog
          title={item ? `Ubah ${item.name}` : produk ? "Tambah produk IRT" : "Tambah bahan IRT"}
          description={produk ? "Stok produk dihitung per pcs. Isi per pack dipakai saat menjual per pack." : "Bahan yang dibeli atau diterima dari kelompok."}
          onClose={() => setOpen(false)}
          shakeKey={shake}
          footer={
            <>
              <Button disabled={pending} onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button kind="primary" disabled={pending} onClick={save}>
                {pending ? "Menyimpan…" : "Simpan"}
              </Button>
            </>
          }
        >
          <Field label="Nama *" htmlFor="irt-name" error={fe.name}>
            <Input id="irt-name" maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={produk ? "mis. Kue kering jagung" : "mis. Gula pasir"} className={formCls.input} />
          </Field>
          {produk ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Harga per pcs (Rp) *" htmlFor="irt-pcs" error={fe.pricePcs}>
                  <Input id="irt-pcs" inputMode="numeric" value={v.pricePcs} onChange={(e) => setV({ ...v, pricePcs: e.target.value })} placeholder="mis. 1500" className={formCls.input} />
                </Field>
                <Field label="Isi per pack (pcs)" htmlFor="irt-pack" error={fe.packSize} hint="Kosongkan bila tidak dijual per pack.">
                  <Input id="irt-pack" inputMode="numeric" value={v.packSize} onChange={(e) => setV({ ...v, packSize: e.target.value })} placeholder="mis. 10" className={formCls.input} />
                </Field>
              </div>
              <Field label="Harga per pack (Rp)" htmlFor="irt-ppack" error={fe.pricePack} hint="Kosongkan untuk memakai isi × harga per pcs.">
                <Input id="irt-ppack" inputMode="numeric" value={v.pricePack} disabled={!v.packSize} onChange={(e) => setV({ ...v, pricePack: e.target.value })} placeholder="mis. 14000" className={formCls.input} />
              </Field>
              <Field label="Stok minimum (pcs)" htmlFor="irt-min" error={fe.minStock}>
                <Input id="irt-min" inputMode="numeric" value={v.minStock} onChange={(e) => setV({ ...v, minStock: e.target.value })} className={formCls.input} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Diterima dari kelompok?" htmlFor="irt-link" hint="Bila dihubungkan, pembelian produk ini dari kelompok otomatis menjadi bahan masuk IRT (satuan kg).">
                <select id="irt-link" value={v.kelompokProductId} onChange={(e) => setV({ ...v, kelompokProductId: e.target.value, unit: e.target.value ? "kg" : v.unit })} className={formCls.select}>
                  <option value="">Tidak — dibeli dari luar</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      Ya — {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Satuan *" htmlFor="irt-unit" error={fe.unit}>
                  <select id="irt-unit" value={v.unit} disabled={Boolean(v.kelompokProductId)} onChange={(e) => setV({ ...v, unit: e.target.value as IrtUnit })} className={formCls.select}>
                    {IRT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Stok minimum (${v.unit})`} htmlFor="irt-min" error={fe.minStock}>
                  <Input id="irt-min" inputMode="decimal" value={v.minStock} onChange={(e) => setV({ ...v, minStock: e.target.value })} className={formCls.input} />
                </Field>
              </div>
            </>
          )}
          <Notice state={state} />
        </Dialog>
      )}
    </>
  );
}

export function IrtArchiveButton({ item }: { item: IrtItemRow }) {
  const [open, setOpen] = useState(false);
  const archive = !item.archived_at;
  return (
    <>
      <Button size="sm" kind="ghost" onClick={() => setOpen(true)}>
        {archive ? "Arsipkan" : "Aktifkan"}
      </Button>
      {open && (
        <ConfirmDialog
          title={archive ? `Arsipkan ${item.name}` : `Aktifkan ${item.name}`}
          confirmLabel={archive ? "Arsipkan" : "Aktifkan"}
          danger={archive}
          onClose={() => setOpen(false)}
          onConfirm={() => archiveIrtItem(item.item_id, archive)}
        >
          <p className="text-sm text-text-muted">
            {archive ? "Tidak muncul lagi di pilihan baru; riwayatnya tetap tersimpan. Stok harus 0 dulu." : "Muncul lagi di pilihan bahan masuk, produksi, dan penjualan."}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
