"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formCls, Notice } from "@/components/shared/notice";
import type { FormState } from "@/features/master/actions";

type Decide = (raw: { approve: boolean; note: string }, key: string) => Promise<FormState>;

// Panel setujui/tolak untuk ketua (koreksi stok, pembatalan batch). `decide` = server action yang sudah diikat ke id
// dokumen di Server Component. Kunci idempotensi dibuat saat panel dibuka (Security.md §6); tolak wajib alasan.
export function DecisionPanel({ decide, approveText, rejectText, summary }: { decide: Decide; approveText: string; rejectText: string; summary: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | { approve: boolean; key: string }>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const open = (approve: boolean) => {
    setState({});
    setMode({ approve, key: crypto.randomUUID() });
  };
  return (
    <div className="flex flex-col gap-2">
      {!mode && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" kind="primary" onClick={() => open(true)}>
            {approveText}
          </Button>
          <Button size="sm" kind="ghost" onClick={() => open(false)}>
            {rejectText}
          </Button>
        </div>
      )}
      {mode && (
        <div className={formCls.panel}>
          <p className="text-sm">{mode.approve ? `${summary} Mutasi dicatat sekali dan tidak bisa dibatalkan.` : `${summary} Tidak ada perubahan stok.`}</p>
          <label htmlFor="decision-note" className="text-label font-medium">
            {mode.approve ? "Catatan (opsional)" : "Alasan penolakan *"}
          </label>
          <textarea id="decision-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={formCls.textarea} />
          <div className="flex flex-wrap gap-2">
            <Button
              kind={mode.approve ? "primary" : "danger"}
              disabled={pending || (!mode.approve && note.trim().length < 5)}
              onClick={() =>
                start(async () => {
                  const res = await decide({ approve: mode.approve, note }, mode.key);
                  setState(res);
                  if (res.ok) {
                    setMode(null);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Menyimpan…" : mode.approve ? approveText : rejectText}
            </Button>
            <Button disabled={pending} onClick={() => setMode(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}
      <Notice state={state} />
    </div>
  );
}
