"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { login, type LoginState } from "./actions";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const error = state.error ?? notice;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state.email} aria-invalid={Boolean(state.error)} />
      </Field>
      <Field label="Kata sandi" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(state.error)} />
      </Field>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
          {error}
        </p>
      )}
      <Button type="submit" kind="primary" disabled={pending} className="mt-1">
        {pending ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
