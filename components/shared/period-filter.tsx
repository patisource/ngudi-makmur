import Link from "next/link";
import { cn } from "@/lib/cn";
import { PERIOD_PRESETS, periodLabel, type Period } from "@/lib/period";

// Pemilih periode (StyleGuide §8.2): Hari ini · 7 hari · Bulan ini · Bulan lalu · Kustom. Bekerja lewat URL (GET),
// tanpa JavaScript; tautan mempertahankan parameter lain (mis. jenis laporan) lewat basePath.
export function PeriodFilter({ period, basePath }: { period: Period; basePath: string }) {
  const join = basePath.includes("?") ? "&" : "?";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <nav aria-label="Periode" className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-1">
        {PERIOD_PRESETS.map(([key, label]) => (
          <Link
            key={key}
            href={`${basePath}${join}periode=${key}`}
            aria-current={period.key === key ? "true" : undefined}
            className={cn(
              "whitespace-nowrap rounded-sm px-3 py-1.5 text-label transition-colors duration-150",
              period.key === key ? "bg-surface font-medium text-text shadow-[0_0_0_1px_var(--border)]" : "text-text-muted hover:text-text",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form method="get" action={basePath.split("?")[0]} className="flex flex-wrap items-end gap-2">
        {[...new URLSearchParams(basePath.split("?")[1] ?? "")].map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="periode" value="kustom" />
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Dari
          <input type="date" name="dari" defaultValue={period.from} className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-text" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Sampai
          <input type="date" name="sampai" defaultValue={period.to} className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-text" />
        </label>
        <button type="submit" className={cn("h-9 rounded-md border px-3 text-sm font-medium hover:bg-surface-muted", period.key === "kustom" ? "border-border-strong bg-surface" : "border-border bg-surface")}>
          Kustom
        </button>
      </form>
      <span className="text-sm text-text-muted">{periodLabel(period)}</span>
    </div>
  );
}
