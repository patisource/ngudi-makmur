"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MasterTabs } from "@/features/master/components/tabs";

const TITLE: Record<string, string> = {
  "/kas/buku": "Buku kas",
  "/kas/pembayaran": "Pembayaran",
  "/kas/pengeluaran": "Pengeluaran",
  "/kas/pemasukan": "Pemasukan lain",
  "/kas/koreksi": "Koreksi kas",
};

// Subhalaman kas (daftar lengkap): kembali ke ringkasan Pembayaran & kas + tab. Halaman /kas sendiri punya header sendiri.
export function KasSubnav() {
  const pathname = usePathname();
  if (pathname === "/kas") return null;
  return (
    <div className="flex flex-col gap-3">
      <Link href="/kas" className="inline-flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text">
        <ArrowLeft size={15} strokeWidth={1.75} /> Pembayaran &amp; kas
      </Link>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{TITLE[pathname] ?? "Kas"}</h1>
      <MasterTabs
        label="Bagian kas"
        tabs={[
          { href: "/kas/buku", label: "Buku kas" },
          { href: "/kas/pembayaran", label: "Pembayaran" },
          { href: "/kas/pengeluaran", label: "Pengeluaran" },
          { href: "/kas/pemasukan", label: "Pemasukan lain" },
          { href: "/kas/koreksi", label: "Koreksi kas" },
        ]}
      />
    </div>
  );
}
