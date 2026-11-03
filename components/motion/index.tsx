"use client";

// Primitif gerak (T0.7, StyleGuide §6): CSS + requestAnimationFrame, tanpa pustaka. Hanya transform/opacity;
// prefers-reduced-motion → tanpa gerak (CSS global mematikan animasi; CountUp langsung ke nilai akhir).
import { Children, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** true bila pengguna meminta gerak dikurangi. Aman di server (false). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Blok masuk sekali: fade + naik 10 px, 0,55 s expo. */
export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`fade-in ${className ?? ""}`} style={{ ["--delay" as string]: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Anak masuk berurutan, jeda 40 ms, maksimal 4 langkah (anak ke-4 dst. 120 ms) — satu koreografi per layar. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) => (
        <FadeIn key={i} delay={Math.min(i, 3) * 40}>
          {child}
        </FadeIn>
      ))}
    </div>
  );
}

/** Ganti isi (mis. badge status) dengan pop masuk 200 ms; `swapKey` berubah → animasi diputar ulang. */
export function PresenceSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  return (
    <span key={swapKey} className="pop-in inline-flex">
      {children}
    </span>
  );
}

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const FORMAT = {
  rp: (n: number) => `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n))}`,
  kg: (n: number) => `${nf.format(n)} kg`,
  int: (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n)),
};

/**
 * Count-up KPI (StyleGuide §6.3): 900 ms ease-out quart, mulai dari nilai sebelumnya, teks ditulis langsung ke DOM
 * tiap frame (tanpa setState per frame). Server merender nilai akhir, jadi tanpa JS / reduced motion angka tetap benar.
 */
export function CountUp({ value, format = "int" }: { value: number; format?: keyof typeof FORMAT }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = value;
    if (!el) return;
    if (reduced || from === value) {
      el.textContent = FORMAT[format](value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const e = 1 - (1 - t) ** 4;
      el.textContent = FORMAT[format](from + (value - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, format, reduced]);
  return (
    <span ref={ref} className="tabular-nums">
      {FORMAT[format](value)}
    </span>
  );
}
