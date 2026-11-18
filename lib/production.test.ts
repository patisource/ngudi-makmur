import { describe, expect, it } from "vitest";
import { costLineAmount, defaultBatchCosts, hppPerKg, summarizeBatch } from "@/lib/production";
import { todayWib } from "@/lib/validation/common";
import { productionDraftSchema } from "@/lib/validation/production";

describe("HPP batch (SRS §10, T5.5)", () => {
  it("DEMO: 60 kg PP @Rp4.000 + biaya Rp60.000 → 50 kg TP = Rp6.000/kg", () => {
    const s = summarizeBatch([60_000], [50_000], [60_000], 4_000);
    expect(s.materialRp).toBe(240_000);
    expect(s.totalRp).toBe(300_000);
    expect(s.hpp).toBe(6_000);
    expect(s.lossGrams).toBe(10_000);
    expect(s.lossPct).toBe(16.7);
  });
  it("output 0 → HPP kosong (data belum cukup), tanpa pembagian nol", () => {
    expect(hppPerKg(300_000, 0)).toBeNull();
    expect(summarizeBatch([60_000], [], [60_000], 4_000).hpp).toBeNull();
  });
  it("output melebihi input ditandai", () => {
    expect(summarizeBatch([10_000], [11_000], [], null).outputExceedsInput).toBe(true);
  });
  it("berat dijumlah dalam gram bulat (tanpa galat float)", () => {
    const s = summarizeBatch([100, 200], [300], [], null); // 0,1 kg + 0,2 kg = 0,3 kg tepat
    expect(s.lossGrams).toBe(0);
    expect(s.outputExceedsInput).toBe(false);
  });
});

describe("productionDraftSchema (Security.md §5.2)", () => {
  const base = { batchType: "penepungan", businessDate: todayWib(), residueKg: "0", inputs: ["60"], outputs: ["50"], costs: [] };
  it("menerima input sah dan mengubah kg ke string desimal", () => {
    const r = productionDraftSchema.parse({ ...base, residueKg: "4,5", costs: [{ category: "tenaga_kerja", amountRp: "60.000" }] });
    expect(r.residueKg).toBe("4.5");
    expect(r.costs[0]?.amountRp).toBe(60_000);
  });
  it("berat 0 dan biaya 0 ditolak", () => {
    expect(productionDraftSchema.safeParse({ ...base, inputs: ["0"] }).success).toBe(false);
    expect(productionDraftSchema.safeParse({ ...base, costs: [{ category: "lain", amountRp: "0" }] }).success).toBe(false);
  });
  it("kategori biaya & field hitungan server ditolak", () => {
    expect(productionDraftSchema.safeParse({ ...base, costs: [{ category: "kas", amountRp: "1" }] }).success).toBe(false);
    expect(productionDraftSchema.safeParse({ ...base, hpp_per_kg: 1 }).success).toBe(false);
  });
});

describe("biaya default HPP (keputusan 19 Nov 2026)", () => {
  const s = { kg_per_karung: 33, harga_bensin_liter: 10_000, karung_per_liter_pipil: 20, liter_per_100kg_giling: 1.5, upah_harian: 90_000, pekerja_pipil: 3, pekerja_giling: 2, biaya_tetap_bulanan: 75_000 };
  it("pemipilan 20 karung (660 kg): bensin 1 liter = Rp10.000, tenaga 3 × Rp90.000", () => {
    const c = defaultBatchCosts("pemipilan", 660_000, s);
    expect(c.find((x) => x.category === "listrik_bbm")).toMatchObject({ qty: 1, unit: "liter", unitPrice: 10_000, amountRp: 10_000 });
    expect(c.find((x) => x.category === "tenaga_kerja")).toMatchObject({ qty: 3, unit: "orang_hari", amountRp: 270_000 });
  });
  it("penepungan 100 kg pipilan: 1,5 liter = Rp15.000 (Rp150/kg), tenaga 2 × Rp90.000", () => {
    const c = defaultBatchCosts("penepungan", 100_000, s);
    expect(c.find((x) => x.category === "listrik_bbm")).toMatchObject({ qty: 1.5, amountRp: 15_000 });
    expect(c.find((x) => x.category === "tenaga_kerja")?.amountRp).toBe(180_000);
  });
  it("input 0 → tanpa BBM", () => {
    expect(defaultBatchCosts("penepungan", 0, s).some((x) => x.category === "listrik_bbm")).toBe(false);
  });
  it("nilai baris: rincian jumlah × harga bila lengkap, selain itu nilai langsung", () => {
    expect(costLineAmount(1_500, 10_000, 999)).toBe(15_000);
    expect(costLineAmount(null, null, 60_000)).toBe(60_000);
  });
  it("schema: rincian tanpa harga satuan ditolak; nilai langsung 0 ditolak", () => {
    const base = { batchType: "penepungan", businessDate: todayWib(), residueKg: "0", inputs: ["100"], outputs: ["88"] };
    expect(productionDraftSchema.safeParse({ ...base, costs: [{ category: "listrik_bbm", qty: "1,5", unit: "liter" }] }).success).toBe(false);
    expect(productionDraftSchema.safeParse({ ...base, costs: [{ category: "lain", amountRp: "0" }] }).success).toBe(false);
    expect(productionDraftSchema.safeParse({ ...base, costs: [{ category: "listrik_bbm", qty: "1,5", unit: "liter", unitPrice: "10000" }] }).success).toBe(true);
  });
});
