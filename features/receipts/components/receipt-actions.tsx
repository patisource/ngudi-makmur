"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog, ImpactNote } from "@/components/shared/confirm-dialog";
import { formCls } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { confirmReceipt, deleteReceiptDraft, voidReceipt } from "@/features/receipts/actions";

type Kind = "confirm" | "void" | "delete";

// Aksi dokumen jagung masuk lewat dialog dampak (StyleGuide §9); idempotensi & toast diurus ConfirmDialog.
export function ReceiptActions({ id, status, impact }: { id: string; status: "draft" | "confirmed" | "void"; impact: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Kind | null>(null);
  const [reason, setReason] = useState("");
  const close = () => setOpen(null);

  if (status === "void") return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <>
            <Button kind="ghost" onClick={() => setOpen("delete")}>
              Hapus draft
            </Button>
            <Button kind="primary" onClick={() => setOpen("confirm")}>
              Konfirmasi
            </Button>
          </>
        ) : (
          <Button kind="ghost" onClick={() => setOpen("void")}>
            Batalkan penerimaan
          </Button>
        )}
      </div>

      {open === "confirm" && (
        <ConfirmDialog title="Konfirmasi jagung masuk" description="Nomor RCV terbit dan dokumen dikunci." confirmLabel="Konfirmasi penerimaan" onClose={close} onConfirm={(key) => confirmReceipt(id, key)}>
          <ImpactNote>{impact}. Perubahan berikutnya hanya lewat pembatalan.</ImpactNote>
        </ConfirmDialog>
      )}

      {open === "delete" && (
        <ConfirmDialog
          title="Hapus draft penerimaan"
          confirmLabel="Hapus draft"
          danger
          onClose={close}
          onConfirm={() => deleteReceiptDraft(id)}
          onDone={() => router.push("/jagung-masuk?simpan=hapus")}
        >
          <p className="text-sm text-text-muted">Draft beserta buktinya dihapus. Draft belum mengubah stok.</p>
        </ConfirmDialog>
      )}

      {open === "void" && (
        <ConfirmDialog
          title="Batalkan penerimaan"
          confirmLabel="Batalkan penerimaan"
          danger
          disabled={reason.trim().length < 5}
          onClose={close}
          onConfirm={(key) => voidReceipt(id, reason, key)}
        >
          <p className="text-sm text-text-muted">
            Stok dikurangi kembali sebesar penerimaan ini. Ditolak bila stok tersedia sudah tidak cukup (mis. sudah dipakai produksi). Nomor dokumen tidak dipakai ulang.
          </p>
          <Field label="Alasan pembatalan *" htmlFor="void-reason">
            <textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} placeholder="mis. Salah timbang, dicatat ulang" className={formCls.textarea} />
          </Field>
        </ConfirmDialog>
      )}
    </>
  );
}
