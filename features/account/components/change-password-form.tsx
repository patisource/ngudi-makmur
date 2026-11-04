"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { changeOwnPassword, type PasswordState } from "@/features/account/actions";
import { PASSWORD_MIN } from "@/lib/auth/password-policy";

const inputCls = "h-11 text-base sm:h-10 sm:text-sm";

// Form ganti kata sandi sendiri. Satu kolom (StyleGuide §5.2 form ≤ 720 px), terbaca di ponsel.
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changeOwnPassword, {});
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok) formRef.current?.reset(); // jangan biarkan sandi tertinggal di layar
  }, [state]);

  const type = show ? "text" : "password";
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <Field label="Kata sandi saat ini *" htmlFor="current" error={fe.current}>
        <Input id="current" name="current" type={type} autoComplete="current-password" required maxLength={200} className={inputCls} aria-invalid={Boolean(fe.current)} />
      </Field>
      <Field label="Kata sandi baru *" htmlFor="next" error={fe.next} hint={`Minimal ${PASSWORD_MIN} karakter. Hindari tanggal lahir atau nama kelompok.`}>
        <Input id="next" name="next" type={type} autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={72} className={inputCls} aria-invalid={Boolean(fe.next)} />
      </Field>
      <Field label="Ulangi kata sandi baru *" htmlFor="confirm" error={fe.confirm}>
        <Input id="confirm" name="confirm" type={type} autoComplete="new-password" required maxLength={72} className={inputCls} aria-invalid={Boolean(fe.confirm)} />
      </Field>
      <Button kind="ghost" size="sm" className="w-fit" onClick={() => setShow(!show)} aria-pressed={show}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
      </Button>
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          {state.message}
        </p>
      )}
      <Button type="submit" kind="primary" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Mengganti…" : "Ganti kata sandi"}
      </Button>
    </form>
  );
}
