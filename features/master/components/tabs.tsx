"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Tab sub-halaman master data (pengganti Seg di prototipe). Tab disaring per peran di server.
export function MasterTabs({ tabs, label = "Bagian master data" }: { tabs: Array<{ href: string; label: string }>; label?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-1">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-sm px-3 py-1.5 text-label transition-colors duration-150",
              active ? "bg-surface font-medium text-text shadow-[0_0_0_1px_var(--border)]" : "text-text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
