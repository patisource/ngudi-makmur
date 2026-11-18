"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/shell/logo";
import { ORG } from "@/lib/org";

// Welcome splash (StyleGuide §6.6, desain 04): ± 3 detik, sekali per sesi browser, dilewati dengan klik/tombol apa pun,
// tidak tampil saat prefers-reduced-motion. Skrip inline (SPLASH_BOOT) memasang html[data-splash] sebelum gambar
// pertama sehingga halaman login tidak sempat berkedip; komponen ini hanya mengatur keluar (tirai) & putar ulang.
export const SPLASH_KEY = "ngudi-makmur-splash";
export const SPLASH_BOOT = `try{if(!sessionStorage.getItem("${SPLASH_KEY}")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.splash="1"}}catch(e){}`;
const STEPS = ["Jagung masuk", "Pemipilan & penepungan", "Stok & penjualan", "HPP & harga", "Nota & laporan"];

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
          <Logo size={88} className="rounded-2xl" />
        </div>
        <div className="sp-word">
          {/* per kata (tidak terpotong di tengah kata saat membungkus di ponsel), huruf beranimasi berurutan */}
          {ORG.splashTitle.split(" ").map((word, w, words) => {
            const start = words.slice(0, w).reduce((n, x) => n + x.length, 0);
            return (
              <span key={w} className="sp-w">
                {word.split("").map((c, i) => (
                  <span key={i} style={{ ["--i" as string]: start + i }}>
                    {c}
                  </span>
                ))}
              </span>
            );
          })}
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
