import "server-only";
import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 20;
export type StatusFilter = "aktif" | "arsip" | "semua";

export const parseStatus = (v: unknown): StatusFilter => (v === "arsip" || v === "semua" ? v : "aktif");
export const parsePage = (v: unknown) => Math.max(1, Math.min(10_000, Number.parseInt(String(v ?? "1"), 10) || 1));

// Kata kunci dipakai di filter .or() PostgREST: buang karakter yang bisa mengubah struktur filter (koma, kurung)
// dan karakter wildcard, lalu batasi panjang. Nilai tetap di-escape oleh PostgREST sebagai literal.
export function cleanQuery(v: unknown): string {
  return String(v ?? "")
    .replace(/[,()*%_\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export async function listMembers({ q, status, page }: { q: string; status: StatusFilter; page: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("members")
    .select("id, code, name, hamlet, land_area_ha, joined_on, nik_masked, phone_masked, archived_at", { count: "exact" })
    .order("code", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status === "aktif") query = query.is("archived_at", null);
  if (status === "arsip") query = query.not("archived_at", "is", null);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,hamlet.ilike.%${q}%`);
  return query;
}

export async function getMember(id: string) {
  const supabase = await createClient();
  const [member, contact] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).maybeSingle(),
    // RLS: hanya admin_kelompok & ketua mendapat baris; peran lain menerima null (memakai kolom *_masked).
    supabase.from("member_contacts").select("nik, phone").eq("member_id", id).maybeSingle(),
  ]);
  return { member: member.data, contact: contact.data, error: member.error };
}

export async function listProducts() {
  const supabase = await createClient();
  return supabase
    .from("products")
    .select("id, code, name, category, base_unit, default_price_per_kg, min_stock_kg, archived_at, product_packagings(id, content_kg, default_price, archived_at, packagings(name))")
    .order("code");
}

export async function getProduct(id: string) {
  const supabase = await createClient();
  const [product, conversions, packagings] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_packagings").select("id, content_kg, default_price, archived_at, packagings(name)").eq("product_id", id).order("content_kg"),
    supabase.from("packagings").select("id, name").is("archived_at", null).order("name"),
  ]);
  return { product: product.data, conversions: conversions.data ?? [], packagings: packagings.data ?? [], error: product.error };
}

export async function listPackagingsAndChannels() {
  const supabase = await createClient();
  const [packagings, channels] = await Promise.all([
    supabase.from("packagings").select("id, name, archived_at").order("name"),
    supabase.from("sales_channels").select("code, name, is_digital, sort_order, archived_at").order("sort_order").order("name"),
  ]);
  return { packagings: packagings.data ?? [], channels: channels.data ?? [], error: packagings.error ?? channels.error };
}

export async function listCustomers({ q, status, page }: { q: string; status: StatusFilter; page: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, code, name, type, phone, address, archived_at", { count: "exact" })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status === "aktif") query = query.is("archived_at", null);
  if (status === "arsip") query = query.not("archived_at", "is", null);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  return query;
}

export async function getCustomer(id: string) {
  const supabase = await createClient();
  return supabase.from("customers").select("*").eq("id", id).maybeSingle();
}
