import "server-only";
import { runPosting } from "@/lib/posting";
import { createClient } from "@/lib/supabase/server";

// Posting kas (FR-CSH-*): setiap pemanggilan berkunci idempotensi, sehingga kirim ulang dengan kunci sama tidak membuat
// pembayaran/kas ganda (FR-CSH-04a). Dipakai server action & Route Handler /api/v1.

export async function postRecordPayment(
  orderId: string,
  p: { businessDate: string; method: "tunai" | "transfer"; accountId: string; amountRp: number; note?: string; verified: boolean },
  key: string,
) {
  const supabase = await createClient();
  const payload = { orderId, ...p, note: p.note ?? null };
  return runPosting("payments.record", key, payload, () =>
    supabase.rpc("record_payment", {
      p_order: orderId,
      p_date: p.businessDate,
      p_method: p.method,
      p_account: p.accountId,
      p_amount: p.amountRp,
      p_note: p.note ?? null,
      p_verified: p.verified,
    }),
  );
}

export async function postVerifyPayment(paymentId: string, key: string) {
  const supabase = await createClient();
  return runPosting("payments.verify", key, { paymentId }, () => supabase.rpc("verify_payment", { p_id: paymentId }));
}

export async function postRejectPayment(paymentId: string, reason: string, key: string) {
  const supabase = await createClient();
  return runPosting("payments.reject", key, { paymentId, reason }, () => supabase.rpc("reject_payment", { p_id: paymentId, p_reason: reason }));
}

export async function postRefund(orderId: string, r: { businessDate: string; accountId: string; amountRp: number; reason: string; returnId: string | null }, key: string) {
  const supabase = await createClient();
  return runPosting("refunds.create", key, { orderId, ...r }, () =>
    supabase.rpc("create_refund", { p_order: orderId, p_account: r.accountId, p_amount: r.amountRp, p_reason: r.reason, p_date: r.businessDate, p_return: r.returnId }),
  );
}

export async function postExpense(e: { businessDate: string; category: string; accountId: string; amountRp: number; description: string; reference?: string }, key: string) {
  const supabase = await createClient();
  return runPosting("expenses.create", key, { ...e, reference: e.reference ?? null }, () =>
    supabase.rpc("create_expense", { p_date: e.businessDate, p_category: e.category, p_account: e.accountId, p_amount: e.amountRp, p_description: e.description, p_reference: e.reference ?? null }),
  );
}

export async function postIncome(e: { businessDate: string; category: string; accountId: string; amountRp: number; description: string }, key: string) {
  const supabase = await createClient();
  return runPosting("incomes.create", key, e, () =>
    supabase.rpc("create_other_income", { p_date: e.businessDate, p_category: e.category, p_account: e.accountId, p_amount: e.amountRp, p_description: e.description }),
  );
}

export async function postOpening(o: { accountId: string; amountRp: number; businessDate: string }, key: string) {
  const supabase = await createClient();
  return runPosting("cash.opening", key, o, () => supabase.rpc("set_opening_balance", { p_account: o.accountId, p_amount: o.amountRp, p_date: o.businessDate }));
}

export async function postCorrection(c: { accountId: string; direction: "in" | "out"; amountRp: number; reason: string; businessDate: string }, key: string) {
  const supabase = await createClient();
  return runPosting("cash_corrections.request", key, c, () =>
    supabase.rpc("request_cash_correction", { p_account: c.accountId, p_direction: c.direction, p_amount: c.amountRp, p_reason: c.reason, p_date: c.businessDate }),
  );
}

export async function postDecision(correctionId: string, d: { approve: boolean; note?: string }, key: string) {
  const supabase = await createClient();
  return runPosting("cash_corrections.decide", key, { correctionId, ...d, note: d.note ?? null }, () =>
    supabase.rpc("decide_cash_correction", { p_id: correctionId, p_approve: d.approve, p_note: d.note ?? null }),
  );
}

export async function postTransfer(t: { businessDate: string; fromAccountId: string; toAccountId: string; amountRp: number; note: string }, key: string) {
  const supabase = await createClient();
  return runPosting("cash_transfers.create", key, t, () =>
    supabase.rpc("create_cash_transfer", { p_date: t.businessDate, p_from: t.fromAccountId, p_to: t.toAccountId, p_amount: t.amountRp, p_note: t.note }),
  );
}
