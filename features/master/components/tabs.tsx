"use client";

import { usePathname } from "next/navigation";
import { SegLinks } from "@/components/ui/seg";

// Tab sub-halaman (pengganti Seg di prototipe): segmented control dengan thumb meluncur. Tab disaring per peran di server.
export function MasterTabs({ tabs, label = "Bagian master data" }: { tabs: Array<{ href: string; label: string }>; label?: string }) {
  const pathname = usePathname();
  return <SegLinks label={label} items={tabs.map((t) => ({ key: t.href, label: t.label, href: t.href, active: pathname === t.href || pathname.startsWith(t.href + "/") }))} />;
}
