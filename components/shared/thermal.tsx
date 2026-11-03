"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { logPrint } from "@/features/orders/print-actions";
import type { ThermalLine } from "@/lib/thermal";

// Pratinjau & cetak via driver (StyleGuide §8.4 jalur A): baris yang sama persis dengan susunan notaLines,
// Courier 7,2 pt selebar 72 mm, hitam di putih, tanpa animasi. Tombol disembunyikan saat dicetak.
export function ThermalPaper({ lines, narrow }: { lines: ThermalLine[]; narrow?: boolean }) {
  return (
    <div className={narrow ? "thermal-paper thermal-58" : "thermal-paper"}>
      {lines.map((l, i) => (
        <div key={i} className={l.big ? "thermal-big" : undefined} style={{ textAlign: l.align ?? "left", fontWeight: l.bold ? 700 : 400 }}>
          {l.text || " "}
        </div>
      ))}
    </div>
  );
}

/**
 * Cetak nota/kuitansi yang tercatat (FR-RPT-03): catat print_logs dulu, lalu dialog cetak browser (driver thermal).
 * Bila printer gagal, cukup cetak ulang — pembayaran/kas tidak terpengaruh (FR-RPT-03b).
 */
export function LoggedPrintControls({ backHref, docType, docId, canPrint }: { backHref: string; docType: "order" | "payment"; docId: string; canPrint: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-2 print:hidden">
      <div className="flex gap-2">
        {canPrint && (
          <Button
            kind="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await logPrint(docType, docId);
                if (res.error) return setError(res.error);
                setError(null);
                window.print();
                router.refresh(); // tanda "CETAK ULANG ke-n" untuk cetakan berikutnya
              })
            }
          >
            {pending ? "Menyiapkan…" : "Cetak"}
          </Button>
        )}
        <Link href={backHref} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
          Kembali
        </Link>
      </div>
      {!canPrint && <p className="text-xs text-text-muted">Pratinjau saja; nota dicetak oleh admin kelompok.</p>}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function PrintControls({ backHref }: { backHref: string }) {
  return (
    <div className="flex gap-2 print:hidden">
      <Button kind="primary" onClick={() => window.print()}>
        Cetak
      </Button>
      <Link href={backHref} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
        Kembali
      </Link>
    </div>
  );
}
