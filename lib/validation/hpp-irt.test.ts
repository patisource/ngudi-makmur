import { describe, expect, it } from "vitest";
import { todayWib } from "@/lib/validation/common";
import { hppSettingsSchema } from "@/lib/validation/hpp";
import { irtBatchSchema, irtItemCostsSchema, irtRecipeSchema } from "@/lib/validation/irt";

const id = "3f1c2b8e-5d6a-4c1e-9f0a-1b2c3d4e5f60";

describe("schema parameter HPP kelompok", () => {
  const base = {
    kg_per_karung: "33",
    harga_tongkol_kg: "7.650",
    rendemen_pipil_pct: "65",
    rendemen_tepung_pct: "88",
    harga_bensin_liter: "10000",
    karung_per_liter_pipil: "20",
    liter_per_100kg_giling: "1,5",
    upah_harian: "90.000",
    pekerja_pipil: "3",
    pekerja_giling: "2",
    biaya_tetap_bulanan: "75000",
  };
  it("nilai default keputusan pengguna lolos (koma desimal & titik ribuan)", () => {
    const r = hppSettingsSchema.parse(base);
    expect(r.liter_per_100kg_giling).toBe(1.5);
    expect(r.harga_tongkol_kg).toBe(7650);
    expect(r.upah_harian).toBe(90000);
  });
  it("rendemen > 100% dan teks ditolak", () => {
    expect(hppSettingsSchema.safeParse({ ...base, rendemen_pipil_pct: "120" }).success).toBe(false);
    expect(hppSettingsSchema.safeParse({ ...base, harga_bensin_liter: "abc" }).success).toBe(false);
    expect(hppSettingsSchema.safeParse({ ...base, kg_per_karung: "d" }).success).toBe(false);
  });
});

describe("schema HPP IRT", () => {
  it("resep mie: hasil 2,77 pcs, gas Rp1.000, garam 0,002 kg", () => {
    const r = irtRecipeSchema.parse({ productId: id, yieldPcs: "2,77", gasRp: "1000", lines: [{ itemId: id, qty: "0,002" }] });
    expect(r.yieldPcs).toBe(2.77);
  });
  it("hasil per resep 0 atau 3 desimal ditolak", () => {
    expect(irtRecipeSchema.safeParse({ productId: id, yieldPcs: "0", gasRp: "0", lines: [{ itemId: id, qty: "1" }] }).success).toBe(false);
    expect(irtRecipeSchema.safeParse({ productId: id, yieldPcs: "2,777", gasRp: "0", lines: [{ itemId: id, qty: "1" }] }).success).toBe(false);
  });
  it("biaya per pcs & target markup", () => {
    expect(irtItemCostsSchema.parse({ stdPrice: "", packagingCostPcs: "800", laborCostPcs: "1.625", targetMarkupPct: "50" })).toEqual({
      stdPrice: null,
      packagingCostPcs: 800,
      laborCostPcs: 1625,
      targetMarkupPct: 50,
    });
  });
  it("batch dengan resep wajib jumlah resep", () => {
    const base = { businessDate: todayWib(), inputs: [{ itemId: id, qty: "0,2" }], outputs: [{ itemId: id, qty: "5" }] };
    const costs = { recipeId: id, gasRp: "", laborRp: "", packagingRp: "", otherRp: "" };
    expect(irtBatchSchema.safeParse({ ...base, costs }).success).toBe(false);
    expect(irtBatchSchema.safeParse({ ...base, costs: { ...costs, recipeCount: "2" } }).success).toBe(true);
  });
});
