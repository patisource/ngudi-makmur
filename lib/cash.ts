// Label & nada badge modul pembayaran/kas (StyleGuide §2.3). Dipakai server & klien.
import type { CashSourceType, CorrectionStatus, PaymentMethod, PaymentStatus } from "@/lib/supabase/types";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = { pending: "Menunggu verifikasi", verified: "Terverifikasi", rejected: "Ditolak" };
export const PAYMENT_TONE: Record<PaymentStatus, "neutral" | "ok" | "warn" | "err"> = { pending: "warn", verified: "ok", rejected: "err" };
export const METHOD_LABEL: Record<PaymentMethod, string> = { tunai: "Tunai", transfer: "Transfer" };
export const CORRECTION_LABEL: Record<CorrectionStatus, string> = { pending: "Menunggu ketua", approved: "Disetujui", rejected: "Ditolak" };
export const CORRECTION_TONE: Record<CorrectionStatus, "neutral" | "ok" | "warn" | "err"> = { pending: "warn", approved: "ok", rejected: "err" };
export const CASH_SOURCE_LABEL: Record<CashSourceType, string> = {
  opening_balance: "Saldo awal",
  payment: "Pembayaran pesanan",
  other_income: "Pemasukan lain",
  expense: "Pengeluaran",
  refund: "Refund",
  cash_correction: "Koreksi kas",
};
