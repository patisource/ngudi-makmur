"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

const schema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1).max(200),
    next: z.string().max(500).optional(),
  })
  .strict();

// Hanya path internal ("/…"), bukan "//domain" atau URL penuh — mencegah open redirect.
const safeNext = (v: string | undefined) => (v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard");

const GENERIC = "Email atau kata sandi salah."; // Security.md §3: pesan generik, tidak membedakan email/kata sandi

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    next: formData.get("next") ? String(formData.get("next")) : undefined,
  });
  if (!parsed.success) return { error: GENERIC, email: String(formData.get("email") ?? "") };

  const { email, password, next } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const tooMany = error?.status === 429;
    return { error: tooMany ? "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi." : GENERIC, email };
  }

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: "Akun ini dinonaktifkan. Hubungi admin teknis.", email };
  }

  await supabase.rpc("log_auth_event", { p_action: "auth.login" });
  redirect(safeNext(next));
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("log_auth_event", { p_action: "auth.logout" });
  await supabase.auth.signOut();
  redirect("/login");
}
