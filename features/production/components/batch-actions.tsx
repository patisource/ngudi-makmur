"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastResult } from "@/components/ui/toast";
import type { FormState } from "@/features/master/actions";
import { confirmProduction, deleteProductionDraft } from "@/features/production/actions";

// Aksi draft batch di header (desain 03): Hapus draft · Konfirmasi produksi, masing-masing lewat dialog dampak.
// Kunci idempotensi dibuat saat dialog dibuka dan dipakai ulang bila diulang (Security.md §6).
export function BatchActions({ id, impact, canConfirm, canDelete }: { id: string; impact: string; canConfirm: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | { kind: "confirm" | "delete"; key: string }>(null);
  const [state, setState] = useState<FormState>({});
  const [shake, setShake] = useState(0);
  const [pending, start] = useTransition();

  const show = (kind: "confirm" | "delete") => {
    setState({});
    setOpen({ kind, key: crypto.randomUUID() });
  };
  const run = (fn: () => Promise<FormState>, after: () => void) =>
    start(async () => {
      const res = await fn();
      setState(res);
      toastResult(res);
      if (res.ok) {
        setOpen(null);
        after();
      } else setShake((n) => n + 1);
    });

  return (
    <>
      {canDelete && (
        <Button kind="ghost" onClick={() => show("delete")}>
          Hapus draft
        </Button>
      )}
      {canConfirm && (
        <Button kind="primary" onClick={() => show("confirm")}>
          <Check size={16} strokeWidth={1.75} />
          Konfirmasi produksi
        </Button>
      )}
      {!open && state.error && <Notice state={state} />}

      {open?.kind === "confirm" && (
        <Dialog
          title="Konfirmasi produksi"
          description="Nomor PRD terbit, stok berubah, dan HPP dikunci; batch tidak bisa diubah lagi."
          onClose={() => setOpen(null)}
          shakeKey={shake}
          footer={
            <>
              <Button disabled={pending} onClick={() => setOpen(null)}>
                Batal
              </Button>
              <Button kind="primary" disabled={pending} onClick={() => run(() => confirmProduction(id, open.key), () => router.refresh())}>
                {pending ? "Mengonfirmasi…" : "Konfirmasi produksi"}
              </Button>
            </>
          }
        >
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm">
            <span className="block text-xs text-accent">Dampak saat dikonfirmasi</span>
            {impact}
          </p>
          <p className="text-xs text-text-muted">Konfirmasi memakai data draft yang terakhir disimpan. Simpan draft dulu bila ada perubahan.</p>
          <Notice state={state} />
        </Dialog>
      )}
      {open?.kind === "delete" && (
        <Dialog
          title="Hapus draft batch"
          onClose={() => setOpen(null)}
          footer={
            <>
              <Button disabled={pending} onClick={() => setOpen(null)}>
                Batal
              </Button>
              <Button kind="danger" disabled={pending} onClick={() => run(() => deleteProductionDraft(id), () => router.push("/produksi?simpan=hapus"))}>
                {pending ? "Menghapus…" : "Hapus draft"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-muted">Draft belum mengubah stok. Draft yang dihapus tidak bisa dikembalikan.</p>
          <Notice state={state} />
        </Dialog>
      )}
    </>
  );
}
