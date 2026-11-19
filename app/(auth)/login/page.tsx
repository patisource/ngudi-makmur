import type { Metadata } from "next";
import { Fragment } from "react";
import { MurmurationSky } from "@/components/motion/murmuration";
import { ReplaySplash, Splash, SPLASH_BOOT } from "@/components/motion/splash";
import { Logo } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ORG } from "@/lib/org";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk · Sistem Pengelolaan Jagung Desa Baturejo" };

const TITLE = "Selamat datang";

// Login (permintaan pengguna 19 Nov 2026): kartu di tengah tanpa foto, di atas langit senja dengan kawanan burung yang
// terbang acak dan siluet ladang jagung (MurmurationSky, kanvas tetap di belakang); logo, judul per kata, kartu, dan
// isian masuk berurutan sekali. Semua gerak mati saat
// prefers-reduced-motion (globals.css). Didahului welcome splash sekali per sesi (§6.6).
export default function LoginPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOT }} />
      <Splash />
      <MurmurationSky className="fixed inset-0" />
      <div className="relative flex min-h-dvh flex-col items-center px-4 pb-6 pt-20 sm:pt-16">
        <ThemeToggle className="absolute right-4 top-4 z-10 shadow-pop sm:right-6 sm:top-6" />

        <div className="relative flex w-full max-w-[420px] flex-1 flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3 text-center text-white">
            <div className="login-logo rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20 backdrop-blur-sm">
              <Logo size={64} className="rounded-xl" />
            </div>
            <div className="login-fade flex flex-col gap-1">
              <span className="text-lg font-semibold leading-snug tracking-tight text-balance">{ORG.appName}</span>
              <span className="text-sm text-white/80">{ORG.address.split(", ").slice(0, 3).join(" · ")}</span>
            </div>
          </div>

          <div className="login-card w-full rounded-2xl border border-border bg-surface p-6 shadow-pop sm:p-8">
            <div className="mb-6 flex flex-col gap-1.5">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight" aria-label={TITLE}>
                {TITLE.split(" ").map((w, i) => (
                  <Fragment key={i}>
                    <span aria-hidden className="word" style={{ ["--w" as string]: i + 4 }}>
                      {w}
                    </span>{" "}
                  </Fragment>
                ))}
              </h1>
              <p className="text-sm text-text-muted">Masuk dengan akun yang dibuat oleh admin kelompok.</p>
            </div>
            <div className="login-stagger">
              <LoginForm />
            </div>
            <p className="mt-5 border-t border-border pt-4 text-center text-xs text-text-subtle">Belum punya akun? Hubungi admin teknis kelompok.</p>
          </div>

          <div className="login-fade-late mt-auto flex max-w-[420px] flex-col items-center gap-1.5 text-balance rounded-xl bg-surface/85 px-4 py-2.5 text-center backdrop-blur-sm">
            <ReplaySplash />
            <p className="text-xs text-text-muted">
              {ORG.appVersion} · {ORG.credit}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
