import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MemberForm } from "@/features/master/components/forms";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Tambah anggota · SIM Ngudi Makmur" };

export default async function NewMemberPage() {
  await requireAction("master.kelola");
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Anggota baru</h2>
        <Link href="/master/anggota" className="text-sm text-text-muted hover:text-text">
          Batal
        </Link>
      </div>
      <p className="text-sm text-text-muted">Kode anggota dibuat otomatis (A-001, A-002, …).</p>
      <MemberForm memberId={null} canSeeContacts />
    </Card>
  );
}
