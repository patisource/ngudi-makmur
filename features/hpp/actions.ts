"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/features/master/actions";
import { requireAction } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { hppSettingsSchema } from "@/lib/validation/hpp";

const KEYS = Object.keys(hppSettingsSchema.shape);

const revalidate = () => {
  for (const p of ["/hpp", "/produksi", "/dashboard", "/stok", "/laporan"]) revalidatePath(p, "layout");
};

// Parameter HPP (admin kelompok). Biaya tetap bulanan berubah → database menghitung ulang seluruh HPP & nilai stok
// dalam transaksi yang sama (save_hpp_settings → _hpp_recalc), tercatat di log hitung ulang.
export async function saveHppSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("hpp.kelola");
  const raw = Object.fromEntries(KEYS.map((k) => [k, fd.get(k) ?? ""]));
  const parsed = hppSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "_")] ??= i.message;
    return { error: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_hpp_settings", { p: parsed.data });
  if (error) return { error: mapDbError(error).message };
  revalidate();
  const recalc = (data as { recalc?: { batches_changed?: number } | null } | null)?.recalc;
  return { ok: true, message: recalc ? `Parameter disimpan. HPP dihitung ulang (${recalc.batches_changed ?? 0} batch berubah).` : "Parameter disimpan. Berlaku untuk batch berikutnya." };
}

/** Biaya kemasan + desain per satuan kemasan (komponen HPP per unit). */
export async function savePackagingCost(id: string, cost: string): Promise<FormState> {
  await requireAction("hpp.kelola");
  const n = parseRupiah(cost);
  if (!z.uuid().safeParse(id).success || n == null || n > 100_000_000) return { error: "Biaya kemasan harus rupiah bulat" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_packagings").update({ cost_rp: n }).eq("id", id).select("id");
  if (error) return { error: mapDbError(error).message };
  if (!data?.length) return { error: "Kemasan tidak ditemukan" };
  revalidatePath("/hpp");
  return { ok: true, message: `Biaya kemasan ${formatRupiah(n)} disimpan.` };
}
