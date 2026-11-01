"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAction } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/permissions";
import { mapDbError } from "@/lib/errors";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";

export type AccountState = { ok?: boolean; error?: string; message?: string; tempPassword?: string; forEmail?: string };

const roleSchema = z.enum(ROLES as [AppRole, ...AppRole[]]);
const PATH = "/pengaturan/akun";

// Kata sandi sementara: 14 karakter dari alfabet tanpa huruf/angka yang mirip (0/O, 1/l/I) — mudah didiktekan.
function tempPassword(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => abc[randomInt(abc.length)]).join("");
}

const roles = (fd: FormData) => fd.getAll("roles").map(String);

// ---------- buat akun (FR-AUTH-04) ----------
const createSchema = z
  .object({
    fullName: z.string().trim().min(1, "Nama wajib diisi").max(120),
    email: z.email("Email tidak valid").max(254),
    roles: z.array(roleSchema).min(1, "Pilih minimal satu peran"),
  })
  .strict();

export async function createAccount(_prev: AccountState, fd: FormData): Promise<AccountState> {
  await requireAction("akun.kelola");
  const parsed = createSchema.safeParse({ fullName: fd.get("fullName"), email: String(fd.get("email") ?? "").trim().toLowerCase(), roles: roles(fd) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  const { fullName, email, roles: r } = parsed.data;

  const admin = createAdminClient();
  const password = tempPassword();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (created.error || !created.data.user) {
    const dup = created.error?.code === "email_exists" || /already/i.test(created.error?.message ?? "");
    return { error: dup ? "Email ini sudah terdaftar." : "Akun tidak dapat dibuat. Coba lagi." };
  }

  // Nama, peran awal, dan catatan audit lewat fungsi database (sebagai admin teknis yang sedang login).
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_register_user", { p_user: created.data.user.id, p_full_name: fullName, p_roles: r });
  if (error) {
    await admin.auth.admin.deleteUser(created.data.user.id); // batalkan akun setengah jadi
    return { error: mapDbError(error).message };
  }
  revalidatePath(PATH);
  return { ok: true, message: `Akun ${fullName} dibuat.`, tempPassword: password, forEmail: email };
}

// ---------- ubah peran ----------
const rolesSchema = z.object({ userId: z.uuid(), roles: z.array(roleSchema).min(1, "Pilih minimal satu peran"), reason: z.string().trim().max(300).optional() }).strict();

export async function updateRoles(_prev: AccountState, fd: FormData): Promise<AccountState> {
  await requireAction("akun.kelola");
  const parsed = rolesSchema.safeParse({ userId: fd.get("userId"), roles: roles(fd), reason: fd.get("reason") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_roles", { p_user: parsed.data.userId, p_roles: parsed.data.roles, p_reason: parsed.data.reason });
  if (error) return { error: mapDbError(error).message };
  revalidatePath(PATH);
  return { ok: true, message: "Peran disimpan." };
}

// ---------- izin konfirmasi batch ----------
const permSchema = z.object({ userId: z.uuid(), granted: z.enum(["true", "false"]) }).strict();

export async function setConfirmPermission(_prev: AccountState, fd: FormData): Promise<AccountState> {
  await requireAction("akun.kelola");
  const parsed = permSchema.safeParse({ userId: fd.get("userId"), granted: fd.get("granted") });
  if (!parsed.success) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_permission", { p_user: parsed.data.userId, p_permission: "production.confirm", p_granted: parsed.data.granted === "true" });
  if (error) return { error: mapDbError(error).message };
  revalidatePath(PATH);
  return { ok: true, message: parsed.data.granted === "true" ? "Izin konfirmasi batch diberikan." : "Izin konfirmasi batch dicabut." };
}

// ---------- aktif / nonaktif (FR-AUTH-05) ----------
const activeSchema = z.object({ userId: z.uuid(), active: z.enum(["true", "false"]), reason: z.string().trim().max(300) }).strict();

export async function setActive(_prev: AccountState, fd: FormData): Promise<AccountState> {
  await requireAction("akun.kelola");
  const parsed = activeSchema.safeParse({ userId: fd.get("userId"), active: fd.get("active"), reason: String(fd.get("reason") ?? "") });
  if (!parsed.success) return { error: "Data tidak valid" };
  const active = parsed.data.active === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_active", { p_user: parsed.data.userId, p_active: active, p_reason: parsed.data.reason });
  if (error) return { error: mapDbError(error).message };

  // Cabut/pulihkan kemampuan masuk di Supabase Auth: ban membuat login & penyegaran token ditolak,
  // sehingga sesi aktif berakhir paling lambat saat token akses kedaluwarsa (≤ 1 jam); has_role() sudah false seketika.
  const { error: banError } = await createAdminClient().auth.admin.updateUserById(parsed.data.userId, { ban_duration: active ? "none" : "876000h" });
  revalidatePath(PATH);
  if (banError) return { error: "Status akun disimpan, tetapi pencabutan sesi gagal. Coba simpan ulang." };
  return { ok: true, message: active ? "Akun diaktifkan kembali." : "Akun dinonaktifkan dan sesinya dicabut." };
}

// ---------- atur ulang kata sandi (FR-AUTH-06 / PRD Q13: pengurus tanpa email) ----------
const resetSchema = z.object({ userId: z.uuid() }).strict();

export async function resetPassword(_prev: AccountState, fd: FormData): Promise<AccountState> {
  await requireAction("akun.kelola");
  const parsed = resetSchema.safeParse({ userId: fd.get("userId") });
  if (!parsed.success) return { error: "Data tidak valid" };
  const password = tempPassword();
  const { data, error } = await createAdminClient().auth.admin.updateUserById(parsed.data.userId, { password });
  if (error) return { error: "Kata sandi tidak dapat diatur ulang. Coba lagi." };
  const supabase = await createClient();
  await supabase.rpc("admin_note_password_reset", { p_user: parsed.data.userId });
  return { ok: true, message: "Kata sandi sementara dibuat.", tempPassword: password, forEmail: data.user.email ?? undefined };
}
