import { describe, expect, it } from "vitest";
import { hppPerKg, summarizeBatch } from "@/lib/production";
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
