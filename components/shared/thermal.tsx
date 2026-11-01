"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ThermalLine } from "@/lib/thermal";

// Pratinjau & cetak via driver (StyleGuide §8.4 jalur A): baris yang sama persis dengan susunan notaLines,
// Courier 7,2 pt selebar 72 mm, hitam di putih, tanpa animasi. Tombol disembunyikan saat dicetak.
export function ThermalPaper({ lines }: { lines: ThermalLine[] }) {
  return (
    <div className="thermal-paper">
      {lines.map((l, i) => (
        <div key={i} className={l.big ? "thermal-big" : undefined} style={{ textAlign: l.align ?? "left", fontWeight: l.bold ? 700 : 400 }}>
          {l.text || " "}
        </div>
      ))}
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
