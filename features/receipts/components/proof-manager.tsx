"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeProof } from "@/features/receipts/actions";
import { PROOF_ACCEPT, uploadReceiptProof } from "@/features/receipts/proof-client";

export type Proof = { id: string; url: string | null; mime_type: string; size_bytes: number };

const sizeLabel = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Bukti penerimaan: pratinjau lewat signed URL 5 menit. Tambah/hapus hanya selama draft (dijaga juga di database).
export function ProofManager({ receiptId, proofs, canEdit }: { receiptId: string; proofs: Proof[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {proofs.length ? (
        <ul className="grid grid-cols-3 gap-3">
          {proofs.map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5">
              <a
                href={p.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-md border border-border bg-surface-muted hover:border-border-strong"
              >
                {p.mime_type.startsWith("image/") && p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL privat berumur pendek, tidak lewat optimizer
                  <img src={p.url} alt="Bukti penerimaan" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-sm font-medium text-text-muted">PDF</span>
                )}
              </a>
              <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-text-subtle">
                <span className="whitespace-nowrap">{sizeLabel(p.size_bytes)}</span>
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-sm px-1.5 py-0.5 text-danger hover:bg-danger-soft disabled:opacity-50"
                    onClick={() =>
                      start(async () => {
                        const r = await removeProof(p.id);
                        setError(r.error ?? null);
                        router.refresh();
                      })
                    }
                  >
                    Hapus
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">Belum ada bukti.{canEdit ? " Tambahkan foto timbangan atau nota pembelian bila ada." : ""}</p>
      )}

      {canEdit && proofs.length < 5 && (
        <label className="inline-flex h-8 w-fit cursor-pointer items-center rounded-md border border-border bg-surface px-3 text-label font-medium hover:bg-surface-muted has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-info">
          <input
            type="file"
            accept={PROOF_ACCEPT}
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              start(async () => {
                setError(await uploadReceiptProof(receiptId, file));
                router.refresh();
              });
            }}
          />
          {pending ? "Memproses…" : "Tambah bukti"}
        </label>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
