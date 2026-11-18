import { describe, expect, it } from "vitest";
import { marginPct, markupPct, packagingUnitCost, suggestedPrice } from "@/lib/hpp";

describe("laba, margin, markup (laporan HPP)", () => {
  it("mie jagung: HPP Rp4.000 dijual Rp6.000 → markup 50%, margin 33,3%", () => {
    expect(markupPct(6000, 4000)).toBe(50);
    expect(marginPct(6000, 4000)).toBe(33.3);
  });
  it("tepung 1 kg: biaya Rp11.500 dijual Rp20.000 → margin 42,5%, markup 73,9%", () => {
    expect(marginPct(20000, 11500)).toBe(42.5);
    expect(markupPct(20000, 11500)).toBe(73.9);
  });
  it("harga saran = HPP × (1 + markup), dibulatkan ke atas Rp100", () => {
    expect(suggestedPrice(4326, 50)).toBe(6500);
    expect(suggestedPrice(4000, 50)).toBe(6000);
    expect(suggestedPrice(null, 50)).toBeNull();
  });
  it("HPP per kemasan = HPP/kg × isi + biaya kemasan (tepung 1 kg: Rp11.500 + Rp1.200)", () => {
    expect(packagingUnitCost(11500, 1000, 1200)).toBe(12700);
    expect(packagingUnitCost(10000, 5000, 1500)).toBe(51500);
    expect(packagingUnitCost(null, 1000, 1200)).toBeNull();
  });
  it("harga atau HPP kosong/0 → tanpa persen (tanpa pembagian nol)", () => {
    expect(marginPct(0, 100)).toBeNull();
    expect(markupPct(100, 0)).toBeNull();
  });
});
