"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/features/master/actions";
import { confirmReceipt, deleteReceiptDraft, voidReceipt } from "@/features/receipts/actions";

type Panel = null | { kind: "confirm" | "void" | "delete"; key: string };

function Notice({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
        {state.message}
      </p>
    );
  return null;
}

// Aksi dokumen jagung masuk. Kunci idempotensi dibuat saat panel dibuka dan dipakai ulang untuk percobaan ulang,
// sehingga klik ganda / koneksi putus tidak membuat posting kedua (Security.md §6).
export function ReceiptActions({ id, status, impact }: { id: string; status: "draft" | "confirmed" | "void"; impact: string }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();

  const open = (kind: NonNullable<Panel>["kind"]) => {
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

  if (status === "void") return null;

  return (
    <div className="flex flex-col gap-3">
      {!panel && (
        <div className="flex flex-wrap gap-2">
          {status === "draft" ? (
            <>
              <Button kind="primary" onClick={() => open("confirm")}>
                Konfirmasi
              </Button>
              <Button kind="ghost" onClick={() => open("delete")}>
                Hapus draft
              </Button>
            </>
          ) : (
            <Button kind="ghost" onClick={() => open("void")}>
              Batalkan penerimaan
            </Button>
          )}
        </div>
      )}

      {panel?.kind === "confirm" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4">
          <p className="text-sm">
            <strong className="font-semibold">{impact}</strong>. Nomor RCV terbit dan dokumen dikunci; perubahan berikutnya hanya lewat pembatalan.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" disabled={pending} onClick={() => run(() => confirmReceipt(id, panel.key))}>
              {pending ? "Mengonfirmasi…" : "Ya, konfirmasi"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {panel?.kind === "delete" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4">
          <p className="text-sm">Hapus draft ini beserta buktinya? Draft belum mengubah stok.</p>
          <div className="flex flex-wrap gap-2">
            <Button kind="danger" disabled={pending} onClick={() => run(() => deleteReceiptDraft(id), () => router.push("/jagung-masuk?simpan=hapus"))}>
              {pending ? "Menghapus…" : "Ya, hapus draft"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {panel?.kind === "void" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4">
          <p className="text-sm">
            Stok dikurangi kembali sebesar penerimaan ini. Ditolak bila stok tersedia sudah tidak cukup (mis. sudah dipakai produksi). Nomor dokumen tidak dipakai ulang.
          </p>
          <label htmlFor="void-reason" className="text-label font-medium">
            Alasan pembatalan
          </label>
          <textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="mis. Salah timbang, dicatat ulang"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft"
          />
          <div className="flex flex-wrap gap-2">
            <Button kind="danger" disabled={pending || reason.trim().length < 5} onClick={() => run(() => voidReceipt(id, reason, panel.key))}>
              {pending ? "Membatalkan…" : "Batalkan penerimaan"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      <Notice state={state} />
    </div>
  );
}
