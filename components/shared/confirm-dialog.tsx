"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastResult } from "@/components/ui/toast";
import type { FormState } from "@/features/master/actions";

// Dialog aksi dokumen (StyleGuide §9: aksi irreversibel selalu lewat dialog yang menjelaskan dampaknya, tombol menyebut
// aksinya). Kunci idempotensi dibuat sekali saat dialog dibuka dan dipakai ulang untuk percobaan ulang (Security.md §6).
// Hasil: toast; galat domain → dialog bergetar + pesan di dalam dialog. Default setelah berhasil: router.refresh().
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  disabled,
  onClose,
  onConfirm,
  onDone,
  children,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  onClose: () => void;
  onConfirm: (idempotencyKey: string) => Promise<FormState>;
  onDone?: (res: FormState) => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<FormState>({});
  const [shake, setShake] = useState(0);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const res = await onConfirm(key);
      setState(res);
      toastResult(res);
      if (res.ok) {
        onClose();
        if (onDone) onDone(res);
        else router.refresh();
      } else setShake((n) => n + 1);
    });

  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      shakeKey={shake}
      footer={
        <>
          <Button disabled={pending} onClick={onClose}>
            Batal
          </Button>
          <Button kind={danger ? "danger" : "primary"} disabled={pending || disabled} onClick={confirm}>
            {pending ? "Menyimpan…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      <Notice state={state} />
    </Dialog>
  );
}

/** Kotak "Setelah …" yang menjelaskan dampak aksi (desain 02/03). */
export function ImpactNote({ label = "Setelah dikonfirmasi", children }: { label?: string; children: ReactNode }) {
  return (
    <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm">
      <span className="block text-xs text-accent">{label}</span>
      {children}
    </p>
  );
}
