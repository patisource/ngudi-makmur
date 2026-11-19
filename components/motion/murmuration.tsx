"use client";

import { useEffect, useRef } from "react";

/**
 * Langit senja + kawanan burung jalak (latar halaman login, permintaan pengguna 19 Nov 2026).
 * Disalin & dijinakkan dari "Murmuration Wordmark" (21st.dev, kedhareswer): TANPA pembentukan kata — burung terbang
 * bebas dalam beberapa kawanan yang pusatnya mengembara acak dan kadang bergabung; arus curl-noise melipat kawanan.
 * Barisan alang-alang diganti siluet tanaman jagung (batang, daun melengkung, malai, tongkol) dengan tinggi yang sama.
 * Kursor/sentuhan = elang: kawanan menyibak di sekitarnya. Satu kanvas 2D, tanpa pustaka; dekoratif (aria-hidden).
 * prefers-reduced-motion → satu gambar diam. Berhenti saat tab tidak terlihat. Mode gelap → langit malam.
 * Warna langit adalah ilustrasi (bukan token UI), jadi ditulis di sini.
 */

type Palette = { skyTop: string; skyLow: string; sun: string; bird: string; ground: string };
const DUSK: Palette = { skyTop: "#1d2b44", skyLow: "#e89a6a", sun: "#ffd2a0", bird: "#14100f", ground: "#14100f" };
const NIGHT: Palette = { skyTop: "#05070d", skyLow: "#1a2236", sun: "#4a5d86", bird: "#dfe6f5", ground: "#020306" };

/** PRNG berbenih (mulberry32) — susunan jagung & butiran langit stabil antar-render. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arus bebas-divergensi (curl dari jumlah gelombang berjalan): melipat kawanan tanpa menumpuk/melubangi. */
function curl(x: number, y: number, t: number): [number, number] {
  const a = 1.7 * x + t;
  const b = 1.3 * y - 0.6 * t;
  const c = 2.9 * y + 1.1 * x - 0.8 * t;
  const d = 4.3 * x - 3.7 * y + 1.3 * t;
  const dpdx = 1.7 * Math.cos(a) * Math.cos(b) + 0.66 * Math.cos(c) - 1.505 * Math.sin(d);
  const dpdy = -1.3 * Math.sin(a) * Math.sin(b) + 1.74 * Math.cos(c) + 1.295 * Math.sin(d);
  return [dpdy, -dpdx];
}

function alpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Satu tanaman jagung: batang, 3–6 daun melengkung terkulai, malai di pucuk, kadang tongkol berkelobot. */
function corn(s: CanvasRenderingContext2D, x: number, base: number, tall: number, lean: number, r: () => number) {
  const top = { x: x + lean, y: base - tall };
  const at = (k: number) => ({ x: x + lean * k * k, y: base - tall * k });
  s.lineCap = "round";
  s.lineWidth = Math.max(1, tall * 0.018);
  s.beginPath();
  s.moveTo(x, base + 2);
  s.quadraticCurveTo(x + lean * 0.25, base - tall * 0.6, top.x, top.y);
  s.stroke();

  const leaves = 3 + Math.floor(r() * 4);
  let side = r() < 0.5 ? -1 : 1;
  for (let i = 0; i < leaves; i++) {
    const k = 0.18 + (i / leaves) * 0.62 + r() * 0.05;
    const p = at(k);
    const len = tall * (0.32 + r() * 0.26) * (1 - k * 0.35);
    const rise = len * (0.35 + r() * 0.3);
    const tip = { x: p.x + side * len, y: p.y - rise * 0.2 + len * (0.25 + r() * 0.35) };
    const w = Math.max(1.4, tall * 0.028);
    s.beginPath();
    s.moveTo(p.x, p.y);
    s.quadraticCurveTo(p.x + side * len * 0.45, p.y - rise, tip.x, tip.y);
    s.quadraticCurveTo(p.x + side * len * 0.4, p.y - rise + w * 2.2, p.x, p.y + w * 1.6);
    s.fill();
    side = -side;
  }

  // malai (bunga jantan) di pucuk
  s.lineWidth = Math.max(0.7, tall * 0.009);
  const tassels = 3 + Math.floor(r() * 3);
  for (let i = 0; i < tassels; i++) {
    const ang = -Math.PI / 2 + (i - (tassels - 1) / 2) * 0.38 + lean * 0.02;
    const l = tall * (0.06 + r() * 0.05);
    s.beginPath();
    s.moveTo(top.x, top.y);
    s.quadraticCurveTo(top.x + Math.cos(ang) * l * 0.6, top.y + Math.sin(ang) * l * 0.9, top.x + Math.cos(ang) * l * 1.1, top.y + Math.sin(ang) * l * 0.55);
    s.stroke();
  }

  // tongkol berkelobot pada tanaman yang cukup tinggi
  if (tall > 46 && r() < 0.65) {
    const p = at(0.42 + r() * 0.1);
    const dir = r() < 0.5 ? -1 : 1;
    const len = tall * 0.16;
    const ang = dir * (0.5 + r() * 0.2);
    s.save();
    s.translate(p.x, p.y);
    s.rotate(ang);
    s.beginPath();
    s.ellipse(0, -len * 0.55, len * 0.17, len * 0.55, 0, 0, Math.PI * 2);
    s.fill();
    s.beginPath();
    s.moveTo(-len * 0.12, -len * 0.95);
    s.quadraticCurveTo(0, -len * 1.35, len * 0.06 * dir, -len * 1.45);
    s.lineTo(len * 0.12, -len * 0.95);
    s.fill();
    s.restore();
  }
}

