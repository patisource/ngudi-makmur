"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { searchDocuments, type SearchHit } from "@/features/shell/actions";
import type { IconName, NavItem } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

// Palet perintah (StyleGuide §6.7): halaman yang diizinkan peran + dokumen (pesanan, jagung masuk, batch) dari server.
// ↑/↓ memilih, Enter membuka, Esc menutup; maks 12 hasil.
type Row = { kind: string; label: string; href: string; icon: IconName };

export function CommandPalette({ nav, onClose }: { nav: NavItem[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [ix, setIx] = useState(0);
  const [docs, setDocs] = useState<SearchHit[]>([]);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Cari dokumen setelah jeda ketik singkat; hasil lama diabaikan bila kata kunci sudah berubah.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let live = true;
    const t = window.setTimeout(() => start(async () => {
      const hits = await searchDocuments(term);
      if (live) setDocs(hits);
    }), 180);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const s = q.trim().toLowerCase();
    const pages: Row[] = nav.filter((n) => !s || n.label.toLowerCase().includes(s)).map((n) => ({ kind: "Halaman", label: n.label, href: n.href, icon: n.icon }));
    const found: Row[] = s.length >= 2 ? docs.map((d) => ({ kind: d.kind, label: d.label, href: d.href, icon: d.icon })) : [];
    return [...pages, ...found].slice(0, 12);
  }, [q, nav, docs]);

  useEffect(() => {
    list.current?.children[ix]?.scrollIntoView({ block: "nearest" });
  }, [ix]);

  const open = (r: Row | undefined) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIx((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(rows[ix]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center px-4 pt-[12vh]">
      <div aria-hidden className="dlg-scrim absolute inset-0 bg-scrim" onMouseDown={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Cari" className="dlg-panel relative flex h-fit max-h-[70dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={18} strokeWidth={1.75} className="shrink-0 text-text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIx(0);
            }}
            onKeyDown={onKey}
            placeholder="Cari halaman, nomor nota, penerimaan, batch"
            aria-label="Kata kunci"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[ix] ? `pal-${ix}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-subtle"
          />
          <kbd className="rounded-sm bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] text-text-muted">Esc</kbd>
        </div>
        <div ref={list} id="palette-list" role="listbox" className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {rows.map((r, i) => (
            <div
              key={`${r.kind}-${r.href}`}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === ix}
              onMouseMove={() => i !== ix && setIx(i)}
              onClick={() => open(r)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm", i === ix && "bg-surface-muted")}
            >
              <Icon name={r.icon} size={16} className="shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="text-xs text-text-subtle">{r.kind}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="px-3 py-6 text-sm text-text-muted">{pending ? "Mencari…" : `Tidak ada hasil untuk "${q}".`}</p>}
        </div>
        <div className="flex gap-4 border-t border-border px-4 py-2.5 text-xs text-text-subtle">
          <span>
            <kbd className="font-sans">↑↓</kbd> pilih
          </span>
          <span>
            <kbd className="font-sans">Enter</kbd> buka
          </span>
          <span>
            <kbd className="font-sans">Ctrl K</kbd> buka/tutup
          </span>
          {pending && <span className="ml-auto">Mencari…</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
