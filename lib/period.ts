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

// ---------------------------------------------------------------- pembanding & pengelompokan (dashboard)
const lastDayOfMonth = (s: string) => {
  const d = toDate(`${s.slice(0, 8)}01`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return fmt(d);
};
const isFullMonth = (p: { from: string; to: string }) => p.from.endsWith("-01") && p.to === lastDayOfMonth(p.from);

/**
 * Periode pembanding nyata (FR-DASH-07): bulan penuh → bulan sebelumnya; "bulan ini" (berjalan) → tanggal yang sama
 * di bulan sebelumnya; selain itu rentang sama panjang tepat sebelum periode.
 */
export function previousPeriod(p: Period): { from: string; to: string } {
  if (isFullMonth(p)) {
    const end = addDays(p.from, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  if (p.key === "bulan-ini") {
    const prevStart = `${addDays(p.from, -1).slice(0, 8)}01`;
    const day = Number(p.to.slice(8, 10));
    const last = lastDayOfMonth(prevStart);
    const to = `${prevStart.slice(0, 8)}${String(Math.min(day, Number(last.slice(8, 10)))).padStart(2, "0")}`;
    return { from: prevStart, to };
  }
  return { from: addDays(p.from, -p.days), to: addDays(p.from, -1) };
}

const monthLong = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Oktober 2026" untuk bulan penuh, selain itu rentang tanggal. */
export const periodTitle = (p: { from: string; to: string }) => (isFullMonth(p) ? monthLong.format(toDate(p.from)) : periodLabel({ ...p, key: "kustom", days: 0 }));
/** "Sep 2026" untuk bulan penuh, selain itu rentang tanggal ringkas. */
export const periodShort = (p: { from: string; to: string }) =>
  isFullMonth(p)
    ? monthShort.format(toDate(p.from))
    : p.from === p.to
      ? dayMonth.format(toDate(p.from))
      : `${dayMonth.format(toDate(p.from))} – ${dayMonth.format(toDate(p.to))}`;

/**
 * Kelompokkan seri harian: ≤ 14 hari → per hari; selain itu per 7 hari dari awal periode ("1–7 Okt", …, "29–31 Okt").
 */
export function bucketDays<T extends { day: string }>(rows: T[], sum: (acc: T[]) => { a: number; b: number }) {
  if (rows.length <= 14) return rows.map((r) => ({ key: r.day, label: dayMonth.format(toDate(r.day)), ...sum([r]) }));
  const out: Array<{ key: string; label: string; a: number; b: number }> = [];
  for (let i = 0; i < rows.length; i += 7) {
    const part = rows.slice(i, i + 7);
    const a = toDate(part[0].day);
    const z = toDate(part[part.length - 1].day);
    const sameMonth = a.getUTCMonth() === z.getUTCMonth();
    const label = sameMonth ? `${a.getUTCDate()}–${dayMonth.format(z)}` : `${dayMonth.format(a)} – ${dayMonth.format(z)}`;
    out.push({ key: part[0].day, label: part.length === 1 ? dayMonth.format(a) : label, ...sum(part) });
  }
  return out;
}
