import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canDo, hasAnyRole, type ActionKey } from "@/lib/auth/permissions";
import type { AppPermission, AppRole } from "@/lib/supabase/types";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: AppRole[];
  permissions: AppPermission[];
};

// Satu kali per permintaan (React cache). Sumber kebenaran peran = tabel user_roles (dibaca lewat RLS: hanya baris sendiri).
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [profile, roles, permissions] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_active").eq("id", auth.user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
    supabase.from("user_permissions").select("permission").eq("user_id", auth.user.id),
  ]);
  if (!profile.data) return null;

  return {
    id: auth.user.id,
    email: profile.data.email,
    fullName: profile.data.full_name,
    isActive: profile.data.is_active,
    roles: (roles.data ?? []).map((r) => r.role),
    permissions: (permissions.data ?? []).map((p) => p.permission),
  };
});

/** Halaman/aksi yang butuh sesi aktif. Tanpa sesi → /login; akun nonaktif → /login dengan pesan. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/keluar?alasan=nonaktif"); // akhiri sesinya dulu agar tidak berputar /login ↔ /dashboard
  return user;
}

/** Lempar ke halaman 403 bila pengguna tidak punya salah satu peran (Security.md §4.1). */
export async function requireRole(allowed: readonly AppRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasAnyRole(user.roles, allowed)) redirect("/403");
  return user;
}

export async function requirePermission(permission: AppPermission): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) redirect("/403");
  return user;
}

export async function requireAction(action: ActionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!canDo(user.roles, action)) redirect("/403");
  return user;
}
