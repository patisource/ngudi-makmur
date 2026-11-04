"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formCls } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/features/master/actions";

type Decide = (raw: { approve: boolean; note: string }, key: string) => Promise<FormState>;

// Tombol setujui/tolak untuk ketua (koreksi stok, pembatalan batch) → dialog dampak. `decide` = server action yang
// sudah diikat ke id dokumen di Server Component. Tolak wajib alasan.
export function DecisionPanel({ decide, approveText, rejectText, summary }: { decide: Decide; approveText: string; rejectText: string; summary: string }) {
  const [mode, setMode] = useState<null | boolean>(null);
  const [note, setNote] = useState("");
  const open = (approve: boolean) => {
    setNote("");
    setMode(approve);
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" kind="ghost" onClick={() => open(false)}>
          {rejectText}
        </Button>
        <Button size="sm" kind="primary" onClick={() => open(true)}>
          {approveText}
        </Button>
      </div>
      {mode !== null && (
        <ConfirmDialog
          title={mode ? approveText : rejectText}
          confirmLabel={mode ? approveText : rejectText}
          danger={!mode}
          disabled={!mode && note.trim().length < 5}
          onClose={() => setMode(null)}
          onConfirm={(key) => decide({ approve: mode, note }, key)}
        >
          <p className="text-sm text-text-muted">{mode ? `${summary} Mutasi dicatat sekali dan tidak bisa dibatalkan.` : `${summary} Tidak ada perubahan stok.`}</p>
          <Field label={mode ? "Catatan (opsional)" : "Alasan penolakan *"} htmlFor="decision-note">
            <textarea id="decision-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={formCls.textarea} />
          </Field>
        </ConfirmDialog>
      )}
    </>
  );
}
