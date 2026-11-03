// Schema Zod pembayaran & kas (FR-CSH-*, Security.md §5.2) — dipakai form, server action, dan API.
// Jumlah > 0 rupiah bulat; tagihan tersisa & saldo dicek ulang di database dengan baris terkunci.
import { z } from "zod";
import { blankToUndefined, businessDate, optText, rupiah, text } from "@/lib/validation/common";

const positiveRupiah = (label: string) => rupiah(label).refine((n) => n > 0, `${label} harus lebih dari 0`);
const reason = (label: string) => text(500, label).refine((s) => s.length >= 5, `${label} minimal 5 karakter`);
const accountId = z.uuid("Pilih akun kas");

export const paymentSchema = z
  .object({
    businessDate: businessDate("Tanggal bayar"),
    method: z.enum(["tunai", "transfer"], { message: "Pilih metode pembayaran" }),
    accountId,
    amountRp: positiveRupiah("Jumlah bayar"),
    note: optText(500, "Catatan"),
    /** tunai yang diterima langsung: catat + verifikasi sekaligus (FR-CSH-02a) */
    verified: z.boolean(),
  })
  .strict();

export const rejectPaymentSchema = z.object({ reason: reason("Alasan penolakan") }).strict();

export const refundSchema = z
  .object({
    businessDate: businessDate("Tanggal refund"),
    accountId,
    amountRp: positiveRupiah("Jumlah refund"),
    reason: reason("Alasan refund"),
    returnId: z.preprocess((v) => blankToUndefined(v) ?? null, z.uuid().nullable()),
  })
  .strict();

export const expenseSchema = z
  .object({
    businessDate: businessDate("Tanggal"),
    category: z.string().regex(/^[a-z_]{3,40}$/, "Pilih kategori"),
    accountId,
    amountRp: positiveRupiah("Jumlah"),
    description: text(500, "Keterangan"),
    reference: optText(60, "Referensi"),
  })
  .strict();

export const incomeSchema = expenseSchema.omit({ reference: true });

/** Transfer antar akun kas (FR-CSH-09): dua akun berbeda, jumlah > 0, keterangan wajib. */
export const transferSchema = z
  .object({ businessDate: businessDate("Tanggal"), fromAccountId: accountId, toAccountId: accountId, amountRp: positiveRupiah("Jumlah"), note: text(500, "Keterangan") })
  .strict()
  .refine((t) => t.fromAccountId !== t.toAccountId, { path: ["toAccountId"], message: "Pilih akun tujuan yang berbeda" });

export const paymentProofPathSchema = z.string().regex(/^payments\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/, "Path bukti tidak valid");

export const openingSchema = z
  .object({ accountId, amountRp: rupiah("Saldo awal"), businessDate: businessDate("Tanggal saldo awal") })
  .strict();

export const correctionSchema = z
  .object({
    accountId,
    direction: z.enum(["in", "out"], { message: "Pilih tambah atau kurang" }),
    amountRp: positiveRupiah("Jumlah koreksi"),
    reason: reason("Alasan koreksi"),
    businessDate: businessDate("Tanggal"),
  })
  .strict();

export const decisionSchema = z
  .object({ approve: z.boolean(), note: optText(500, "Catatan") })
  .strict()
  .refine((d) => d.approve || (d.note?.length ?? 0) >= 5, { path: ["note"], message: "Alasan penolakan minimal 5 karakter" });

export type PaymentInput = z.input<typeof paymentSchema>;
export type RefundInput = z.input<typeof refundSchema>;
export type ExpenseInput = z.input<typeof expenseSchema>;
export type IncomeInput = z.input<typeof incomeSchema>;
export type TransferInput = z.input<typeof transferSchema>;
export type CorrectionInput = z.input<typeof correctionSchema>;
