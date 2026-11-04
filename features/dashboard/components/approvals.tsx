"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formCls, Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastResult } from "@/components/ui/toast";
import { decideCorrection } from "@/features/cash/actions";
import type { FormState } from "@/features/master/actions";
import { verifyReturn } from "@/features/orders/actions";
import type { Approval } from "@/features/shell/queries";
import { decideAdjustment, decideBatchVoid } from "@/features/stock/actions";

// "Menunggu persetujuan ketua" (desain 07): setujui/tolak langsung dari dashboard. Keputusan tetap lewat dialog yang
// menjelaskan dampaknya (StyleGuide §9); tolak wajib alasan; kunci idempotensi dibuat saat dialog dibuka.
const KIND_LABEL: Record<Approval["kind"], string> = { stock: "Koreksi stok", cash: "Koreksi kas", return: "Retur fisik", void: "Pembatalan batch" };

const IMPACT: Record<Approval["kind"], { yes: string; no: string }> = {
  stock: { yes: "Mutasi koreksi stok dicatat sekali dan tidak bisa dibatalkan.", no: "Stok tidak berubah." },
  cash: { yes: "Saldo kas berubah sesuai koreksi; tercatat satu kali di buku kas.", no: "Saldo kas tidak berubah." },
  return: { yes: "Barang masuk kembali ke stok dan nilai retur mengurangi tagihan pesanan.", no: "" },
  void: { yes: "Bahan dikembalikan ke stok dan hasil dikeluarkan dari stok (mutasi balik).", no: "Batch tetap terkonfirmasi." },
};

function decide(a: Approval, approve: boolean, note: string, key: string): Promise<FormState> {
  switch (a.kind) {
    case "stock":
      return decideAdjustment(a.id, { approve, note }, key);
    case "cash":
      return decideCorrection(a.id, { approve, note }, key);
    case "void":
      return decideBatchVoid(a.id, { approve, note }, key);
    case "return":
      return verifyReturn(a.parentId ?? "", a.id, key);
  }
}

export function Approvals({ items }: { items: Approval[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | { item: Approval; approve: boolean; key: string }>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<FormState>({});
  const [shake, setShake] = useState(0);
  const [pending, start] = useTransition();

  const show = (item: Approval, approve: boolean) => {
    setNote("");
    setState({});
    setOpen({ item, approve, key: crypto.randomUUID() });
  };

  const submit = () =>
    open &&
    start(async () => {
      const res = await decide(open.item, open.approve, note, open.key);
      setState(res);
      toastResult(res);
      if (res.ok) {
        setOpen(null);
        router.refresh();
      } else setShake((n) => n + 1);
    });

  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {items.map((a) => (
          <li key={`${a.kind}-${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-surface-muted px-4 py-3.5">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
              <span className="text-xs text-text-subtle">{KIND_LABEL[a.kind]}</span>
              <Link href={a.href} className="truncate font-medium underline-offset-4 hover:underline">
                {a.doc} · {a.title}
              </Link>
              <span className="text-xs text-text-muted">
                {a.detail}
                {a.detail && " · "}
                {a.meta}
              </span>
            </div>
            <div className="flex gap-2">
              {a.kind === "return" ? (
                <Link href={a.href} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface">
                  Buka
                </Link>
              ) : (
                <Button onClick={() => show(a, false)}>Tolak</Button>
              )}
              <Button kind="primary" onClick={() => show(a, true)}>
                {a.kind === "return" ? "Verifikasi fisik" : "Setujui"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Notice state={open ? {} : state} />

      {open && (
        <Dialog
          title={`${open.approve ? (open.item.kind === "return" ? "Verifikasi retur" : "Setujui") : "Tolak"} ${KIND_LABEL[open.item.kind].toLowerCase()}`}
          description={`${open.item.doc} · ${open.item.title}`}
          onClose={() => setOpen(null)}
          shakeKey={shake}
          footer={
            <>
              <Button disabled={pending} onClick={() => setOpen(null)}>
                Batal
              </Button>
              <Button kind={open.approve ? "primary" : "danger"} disabled={pending || (!open.approve && note.trim().length < 5)} onClick={submit}>
                {pending ? "Menyimpan…" : open.approve ? (open.item.kind === "return" ? "Verifikasi fisik" : "Setujui") : "Tolak pengajuan"}
              </Button>
            </>
          }
        >
          <div className="rounded-lg bg-surface-muted px-4 py-3 text-sm">
            <p>{open.item.detail}</p>
            <p className="mt-1 text-xs text-text-muted">{open.item.meta}</p>
          </div>
          <p className={open.approve ? "rounded-lg bg-accent-soft px-4 py-3 text-sm text-text" : "text-sm text-text-muted"}>{open.approve ? IMPACT[open.item.kind].yes : IMPACT[open.item.kind].no}</p>
          {open.item.kind !== "return" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="approval-note" className="text-label font-medium">
                {open.approve ? "Catatan (opsional)" : "Alasan penolakan *"}
              </label>
              <textarea id="approval-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={formCls.textarea} />
            </div>
          )}
          <Notice state={state} />
        </Dialog>
      )}
    </>
  );
}
