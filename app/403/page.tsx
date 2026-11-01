import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/shell/icon";

export const metadata: Metadata = { title: "Akses ditolak · SIM Ngudi Makmur" };

// Halaman 403 (PRD FR-AUTH-03): tampil saat peran tidak mengizinkan halaman/aksi. Tidak membocorkan detail.
export default function Forbidden() {
  return (
    <main className="enter mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <span className="grid size-11 place-items-center rounded-md bg-warning-soft text-warning">
        <Icon name="lock" size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-label font-medium text-text-muted">403 · Akses ditolak</p>
        <h1 className="text-2xl font-semibold tracking-tight">Halaman ini tidak tersedia untuk peran Anda</h1>
        <p className="text-text-muted">Bila Anda memerlukan akses, hubungi admin teknis kelompok untuk meninjau peran akun Anda.</p>
      </div>
      <Link href="/dashboard" className="w-fit text-sm font-medium underline underline-offset-4">
        Kembali ke halaman awal
      </Link>
    </main>
  );
}
