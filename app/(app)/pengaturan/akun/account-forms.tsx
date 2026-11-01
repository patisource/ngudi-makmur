"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ROLE_LABEL, ROLES } from "@/lib/auth/permissions";
import type { AppRole } from "@/lib/supabase/types";
import { createAccount, resetPassword, setActive, setConfirmPermission, updateRoles, type AccountState } from "./actions";

function Status({ state }: { state: AccountState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
        {state.error}
      </p>
    );
  if (!state.ok) return null;
  return (
    <div role="status" className="flex flex-col gap-1 rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
      <span>{state.message}</span>
      {state.tempPassword && (
        <span className="text-text">
          Kata sandi sementara untuk <strong className="font-medium">{state.forEmail}</strong>:{" "}
          <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-sm select-all">{state.tempPassword}</code>
          <span className="block text-xs text-text-muted">Hanya ditampilkan sekali. Serahkan langsung ke pemilik akun.</span>
        </span>
      )}
    </div>
  );
}

function RoleChecks({ name, selected }: { name: string; selected?: AppRole[] }) {
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
      <legend className="sr-only">Peran</legend>
      {ROLES.map((r) => (
        <label key={r} className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} value={r} defaultChecked={selected?.includes(r)} className="size-4 accent-[var(--accent)]" />
          {ROLE_LABEL[r]}
        </label>
      ))}
    </fieldset>
  );
}

export function CreateAccountForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(createAccount, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama" htmlFor="fullName">
          <Input id="fullName" name="fullName" required maxLength={120} placeholder="Mis. Hafidz" />
        </Field>
        <Field label="Email" htmlFor="email" hint="Dipakai untuk masuk; tidak harus email aktif.">
          <Input id="email" name="email" type="email" required placeholder="nama@contoh.com" />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-medium">Peran</span>
        <RoleChecks name="roles" />
        <span className="text-xs text-text-subtle">Operator produksi otomatis mendapat izin konfirmasi batch; bisa dicabut setelahnya.</span>
      </div>
      <Status state={state} />
      <div>
        <Button type="submit" kind="primary" disabled={pending}>
          {pending ? "Membuat…" : "Buat akun"}
        </Button>
      </div>
    </form>
  );
}

export function ManageAccount({ userId, roles, canConfirm, isActive, isSelf }: { userId: string; roles: AppRole[]; canConfirm: boolean; isActive: boolean; isSelf: boolean }) {
  const [rolesState, rolesAction, rolesPending] = useActionState<AccountState, FormData>(updateRoles, {});
  const [permState, permAction, permPending] = useActionState<AccountState, FormData>(setConfirmPermission, {});
  const [activeState, activeAction, activePending] = useActionState<AccountState, FormData>(setActive, {});
  const [pwState, pwAction, pwPending] = useActionState<AccountState, FormData>(resetPassword, {});
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-col gap-5 border-t border-border pt-4">
      <form action={rolesAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="userId" value={userId} />
        <span className="text-label font-medium">Peran</span>
        <RoleChecks name="roles" selected={roles} />
        <Status state={rolesState} />
        <div>
          <Button type="submit" size="sm" disabled={rolesPending}>
            Simpan peran
          </Button>
        </div>
      </form>

      {roles.includes("operator_produksi") && (
        <form action={permAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="granted" value={String(!canConfirm)} />
          <span className="text-sm">
            Izin konfirmasi batch: <strong className="font-medium">{canConfirm ? "diberikan" : "tidak ada"}</strong>
          </span>
          <Button type="submit" size="sm" kind="ghost" disabled={permPending}>
            {canConfirm ? "Cabut izin" : "Beri izin"}
          </Button>
          <div className="basis-full">
            <Status state={permState} />
          </div>
        </form>
      )}

      {!isSelf && (
        <form action={activeAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="active" value={String(!isActive)} />
          {isActive && (
            <Field label="Alasan menonaktifkan" htmlFor={`reason-${userId}`} hint="Wajib; tercatat di log audit.">
              <Input id={`reason-${userId}`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. tidak lagi menjadi pengurus" />
            </Field>
          )}
          {!isActive && <input type="hidden" name="reason" value="Diaktifkan kembali" />}
          <Status state={activeState} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" kind={isActive ? "danger" : "secondary"} disabled={activePending || (isActive && !reason.trim())}>
              {isActive ? "Nonaktifkan akun" : "Aktifkan kembali"}
            </Button>
          </div>
        </form>
      )}

      <form action={pwAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="userId" value={userId} />
        <Status state={pwState} />
        <div>
          <Button type="submit" size="sm" kind="ghost" disabled={pwPending}>
            Atur ulang kata sandi
          </Button>
        </div>
      </form>
    </div>
  );
}
