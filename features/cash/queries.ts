import "server-only";
import { PAGE_SIZE } from "@/features/master/queries";
import { createClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/lib/supabase/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CashFilter = { account?: string; from?: string; to?: string; page: number };

export function parseCashFilter(sp: Record<string, string | string[] | undefined>): CashFilter {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return {
    account: UUID.test(s("akun") ?? "") ? s("akun") : undefined,
    from: DATE.test(s("dari") ?? "") ? s("dari") : undefined,
    to: DATE.test(s("sampai") ?? "") ? s("sampai") : undefined,
    page: Math.max(1, Math.min(10_000, Number.parseInt(s("page") ?? "1", 10) || 1)),
  };
}

export async function listAccounts() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_cash_balance").select("account_id, code, name, kind, balance_rp, opening_set_at, archived_at").order("sort_order").order("name");
  return data ?? [];
}

/** Buku kas (FR-CSH-07): mutasi per akun dengan referensi dokumen sumber, terbaru dulu. */
export async function listCashTransactions(f: CashFilter) {
  const supabase = await createClient();
  let q = supabase
    .from("cash_transactions")
    .select("id, account_id, direction, amount_rp, balance_after_rp, source_type, source_id, doc_number, business_date, note, cash_accounts(name)", { count: "exact" })
    .order("id", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.account) q = q.eq("account_id", f.account);
  if (f.from) q = q.gte("business_date", f.from);
  if (f.to) q = q.lte("business_date", f.to);
  return q;
}

/** Ringkasan masuk/keluar periode per akun (untuk kartu saldo). */
export async function cashFlowSummary(f: Pick<CashFilter, "from" | "to" | "account">) {
  const supabase = await createClient();
  let q = supabase.from("cash_transactions").select("direction, amount_rp").limit(100000);
  if (f.account) q = q.eq("account_id", f.account);
  if (f.from) q = q.gte("business_date", f.from);
  if (f.to) q = q.lte("business_date", f.to);
  const { data } = await q;
  let inRp = 0;
  let outRp = 0;
  for (const r of data ?? []) {
    if (r.direction === "in") inRp += r.amount_rp;
    else outRp += r.amount_rp;
  }
  return { inRp, outRp };
}

export async function listPayments({ status, page }: { status?: PaymentStatus; page: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("payments")
    .select("id, doc_number, order_id, business_date, method, amount_rp, status, note, cash_accounts(name), orders(doc_number, customer_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) q = q.eq("status", status);
  return q;
}

export async function listExpenses(f: CashFilter) {
  const supabase = await createClient();
  let q = supabase
    .from("expenses")
    .select("id, doc_number, business_date, category, amount_rp, description, reference, expense_categories(name), cash_accounts(name)", { count: "exact" })
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.from) q = q.gte("business_date", f.from);
  if (f.to) q = q.lte("business_date", f.to);
  return q;
}

export async function listIncomes(f: CashFilter) {
  const supabase = await createClient();
  let q = supabase
    .from("other_incomes")
    .select("id, doc_number, business_date, category, amount_rp, description, income_categories(name), cash_accounts(name)", { count: "exact" })
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.from) q = q.gte("business_date", f.from);
  if (f.to) q = q.lte("business_date", f.to);
  return q;
}

export async function listCorrections() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_corrections")
    .select("id, doc_number, account_id, direction, amount_rp, reason, business_date, status, requested_by, requested_by_name, decided_at, decided_by_name, decision_note, cash_accounts(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function listCategories() {
  const supabase = await createClient();
  const [expense, income] = await Promise.all([
    supabase.from("expense_categories").select("code, name").is("archived_at", null).order("sort_order").order("name"),
    supabase.from("income_categories").select("code, name").is("archived_at", null).order("sort_order").order("name"),
  ]);
  return { expense: expense.data ?? [], income: income.data ?? [] };
}

/** Pembayaran & refund satu pesanan (bagian Pembayaran di detail pesanan). */
export async function orderPayments(orderId: string) {
  const supabase = await createClient();
  const [payments, refunds] = await Promise.all([
    supabase
      .from("payments")
      .select("id, doc_number, business_date, method, amount_rp, status, note, reject_reason, created_at, verified_at, cash_accounts(name), attachments(id, storage_path, mime_type, created_at)")
      .eq("order_id", orderId)
      .order("created_at"),
    supabase.from("refunds").select("id, doc_number, business_date, amount_rp, reason, return_id, created_at, cash_accounts(name)").eq("order_id", orderId).order("created_at"),
  ]);
  // Bukti transfer privat: signed URL 5 menit setelah RLS memastikan pengguna boleh melihat pembayaran (Security.md §8).
  const files = (payments.data ?? []).flatMap((p) => p.attachments ?? []);
  const { data: signed } = files.length ? await supabase.storage.from("proofs").createSignedUrls(files.map((a) => a.storage_path), 300) : { data: [] };
  const url = new Map(files.map((a, i) => [a.id, signed?.[i]?.signedUrl ?? null]));
  return {
    payments: (payments.data ?? []).map((p) => ({
      ...p,
      proofs: [...(p.attachments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((a) => ({ id: a.id, mime: a.mime_type, url: url.get(a.id) ?? null })),
    })),
    refunds: refunds.data ?? [],
  };
}

/** Ringkasan halaman Pembayaran & kas (desain 06): saldo awal per akun, mutasi terbaru, koreksi terbaru. */
export async function cashOverview(account: string | undefined) {
  const supabase = await createClient();
  let mut = supabase
    .from("cash_transactions")
    .select("id, account_id, direction, amount_rp, source_type, doc_number, business_date, note, cash_accounts(name, kind)")
    .order("business_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(15);
  if (account) mut = mut.eq("account_id", account);
  const [opening, recent, corrections] = await Promise.all([
    supabase.from("cash_transactions").select("account_id, amount_rp").eq("source_type", "opening_balance"),
    mut,
    supabase
      .from("cash_corrections")
      .select("id, doc_number, direction, amount_rp, reason, status, requested_by_name, decided_by_name, decision_note, created_at, cash_accounts(name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    opening: new Map((opening.data ?? []).map((o) => [o.account_id, o.amount_rp])),
    recent: recent.data ?? [],
    corrections: corrections.data ?? [],
    error: recent.error ?? corrections.error,
  };
}
