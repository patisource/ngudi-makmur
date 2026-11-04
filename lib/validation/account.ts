// Ganti kata sandi sendiri (Security.md §3): minimal 8 karakter, maks. 72 (batas bcrypt Supabase Auth).
// Kekuatan & daftar kata sandi bocor dicek ulang oleh Supabase Auth.
import { z } from "zod";

import { PASSWORD_MIN } from "@/lib/auth/password-policy";
export { PASSWORD_MIN };
export const PASSWORD_MAX = 72;

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Isi kata sandi saat ini").max(200),
    next: z
      .string()
      .min(PASSWORD_MIN, `Kata sandi baru minimal ${PASSWORD_MIN} karakter`)
      .refine((s) => new TextEncoder().encode(s).length <= PASSWORD_MAX, `Kata sandi baru maksimal ${PASSWORD_MAX} karakter`)
      .refine((s) => s.trim() === s, "Kata sandi tidak boleh diawali atau diakhiri spasi"),
    confirm: z.string(),
  })
  .strict()
  .refine((d) => d.next === d.confirm, { path: ["confirm"], message: "Konfirmasi tidak sama dengan kata sandi baru" })
  .refine((d) => d.next !== d.current, { path: ["next"], message: "Kata sandi baru harus berbeda dari yang sekarang" });
