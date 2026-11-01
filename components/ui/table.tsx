import Link from "next/link";
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Tabel data dasar (StyleGuide §5.2): teks rata kiri, angka rata kanan (num), kepala tabel abu-abu tipis.
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">{children}</table>
      </div>
    </div>
  );
}

export function Th({ num, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <th className={cn("bg-surface-muted px-3.5 py-2.5 text-xs font-medium whitespace-nowrap text-text-muted first:pl-5 last:pr-5", num ? "text-right" : "text-left", className)} {...rest} />;
}

export function Td({ num, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <td className={cn("border-t border-border px-3.5 py-3 align-top first:pl-5 last:pr-5", num && "text-right whitespace-nowrap", className)} {...rest} />;
}

export function Sub({ children }: { children: ReactNode }) {
  return <span className="mt-0.5 block text-xs text-text-subtle">{children}</span>;
}

/** State kosong (StyleGuide §5.2): pesan + aksi berikutnya, bukan sekadar "tidak ada data". */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-border-strong bg-surface px-5 py-8">
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-text-muted">{children}</div>}
    </div>
  );
}

/** Cari + filter status lewat GET (bekerja tanpa JavaScript; nilai tersimpan di URL). */
export function SearchBar({ q, status, placeholder, statuses }: { q?: string; status?: string; placeholder: string; statuses: Array<[string, string]> }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 min-w-0 flex-[1_1_240px] rounded-md border border-border bg-surface px-3 text-sm outline-none placeholder:text-text-subtle focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:max-w-sm"
      />
      <select name="status" defaultValue={status} aria-label="Status" className="h-10 rounded-md border border-border bg-surface px-3 text-sm">
        {statuses.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <button type="submit" className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
        Terapkan
      </button>
    </form>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-xs text-text-subtle">{total} data</p>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-text-muted">
        {from}–{to} dari {total}
      </span>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Link className="rounded-md border border-border bg-surface px-3 py-1.5 hover:bg-surface-muted" href={href(page - 1)}>
            Sebelumnya
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="rounded-md border border-border bg-surface px-3 py-1.5 hover:bg-surface-muted" href={href(page + 1)}>
            Berikutnya
          </Link>
        ) : null}
      </div>
    </div>
  );
}
