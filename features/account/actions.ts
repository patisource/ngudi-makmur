"use server";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validation/account";

export type PasswordState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };

// Ganti kata sandi sendiri (Security.md §3) — untuk semua peran. Kata sandi saat ini diverifikasi ulang ke Supabase Auth,
// lalu kata sandi baru disimpan, sesi di perangkat lain dicabut, dan kejadiannya dicatat di audit (tanpa isi sandi).
export async function changeOwnPassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({ current: String(fd.get("current") ?? ""), next: String(fd.get("next") ?? ""), confirm: String(fd.get("confirm") ?? "") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "_")] ??= issue.message;
    return { error: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  const { current, next } = parsed.data;
  const supabase = await createClient();

  const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (check.error || check.data.user?.id !== user.id) {
    if (check.error?.status === 429) return { error: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi." };
    return { error: "Kata sandi saat ini salah.", fieldErrors: { current: "Kata sandi saat ini salah." } };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    if (error.code === "weak_password") return { error: "Kata sandi baru terlalu lemah atau pernah bocor di internet. Pilih kata sandi lain.", fieldErrors: { next: "Pilih kata sandi lain." } };
    if (error.code === "same_password") return { error: "Kata sandi baru harus berbeda dari yang sekarang.", fieldErrors: { next: "Harus berbeda dari yang sekarang." } };
    if (error.code === "reauthentication_needed") return { error: "Demi keamanan, keluar lalu masuk lagi sebelum mengganti kata sandi." };
    return { error: "Kata sandi tidak dapat diganti. Coba lagi; bila berulang, hubungi admin teknis." };
  }

  await supabase.auth.signOut({ scope: "others" }); // perangkat lain wajib masuk ulang dengan sandi baru
  await supabase.rpc("log_auth_event", { p_action: "auth.password_changed" });
  return { ok: true, message: "Kata sandi diganti. Perangkat lain yang masih masuk harus login ulang." };
}
