"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAction } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import {
  channelSchema,
  customerSchema,
  memberSchema,
  packagingSchema,
  productPackagingSchema,
  productUpdateSchema,
} from "@/lib/validation/master";

export type FormState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };

// Ambil hanya kunci yang diharapkan dari FormData (sisanya diabaikan; schema .strict() menolak kunci asing).
const pick = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, fd.get(k) ?? undefined]));

function fieldErrors(error: z.ZodError): FormState {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return { error: "Periksa kembali isian yang ditandai.", fieldErrors: out };
}

// Pelanggaran unik → pesan ramah; selain itu lewat mapDbError (tanpa detail SQL).
function dbError(e: { code?: string; message?: string }, unique = "Data dengan nilai yang sama sudah ada."): FormState {
  if (e.code === "23505") return { error: unique };
  if (e.code === "23514") return { error: "Nilai tidak memenuhi aturan (mis. isi kemasan harus lebih dari 0)." };
  return { error: mapDbError(e).message };
}

// ---------------------------------------------------------------- anggota
const MEMBER_KEYS = ["name", "hamlet", "address", "landAreaHa", "joinedOn", "nik", "phone"];

export async function saveMember(memberId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = memberSchema.safeParse(pick(fd, MEMBER_KEYS));
  if (!parsed.success) return fieldErrors(parsed.error);
  const m = parsed.data;
  const row = { name: m.name, hamlet: m.hamlet ?? null, address: m.address ?? null, land_area_ha: m.landAreaHa ? Number(m.landAreaHa) : null, joined_on: m.joinedOn ?? null };

  const supabase = await createClient();
  let id = memberId;
  if (id) {
    const { error } = await supabase.from("members").update(row).eq("id", id);
    if (error) return dbError(error);
  } else {
    const { data, error } = await supabase.from("members").insert(row).select("id").single();
    if (error || !data) return dbError(error ?? {});
    id = data.id;
  }
  const { error: cErr } = await supabase.from("member_contacts").upsert({ member_id: id, nik: m.nik ?? null, phone: m.phone ?? null }, { onConflict: "member_id" });
  if (cErr) return dbError(cErr, "NIK atau no. HP sudah dipakai.");

  revalidatePath("/master/anggota");
  redirect(`/master/anggota?simpan=${memberId ? "ubah" : "baru"}`);
}

// ---------------------------------------------------------------- pelanggan
const CUSTOMER_KEYS = ["name", "type", "phone", "address", "note", "creditLimitRp"];

export async function saveCustomer(customerId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = customerSchema.safeParse(pick(fd, CUSTOMER_KEYS));
  if (!parsed.success) return fieldErrors(parsed.error);
  const c = parsed.data;
  const row = { name: c.name, type: c.type, phone: c.phone ?? null, address: c.address ?? null, note: c.note ?? null, credit_limit_rp: c.creditLimitRp ?? null };
  const supabase = await createClient();
  const { error } = customerId ? await supabase.from("customers").update(row).eq("id", customerId) : await supabase.from("customers").insert(row);
  if (error) return dbError(error);
  revalidatePath("/master/pelanggan");
  redirect(`/master/pelanggan?simpan=${customerId ? "ubah" : "baru"}`);
}

// ---------------------------------------------------------------- produk & konversi
export async function updateProduct(productId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = productUpdateSchema.safeParse(pick(fd, ["name", "defaultPricePerKg", "minStockKg"]));
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ name: parsed.data.name, default_price_per_kg: parsed.data.defaultPricePerKg, min_stock_kg: Number(parsed.data.minStockKg) })
    .eq("id", productId);
  if (error) return dbError(error);
  revalidatePath("/master/produk", "layout");
  return { ok: true, message: "Produk disimpan." };
}

