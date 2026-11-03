"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { login, type LoginState } from "./actions";

// Formulir login (desain 00): email, kata sandi dengan tombol tampilkan, "Lupa kata sandi?", tombol hitam lebar penuh.
// Galat tunggal di atas tombol yang tidak membocorkan apakah email terdaftar (StyleGuide §8.1).
export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const error = state.error ?? notice;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state.email} aria-invalid={Boolean(state.error)} className="h-11 text-base sm:text-sm" />
      </Field>
      <Field label="Kata sandi" htmlFor="password">
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required aria-invalid={Boolean(state.error)} className="h-11 pr-11 text-base sm:text-sm" />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={show}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-text-muted hover:text-text"
          >
            {show ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
          </button>
        </div>
      </Field>
      <div className="-mt-1 flex justify-end">
        <button type="button" onClick={() => setForgot((v) => !v)} aria-expanded={forgot} className="text-sm font-medium underline-offset-4 hover:underline">
          Lupa kata sandi?
        </button>
      </div>
      {forgot && (
        <p role="status" className="rounded-md bg-surface-muted px-3 py-2 text-label text-text-muted">
          Kata sandi diatur ulang oleh admin teknis kelompok. Setelah bisa masuk lagi, ganti kata sandi Anda di menu Akun saya.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
          {error}
        </p>
      )}
      <Button type="submit" kind="primary" disabled={pending} className="mt-1 h-11 rounded-lg">
        {pending ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
