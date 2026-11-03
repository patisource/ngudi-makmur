// Periode laporan & dashboard (StyleGuide §8.2): Hari ini · 7 hari · Bulan ini · Bulan lalu · Kustom.
// Semua tanggal bisnis WIB (CLAUDE.md aturan 8), format YYYY-MM-DD. Fungsi murni: "hari ini" bisa disuntikkan untuk uji.
import { todayWib } from "@/lib/validation/common";

export const PERIOD_PRESETS = [
  ["hari-ini", "Hari ini"],
  ["7-hari", "7 hari"],
  ["bulan-ini", "Bulan ini"],
  ["bulan-lalu", "Bulan lalu"],
] as const;
export type PeriodKey = (typeof PERIOD_PRESETS)[number][0] | "kustom";
export type Period = { key: PeriodKey; from: string; to: string; days: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1;

export function parsePeriod(sp: Record<string, string | string[] | undefined>, fallback: PeriodKey = "bulan-ini", today = todayWib()): Period {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const key = (s("periode") ?? fallback) as PeriodKey;
  const make = (k: PeriodKey, from: string, to: string): Period => ({ key: k, from, to, days: daysBetween(from, to) });
  const monthStart = `${today.slice(0, 8)}01`;
  switch (key) {
    case "hari-ini":
      return make(key, today, today);
    case "7-hari":
      return make(key, addDays(today, -6), today);
    case "bulan-lalu": {
      const prevEnd = addDays(monthStart, -1);
      return make(key, `${prevEnd.slice(0, 8)}01`, prevEnd);
    }
    case "kustom": {
      let from = DATE.test(s("dari") ?? "") ? (s("dari") as string) : monthStart;
      let to = DATE.test(s("sampai") ?? "") ? (s("sampai") as string) : today;
      if (to > today) to = today;
      if (from > to) [from, to] = [to, from];
      if (daysBetween(from, to) > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1)); // batas satu tahun per tampilan
      return make("kustom", from, to);
    }
    default:
      return make("bulan-ini", monthStart, today);
  }
}

/** Query string periode untuk tautan (mempertahankan rentang kustom). */
export function periodQuery(p: Period): string {
  return p.key === "kustom" ? `periode=kustom&dari=${p.from}&sampai=${p.to}` : `periode=${p.key}`;
}

const longFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const periodLabel = (p: Period) => (p.from === p.to ? longFmt.format(toDate(p.from)) : `${longFmt.format(toDate(p.from))} – ${longFmt.format(toDate(p.to))}`);
