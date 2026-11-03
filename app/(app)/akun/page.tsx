import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/account/components/change-password-form";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Akun saya · SIM Ngudi Makmur" };

// Akun saya: semua peran (termasuk admin teknis) boleh mengganti kata sandinya sendiri. Nama, email, dan peran
// hanya diubah admin teknis di menu Akun & izin.
export default async function MyAccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Akun saya" description="Ganti kata sandi Anda sendiri. Nama, email, dan peran diubah oleh admin teknis." />
      <div className="flex max-w-[720px] flex-col gap-5">
        <Card>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-text-muted">Nama</dt>
            <dd className="font-medium">{user.fullName}</dd>
            <dt className="text-text-muted">Email</dt>
            <dd className="break-all">{user.email}</dd>
            <dt className="text-text-muted">Peran</dt>
            <dd>{user.roles.map((r) => ROLE_LABEL[r]).join(", ") || "Tanpa peran"}</dd>
          </dl>
        </Card>
        <Card>
          <h2 className="font-semibold">Ganti kata sandi</h2>
          <p className="text-sm text-text-muted">Bila Anda baru menerima kata sandi sementara dari admin teknis, segera ganti di sini.</p>
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
