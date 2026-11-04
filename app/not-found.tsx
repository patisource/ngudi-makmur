import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/shell/icon";

export const metadata: Metadata = { title: "Tidak ditemukan · SIM Ngudi Makmur" };

// 404: alamat salah atau dokumen tidak ada / tidak boleh dilihat peran ini (RLS mengembalikan kosong).
export default function NotFound() {
  return (
    <main className="enter mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <span className="grid size-11 place-items-center rounded-md bg-surface-muted text-text-muted">
        <Icon name="file" size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-label font-medium text-text-muted">404 · Tidak ditemukan</p>
        <h1 className="text-2xl font-semibold tracking-tight">Halaman atau dokumen tidak ditemukan</h1>
        <p className="text-text-muted">Alamatnya mungkin salah, atau dokumen ini tidak tersedia untuk peran Anda.</p>
      </div>
      <Link href="/dashboard" className="w-fit text-sm font-medium underline underline-offset-4">
        Kembali ke halaman awal
      </Link>
    </main>
  );
}