export function MurmurationSky({ birds = 3000, className }: { birds?: number; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");

    let w = 1;
    let h = 1;
    let dpr = 1;
    let n = 0;
    let raf = 0;
    let pal = DUSK;
    let sky: HTMLCanvasElement | null = null;
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let vx = new Float32Array(0);
    let vy = new Float32Array(0);
    let depth = new Float32Array(0);
    let phase = new Float32Array(0);
    let group = new Uint8Array(0);
    let hx = -1e5;
    let hy = -1e5;
    let last = performance.now();
    let clock = 0;
    const rand = rng(11);
    // 3 kawanan, masing-masing dengan lintasan pusat sendiri (frekuensi & fase acak tetapi stabil).
    const GROUPS = Array.from({ length: 3 }, (_, g) => {
      const q = rng(101 + g * 7);
      return { a: 0.09 + q() * 0.12, b: 0.27 + q() * 0.3, c: 0.13 + q() * 0.2, p: q() * 6.28, s: q() * 6.28, u: q() * 6.28 };
    });

    const paintSky = () => {
      sky = document.createElement("canvas");
      sky.width = canvas.width;
      sky.height = canvas.height;
      const s = sky.getContext("2d");
      if (!s) return;
      s.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = s.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, pal.skyTop);
      g.addColorStop(0.78, pal.skyLow);
      g.addColorStop(1, pal.skyLow);
      s.fillStyle = g;
      s.fillRect(0, 0, w, h);
      const sun = s.createRadialGradient(w * 0.62, h * 0.86, 0, w * 0.62, h * 0.86, Math.max(w, h) * 0.55);
      sun.addColorStop(0, pal.sun);
      sun.addColorStop(0.25, alpha(pal.sun, 0.5));
      sun.addColorStop(1, alpha(pal.sun, 0));
      s.globalAlpha = 0.55;
      s.fillStyle = sun;
      s.fillRect(0, 0, w, h);
      s.globalAlpha = 1;
      const gr = rng(5);
      for (let i = 0; i < (w * h) / 12; i++) {
        s.fillStyle = gr() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.035)";
        s.fillRect(gr() * w, gr() * h, 1, 1);
      }
      // ladang jagung di bawah — tinggi maksimum sama dengan alang-alang aslinya (≈13% tinggi layar)
      s.strokeStyle = pal.ground;
      s.fillStyle = pal.ground;
      const base = h - Math.max(6, h * 0.012);
      s.fillRect(0, base, w, h - base);
      const maxTall = Math.max(40, h * 0.13);
      for (let x = -12; x < w + 12; x += 9 + gr() * 16) {
        if (gr() < 0.12) x += gr() * 26;
        const tall = (0.28 + 0.72 * Math.pow(gr(), 1.3)) * maxTall + 8;
        corn(s, x, base, tall, (gr() - 0.35) * tall * 0.12, gr);
      }
    };

    const layout = () => {
      const rect = root.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      pal = isDark() ? NIGHT : DUSK;
      paintSky();
      const want = Math.max(500, Math.round(Math.min(6000, birds) * Math.min(1, (w * h) / (1440 * 860))));
      if (want !== n) {
        n = want;
        px = new Float32Array(n);
        py = new Float32Array(n);
        vx = new Float32Array(n);
        vy = new Float32Array(n);
        depth = new Float32Array(n);
        phase = new Float32Array(n);
        group = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand());
          group[i] = rand() < 0.5 ? 0 : rand() < 0.6 ? 1 : 2;
          px[i] = w * (0.25 + group[i] * 0.25) + Math.cos(a) * r * w * 0.12;
          py[i] = h * 0.35 + Math.sin(a) * r * h * 0.12;
          depth[i] = 0.55 + rand() * 0.45;
          phase[i] = rand() * Math.PI * 2;
        }
      }
      if (reduced) draw();
    };

    const step = (dt: number) => {
      clock += dt;
      const u = Math.min(w, h);
      const t = clock * 0.35;
      const centres = GROUPS.map((g) => [
        w * (0.5 + 0.36 * Math.sin(clock * g.a + g.p) + 0.1 * Math.sin(clock * g.b + g.s)),
        h * (0.34 + 0.13 * Math.sin(clock * g.c + g.u)),
      ]);
      const hawk = hx > -1e4;
      const hawkR = u * 0.16;
      for (let i = 0; i < n; i++) {
        const x = px[i];
        const y = py[i];
        const cv = curl(((x - w / 2) / u) * 2.2 + depth[i] * 0.25, ((y - h / 2) / u) * 2.2, t);
        let ax = cv[0] * 420;
        let ay = cv[1] * 420;
        const c = centres[group[i]];
        const dxC = c[0] - x;
        const dyC = (c[1] - y) * 1.6;
        const dC = Math.hypot(dxC, dyC) / u;
        const hold = dC < 0.12 ? 0.12 : 0.12 + (dC - 0.12) * 5;
        ax += dxC * hold * 2.2;
        ay += dyC * hold * 1.6;
        if (hawk) {
          const dx = x - hx;
          const dy = y - hy;
          const d2 = dx * dx + dy * dy;
          if (d2 < hawkR * hawkR) {
            const d = Math.sqrt(d2) + 0.01;
            const f = (1 - d / hawkR) * 5200;
            ax += (dx / d) * f;
            ay += (dy / d) * f;
          }
        }
        let nvx = (vx[i] + ax * dt) * (1 - 1.1 * dt);
        let nvy = (vy[i] + ay * dt) * (1 - 1.1 * dt);
        const sp = Math.hypot(nvx, nvy);
        if (sp > 480) {
          nvx = (nvx / sp) * 480;
          nvy = (nvy / sp) * 480;
        }
        vx[i] = nvx;
        vy[i] = nvy;
        px[i] = x + nvx * dt;
        py[i] = y + nvy * dt;
        phase[i] += dt * (9 + sp * 0.02);
      }
    };

    function draw() {
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (sky) ctx.drawImage(sky, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // dua lapis kedalaman: burung dekat lebih gelap & tebal
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if ((pass === 1) !== depth[i] > 0.78) continue;
          const s = 1.6 + depth[i] * 2.2;
          const sp = Math.hypot(vx[i], vy[i]) + 0.001;
          const dx = sp > 0.01 ? vx[i] / sp : 1;
          const dy = sp > 0.01 ? vy[i] / sp : 0;
          const flap = 0.55 + 0.45 * Math.sin(phase[i]);
          const wx = -dx * s;
          const wy = -dy * s;
          const nx = -dy * s * flap;
          const ny = dx * s * flap;
          ctx.moveTo(px[i] + wx + nx, py[i] + wy + ny);
          ctx.lineTo(px[i], py[i]);
          ctx.lineTo(px[i] + wx - nx, py[i] + wy - ny);
        }
        ctx.strokeStyle = pal.bird;
        ctx.globalAlpha = pass === 0 ? 0.55 : 0.92;
        ctx.lineWidth = pass === 0 ? 0.9 : 1.25;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      step(dt);
      draw();
    };

    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      hx = e.clientX - b.left;
      hy = e.clientY - b.top;
    };
    const onLeave = () => {
      hx = -1e5;
      hy = -1e5;
    };
    const onTheme = () => {
      pal = isDark() ? NIGHT : DUSK;
      paintSky();
      if (reduced) draw();
    };

    layout();
    // sebaran awal: biarkan kawanan "terbang" beberapa detik agar gambar pertama (dan gambar diam saat reduced motion)
    // sudah berbentuk kawanan, bukan gumpalan
    for (let k = 0; k < (reduced ? 150 : 40); k++) step(1 / 30);
    if (!reduced) {
      raf = requestAnimationFrame(frame);
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onLeave);
      window.addEventListener("pointercancel", onLeave);
      document.documentElement.addEventListener("pointerleave", onLeave);
    } else {
      draw();
    }
    window.addEventListener("theme-change", onTheme);
    scheme.addEventListener("change", onTheme);
    const ro = new ResizeObserver(() => layout());
    ro.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onLeave);
      window.removeEventListener("pointercancel", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("theme-change", onTheme);
      scheme.removeEventListener("change", onTheme);
    };
  }, [birds]);

  return (
    <div ref={rootRef} aria-hidden className={`login-sky ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
