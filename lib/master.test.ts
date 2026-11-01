import { describe, expect, it } from "vitest";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { formatKg, gramsToKgString, packagingToGrams, parseKgToGrams } from "@/lib/qty";
import { customerSchema, memberSchema, productPackagingSchema, productUpdateSchema } from "@/lib/validation/master";

describe("kg tanpa float", () => {
  it("parse format Indonesia & titik", () => {
    expect(parseKgToGrams("1,5")).toBe(1500);
    expect(parseKgToGrams("0.001")).toBe(1);
    expect(parseKgToGrams("2")).toBe(2000);
    expect(parseKgToGrams("1,2345")).toBeNull(); // > 3 desimal
    expect(parseKgToGrams("-1")).toBeNull();
    expect(parseKgToGrams("abc")).toBeNull();
  });
  it("0,1 + 0,2 = 0,3 kg tepat (tidak 0,30000000000000004)", () => {
    expect(gramsToKgString(parseKgToGrams("0,1")! + parseKgToGrams("0,2")!)).toBe("0.3");
  });
  it("T2.3: 2 kemasan @0,5 kg = 1 kg", () => {
    expect(packagingToGrams(2, "0.5")).toBe(1000);
    expect(packagingToGrams("1,5", "50")).toBe(75_000);
    expect(formatKg(1000)).toBe("1 kg");
  });
});

describe("rupiah integer", () => {
  it("parse & format", () => {
    expect(parseRupiah("Rp 10.000")).toBe(10000);
    expect(parseRupiah("10000")).toBe(10000);
    expect(parseRupiah("10.000,50")).toBeNull();
    expect(parseRupiah("-5")).toBeNull();
    expect(formatRupiah(10000).replace(/\s/g, "")).toBe("Rp10.000");
  });
});

describe("validasi master (Security.md §5.2)", () => {
  it("T2.3: konversi kemasan 0 kg ditolak, 0,5 kg diterima", () => {
    const base = { productId: crypto.randomUUID(), packagingId: crypto.randomUUID(), defaultPrice: "" };
    expect(productPackagingSchema.safeParse({ ...base, contentKg: "0" }).success).toBe(false);
    const ok = productPackagingSchema.safeParse({ ...base, contentKg: "0,5" });
    expect(ok.success && ok.data.contentKg).toBe("0.5");
  });
  it("anggota: NIK 16 digit & HP Indonesia; field asing ditolak (.strict)", () => {
    expect(memberSchema.safeParse({ name: "Petani A", nik: "3318011234560001", phone: "0812-3456-0001" }).success).toBe(true);
    expect(memberSchema.safeParse({ name: "Petani A", nik: "123" }).success).toBe(false);
    expect(memberSchema.safeParse({ name: "Petani A", phone: "021555" }).success).toBe(false);
    expect(memberSchema.safeParse({ name: "Petani A", code: "A-999" }).success).toBe(false);
    expect(memberSchema.safeParse({ name: "   " }).success).toBe(false);
  });
  it("anggota: tanggal bergabung di masa depan ditolak", () => {
    expect(memberSchema.safeParse({ name: "Petani A", joinedOn: "2999-01-01" }).success).toBe(false);
  });
  it("produk: harga kosong = belum ditetapkan, stok minimum tidak negatif", () => {
    const r = productUpdateSchema.safeParse({ name: "Tepung jagung", defaultPricePerKg: "", minStockKg: "30" });
    expect(r.success && r.data.defaultPricePerKg).toBeNull();
    expect(productUpdateSchema.safeParse({ name: "Tepung jagung", defaultPricePerKg: "10.000", minStockKg: "-1" }).success).toBe(false);
  });
  it("pelanggan: jenis wajib perorangan/usaha", () => {
    expect(customerSchema.safeParse({ name: "IRT Sekar Arum", type: "usaha" }).success).toBe(true);
    expect(customerSchema.safeParse({ name: "IRT Sekar Arum", type: "toko" }).success).toBe(false);
  });
});
