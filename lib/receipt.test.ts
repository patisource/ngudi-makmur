import { describe, expect, it } from "vitest";
import { hasExif, proofPath, sniffMime } from "@/lib/files";
import { lr, toAscii, wrap } from "@/lib/thermal";
import { proofPathSchema, receiptSchema, voidReasonSchema } from "@/lib/validation/receipt";
import { todayWib } from "@/lib/validation/common";

const MEMBER = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const PRODUCT = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const base = { businessDate: todayWib(), sourceType: "anggota", memberId: MEMBER, productId: PRODUCT, weightKg: "100", acquisitionCost: "400.000" };

describe("receiptSchema (FR-RCV-01, Security.md §5.2)", () => {
  it("menerima input sah: berat → string kg, biaya → integer rupiah", () => {
    const r = receiptSchema.parse({ ...base, weightKg: "1000,5",moisturePct: "14,5" });
    expect(r.weightKg).toBe("1000.5");
    expect(r.acquisitionCost).toBe(400000);
    expect(r.moisturePct).toBe("14.5");
  });
  it("berat 0 atau negatif ditolak", () => {
    expect(receiptSchema.safeParse({ ...base, weightKg: "0" }).success).toBe(false);
    expect(receiptSchema.safeParse({ ...base, weightKg: "-5" }).success).toBe(false);
  });
  it("sumber anggota wajib anggota; sumber luar wajib nama pemasok", () => {
    expect(receiptSchema.safeParse({ ...base, memberId: "" }).success).toBe(false);
    expect(receiptSchema.safeParse({ ...base, sourceType: "luar", memberId: "" }).success).toBe(false);
    const luar = receiptSchema.parse({ ...base, sourceType: "luar", supplierName: "UD Tani Jaya" });
    expect(luar.memberId).toBeUndefined(); // identitas anggota dibuang untuk sumber luar
  });
  it("tanggal besok ditolak", () => {
    const d = new Date(`${todayWib()}T12:00:00+07:00`);
    d.setDate(d.getDate() + 1);
    expect(receiptSchema.safeParse({ ...base, businessDate: d.toISOString().slice(0, 10) }).success).toBe(false);
  });
  it("field hitungan server (status, doc_number) ditolak — .strict()", () => {
    expect(receiptSchema.safeParse({ ...base, status: "confirmed" }).success).toBe(false);
    expect(receiptSchema.safeParse({ ...base, doc_number: "RCV-1" }).success).toBe(false);
  });
  it("kadar air > 100% ditolak", () => {
    expect(receiptSchema.safeParse({ ...base, moisturePct: "101" }).success).toBe(false);
  });
  it("alasan void minimal 5 karakter", () => {
    expect(voidReasonSchema.safeParse("ok").success).toBe(false);
    expect(voidReasonSchema.safeParse("Salah timbang").success).toBe(true);
  });
});

describe("file bukti (Security.md §8)", () => {
  const jpeg = (segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2]);
  const app = (marker: number, payload: string) => [0xff, marker, 0, payload.length + 2, ...payload.split("").map((c) => c.charCodeAt(0))];

  it("tipe dikenali dari magic bytes, bukan nama file", () => {
    expect(sniffMime(jpeg([]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("JPEG dengan blok EXIF terdeteksi; tanpa EXIF lolos", () => {
    expect(hasExif(jpeg([app(0xe0, "JFIF\0"), app(0xe1, "Exif\0\0")]), "image/jpeg")).toBe(true);
    expect(hasExif(jpeg([app(0xe0, "JFIF\0")]), "image/jpeg")).toBe(false);
  });
  it("PNG dengan chunk eXIf terdeteksi", () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const chunk = (type: string, len = 0) => [0, 0, 0, len, ...type.split("").map((c) => c.charCodeAt(0)), ...new Array(len + 4).fill(0)];
    expect(hasExif(new Uint8Array([...sig, ...chunk("IHDR", 13), ...chunk("eXIf", 2), ...chunk("IEND")]), "image/png")).toBe(true);
    expect(hasExif(new Uint8Array([...sig, ...chunk("IHDR", 13), ...chunk("IEND")]), "image/png")).toBe(false);
  });
  it("path bukti memakai uuid, bukan nama file asli", () => {
    const p = proofPath("receipts", "2026-11-01", "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", "image/jpeg");
    expect(p).toBe("receipts/2026/11/6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b.jpg");
    expect(proofPathSchema.safeParse(p).success).toBe(true);
    expect(proofPathSchema.safeParse("receipts/2026/11/foto petani.jpg").success).toBe(false);
    expect(proofPathSchema.safeParse("../receipts/2026/11/6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b.jpg").success).toBe(false);
  });
});

describe("struk thermal (StyleGuide §8.4)", () => {
  it("hanya ASCII: simbol & huruf beraksen ditransliterasi", () => {
    expect(toAscii("Pak 0,5 kg · 2 × Rp5.000 → café “ok”…")).toBe('Pak 0,5 kg - 2 x Rp5.000 > cafe "ok"...');
    expect(toAscii("🌽")).toBe("?");
  });
  it("baris kiri–kanan tepat selebar kolom; nilai panjang dipotong dengan titik", () => {
    expect(lr("Berat", "100 kg", 48).text).toHaveLength(48);
    expect(lr("Berat", "100 kg", 48).text.endsWith("100 kg")).toBe(true);
    expect(lr("Sumber", "x".repeat(60), 32).text).toHaveLength(32);
    expect(lr("Sumber", "x".repeat(60), 32).text.endsWith(".")).toBe(true);
  });
  it("teks panjang dipecah per kata tanpa melebihi kolom", () => {
    const lines = wrap("Jagung pipilan dari petani dusun Kedungwinong kadar air agak tinggi dijemur dulu", 32);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.text.length <= 32)).toBe(true);
  });
});