import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CustomerForm } from "@/features/master/components/forms";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Tambah pelanggan · Sistem Pengelolaan Jagung Desa Baturejo" };

export default async function NewCustomerPage() {
  await requireAction("master.kelola");
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Pelanggan baru</h2>
        <Link href="/master/pelanggan" className="text-sm text-text-muted hover:text-text">
          Batal
        </Link>
      </div>
      <p className="text-sm text-text-muted">Pelanggan tidak memerlukan akun. Kode dibuat otomatis (PLG-001, …).</p>
      <CustomerForm customerId={null} />
    </Card>
  );
}
