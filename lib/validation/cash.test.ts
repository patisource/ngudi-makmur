import { describe, expect, it } from "vitest";
import { correctionSchema, decisionSchema, expenseSchema, paymentSchema, refundSchema } from "./cash";

const acc = "3f1c2b8e-5d6a-4c1e-9f0a-1b2c3d4e5f60";
const pay = { businessDate: "2026-11-01", method: "tunai", accountId: acc, amountRp: "Rp 30.000", note: "", verified: true };

describe("pembayaran (FR-CSH-02/03)", () => {
  it("menerima format rupiah Indonesia → integer", () => {
    expect(paymentSchema.parse(pay).amountRp).toBe(30000);
  });
  it("UJI WAJIB: jumlah ≤ 0 atau berdesimal ditolak", () => {
    for (const amountRp of ["0", "-5000", "1000,5", ""]) expect(paymentSchema.safeParse({ ...pay, amountRp }).success).toBe(false);
  });
  it("metode & akun wajib; status/nomor dari klien ditolak", () => {
    expect(paymentSchema.safeParse({ ...pay, method: "qris" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...pay, accountId: "" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...pay, status: "verified" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...pay, docNumber: "PAY-1" }).success).toBe(false);
  });
  it("tanggal masa depan ditolak", () => {
    expect(paymentSchema.safeParse({ ...pay, businessDate: "2999-01-01" }).success).toBe(false);
  });
});

describe("refund, pengeluaran, koreksi", () => {
  it("refund wajib alasan ≥ 5 karakter; retur rujukan opsional", () => {
    const r = { businessDate: "2026-11-01", accountId: acc, amountRp: "10000", reason: "Retur lembap", returnId: "" };
    expect(refundSchema.parse(r).returnId).toBeNull();
    expect(refundSchema.safeParse({ ...r, reason: "x" }).success).toBe(false);
  });
  it("pengeluaran wajib keterangan & kategori", () => {
    const e = { businessDate: "2026-11-01", category: "upah", accountId: acc, amountRp: "40000", description: "Upah giling", reference: "PRD-20261101-01" };
    expect(expenseSchema.safeParse(e).success).toBe(true);
    expect(expenseSchema.safeParse({ ...e, description: " " }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...e, category: "" }).success).toBe(false);
  });
  it("koreksi: arah tambah/kurang, jumlah > 0, alasan wajib", () => {
    const c = { accountId: acc, direction: "out", amountRp: "1000", reason: "Selisih laci", businessDate: "2026-11-01" };
    expect(correctionSchema.safeParse(c).success).toBe(true);
    expect(correctionSchema.safeParse({ ...c, direction: "x" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...c, amountRp: "0" }).success).toBe(false);
  });
  it("tolak koreksi wajib alasan; setujui boleh tanpa catatan", () => {
    expect(decisionSchema.safeParse({ approve: true, note: "" }).success).toBe(true);
    expect(decisionSchema.safeParse({ approve: false, note: "" }).success).toBe(false);
    expect(decisionSchema.safeParse({ approve: false, note: "Bukti belum ada" }).success).toBe(true);
  });
});
