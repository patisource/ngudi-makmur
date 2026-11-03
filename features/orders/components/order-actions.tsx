"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "@/features/master/actions";
import { cancelOrder, confirmOrder, deleteOrderDraft, fulfillOrder } from "@/features/orders/actions";
import type { OrderStatus } from "@/lib/supabase/types";
import { todayWib } from "@/lib/validation/common";

type Kind = "confirm" | "delete" | "fulfill" | "cancel";
type Panel = null | { kind: Kind; key: string };

const panelCls = "flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4";
const textareaCls = "rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:text-sm";

// Aksi status pesanan (FR-SAL-04..06). Kunci idempotensi dibuat saat panel dibuka dan dipakai ulang untuk percobaan
// ulang, sehingga klik ganda / koneksi putus tidak memposting dua kali (Security.md §6). Setiap aksi menjelaskan
// dampaknya dan tombolnya menyebut aksinya (StyleGuide §9).
export function OrderActions({ id, status, docNumber, businessDate, impact }: { id: string; status: OrderStatus; docNumber: string | null; businessDate: string; impact: string }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [recipient, setRecipient] = useState("");
  const [deliveredOn, setDeliveredOn] = useState(todayWib());
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();

  const open = (kind: Kind) => {
    setState({});
    setPanel({ kind, key: crypto.randomUUID() });
  };
  const run = (fn: () => Promise<FormState>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setState(res);
      if (res.ok) {
        setPanel(null);
        if (after) after();
        else router.refresh();
      }
    });

  if (status === "cancelled" || status === "delivered") return null;

  return (
    <div className="flex flex-col gap-3">
      {!panel && (
        <div className="flex flex-wrap gap-2">
          {status === "draft" ? (
            <>
              <Button kind="primary" onClick={() => open("confirm")}>
                Konfirmasi pesanan
              </Button>
              <Button kind="ghost" onClick={() => open("delete")}>
                Hapus draft
              </Button>
            </>
          ) : (
            <>
              <Button kind="primary" onClick={() => open("fulfill")}>
                Serahkan barang
              </Button>
              <Button kind="ghost" onClick={() => open("cancel")}>
                Batalkan pesanan
              </Button>
            </>
          )}
        </div>
      )}

      {panel?.kind === "confirm" && (
        <div className={panelCls}>
          <p className="text-sm">
            <strong className="font-semibold">{impact}</strong>. Nomor INV terbit, stok direservasi, dan isi pesanan dikunci. Ditolak bila stok tersedia tidak cukup.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" disabled={pending} onClick={() => run(() => confirmOrder(id, panel.key))}>
              {pending ? "Mengonfirmasi…" : "Ya, konfirmasi"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {panel?.kind === "delete" && (
        <div className={panelCls}>
          <p className="text-sm">Hapus draft pesanan ini? Draft belum mengubah stok dan belum punya nomor.</p>
          <div className="flex flex-wrap gap-2">
            <Button kind="danger" disabled={pending} onClick={() => run(() => deleteOrderDraft(id), () => router.push("/penjualan?simpan=hapus"))}>
              {pending ? "Menghapus…" : "Ya, hapus draft"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {panel?.kind === "fulfill" && (
        <div className={panelCls}>
          <p className="text-sm">
            <strong className="font-semibold">{impact}</strong> keluar dari stok (reservasi menjadi stok keluar). Status bayar tidak berubah; barang yang sudah diserahkan hanya bisa kembali lewat retur.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Diterima oleh" htmlFor="recipient" hint="Opsional, mis. nama pelanggan atau kurir.">
              <Input id="recipient" maxLength={120} value={recipient} onChange={(e) => setRecipient(e.target.value)} className="h-11 text-base sm:h-10 sm:text-sm" />
            </Field>
            <Field label="Tanggal serah" htmlFor="deliveredOn">
              <Input id="deliveredOn" type="date" min={businessDate} max={todayWib()} value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)} className="h-11 text-base sm:h-10 sm:text-sm" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" disabled={pending} onClick={() => run(() => fulfillOrder(id, { recipient, deliveredOn }, panel.key))}>
              {pending ? "Menyimpan…" : "Serahkan barang"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {panel?.kind === "cancel" && (
        <div className={panelCls}>
          <p className="text-sm">
            Batalkan {docNumber}? Reservasi stok dilepas dan nomor tidak dipakai ulang. Pembayaran yang sudah diterima dikembalikan lewat refund (modul pembayaran).
          </p>
          <label htmlFor="cancel-reason" className="text-label font-medium">
            Alasan pembatalan *
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="mis. Pelanggan membatalkan lewat WhatsApp"
            className={textareaCls}
          />
          <div className="flex flex-wrap gap-2">
            <Button kind="danger" disabled={pending || reason.trim().length < 5} onClick={() => run(() => cancelOrder(id, reason, panel.key))}>
              {pending ? "Membatalkan…" : "Batalkan pesanan"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          {state.message}
        </p>
      )}
    </div>
  );
}
