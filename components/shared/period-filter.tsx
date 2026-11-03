import { SegLinks } from "@/components/ui/seg";
import { PERIOD_PRESETS, type Period } from "@/lib/period";

// Pemilih periode (StyleGuide §8.2): Hari ini · 7 hari · Bulan ini · Bulan lalu · Kustom, dengan thumb meluncur.
// Bekerja lewat URL (GET); tautan mempertahankan parameter lain lewat basePath. Rentang kustom diisi lewat form kecil.
export function PeriodFilter({ period, basePath }: { period: Period; basePath: string }) {
  const join = basePath.includes("?") ? "&" : "?";
  const items = [
    ...PERIOD_PRESETS.map(([key, label]) => ({ key, label, href: `${basePath}${join}periode=${key}`, active: period.key === key })),
    { key: "kustom", label: "Kustom", href: `${basePath}${join}periode=kustom&dari=${period.from}&sampai=${period.to}`, active: period.key === "kustom" },
  ];
  return <SegLinks items={items} label="Periode" />;
}

/** Form rentang tanggal; tampil hanya saat periode kustom aktif. */
export function CustomRange({ period, basePath }: { period: Period; basePath: string }) {
  if (period.key !== "kustom") return null;
  const [path, qs] = basePath.split("?");
  return (
    <form method="get" action={path} className="flex flex-wrap items-end gap-2">
      {[...new URLSearchParams(qs ?? "")].map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="periode" value="kustom" />
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Dari
        <input type="date" name="dari" defaultValue={period.from} className="h-10 rounded-md border border-border bg-surface px-2 text-sm text-text" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Sampai
        <input type="date" name="sampai" defaultValue={period.to} className="h-10 rounded-md border border-border bg-surface px-2 text-sm text-text" />
      </label>
      <button type="submit" className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
        Terapkan
      </button>
    </form>
  );
}
