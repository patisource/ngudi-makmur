"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/features/master/actions";
import { postCorrection, postDecision, postExpense, postIncome, postOpening, postRecordPayment, postRefund, postRejectPayment, postVerifyPayment } from "@/features/cash/posting";
import { requireAction } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import type { PostingOutcome } from "@/lib/posting";
import {
  correctionSchema,
  decisionSchema,
  expenseSchema,
  incomeSchema,
  openingSchema,
  paymentSchema,
  refundSchema,
  rejectPaymentSchema,
  type CorrectionInput,
  type ExpenseInput,
  type IncomeInput,
  type PaymentInput,
  type RefundInput,
} from "@/lib/validation/cash";

const uuid = z.uuid();
const bad = (): FormState => ({ error: "Data tidak valid" });

function zodErrors(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
  return { error: error.issues[0]?.message ?? "Periksa kembali isian.", fieldErrors };
}

const revalidateCash = (orderId?: string) => {
  revalidatePath("/kas", "layout");
  revalidatePath("/penjualan");
  if (orderId) revalidatePath(`/penjualan/${orderId}`);
};

const done = (res: PostingOutcome, msg: (r: Extract<PostingOutcome, { ok: true }>["result"], already: boolean) => string, orderId?: string): FormState => {
  if (!res.ok) return { error: res.error.message };
  revalidateCash(orderId);
  return { ok: true, message: msg(res.result, res.result.already || res.replayed) };
};

// ---------------------------------------------------------------- pembayaran pesanan (T7.2, T7.3)
export async function recordPayment(orderId: string, raw: PaymentInput, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(key).success) return bad();
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postRecordPayment(orderId, parsed.data, key);
  return done(
    res,
    (r, already) =>
      already
        ? "Pembayaran ini sudah tercatat sebelumnya."
        : r.status === "verified"
          ? `Pembayaran ${formatRupiah(parsed.data.amountRp)} diverifikasi (${r.doc_number}). Kas masuk dicatat.`
          : `Pembayaran ${formatRupiah(parsed.data.amountRp)} dicatat, menunggu verifikasi. Kas belum bertambah.`,
    orderId,
  );
}

export async function verifyPayment(orderId: string, paymentId: string, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (![orderId, paymentId, key].every((v) => uuid.safeParse(v).success)) return bad();
  const res = await postVerifyPayment(paymentId, key);
  return done(res, (r, already) => (already ? `Sudah diverifikasi sebelumnya (${r.doc_number}).` : `Pembayaran diverifikasi (${r.doc_number}). Kas masuk dicatat.`), orderId);
}

export async function rejectPayment(orderId: string, paymentId: string, reason: string, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (![orderId, paymentId, key].every((v) => uuid.safeParse(v).success)) return bad();
  const parsed = rejectPaymentSchema.safeParse({ reason });
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postRejectPayment(paymentId, parsed.data.reason, key);
  return done(res, () => "Pembayaran ditolak. Tidak ada kas yang dicatat.", orderId);
}

export async function createRefund(orderId: string, raw: RefundInput, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(key).success) return bad();
  const parsed = refundSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postRefund(orderId, parsed.data, key);
  return done(res, (r) => `Refund ${formatRupiah(parsed.data.amountRp)} dicatat (${r.doc_number}). Kas keluar dicatat.`, orderId);
}

// ---------------------------------------------------------------- pengeluaran & pemasukan lain (T7.4)
export async function createExpense(raw: ExpenseInput, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postExpense(parsed.data, key);
  return done(res, (r, already) => (already ? `Sudah tercatat sebagai ${r.doc_number}.` : `Pengeluaran ${formatRupiah(parsed.data.amountRp)} dicatat (${r.doc_number}).`));
}

export async function createIncome(raw: IncomeInput, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = incomeSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postIncome(parsed.data, key);
  return done(res, (r, already) => (already ? `Sudah tercatat sebagai ${r.doc_number}.` : `Pemasukan ${formatRupiah(parsed.data.amountRp)} dicatat (${r.doc_number}).`));
}

// ---------------------------------------------------------------- saldo awal & koreksi kas (T7.6)
export async function setOpeningBalance(raw: { accountId: string; amountRp: string; businessDate: string }, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = openingSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postOpening(parsed.data, key);
  return done(res, () => `Saldo awal ${formatRupiah(parsed.data.amountRp)} disimpan. Perubahan berikutnya lewat koreksi kas.`);
}

export async function requestCorrection(raw: CorrectionInput, key: string): Promise<FormState> {
  await requireAction("kas.kelola");
  if (!uuid.safeParse(key).success) return bad();
  const parsed = correctionSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postCorrection(parsed.data, key);
  return done(res, (r) => `Koreksi ${r.doc_number} diajukan. Saldo berubah setelah ketua menyetujui.`);
}

export async function decideCorrection(correctionId: string, raw: { approve: boolean; note: string }, key: string): Promise<FormState> {
  await requireAction("kas.putuskan");
  if (!uuid.safeParse(correctionId).success || !uuid.safeParse(key).success) return bad();
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const res = await postDecision(correctionId, parsed.data, key);
  return done(res, (r) => (r.status === "approved" ? `Koreksi ${r.doc_number} disetujui; saldo kas diperbarui.` : `Koreksi ${r.doc_number} ditolak.`));
}
