"use client";

import { useEffect, useRef, useState } from "react";
import { ORG } from "@/lib/org";

// Welcome splash (StyleGuide §6.6, desain 04): ± 3 detik, sekali per sesi browser, dilewati dengan klik/tombol apa pun,
// tidak tampil saat prefers-reduced-motion. Skrip inline (SPLASH_BOOT) memasang html[data-splash] sebelum gambar
// pertama sehingga halaman login tidak sempat berkedip; komponen ini hanya mengatur keluar (tirai) & putar ulang.
export const SPLASH_KEY = "ngudi-makmur-splash";
export const SPLASH_BOOT = `try{if(!sessionStorage.getItem("${SPLASH_KEY}")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.splash="1"}}catch(e){}`;
const STEPS = ["Jagung masuk", "Pemipilan & penepungan", "Stok & penjualan", "Pembayaran & kas", "Nota & laporan"];
const PATHS = [
  "M7 20h10",
  "M10 20c5.5-2.5.8-6.4 3-10",
  "M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z",
  "M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z",
];

export function Splash() {
  const [phase, setPhase] = useState<"in" | "out" | "done">("in");
  const [run, setRun] = useState(0); // naik saat diputar ulang → animasi CSS mulai lagi
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const html = document.documentElement;
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const leave = () => {
      if (!html.dataset.splash) return;
      clear();
      setPhase("out");
      timers.current.push(
        window.setTimeout(() => {
          delete html.dataset.splash;
          setPhase("done");
        }, 1100),
      );
    };
    const start = () => {
      if (!html.dataset.splash) return;
      try {
        sessionStorage.setItem(SPLASH_KEY, "1");
      } catch {
        /* tetap jalan tanpa penyimpanan */
      }
      timers.current.push(window.setTimeout(leave, 2250));
    };
    const replay = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      clear();
      html.dataset.splash = "1";
      setPhase("in");
      setRun((n) => n + 1);
      timers.current.push(window.setTimeout(leave, 2250));
    };
    start();
    window.addEventListener("keydown", leave);
    window.addEventListener("replay-splash", replay);
    return () => {
      clear();
      window.removeEventListener("keydown", leave);
      window.removeEventListener("replay-splash", replay);
    };
  }, []);

  if (phase === "done") return null;
  const skip = () => window.dispatchEvent(new KeyboardEvent("keydown"));
  return (
    <div key={run} className={phase === "out" ? "splash out" : "splash"} aria-hidden onPointerDown={skip}>
      <span className="sp-skip">Klik untuk lewati</span>
      <div className="sp-center">
        <div className="sp-mark">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            {PATHS.map((d, i) => (
              <path key={d} d={d} pathLength={1} style={{ animationDelay: `${0.2 + i * 0.12}s` }} />
            ))}
          </svg>
        </div>
        <div className="sp-word">
          {ORG.shortName.split("").map((c, i) => (
            <span key={i} style={{ ["--i" as string]: i }}>
              {c}
            </span>
          ))}
        </div>
        <div className="sp-sub">{ORG.splashSubtitle}</div>
      </div>
      <div className="sp-foot">
        <div className="sp-steps">
          <div className="sp-roll">
            {STEPS.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
        <div className="sp-line">
          <i />
        </div>
      </div>
    </div>
  );
}

/** Tautan kecil "Putar ulang intro" di bawah form login. */
export function ReplaySplash() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("replay-splash"))} className="w-fit text-xs text-text-subtle underline-offset-4 hover:text-text hover:underline">
      Putar ulang intro
    </button>
  );
}
