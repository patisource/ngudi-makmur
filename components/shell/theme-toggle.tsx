"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { THEME_KEY, type ThemeChoice } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: LucideIcon }> = [
  { value: "light", label: "Mode terang", Icon: Sun },
  { value: "dark", label: "Mode gelap", Icon: Moon },
  { value: "system", label: "Ikuti sistem", Icon: Monitor },
];

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* penyimpanan diblokir: pilihan tetap berlaku sampai halaman ditutup */
  }
  window.dispatchEvent(new Event("theme-change"));
}

// Sumber kebenaran = atribut data-theme di <html> (dipasang THEME_BOOT sebelum React); server selalu "system".
const subscribe = (cb: () => void) => {
  window.addEventListener("theme-change", cb);
  return () => window.removeEventListener("theme-change", cb);
};
const current = (): ThemeChoice => {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
};

/** Pengalih tema yang selalu terlihat (topbar & halaman login): Terang · Gelap · Sistem. */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, current, () => "system" as ThemeChoice);

  return (
    <div role="group" aria-label="Tema tampilan" className={cn("flex h-10 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-1", className)}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={choice === value}
          title={label}
          onClick={() => apply(value)}
          className={cn(
            "grid size-8 place-items-center rounded-md transition-colors",
            choice === value ? "bg-surface-muted text-text ring-1 ring-border-strong" : "text-text-muted hover:text-text",
          )}
        >
          <Icon size={16} strokeWidth={1.9} />
        </button>
      ))}
    </div>
  );
}
