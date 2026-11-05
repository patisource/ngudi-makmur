"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavItem } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { ORG } from "@/lib/org";
import { Icon } from "./icon";

// Daftar menu (sudah disaring per peran di server) dengan penanda halaman aktif dan laci di ponsel.
export function SidebarNav({ items, badges = {}, children }: { items: NavItem[]; badges?: Record<string, number>; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // laci ponsel; ditutup saat menu dipilih

  const groups = items.reduce<Array<{ group: string; items: NavItem[] }>>((acc, item) => {
    const last = acc[acc.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else acc.push({ group: item.group, items: [item] });
    return acc;
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu"
        className="fixed left-4 top-3 z-30 grid size-10 shadow-pop place-items-center rounded-full border border-border bg-surface lg:hidden"
      >
        <Icon name="menu" />
      </button>
      {open && <button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-scrim lg:hidden" />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col gap-2 border-r border-border bg-surface p-3 transition-transform duration-300 ease-expo lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start gap-2.5 px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-fg">
            <Icon name="sprout" size={20} />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold text-balance">{ORG.appName}</div>
            <div className="mt-0.5 text-xs text-text-muted">{ORG.fullName}</div>
          </div>
        </div>
        <nav aria-label="Menu utama" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.group} className="flex flex-col gap-0.5">
              <div className="px-3 pb-1 pt-3 text-[11px] font-medium text-text-subtle">{g.group}</div>
              {g.items.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
                      active ? "bg-surface-muted font-medium text-text" : "text-text-muted hover:bg-surface-muted/60 hover:text-text",
                    )}
                  >
                    <Icon name={n.icon} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{n.label}</span>
                    {(badges[n.href] ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning tabular-nums" aria-label={`${badges[n.href]} menunggu`}>
                        <span aria-hidden className="size-1.5 rounded-full bg-current" />
                        {badges[n.href]}
                      </span>
                    )}
                    {n.milestone && <span className="text-[10px] text-text-subtle">{n.milestone}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {children}
      </aside>
    </>
  );
}
