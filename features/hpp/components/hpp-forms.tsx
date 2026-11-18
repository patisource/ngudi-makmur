"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toastResult } from "@/components/ui/toast";
import { saveHppSettings, savePackagingCost } from "@/features/hpp/actions";
import type { FormState } from "@/features/master/actions";
import type { HppSettings } from "@/lib/supabase/types";

const dec = (n: number) => String(n).replace(".", ",");

type Def = { key: keyof HppSettings & string; label: string; suffix: string; hint?: string };
const GROUPS: Array<{ title: string; items: Def[] }> = [
  {
    title: "Jagung tongkol & rendemen",
    items: [
      { key: "kg_per_karung", label: "Isi 1 karung tongkol", suffix: "kg", hint: "Jagung masuk bisa diisi per karung." },
      { key: "harga_tongkol_kg", label: "Harga beli tongkol standar", suffix: "Rp/kg", hint: "Pasar Pati Rp7.500–7.800/kg." },
      { key: "rendemen_pipil_pct", label: "Rendemen tongkol → pipilan", suffix: "%" },
      { key: "rendemen_tepung_pct", label: "Rendemen pipilan → tepung", suffix: "%" },
    ],
  },
  {
    title: "BBM (bensin)",
    items: [
      { key: "harga_bensin_liter", label: "Harga bensin", suffix: "Rp/liter" },
      { key: "karung_per_liter_pipil", label: "Pemipilan: karung per 1 liter", suffix: "karung" },
      { key: "liter_per_100kg_giling", label: "Penepungan: liter per 100 kg pipilan", suffix: "liter" },
    ],
  },
  {
    title: "Tenaga kerja",
    items: [
      { key: "upah_harian", label: "Upah harian per orang", suffix: "Rp/hari", hint: "8 jam kerja, Desa Baturejo." },
      { key: "pekerja_pipil", label: "Pekerja batch pemipilan", suffix: "orang" },
      { key: "pekerja_giling", label: "Pekerja batch penepungan", suffix: "orang" },
    ],
  },
  {
    title: "Biaya tetap",
    items: [{ key: "biaya_tetap_bulanan", label: "Oli & perawatan mesin", suffix: "Rp/bulan", hint: "Dibagi ke semua batch di bulan yang sama sebanding kg hasil." }],
  },
];

/** Parameter HPP kelompok. Admin kelompok mengubah; peran lain hanya melihat. */
export function HppSettingsForm({ settings, canManage }: { settings: HppSettings; canManage: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(saveHppSettings, {});
  const fe = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) {
      toastResult(state);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{g.title}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((d) => (
              <Field key={d.key} label={`${d.label} (${d.suffix})`} htmlFor={d.key} error={fe[d.key]} hint={d.hint}>
                <Input
                  id={d.key}
                  name={d.key}
                  inputMode="decimal"
                  defaultValue={dec(Number(settings[d.key]))}
                  readOnly={!canManage}
                  aria-invalid={Boolean(fe[d.key])}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
      {state.error && <Notice state={state} />}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" kind="primary" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan parameter"}
          </Button>
          <span className="text-xs text-text-subtle">Mengubah biaya tetap bulanan menghitung ulang HPP semua batch & nilai stok.</span>
        </div>
      ) : (
        <p className="text-xs text-text-subtle">Parameter diubah oleh admin kelompok.</p>
      )}
    </form>
  );
}

/** Biaya kemasan + desain per satuan kemasan (sel tabel, admin kelompok). */
export function PackagingCostInput({ id, cost, label }: { id: string; cost: number; label: string }) {
  const router = useRouter();
  const [value, setValue] = useState(String(cost));
  const [pending, start] = useTransition();
  const dirty = value.trim() !== String(cost);
  return (
    <span className="flex items-center justify-end gap-1.5">
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Biaya kemasan ${label} (Rp)`}
        className="h-9 w-24 text-right tabular-nums"
      />
      <Button
        size="sm"
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            const res = await savePackagingCost(id, value);
            toastResult(res);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "…" : "Simpan"}
      </Button>
    </span>
  );
}
