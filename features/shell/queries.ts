import "server-only";
import { cache } from "react";
import type { AppRole } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";

// Hal yang menunggu tindakan per peran: dipakai badge menu, lonceng di topbar, dan dashboard.
// Hanya hitungan (head: true); RLS tetap membatasi baris yang terlihat.
export type PendingKey = "payments" | "toDeliver" | "stockAdjustments" | "cashCorrections" | "returns" | "batchVoids";
export type PendingItem = { key: PendingKey; label: string; href: string; count: number; nav: string; approval: boolean };

const DEF: Record<PendingKey, { label: string; href: string; nav: string; roles: readonly AppRole[] }> = {
  payments: { label: "Pembayaran menunggu verifikasi", href: "/kas/pembayaran?status=pending", nav: "/kas", roles: ["admin_kelompok"] },
  toDeliver: { label: "Pesanan belum diserahkan", href: "/penjualan?status=confirmed", nav: "/penjualan", roles: ["admin_kelompok"] },
  stockAdjustments: { label: "Koreksi stok menunggu persetujuan", href: "/stok/koreksi", nav: "/stok", roles: ["ketua"] },
  cashCorrections: { label: "Koreksi kas menunggu persetujuan", href: "/kas/koreksi", nav: "/kas", roles: ["ketua"] },
  returns: { label: "Retur menunggu verifikasi fisik", href: "/penjualan?status=delivered", nav: "/penjualan", roles: ["ketua"] },
  batchVoids: { label: "Pembatalan batch menunggu persetujuan", href: "/produksi?status=pending_void", nav: "/produksi", roles: ["ketua"] },
};

export const pendingFor = cache(async (roles: readonly AppRole[]): Promise<PendingItem[]> => {
  const keys = (Object.keys(DEF) as PendingKey[]).filter((k) => DEF[k].roles.some((r) => roles.includes(r)));
  if (keys.length === 0) return [];
  const supabase = await createClient();
  const q = {
    payments: () => supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    toDeliver: () => supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
    stockAdjustments: () => supabase.from("stock_adjustments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    cashCorrections: () => supabase.from("cash_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
    returns: () => supabase.from("order_returns").select("id", { count: "exact", head: true }).eq("status", "draft"),
    batchVoids: () => supabase.from("production_batches").select("id", { count: "exact", head: true }).eq("status", "pending_void"),
  } satisfies Record<PendingKey, () => PromiseLike<{ count: number | null }>>;
  const counts = await Promise.all(keys.map((k) => q[k]()));
  return keys.map((k, i) => ({ key: k, label: DEF[k].label, href: DEF[k].href, nav: DEF[k].nav, count: counts[i].count ?? 0, approval: DEF[k].roles.includes("ketua") }));
});

// ---------------------------------------------------------------- daftar keputusan ketua (dashboard)
export type Approval = {
  kind: "stock" | "cash" | "return" | "void";
  id: string;
  /** id pesanan untuk retur (aksi verifikasi butuh keduanya) */
  parentId?: string;
  doc: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
};

const shortDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const kgText = (v: number | string) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(v))} kg`;
const rpText = (v: number) => `Rp${new Intl.NumberFormat("id-ID").format(v)}`;

export async function ketuaApprovals(): Promise<Approval[]> {
  const supabase = await createClient();
  const [adj, cor, ret, voids] = await Promise.all([
    supabase
      .from("stock_adjustments")
      .select("id, doc_number, direction, qty_kg, reason, requested_by_name, created_at, products(name)")
      .eq("status", "pending")
      .order("created_at")
      .limit(10),
    supabase.from("cash_corrections").select("id, doc_number, direction, amount_rp, reason, requested_by_name, created_at, cash_accounts(name)").eq("status", "pending").order("created_at").limit(10),
    supabase
      .from("order_returns")
      .select("id, order_id, reason, sales_value_rp, created_by_name, created_at, orders(doc_number), order_return_items(qty_kg, products(name))")
      .eq("status", "draft")
      .order("created_at")
      .limit(10),
    supabase.from("production_batches").select("id, doc_number, batch_type, void_reason, operator_name, void_requested_at").eq("status", "pending_void").order("void_requested_at").limit(10),
  ]);
  const out: Approval[] = [];
  for (const a of adj.data ?? []) {
    out.push({
      kind: "stock",
      id: a.id,
      doc: a.doc_number,
      title: `${a.products?.name ?? "Produk"} ${a.direction === "in" ? "+" : "−"}${kgText(a.qty_kg)}`,
      detail: a.reason,
      meta: `diajukan ${a.requested_by_name} · ${shortDate.format(new Date(a.created_at))}`,
      href: "/stok/koreksi",
    });
  }
  for (const c of cor.data ?? []) {
    out.push({
      kind: "cash",
      id: c.id,
      doc: c.doc_number,
      title: `${c.cash_accounts?.name ?? "Kas"} ${c.direction === "in" ? "+" : "−"}${rpText(c.amount_rp)}`,
      detail: c.reason,
      meta: `diajukan ${c.requested_by_name} · ${shortDate.format(new Date(c.created_at))}`,
      href: "/kas/koreksi",
    });
  }
  for (const r of ret.data ?? []) {
    const items = (r.order_return_items ?? []).map((i) => `${i.products?.name ?? "Produk"} ${kgText(i.qty_kg)}`).join(", ");
    out.push({
      kind: "return",
      id: r.id,
      parentId: r.order_id,
      doc: r.orders?.doc_number ?? "Retur",
      title: items || "Retur",
      detail: `${r.reason} · nilai ${rpText(r.sales_value_rp)}`,
      meta: `dicatat ${r.created_by_name} · cek barang di gudang`,
      href: `/penjualan/${r.order_id}`,
    });
  }
  for (const v of voids.data ?? []) {
    out.push({
      kind: "void",
      id: v.id,
      doc: v.doc_number ?? "Batch",
      title: `Batalkan batch ${v.batch_type}`,
      detail: v.void_reason ?? "",
      meta: `diajukan ${v.operator_name}${v.void_requested_at ? ` · ${shortDate.format(new Date(v.void_requested_at))}` : ""}`,
      href: `/produksi/${v.id}`,
    });
  }
  return out;
}
