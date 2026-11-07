import { describe, expect, it } from "vitest";
import { formatIrtQty, linePcs, parseWhole, pcsWithPack, unitPrice } from "./irt";

describe("pcs & pack IRT", () => {
  it("menampilkan stok pcs beserta pecahan pack", () => {
    expect(pcsWithPack(125, 10)).toBe("125 pcs (12 pack + 5 pcs)");
    expect(pcsWithPack(120, 10)).toBe("120 pcs (12 pack)");
    expect(pcsWithPack(7, 10)).toBe("7 pcs");
    expect(pcsWithPack(30, null)).toBe("30 pcs");
    expect(pcsWithPack(1250, 20)).toBe("1.250 pcs (62 pack + 10 pcs)");
  });
  it("menghitung pcs keluar per baris jual", () => {
    expect(linePcs("pack", 2, 10)).toBe(20);
    expect(linePcs("pcs", 3, 10)).toBe(3);
    expect(linePcs("pack", 1, null)).toBeNull();
    expect(linePcs("pcs", 1.5, null)).toBeNull();
    expect(linePcs("pcs", 0, null)).toBeNull();
  });
  it("harga satuan sama dengan server (pack: harga pack, atau isi × harga pcs)", () => {
    expect(unitPrice("pack", { packSize: 10, pricePcs: 1500, pricePack: 14000 })).toBe(14000);
    expect(unitPrice("pack", { packSize: 10, pricePcs: 1500, pricePack: null })).toBe(15000);
    expect(unitPrice("pcs", { packSize: 10, pricePcs: 1500, pricePack: 14000 })).toBe(1500);
    expect(unitPrice("pack", { packSize: null, pricePcs: 2000, pricePack: null })).toBeNull();
    expect(unitPrice("pcs", { packSize: null, pricePcs: null, pricePack: null })).toBeNull();
  });
  it("jumlah jual hanya bilangan bulat positif", () => {
    expect(parseWhole("3")).toBe(3);
    expect(parseWhole(" 12 ")).toBe(12);
    expect(parseWhole("1,5")).toBeNull();
    expect(parseWhole("0")).toBeNull();
    expect(parseWhole("")).toBeNull();
    expect(parseWhole("-2")).toBeNull();
  });
  it("format jumlah dengan satuan Indonesia", () => {
    expect(formatIrtQty(2.5, "kg")).toBe("2,5 kg");
    expect(formatIrtQty(10, "butir")).toBe("10 butir");
  });
});
