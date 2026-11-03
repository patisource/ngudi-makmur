import { describe, expect, it } from "vitest";
import { itemGrams, lineGross, summarizeOrder } from "./order";
import { orderDraftSchema, cancelOrderSchema, fulfillOrderSchema } from "./validation/order";

// Rumus pratinjau harus sama dengan save_order_draft (DB): gross = round(qty × harga), kg = round(qty × isi kg, 3).
describe("pratinjau pesanan (FR-SAL-03)", () => {
  it("2 pak @0,5 kg = 1 kg; harga per kemasan", () => {
    expect(itemGrams("2", "0.5")).toBe(1000);
    expect(lineGross("2", 5500)).toBe(11000);
  });
  it("kg curah boleh desimal koma", () => {
    expect(itemGrams("1,5", null)).toBe(1500);
    expect(lineGross("1,5", 10000)).toBe(15000);
  });
  it("pembulatan rupiah ke bilangan bulat terdekat (setengah ke atas)", () => {
    expect(lineGross("0,333", 10000)).toBe(3330);
    expect(lineGross("0,001", 500)).toBe(1); // 0,5 → 1
    expect(lineGross("0,001", 499)).toBe(0);
  });
  it("nilai besar tetap tepat (tanpa galat float)", () => {
    // 99.999,999 × Rp10 miliar ≈ 10^15 (masih di bawah Number.MAX_SAFE_INTEGER); float biasa memberi …0001
    expect(lineGross("99999,999", 10_000_000_000)).toBe(999_999_990_000_000);
    expect(lineGross("0,007", 100_000_000_001)).toBe(700_000_000);
  });
  it("angka tidak valid → null", () => {
    expect(lineGross("abc", 1000)).toBeNull();
    expect(itemGrams("1,2345", null)).toBeNull();
  });
  it("contoh uji DB: pak 2 × Rp5.500 + 3 kg × Rp10.000 − diskon Rp1.000 + ongkir Rp5.000 = Rp45.000, 4 kg", () => {
    const s = summarizeOrder(
      [
        { qty: "2", price: 5500, contentKg: "0.5", discountRp: 0 },
        { qty: "3", price: 10000, contentKg: null, discountRp: 1000 },
      ],
      5000,
    );
    expect(s).toMatchObject({ subtotalRp: 41000, discountRp: 1000, shippingRp: 5000, totalRp: 45000, grams: 4000, complete: true });
    expect(s.lines.map((l) => l.totalRp)).toEqual([11000, 29000]);
  });
  it("DEMO PRD §9.1: 5 kg tepung @Rp10.000 = tagihan Rp50.000", () => {
    expect(summarizeOrder([{ qty: "5", price: 10000, contentKg: null, discountRp: 0 }], 0).totalRp).toBe(50000);
  });
  it("harga belum ditetapkan atau diskon melebihi baris → ditandai, tidak dihitung lengkap", () => {
    const s = summarizeOrder(
      [
        { qty: "1", price: null, contentKg: null, discountRp: 0 },
        { qty: "1", price: 1000, contentKg: null, discountRp: 2000 },
      ],
      0,
    );
    expect(s.complete).toBe(false);
    expect(s.lines[0].missingPrice).toBe(true);
    expect(s.lines[1].discountTooHigh).toBe(true);
  });
});

describe("validasi pesanan (Security.md §5.2)", () => {
  const base = {
    businessDate: "2026-11-01",
    customerId: "3f1c2b8e-5d6a-4c1e-9f0a-1b2c3d4e5f60",
    channel: "whatsapp",
    note: "",
    shippingRp: "0",
    items: [{ productId: "8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d", packagingId: "", qty: "2", discountRp: "" }],
  };
  it("draft valid; kemasan kosong = kg curah; diskon kosong = 0", () => {
    const r = orderDraftSchema.parse(base);
    expect(r.items[0]).toEqual({ productId: base.items[0].productId, packagingId: null, qty: "2", discountRp: 0 });
  });
  it("menolak kunci asing (mis. total dari klien)", () => {
    expect(orderDraftSchema.safeParse({ ...base, totalRp: 1 }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ ...base, items: [{ ...base.items[0], price: 1 }] }).success).toBe(false);
  });
  it("menolak jumlah 0, negatif, atau > 3 desimal", () => {
    for (const qty of ["0", "-1", "1,2345", ""]) expect(orderDraftSchema.safeParse({ ...base, items: [{ ...base.items[0], qty }] }).success).toBe(false);
  });
  it("wajib minimal satu item, pelanggan & saluran", () => {
    expect(orderDraftSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ ...base, customerId: "" }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ ...base, channel: "" }).success).toBe(false);
  });
  it("menolak tanggal masa depan", () => {
    expect(orderDraftSchema.safeParse({ ...base, businessDate: "2999-01-01" }).success).toBe(false);
  });
  it("alasan batal 5–500 karakter", () => {
    expect(cancelOrderSchema.safeParse({ reason: "  ok " }).success).toBe(false);
    expect(cancelOrderSchema.safeParse({ reason: "Pelanggan membatalkan" }).success).toBe(true);
  });
  it("serah barang: penerima opsional, tanggal wajib & tidak di masa depan", () => {
    expect(fulfillOrderSchema.parse({ recipient: "", deliveredOn: "2026-11-01" })).toEqual({ recipient: undefined, deliveredOn: "2026-11-01" });
    expect(fulfillOrderSchema.safeParse({ recipient: "Bu Sari", deliveredOn: "2999-01-01" }).success).toBe(false);
  });
});
