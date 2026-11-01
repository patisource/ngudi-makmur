import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-w-0 flex-col gap-3.5 rounded-xl border border-border bg-surface p-5", className)} {...rest} />;
}

type Tone = "neutral" | "ok" | "warn" | "err" | "info";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-muted text-text-muted",
  ok: "bg-accent-soft text-accent",
  warn: "bg-warning-soft text-warning",
  err: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm py-0.5 pl-2 pr-2.5 text-xs font-medium", TONE[tone])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

// Judul halaman (StyleGuide §5.2): judul + keterangan singkat di kiri, aksi di kanan.
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-[72ch] text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
