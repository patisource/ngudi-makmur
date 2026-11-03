import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { daysBetween, parsePeriod, periodQuery } from "./period";

describe("periode (WIB)", () => {
  const today = "2026-11-03";
  it("preset hari ini, 7 hari, bulan ini, bulan lalu", () => {
    expect(parsePeriod({ periode: "hari-ini" }, "bulan-ini", today)).toMatchObject({ from: today, to: today, days: 1 });
    expect(parsePeriod({ periode: "7-hari" }, "bulan-ini", today)).toMatchObject({ from: "2026-10-28", to: today, days: 7 });
    expect(parsePeriod({}, "bulan-ini", today)).toMatchObject({ key: "bulan-ini", from: "2026-11-01", to: today });
    expect(parsePeriod({ periode: "bulan-lalu" }, "bulan-ini", today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31 });
  });
  it("bulan lalu dari Januari = Desember tahun sebelumnya", () => {
    expect(parsePeriod({ periode: "bulan-lalu" }, "bulan-ini", "2027-01-15")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("kustom: dibalik bila terbalik, tidak melewati hari ini, maks 366 hari, tanggal rusak diabaikan", () => {
    expect(parsePeriod({ periode: "kustom", dari: "2026-11-02", sampai: "2026-10-01" }, "bulan-ini", today)).toMatchObject({ from: "2026-10-01", to: "2026-11-02" });
    expect(parsePeriod({ periode: "kustom", dari: "2026-10-01", sampai: "2099-01-01" }, "bulan-ini", today).to).toBe(today);
    expect(parsePeriod({ periode: "kustom", dari: "2020-01-01", sampai: today }, "bulan-ini", today).days).toBe(366);
    expect(parsePeriod({ periode: "kustom", dari: "x'; drop", sampai: today }, "bulan-ini", today).from).toBe("2026-11-01");
  });
  it("query string mempertahankan rentang kustom", () => {
    expect(periodQuery(parsePeriod({ periode: "kustom", dari: "2026-10-01", sampai: "2026-10-31" }, "bulan-ini", today))).toBe("periode=kustom&dari=2026-10-01&sampai=2026-10-31");
    expect(daysBetween("2026-02-01", "2026-02-28")).toBe(28);
  });
});

describe("CSV (FR-RPT-05)", () => {
  it("BOM UTF-8, pemisah titik koma, baris CRLF", () => {
    const csv = toCsv([{ key: "a", label: "Produk", type: "text" }, { key: "b", label: "Berat (kg)", type: "kg" }], [{ a: "Tepung", b: 1.5 }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Produk;Berat (kg)\r\nTepung;1,5\r\n");
  });
  it("rupiah bulat tanpa format; kg desimal koma maks 3 digit", () => {
    expect(csvCell("rp", 50000)).toBe("50000");
    expect(csvCell("kg", 0.3333)).toBe("0,333");
    expect(csvCell("kg", -5)).toBe("-5");
  });
  it("teks dengan ; \" atau baris baru dikutip", () => {
    expect(csvCell("text", 'IRT "Sekar"; Arum')).toBe('"IRT ""Sekar""; Arum"');
  });
  it("mencegah injeksi formula Excel pada teks", () => {
    expect(csvCell("text", "=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("text", "-batal")).toBe("'-batal");
    expect(csvCell("rp", -10000)).toBe("-10000"); // angka negatif (retur) tetap angka
  });
  it("kosong → sel kosong", () => {
    expect(csvCell("rp", null)).toBe("");
  });
});
