import "server-only";
import { cleanQuery, PAGE_SIZE } from "@/features/master/queries";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order";
import { createClient } from "@/lib/supabase/server";
import type { OrderPaymentStatus, OrderStatus } from "@/lib/supabase/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type OrderFilter = { q: string; status?: OrderStatus; pay?: OrderPaymentStatus; channel?: string; from?: string; to?: string; page: number };

export function parseOrderFilter(sp: Record<string, string | string[] | undefined>): OrderFilter {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const status = s("status");
  const pay = s("bayar");
  return {
    q: cleanQuery(s("q")),
    status: status && status in ORDER_STATUS_LABEL ? (status as OrderStatus) : undefined,
    pay: pay && pay in PAYMENT_STATUS_LABEL ? (pay as OrderPaymentStatus) : undefined,
    channel: /^[a-z_]{3,40}$/.test(s("saluran") ?? "") ? s("saluran") : undefined,
    from: DATE.test(s("dari") ?? "") ? s("dari") : undefined,
    to: DATE.test(s("sampai") ?? "") ? s("sampai") : undefined,
    page: Math.max(1, Math.min(10_000, Number.parseInt(s("page") ?? "1", 10) || 1)),
  };
}

// Daftar pesanan (FR-SAL-07, T6.5): dua status terpisah, filter saluran, cari nomor INV / nama pelanggan.
export async function listOrders(f: OrderFilter) {
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, doc_number, status, payment_status, business_date, customer_name, channel, total_rp, sales_channels(name)", { count: "exact" })
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.q) query = query.or(`doc_number.ilike.%${f.q}%,customer_name.ilike.%${f.q}%`);
  if (f.status) query = query.eq("status", f.status);
  if (f.pay) query = query.eq("payment_status", f.pay);
  if (f.channel) query = query.eq("channel", f.channel);
  if (f.from) query = query.gte("business_date", f.from);
  if (f.to) query = query.lte("business_date", f.to);
  return query;
}

export async function listChannels() {
  const supabase = await createClient();
  const { data } = await supabase.from("sales_channels").select("code, name, is_digital, archived_at").order("sort_order").order("name");
  return data ?? [];
}

/**
 * Pilihan form pesanan: pelanggan aktif, saluran aktif, produk aktif + kemasan aktif + harga katalog + stok tersedia.
 * Nama produk & kemasan diambil dari master (bukan hardcode, PRD §4.0).
 */
export async function orderFormOptions() {
  const supabase = await createClient();
  const [customers, channels, products, stock, balances] = await Promise.all([
    supabase.from("customers").select("id, name, type, credit_limit_rp").is("archived_at", null).order("name").limit(1000),
    supabase.from("sales_channels").select("code, name").is("archived_at", null).order("sort_order").order("name"),
    supabase
      .from("products")
      .select("id, code, name, default_price_per_kg, product_packagings(id, content_kg, default_price, archived_at, packagings(name))")
      .is("archived_at", null)
      .order("code"),
    supabase.from("v_stock_balance").select("product_id, available_kg, avg_cost_per_kg"),
    // piutang berjalan per pelanggan (FR-SAL-09): sisa tagihan pesanan sah
    supabase.from("v_order_balance").select("customer_id, outstanding_rp").in("status", ["confirmed", "delivered"]).gt("outstanding_rp", 0).limit(5000),
  ]);
  const available = new Map((stock.data ?? []).map((s) => [s.product_id, s.available_kg]));
  const avgCost = new Map((stock.data ?? []).map((s) => [s.product_id, s.avg_cost_per_kg]));
  const owed = new Map<string, number>();
  for (const b of balances.data ?? []) owed.set(b.customer_id, (owed.get(b.customer_id) ?? 0) + b.outstanding_rp);
  return {
    customers: (customers.data ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type, creditLimitRp: c.credit_limit_rp, outstandingRp: owed.get(c.id) ?? 0 })),
    channels: channels.data ?? [],
    products: (products.data ?? []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      pricePerKg: p.default_price_per_kg,
      availableKg: available.get(p.id) ?? 0,
      avgCostPerKg: avgCost.get(p.id) ?? null,
      packagings: (p.product_packagings ?? [])
        .filter((pp) => pp.archived_at === null)
        .map((pp) => ({ id: pp.id, name: pp.packagings?.name ?? "Kemasan", contentKg: pp.content_kg, price: pp.default_price }))
        .sort((a, b) => a.contentKg - b.contentKg),
    })),
    error: customers.error ?? channels.error ?? products.error,
  };
}
export type OrderFormOptions = Awaited<ReturnType<typeof orderFormOptions>>;

export async function getOrder(id: string) {
  const supabase = await createClient();
  const [order, items, balance, returns] = await Promise.all([
    supabase.from("orders").select("*, sales_channels(name)").eq("id", id).maybeSingle(),
    supabase
      .from("order_items")
      .select("id, product_id, product_packaging_id, unit_label, qty_input, qty_kg, price_snapshot, gross_rp, discount_rp, line_total_rp, sort_order, products(code, name)")
      .eq("order_id", id)
      .order("sort_order"),
    supabase.from("v_order_balance").select("paid_rp, refunded_rp, outstanding_rp, bill_rp, credit_rp, pending_rp, returned_rp").eq("order_id", id).maybeSingle(),
    supabase
      .from("order_returns")
      .select("id, doc_number, status, business_date, reason, total_kg, sales_value_rp, created_by, created_by_name, verified_at, verified_by_name, order_return_items(order_item_id, qty_kg)")
      .eq("order_id", id)
      .order("created_at"),
  ]);
  return { order: order.data, items: items.data ?? [], balance: balance.data, returns: returns.data ?? [], error: order.error };
}

/** Kolom kanan detail pesanan (desain 02): data pelanggan, piutang berjalan pelanggan, dan jumlah/waktu cetak nota. */
export async function orderSideInfo(orderId: string, customerId: string) {
  const supabase = await createClient();
  const [customer, open, prints] = await Promise.all([
    supabase.from("customers").select("name, address, phone, credit_limit_rp").eq("id", customerId).maybeSingle(),
    supabase.from("v_order_balance").select("outstanding_rp").eq("customer_id", customerId).in("status", ["confirmed", "delivered"]),
    supabase.from("print_logs").select("printed_at").eq("doc_type", "order").eq("doc_id", orderId).order("printed_at"),
  ]);
  return {
    customer: customer.data,
    customerOutstandingRp: (open.data ?? []).reduce((s, r) => s + r.outstanding_rp, 0),
    prints: (prints.data ?? []).map((p) => p.printed_at),
  };
}
