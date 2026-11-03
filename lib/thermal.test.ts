import { describe, expect, it } from "vitest";
import { center, escposBytes, lr, toAscii } from "./thermal";

describe("struk thermal (StyleGuide §8.4)", () => {
  it("baris kiri–kanan tepat selebar kolom 80 mm & 58 mm", () => {
    expect(lr("TOTAL", "Rp12.700.000", 48).text).toHaveLength(48);
    expect(lr("Pelanggan", "UD Tani Makmur Sejahtera Abadi", 32).text).toHaveLength(32);
    expect(lr("Sisa tagihan", "Rp7.700.000", 32).text.endsWith("Rp7.700.000")).toBe(true);
  });
  it("hanya ASCII", () => {
    expect(toAscii("Tepung · 2 × Rp5.000 → lunas “ok” …")).toBe('Tepung - 2 x Rp5.000 > lunas "ok" ...');
  });
  it("byte ESC/POS: init, code page, rata/tebal/ganda per baris, feed & potong", () => {
    const b = Array.from(escposBytes([center("NGUDI MAKMUR", { bold: true, big: true }), { text: "A" }]));
    expect(b.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x00]);
    expect(b.slice(5, 14)).toEqual([0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11]);
    expect(String.fromCharCode(...b.slice(14, 26))).toBe("NGUDI MAKMUR");
    expect(b[26]).toBe(0x0a);
    expect(b.slice(27, 36)).toEqual([0x1b, 0x61, 0, 0x1b, 0x45, 0, 0x1d, 0x21, 0x00]);
    expect(b.slice(-7)).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 66, 0]);
  });
});
