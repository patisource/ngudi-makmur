"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type ComboOption = { value: string; label: string; hint?: string };

// Combobox (T0.5, pola ARIA 1.2 "combobox + listbox"): ketik untuk menyaring, ↑/↓ memilih, Enter menetapkan,
// Esc menutup. Dipakai untuk daftar yang bisa panjang (pelanggan). Nilai hanya bisa salah satu opsi; teks bebas
// tidak pernah dikirim sebagai nilai.
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Ketik untuk mencari",
  emptyText = "Tidak ada yang cocok",
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  emptyText?: string;
  invalid?: boolean;
  className?: string;
}) {
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState<string | null>(null); // null = tidak sedang mengetik → tampilkan label terpilih
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, query]);

  const show = (start?: number) => {
    setOpen(true);
    const i = start ?? Math.max(0, filtered.findIndex((o) => o.value === value));
    setActive(i);
  };
  const pick = (o: ComboOption) => {
    onChange(o.value);
    setQuery(null);
    setOpen(false);
  };
  const move = (delta: number) => {
    if (!open) return show();
    const n = filtered.length;
    if (n === 0) return;
    const next = (active + delta + n) % n;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        value={query ?? selected?.label ?? ""}
        placeholder={selected ? selected.label : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onClick={() => !open && show()}
        onBlur={() => {
          setOpen(false);
          setQuery(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter") {
            if (open && filtered[active]) {
              e.preventDefault();
              pick(filtered[active]);
            }
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation(); // jangan ikut menutup dialog
            setOpen(false);
            setQuery(null);
          }
        }}
        className="h-11 w-full rounded-md border border-border bg-surface pl-3 pr-9 text-base outline-none placeholder:text-text-subtle focus:border-border-strong focus:ring-4 focus:ring-info-soft aria-invalid:border-danger sm:h-10 sm:text-sm"
      />
      <ChevronDown aria-hidden size={16} strokeWidth={1.75} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className="pop-in absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-pop">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">{emptyText}</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                // mousedown (bukan click) agar terpilih sebelum input kehilangan fokus
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseMove={() => setActive(i)}
                className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm", i === active && "bg-surface-muted")}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-text-muted">{o.hint}</span>}
                {o.value === value && <Check aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-accent" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
