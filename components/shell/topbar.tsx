"use client";

import { Bell, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PendingItem } from "@/features/shell/queries";
import { navItemFor, type NavItem } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { useCrumb } from "./crumb";
import { CommandPalette } from "./palette";

// Label segmen URL yang bukan menu utama (remah kedua). Segmen id dokumen memakai <Crumb>, atau "Detail".
const SEGMENT: Record<string, string> = {
  baru: "Baru",
  buku: "Buku kas",
  koreksi: "Koreksi",
  pemasukan: "Pemasukan lain",
  pembayaran: "Pembayaran",
  pengeluaran: "Pengeluaran",
  opname: "Stok opname",
  anggota: "Anggota",
  pelanggan: "Pelanggan",
  produk: "Produk",
  kemasan: "Kemasan",
  akun: "Akun",
};

function useCrumbs(): Array<{ label: string; href?: string }> {
  const pathname = usePathname();
  const detail = useCrumb();
  if (pathname === "/akun") return [{ label: "Akun" }, { label: "Akun saya" }];
  const item = navItemFor(pathname);
  if (!item) return [];
  if (pathname === item.href) return [{ label: item.group }, { label: item.label }];
  const rest = pathname.slice(item.href.length + 1).split("/");
  const crumbs: Array<{ label: string; href?: string }> = [{ label: item.label, href: item.href }];
  let href = item.href;
  rest.forEach((seg, i) => {
    href += `/${seg}`;
    const last = i === rest.length - 1;
    const label = SEGMENT[seg] ?? (last ? (detail ?? "Detail") : decodeURIComponent(seg));
    crumbs.push(last ? { label } : { label, href });
  });
  return crumbs;
}

export function Topbar({ nav, pending }: { nav: NavItem[]; pending: PendingItem[] }) {
  const crumbs = useCrumbs();
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const waiting = pending.filter((p) => p.count > 0);
  const total = waiting.reduce((s, p) => s + p.count, 0);

  // Ctrl/⌘ K membuka/menutup palet (StyleGuide §6.7).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!bell) return;
    const away = (e: PointerEvent) => !bellRef.current?.contains(e.target as Node) && setBell(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBell(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [bell]);

  return (
    <header className="flex min-h-10 items-center gap-3 pl-12 lg:pl-0">
      <nav aria-label="Remah roti" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-sm">
          {crumbs.map((c, i) => (
            <li key={i} className={cn("flex min-w-0 items-center gap-2", i < crumbs.length - 1 && "hidden sm:flex")}>
              {i > 0 && (
                <span aria-hidden className="hidden text-text-subtle sm:inline">
                  /
                </span>
              )}
              {i === crumbs.length - 1 ? (
                <span aria-current="page" className="truncate font-medium text-text">
                  {c.label}
                </span>
              ) : c.href ? (
                <Link href={c.href} className="truncate text-text-muted hover:text-text">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-text-muted">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <button
        type="button"
        onClick={() => setPalette(true)}
        aria-label="Cari nota, anggota, produk (Ctrl K)"
        className="flex h-10 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-sm text-text-subtle transition-colors hover:border-border-strong sm:w-80"
      >
        <Search size={17} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        <span className="hidden flex-1 text-left sm:inline">Cari nota, anggota, produk</span>
        <kbd className="hidden rounded-sm bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] text-text-muted sm:inline">Ctrl K</kbd>
      </button>

      <div ref={bellRef} className="relative">
        <button
          type="button"
          onClick={() => setBell((v) => !v)}
          aria-expanded={bell}
          aria-haspopup="true"
          aria-label={total > 0 ? `Pemberitahuan: ${total} menunggu tindakan` : "Pemberitahuan"}
          className="relative grid size-10 place-items-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <Bell size={18} strokeWidth={1.75} />
          {total > 0 && <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-warning ring-2 ring-surface" />}
        </button>
        {bell && (
          <div className="pop-in absolute right-0 top-12 z-40 flex w-[min(320px,calc(100vw-32px))] flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-pop">
            <div className="px-2 pb-1 pt-1.5 text-label font-medium">Menunggu tindakan</div>
            {waiting.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-text-muted">Tidak ada yang menunggu.</p>
            ) : (
              waiting.map((p) => (
                <Link key={p.key} href={p.href} onClick={() => setBell(false)} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-muted">
                  <span>{p.label}</span>
                  <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning tabular-nums">{p.count}</span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      {palette && <CommandPalette nav={nav} onClose={() => setPalette(false)} />}
    </header>
  );
}
