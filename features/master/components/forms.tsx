"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  addConversion,
  createChannel,
  createPackaging,
  saveCustomer,
  saveMember,
  setArchived,
  setChannelDigital,
  updateConversionPrice,
  updateProduct,
  type FormState,
} from "../actions";

function Status({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
        {state.message}
      </p>
    );
  return null;
}

const selectCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft";

// ---------------------------------------------------------------- anggota
export type MemberDefaults = { name?: string; hamlet?: string | null; address?: string | null; landAreaHa?: number | null; joinedOn?: string | null; nik?: string | null; phone?: string | null };

export function MemberForm({ memberId, defaults, canSeeContacts }: { memberId: string | null; defaults?: MemberDefaults; canSeeContacts: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMember.bind(null, memberId), {});
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama" htmlFor="name" error={fe.name}>
          <Input id="name" name="name" required maxLength={120} defaultValue={d.name} aria-invalid={Boolean(fe.name)} />
        </Field>
        <Field label="Dusun" htmlFor="hamlet" error={fe.hamlet}>
          <Input id="hamlet" name="hamlet" maxLength={120} defaultValue={d.hamlet ?? ""} />
        </Field>
        <Field label="No. HP" htmlFor="phone" error={fe.phone} hint="Opsional, mis. 081234567890. Hanya terlihat admin & ketua.">
          <Input id="phone" name="phone" inputMode="tel" defaultValue={canSeeContacts ? (d.phone ?? "") : ""} aria-invalid={Boolean(fe.phone)} />
        </Field>
        <Field label="NIK" htmlFor="nik" error={fe.nik} hint="Opsional, 16 digit. Hanya terlihat admin & ketua.">
          <Input id="nik" name="nik" inputMode="numeric" maxLength={16} defaultValue={canSeeContacts ? (d.nik ?? "") : ""} aria-invalid={Boolean(fe.nik)} />
        </Field>
        <Field label="Luas lahan (ha)" htmlFor="landAreaHa" error={fe.landAreaHa}>
          <Input id="landAreaHa" name="landAreaHa" inputMode="decimal" defaultValue={d.landAreaHa ?? ""} placeholder="mis. 0,5" />
        </Field>
        <Field label="Tanggal bergabung" htmlFor="joinedOn" error={fe.joinedOn}>
          <Input id="joinedOn" name="joinedOn" type="date" defaultValue={d.joinedOn ?? ""} />
        </Field>
      </div>
      <Field label="Alamat" htmlFor="address" error={fe.address}>
        <Input id="address" name="address" maxLength={300} defaultValue={d.address ?? ""} />
      </Field>
      <Status state={state} />
      <div>
        <Button type="submit" kind="primary" disabled={pending}>
          {pending ? "Menyimpan…" : memberId ? "Simpan perubahan" : "Tambah anggota"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- pelanggan
export type CustomerDefaults = { name?: string; type?: "perorangan" | "usaha"; phone?: string | null; address?: string | null; note?: string | null; creditLimitRp?: number | null };

export function CustomerForm({ customerId, defaults }: { customerId: string | null; defaults?: CustomerDefaults }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCustomer.bind(null, customerId), {});
  const fe = state.fieldErrors ?? {};
  const d = defaults ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama" htmlFor="name" error={fe.name}>
          <Input id="name" name="name" required maxLength={120} defaultValue={d.name} aria-invalid={Boolean(fe.name)} placeholder="mis. IRT Sekar Arum" />
        </Field>
        <Field label="Jenis" htmlFor="type" error={fe.type}>
          <select id="type" name="type" defaultValue={d.type ?? "perorangan"} className={selectCls}>
            <option value="perorangan">Perorangan</option>
            <option value="usaha">Usaha</option>
          </select>
        </Field>
        <Field label="No. HP" htmlFor="phone" error={fe.phone} hint="Opsional.">
          <Input id="phone" name="phone" inputMode="tel" defaultValue={d.phone ?? ""} aria-invalid={Boolean(fe.phone)} />
        </Field>
        <Field label="Alamat" htmlFor="address" error={fe.address}>
          <Input id="address" name="address" maxLength={300} defaultValue={d.address ?? ""} />
        </Field>
      </div>
      <Field label="Batas piutang (Rp)" htmlFor="creditLimitRp" error={fe.creditLimitRp} hint="Opsional. Form pesanan memberi peringatan bila sisa tagihan pelanggan melebihi batas ini.">
        <Input id="creditLimitRp" name="creditLimitRp" inputMode="numeric" defaultValue={d.creditLimitRp != null ? String(d.creditLimitRp) : ""} placeholder="Kosongkan bila tanpa batas" />
      </Field>
      <Field label="Catatan" htmlFor="note" error={fe.note}>
        <Input id="note" name="note" maxLength={1000} defaultValue={d.note ?? ""} />
      </Field>
      <Status state={state} />
      <div>
        <Button type="submit" kind="primary" disabled={pending}>
          {pending ? "Menyimpan…" : customerId ? "Simpan perubahan" : "Tambah pelanggan"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- produk & konversi
export function ProductForm({ productId, defaults }: { productId: string; defaults: { name: string; defaultPricePerKg: number | null; minStockKg: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProduct.bind(null, productId), {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nama tampilan" htmlFor="name" error={fe.name} hint="Nama sementara; merek belum final.">
          <Input id="name" name="name" required maxLength={120} defaultValue={defaults.name} />
        </Field>
        <Field label="Harga jual default per kg (Rp)" htmlFor="defaultPricePerKg" error={fe.defaultPricePerKg} hint="Kosongkan bila belum ditetapkan.">
          <Input id="defaultPricePerKg" name="defaultPricePerKg" inputMode="numeric" defaultValue={defaults.defaultPricePerKg ?? ""} placeholder="mis. 10000" />
        </Field>
        <Field label="Stok minimum (kg)" htmlFor="minStockKg" error={fe.minStockKg}>
          <Input id="minStockKg" name="minStockKg" inputMode="decimal" defaultValue={defaults.minStockKg} />
        </Field>
      </div>
      <Status state={state} />
      <div>
        <Button type="submit" kind="primary" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan produk"}
        </Button>
      </div>
    </form>
  );
}

export function ConversionForm({ productId, packagings }: { productId: string; packagings: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addConversion.bind(null, productId), {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Jenis kemasan" htmlFor="packagingId" error={fe.packagingId}>
          <select id="packagingId" name="packagingId" className={selectCls} defaultValue="">
            <option value="" disabled>
              Pilih kemasan
            </option>
            {packagings.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Isi (kg)" htmlFor="contentKg" error={fe.contentKg}>
          <Input id="contentKg" name="contentKg" inputMode="decimal" placeholder="mis. 0,5" aria-invalid={Boolean(fe.contentKg)} />
        </Field>
        <Field label="Harga per kemasan (Rp)" htmlFor="defaultPrice" error={fe.defaultPrice}>
          <Input id="defaultPrice" name="defaultPrice" inputMode="numeric" placeholder="opsional" />
        </Field>
        <Button type="submit" disabled={pending}>
          Tambah
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function ConversionPriceForm({ conversionId, price }: { conversionId: string; price: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateConversionPrice.bind(null, conversionId), {});
  return (
    <form action={action} className="flex items-center justify-end gap-1.5">
      <Input name="defaultPrice" inputMode="numeric" defaultValue={price ?? ""} aria-label="Harga per kemasan" placeholder="belum ada" className="h-8 w-28 text-right" />
      <Button type="submit" size="sm" kind="ghost" disabled={pending}>
        Simpan
      </Button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

// ---------------------------------------------------------------- jenis kemasan & saluran
export function PackagingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createPackaging, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input name="name" maxLength={60} placeholder="Nama kemasan baru, mis. Dus" aria-label="Nama kemasan baru" aria-invalid={Boolean(state.fieldErrors?.name)} />
        <Button type="submit" disabled={pending}>
          Tambah
        </Button>
      </div>
      {state.fieldErrors?.name ? <p className="text-xs text-danger">{state.fieldErrors.name}</p> : <Status state={state} />}
    </form>
  );
}

export function ChannelForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createChannel, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
        <Input name="code" placeholder="Kode, mis. toko_online" aria-label="Kode saluran" aria-invalid={Boolean(fe.code)} />
        <Input name="name" placeholder="Nama, mis. Toko online" aria-label="Nama saluran" aria-invalid={Boolean(fe.name)} />
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDigital" className="size-4 accent-[var(--accent)]" /> Digital
        </label>
        <Button type="submit" disabled={pending}>
          Tambah
        </Button>
      </div>
      {fe.code || fe.name ? <p className="text-xs text-danger">{fe.code ?? fe.name}</p> : <Status state={state} />}
    </form>
  );
}

// ---------------------------------------------------------------- tombol kecil
type ArchiveTable = Parameters<typeof setArchived>[0];

export function ArchiveButton({ table, id, archived, label }: { table: ArchiveTable; id: string; archived: boolean; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={() =>
        start(async () => {
          const r = await setArchived(table, id, !archived);
          if (r.error) window.alert(r.error);
        })
      }
    >
      <Button type="submit" size="sm" kind={archived ? "secondary" : "ghost"} disabled={pending}>
        {label ?? (archived ? "Pulihkan" : "Arsipkan")}
      </Button>
    </form>
  );
}

export function DigitalToggle({ code, isDigital }: { code: string; isDigital: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        defaultChecked={isDigital}
        disabled={pending}
        onChange={(e) => {
          const v = e.currentTarget.checked;
          start(async () => {
            const r = await setChannelDigital(code, v);
            if (r.error) window.alert(r.error);
          });
        }}
        className="size-4 accent-[var(--accent)]"
      />
      Digital
    </label>
  );
}
