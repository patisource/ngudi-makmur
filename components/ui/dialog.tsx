"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// Dialog (StyleGuide §6.3 & §9): scrim + panel, Esc / klik scrim menutup dialog teratas, fokus masuk ke panel dan
// kembali ke pemicu saat ditutup. Ponsel (< 640 px): bottom sheet. `shakeKey` berubah → getar (hanya galat domain dari server).
const stack: string[] = [];

export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  wide,
  shakeKey,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  shakeKey?: number;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [out, setOut] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    setOut(true);
    window.setTimeout(onClose, 150);
  }, [onClose]);

  useEffect(() => {
    stack.push(id);
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button:not([data-close])");
    (first ?? panel.current)?.focus();
    return () => {
      stack.splice(stack.indexOf(id), 1);
      if (stack.length === 0) document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab" && panel.current) {
        // Fokus tetap di dalam dialog.
        const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']")];
        if (f.length === 0) return;
        const [a, z] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, close]);

  // Getar: putar ulang kelas animasi langsung di DOM (tanpa state per animasi).
  useEffect(() => {
    const el = body.current;
    if (!shakeKey || !el) return;
    el.classList.remove("dlg-shake");
    void el.offsetWidth;
    el.classList.add("dlg-shake");
  }, [shakeKey]);

  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6", out && "dlg-out")}>
      <div aria-hidden className="dlg-scrim absolute inset-0 bg-scrim" onMouseDown={close} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        className={cn(
          "dlg-panel relative flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-surface shadow-pop outline-none sm:rounded-xl",
          wide ? "sm:max-w-[640px]" : "sm:max-w-[520px]",
        )}
      >
        <div ref={body} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5 sm:px-7 sm:pt-7">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={`${id}-t`} className="text-xl font-semibold tracking-tight">
                {title}
              </h2>
              {description && <div className="text-sm text-text-muted">{description}</div>}
            </div>
            <button type="button" data-close onClick={close} aria-label="Tutup" className="-mr-2 grid size-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text">
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-3 sm:px-7">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:flex-nowrap sm:border-0 sm:px-7 sm:pb-7 sm:pt-3">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
