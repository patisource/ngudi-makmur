import { describe, expect, it } from "vitest";
import { bucketDays, parsePeriod, periodShort, periodTitle, previousPeriod } from "./period";

const today = "2026-11-03";

describe("periode pembanding (FR-DASH-07)", () => {
  it("bulan lalu → bulan sebelumnya penuh", () => {
    const p = parsePeriod({ periode: "bulan-lalu" }, "bulan-ini", today);
    expect(p).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(previousPeriod(p)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodTitle(p)).toBe("Oktober 2026");
    expect(periodShort(previousPeriod(p))).toBe("Sep 2026");
  });
  it("bulan ini (berjalan) → tanggal yang sama bulan lalu", () => {
    expect(previousPeriod(parsePeriod({}, "bulan-ini", today))).toEqual({ from: "2026-10-01", to: "2026-10-03" });
    expect(previousPeriod(parsePeriod({}, "bulan-ini", "2026-03-31"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("7 hari → 7 hari sebelumnya", () => {
    expect(previousPeriod(parsePeriod({ periode: "7-hari" }, "bulan-ini", today))).toEqual({ from: "2026-10-21", to: "2026-10-27" });
  });
  it("hari ini → kemarin", () => {
    expect(previousPeriod(parsePeriod({ periode: "hari-ini" }, "bulan-ini", today))).toEqual({ from: "2026-11-02", to: "2026-11-02" });
  });
});

describe("pengelompokan seri", () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, v: 1 }));
  const sum = (rows: Array<{ v: number }>) => ({ a: rows.reduce((s, r) => s + r.v, 0), b: 0 });
  it("≤ 14 hari tetap per hari", () => {
    expect(bucketDays(days(7), sum)).toHaveLength(7);
  });
  it("31 hari → 5 kelompok mingguan", () => {
    const b = bucketDays(days(31), sum);
    expect(b.map((x) => x.label)).toEqual(["1–7 Okt", "8–14 Okt", "15–21 Okt", "22–28 Okt", "29–31 Okt"]);
    expect(b.map((x) => x.a)).toEqual([7, 7, 7, 7, 3]);
  });
});
