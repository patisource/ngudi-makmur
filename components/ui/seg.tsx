"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Segmented control (StyleGuide §6.3): satu thumb meluncur; posisi & ukuran diukur dari item aktif setiap render
// dan saat resize. Transisi baru dinyalakan setelah frame pertama (data-ready) agar tidak meluncur dari 0 saat mount.
function useThumb(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      const th = el?.querySelector<HTMLElement>(".seg-thumb");
      if (!el || !th) return;
      const on = el.querySelector<HTMLElement>("[aria-pressed='true'], [aria-current='true']");
      th.style.opacity = on ? "1" : "0";
      if (!on) return;
      el.style.setProperty("--tx", `${on.offsetLeft}px`);
      el.style.setProperty("--ty", `${on.offsetTop}px`);
      el.style.setProperty("--tw", `${on.offsetWidth}px`);
      el.style.setProperty("--th", `${on.offsetHeight}px`);
      if (!th.dataset.ready) requestAnimationFrame(() => (th.dataset.ready = ""));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [dep]);
  return ref;
}

const wrap = "relative flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface-muted p-1";
const thumb = "seg-thumb pointer-events-none absolute left-0 top-0 rounded-md bg-surface shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(17_17_19/0.05)]";
const item = (on: boolean, full?: boolean) =>
  cn(
    "relative z-1 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm transition-colors duration-150",
    on ? "font-medium text-text" : "text-text-muted hover:text-text",
    full && "flex-1 py-2",
  );

/** Pilihan di dalam form (state klien). */
export function Seg<T extends string>({ value, onChange, options, label, full }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, ReactNode]>; label: string; full?: boolean }) {
  const ref = useThumb(value);
  return (
    <div ref={ref} role="group" aria-label={label} className={cn(wrap, full && "w-full")}>
      <i aria-hidden className={thumb} />
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={item(value === v, full)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Pilihan berupa tautan (filter lewat URL, mis. periode). */
export function SegLinks({ items, label }: { items: ReadonlyArray<{ key: string; label: ReactNode; href: string; active: boolean }>; label: string }) {
  const active = items.find((i) => i.active)?.key;
  const ref = useThumb(active);
  return (
    <nav ref={ref} aria-label={label} className={wrap}>
      <i aria-hidden className={thumb} />
      {items.map((i) => (
        <Link key={i.key} href={i.href} scroll={false} aria-current={i.active ? "true" : undefined} className={item(i.active)}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
