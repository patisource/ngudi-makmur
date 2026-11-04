"use client";

import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import { Button } from "@/components/ui/button";

// Galat tak terduga di halaman bersesi (CLAUDE.md: setiap halaman punya state error). Pesan teknis TIDAK ditampilkan
// (Security.md: jangan bocorkan galat SQL); hanya kode rujukan (digest) yang cocok dengan log server.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <div role="alert" className="flex max-w-lg flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <span className="grid size-11 place-items-center rounded-md bg-danger-soft text-danger">
        <Icon name="shield" size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Halaman gagal dimuat</h1>
        <p className="text-text-muted">
          Terjadi galat saat mengambil data. Data Anda tidak berubah. Coba muat ulang; bila terus terjadi, hubungi admin teknis
          {digest ? " dan sebutkan kode di bawah" : ""}.
        </p>
        {digest && <p className="font-mono text-xs text-text-muted">Kode: {digest}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button kind="primary" onClick={() => retry()}>
          Coba lagi
        </Button>
        <Link href="/dashboard" className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text">
          Ke dashboard
        </Link>
      </div>
    </div>
  );
}
