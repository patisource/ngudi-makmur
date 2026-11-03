"use client";

import { Check, PackageCheck, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formCls, Notice } from "@/components/shared/notice";
import { ReceiptDialog } from "@/components/shared/receipt-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "@/features/master/actions";
import { cancelOrder, confirmOrder, deleteOrderDraft, fulfillOrder } from "@/features/orders/actions";
import { formatRupiah } from "@/lib/money";
import type { OrderStatus } from "@/lib/supabase/types";
import type { ThermalLine } from "@/lib/thermal";
import { todayWib } from "@/lib/validation/common";

type Kind = "confirm" | "delete" | "fulfill" | "cancel" | "nota";
type Open = null | { kind: Kind; key: string };

export type ReceiptProps = { lines80: ThermalLine[]; lines58: ThermalLine[]; printed: number; canPrint: boolean };

// Aksi status pesanan di header (desain 02): Batalkan · Nota thermal · Serahkan barang. Setiap aksi lewat dialog yang
// menjelaskan dampaknya (StyleGuide §9). Kunci idempotensi dibuat saat dialog dibuka dan dipakai ulang untuk percobaan
// ulang, sehingga klik ganda / koneksi putus tidak memposting dua kali (Security.md §6).
export function OrderActions({
  id,
  status,
  docNumber,
  businessDate,
  impact,
  netPaidRp = 0,
  accounts = [],
  canManage,
  receipt,
}: {
  id: string;
  status: OrderStatus;
  docNumber: string | null;
  businessDate: string;
  impact: string;
  /** pembayaran bersih terverifikasi; > 0 → batal wajib memilih akun refund */
  netPaidRp?: number;
  accounts?: Array<{ id: string; name: string; balanceRp: number }>;
  canManage: boolean;
  receipt?: ReceiptProps;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [reason, setReason] = useState("");
  const [refundAccount, setRefundAccount] = useState(accounts[0]?.id ?? "");
  const [recipient, setRecipient] = useState("");
  const [deliveredOn, setDeliveredOn] = useState(todayWib);
  const [state, setState] = useState<FormState>({});
  const [shake, setShake] = useState(0);
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition(); // tombol nonaktif sampai data terbaru tampil

  const show = (kind: Kind) => {
    setState({});
    setOpen({ kind, key: crypto.randomUUID() });
  };
  const close = () => setOpen(null);
  const run = (fn: () => Promise<FormState>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setState(res);
      if (res.ok) {
        setOpen(null);
        if (after) after();
        else startRefresh(() => router.refresh());
      } else setShake((n) => n + 1);
    });

  const live = status === "draft" || status === "confirmed";
  const footer = (confirmLabel: string, onConfirm: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) => (
    <>
      <Button disabled={pending} onClick={close}>
        Batal
      </Button>
      <Button kind={opts.danger ? "danger" : "primary"} disabled={pending || opts.disabled} onClick={onConfirm}>
        {pending ? "Menyimpan…" : confirmLabel}
      </Button>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canManage && live && status === "draft" && (
          <>
            <Button kind="ghost" disabled={refreshing} onClick={() => show("delete")}>
              Hapus draft
            </Button>
            <Button kind="primary" disabled={refreshing} onClick={() => show("confirm")}>
              <Check size={16} strokeWidth={1.75} />
              Konfirmasi pesanan
            </Button>
          </>
        )}
        {canManage && status === "confirmed" && (
          <Button kind="ghost" disabled={refreshing} onClick={() => show("cancel")}>
            Batalkan
          </Button>
        )}
        {receipt && (
          <Button onClick={() => show("nota")}>
            <Printer size={16} strokeWidth={1.75} />
            Nota thermal
          </Button>
        )}
        {canManage && status === "confirmed" && (
          <Button kind="primary" disabled={refreshing} onClick={() => show("fulfill")}>
            <PackageCheck size={16} strokeWidth={1.75} />
            Serahkan barang
          </Button>
        )}
      </div>
      {!open && <Notice state={state} />}

      {open?.kind === "nota" && receipt && (
        <ReceiptDialog title={`Struk thermal ${docNumber ?? ""}`} docId={id} lines80={receipt.lines80} lines58={receipt.lines58} printed={receipt.printed} canPrint={receipt.canPrint} onClose={close} />
      )}

      {open?.kind === "confirm" && (
        <Dialog title="Konfirmasi pesanan" description="Nomor INV terbit dan isi pesanan dikunci." onClose={close} shakeKey={shake} footer={footer("Konfirmasi & reservasi", () => run(() => confirmOrder(id, open.key)))}>
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm">
            <span className="block text-xs text-accent">Setelah dikonfirmasi</span>
            {impact}. Ditolak bila stok tersedia tidak cukup.
          </p>
          <Notice state={state} />
        </Dialog>
      )}

      {open?.kind === "delete" && (
        <Dialog title="Hapus draft pesanan" onClose={close} footer={footer("Hapus draft", () => run(() => deleteOrderDraft(id), () => router.push("/penjualan?simpan=hapus")), { danger: true })}>
          <p className="text-sm text-text-muted">Draft belum mengubah stok dan belum punya nomor. Draft yang dihapus tidak bisa dikembalikan.</p>
          <Notice state={state} />
        </Dialog>
      )}

      {open?.kind === "fulfill" && (
        <Dialog title="Serahkan barang" description={docNumber ?? undefined} onClose={close} shakeKey={shake} footer={footer("Serahkan barang", () => run(() => fulfillOrder(id, { recipient, deliveredOn }, open.key)))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Diterima oleh" htmlFor="recipient" hint="Opsional, mis. nama pelanggan atau kurir.">
              <Input id="recipient" maxLength={120} value={recipient} onChange={(e) => setRecipient(e.target.value)} className={formCls.input} />
            </Field>
            <Field label="Tanggal serah" htmlFor="deliveredOn">
              <Input id="deliveredOn" type="date" min={businessDate} max={todayWib()} value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)} className={formCls.input} />
            </Field>
          </div>
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm">
            <span className="block text-xs text-accent">Setelah disimpan</span>
            {impact} keluar dari stok (reservasi menjadi stok keluar). Status bayar tidak berubah; barang yang sudah diserahkan hanya bisa kembali lewat retur.
          </p>
          <Notice state={state} />
        </Dialog>
      )}

      {open?.kind === "cancel" && (
        <Dialog
          title={`Batalkan ${docNumber ?? "pesanan"}`}
          onClose={close}
          shakeKey={shake}
          footer={footer("Batalkan pesanan", () => run(() => cancelOrder(id, reason, netPaidRp > 0 ? refundAccount : null, open.key)), { danger: true, disabled: reason.trim().length < 5 })}
        >
          <p className="text-sm text-text-muted">
            Reservasi stok dilepas dan nomor tidak dipakai ulang; pembayaran yang belum diverifikasi ikut ditolak.
            {netPaidRp > 0 && (
              <>
                {" "}
                Pesanan sudah dibayar <strong className="font-semibold text-text">{formatRupiah(netPaidRp)}</strong>: uang dikembalikan penuh sebagai refund (kas keluar) dalam langkah yang sama.
              </>
            )}
          </p>
          {netPaidRp > 0 && (
            <Field label="Refund dari akun *" htmlFor="refund-account">
              <select id="refund-account" value={refundAccount} onChange={(e) => setRefundAccount(e.target.value)} className={formCls.select}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · saldo {formatRupiah(a.balanceRp)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Alasan pembatalan *" htmlFor="cancel-reason">
            <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} placeholder="mis. Pelanggan membatalkan lewat WhatsApp" className={formCls.textarea} />
          </Field>
          <Notice state={state} />
        </Dialog>
      )}
    </>
  );
}
