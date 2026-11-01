import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { canDo, PERMISSION_LABEL, ROLE_LABEL } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { AppPermission, AppRole } from "@/lib/supabase/types";
import { CreateAccountForm, ManageAccount } from "./account-forms";

export const metadata: Metadata = { title: "Akun & izin · SIM Ngudi Makmur" };

// PRD §3.1 "Pengguna, peran & izin": ketua = lihat, admin_teknis = kelola. RLS membatasi baris yang terbaca.
export default async function AccountsPage() {
  const me = await requireRole(["ketua", "admin_teknis"]);
  const canManage = canDo(me.roles, "akun.kelola");
  const supabase = await createClient();
  const [profiles, roles, perms] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, is_active, created_at").order("is_active", { ascending: false }).order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("user_permissions").select("user_id, permission"),
  ]);
  const rolesOf = (id: string) => (roles.data ?? []).filter((r) => r.user_id === id).map((r) => r.role as AppRole);
  const permsOf = (id: string) => (perms.data ?? []).filter((p) => p.user_id === id).map((p) => p.permission as AppPermission);

  return (
    <>
      <PageHeader
        title="Akun & izin"
        description={canManage ? "Buat akun pengurus, atur peran dan izin, nonaktifkan akun, atau atur ulang kata sandi. Semua perubahan tercatat di log audit." : "Daftar akun pengurus beserta perannya. Perubahan hanya dapat dilakukan admin teknis."}
      />

      {canManage && (
        <Card>
          <h2 className="font-semibold">Akun baru</h2>
          <CreateAccountForm />
        </Card>
      )}

      {profiles.error ? (
        <Card>
          <p className="text-danger">Daftar akun tidak dapat dimuat. Coba muat ulang halaman.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {(profiles.data ?? []).map((p) => {
            const r = rolesOf(p.id);
            const pm = permsOf(p.id);
            const head = (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-[1_1_220px]">
                  <div className="font-medium">
                    {p.full_name}
                    {p.id === me.id && <span className="ml-1.5 text-xs text-text-subtle">(Anda)</span>}
                  </div>
                  <div className="truncate text-xs text-text-muted">{p.email}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!p.is_active && <Badge tone="err">Nonaktif</Badge>}
                  {r.length ? r.map((x) => <Badge key={x} tone="info">{ROLE_LABEL[x]}</Badge>) : <Badge tone="warn">Belum ada peran</Badge>}
                  {pm.map((x) => (
                    <Badge key={x} tone="ok">
                      {PERMISSION_LABEL[x]}
                    </Badge>
                  ))}
                </div>
              </div>
            );
            return canManage ? (
              <details key={p.id} className="group rounded-xl border border-border bg-surface p-4 open:pb-5">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{head}</summary>
                <div className="mt-4">
                  <ManageAccount userId={p.id} roles={r} canConfirm={pm.includes("production.confirm")} isActive={p.is_active} isSelf={p.id === me.id} />
                </div>
              </details>
            ) : (
              <div key={p.id} className="rounded-xl border border-border bg-surface p-4">
                {head}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
