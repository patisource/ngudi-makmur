import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { canOpen, homeFor, navFor, PERMISSION_LABEL, ROLE_LABEL } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard · SIM Ngudi Makmur" };

// Dashboard sementara (isi KPI dibangun di M8). Peran tanpa dashboard (admin_teknis) diarahkan ke menu pertamanya.
export default async function DashboardPage() {
  const user = await requireUser();
  if (!canOpen(user.roles, "/dashboard")) redirect(homeFor(user.roles));
  const modules = navFor(user.roles).filter((n) => n.href !== "/dashboard");

  return (
    <>
      <PageHeader title={`Halo, ${user.fullName}`} description="Ringkasan usaha (KPI, grafik produksi, stok) dibangun di Task M8. Berikut menu yang tersedia untuk peran Anda." />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label text-text-muted">Peran:</span>
          {user.roles.map((r) => (
            <Badge key={r} tone="info">
              {ROLE_LABEL[r]}
            </Badge>
          ))}
          {user.permissions.map((p) => (
            <Badge key={p} tone="ok">
              {PERMISSION_LABEL[p]}
            </Badge>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {modules.map((m) => (
          <Link key={m.href} href={m.href} className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong">
            <span className="font-medium">{m.label}</span>
            <span className="text-xs text-text-muted">{m.milestone ? `Dibangun di Task ${m.milestone}` : "Tersedia"}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