export async function addConversion(productId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = productPackagingSchema.safeParse({ productId, ...pick(fd, ["packagingId", "contentKg", "defaultPrice"]) });
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("product_packagings").insert({
    product_id: parsed.data.productId,
    packaging_id: parsed.data.packagingId,
    content_kg: Number(parsed.data.contentKg),
    default_price: parsed.data.defaultPrice,
  });
  if (error) return dbError(error, "Konversi dengan kemasan & isi yang sama sudah ada.");
  revalidatePath("/master/produk", "layout");
  return { ok: true, message: "Konversi kemasan ditambahkan." };
}

const priceOnly = z.object({ defaultPrice: productPackagingSchema.shape.defaultPrice }).strict();

export async function updateConversionPrice(conversionId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = priceOnly.safeParse(pick(fd, ["defaultPrice"]));
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("product_packagings").update({ default_price: parsed.data.defaultPrice }).eq("id", conversionId);
  if (error) return dbError(error);
  revalidatePath("/master/produk", "layout");
  return { ok: true, message: "Harga kemasan disimpan." };
}

// ---------------------------------------------------------------- jenis kemasan & saluran
export async function createPackaging(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = packagingSchema.safeParse(pick(fd, ["name"]));
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("packagings").insert({ name: parsed.data.name });
  if (error) return dbError(error, "Jenis kemasan dengan nama itu sudah ada.");
  revalidatePath("/master/kemasan");
  return { ok: true, message: "Jenis kemasan ditambahkan." };
}

export async function createChannel(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = channelSchema.safeParse({ ...pick(fd, ["code", "name"]), isDigital: fd.get("isDigital") === "on" });
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("sales_channels").insert({ code: parsed.data.code, name: parsed.data.name, is_digital: parsed.data.isDigital });
  if (error) return dbError(error, "Kode saluran sudah dipakai.");
  revalidatePath("/master/kemasan");
  return { ok: true, message: "Saluran ditambahkan." };
}

export async function setChannelDigital(code: string, isDigital: boolean): Promise<FormState> {
  await requireAction("master.kelola");
  if (!/^[a-z_]{3,40}$/.test(code)) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { error } = await supabase.from("sales_channels").update({ is_digital: isDigital }).eq("code", code);
  if (error) return dbError(error);
  revalidatePath("/master/kemasan");
  return { ok: true };
}

// ---------------------------------------------------------------- arsip & pulihkan (FR-MST-05)
const ARCHIVABLE = {
  members: { key: "id", path: "/master/anggota" },
  customers: { key: "id", path: "/master/pelanggan" },
  products: { key: "id", path: "/master/produk" },
  product_packagings: { key: "id", path: "/master/produk" },
  packagings: { key: "id", path: "/master/kemasan" },
  sales_channels: { key: "code", path: "/master/kemasan" },
} as const;
type Archivable = keyof typeof ARCHIVABLE;

const archiveSchema = z.object({
  table: z.enum(Object.keys(ARCHIVABLE) as [Archivable, ...Archivable[]]),
  id: z.string().min(1).max(64),
  archive: z.boolean(),
});

export async function setArchived(table: Archivable, id: string, archive: boolean): Promise<FormState> {
  await requireAction("master.kelola");
  const parsed = archiveSchema.safeParse({ table, id, archive });
  if (!parsed.success) return { error: "Data tidak valid" };
  const { table: t, id: rowId } = parsed.data;
  const { path } = ARCHIVABLE[t];
  const stamp = { archived_at: archive ? new Date().toISOString() : null };
  const supabase = await createClient();
  // sales_channels berkunci "code"; tabel lain berkunci "id".
  const { data, error } = t === "sales_channels" ? await supabase.from(t).update(stamp).eq("code", rowId).select("code") : await supabase.from(t).update(stamp).eq("id", rowId).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: "Data tidak ditemukan atau Anda tidak berhak mengubahnya." };
  revalidatePath(path, "layout");
  return { ok: true, message: archive ? "Diarsipkan." : "Dipulihkan." };
}
