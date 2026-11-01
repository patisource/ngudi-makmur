import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/card";
import { hasAnyRole, navItemFor } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";

// Penampung modul yang belum dibangun. Tetap dijaga peran: operator_produksi yang membuka /kas mendapat 403
// (uji wajib SRS §11, sisi halaman). Rute nyata (mis. app/(app)/kas/page.tsx) otomatis menggantikan penampung ini.
export default async function ModulePlaceholder({ params }: PageProps<"/[...modul]">) {
  const { modul } = await params;
  const path = "/" + modul.join("/");
  const item = navItemFor(path);
  if (!item) notFound();

  const user = await requireUser();
  if (!hasAnyRole(user.roles, item.roles)) redirect("/403");

  return (
    <>
      <PageHeader title={item.label} />
      <Card>
        <p className="text-text-muted">
          Modul ini dibangun di <strong className="font-medium text-text">Task {item.milestone}</strong> (lihat docs/Task.md). Hak akses halamannya sudah aktif sesuai matriks PRD §3.1.
        </p>
      </Card>
    </>
  );
}
