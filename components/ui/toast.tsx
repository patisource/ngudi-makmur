"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

// Toast (StyleGuide §6.3, §9): pesan hasil aksi dengan titik warna + teks, masuk dari bawah kanan, umur 5,2 s, antre
// maksimal 3. Penyimpanan di tingkat modul agar toast tetap tampil saat halaman berpindah/di-refresh.
type Kind = "ok" | "warn" | "error";
type Item = { id: number; kind: Kind; message: string; leaving?: boolean };

const LIFE_MS = 5200;
const MAX = 3;
let items: Item[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const EMPTY: Item[] = [];

function remove(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 160);
}

/** Tampilkan toast. Galat juga diumumkan pembaca layar secara tegas (role="alert"). */
export function toast(message: string, kind: Kind = "ok") {
  const id = ++seq;
  items = [...items.filter((t) => !t.leaving), { id, kind, message }].slice(-MAX);
  emit();
  setTimeout(() => remove(id), LIFE_MS);
}

/** Toast dari hasil Server Action ({ ok, message } / { error }). */
export function toastResult(res: { ok?: boolean; message?: string; error?: string }) {
  if (res.error) toast(res.error, "error");
  else if (res.ok && res.message) toast(res.message, "ok");
}

const DOT: Record<Kind, string> = { ok: "bg-accent", warn: "bg-warning", error: "bg-danger" };

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => EMPTY,
  );
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-60 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          data-leaving={t.leaving ? "" : undefined}
          className="toast pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border border-border bg-surface py-3 pl-4 pr-2 text-sm shadow-pop sm:w-auto sm:min-w-72"
        >
          <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[t.kind]}`} />
          <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
          <button type="button" aria-label="Tutup pesan" onClick={() => remove(t.id)} className="grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text">
            <X size={14} strokeWidth={1.75} />
          </button>
          <span aria-hidden="true" className={`toast-life absolute inset-x-0 bottom-0 h-0.5 ${DOT[t.kind]} opacity-60`} />
        </div>
      ))}
    </div>
  );
}
