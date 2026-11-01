"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/features/master/actions";
import { confirmProduction, deleteProductionDraft } from "@/features/production/actions";

// Aksi draft batch. Kunci idempotensi dibuat saat panel konfirmasi dibuka dan dipakai ulang bila diulang (Security.md §6).
export function BatchActions({ id, impact, canConfirm, canDelete }: { id: string; impact: string; canConfirm: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [panel, setPanel] = useState<null | { kind: "confirm" | "delete"; key: string }>(null);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();

  const open = (kind: "confirm" | "delete") => {
    setState({});
    setPanel({ kind, key: crypto.randomUUID() });
  };
  const run = (fn: () => Promise<FormState>, after: () => void) =>
    start(async () => {
      const res = await fn();
      setState(res);
      if (res.ok) {
        setPanel(null);
        after();
      }
    });

  return (
    <div className="flex flex-col gap-3">
      {!panel && (
        <div className="flex flex-wrap gap-2">
          {canConfirm && (
            <Button kind="primary" onClick={() => open("confirm")}>
              Konfirmasi batch
            </Button>
          )}
          {canDelete && (
            <Button kind="ghost" onClick={() => open("delete")}>
              Hapus draft
            </Button>
          )}
        </div>
      )}
      {!canConfirm && <p className="text-xs text-text-subtle">Konfirmasi hanya oleh pemegang izin konfirmasi batch.</p>}

      {panel?.kind === "confirm" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4">
          <p className="text-sm">
            <strong className="font-semibold">{impact}</strong>. Nomor PRD terbit, stok berubah, dan HPP dikunci; batch tidak bisa diubah lagi.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" disabled={pending} onClick={() => run(() => confirmProduction(id, panel.key), () => router.refresh())}>
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
          <p className="text-sm">Hapus draft batch ini? Draft belum mengubah stok.</p>
          <div className="flex flex-wrap gap-2">
            <Button kind="danger" disabled={pending} onClick={() => run(() => deleteProductionDraft(id), () => router.push("/produksi?simpan=hapus"))}>
              {pending ? "Menghapus…" : "Ya, hapus draft"}
            </Button>
            <Button disabled={pending} onClick={() => setPanel(null)}>
              Batal
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
