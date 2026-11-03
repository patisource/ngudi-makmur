import type { Metadata } from "next";
import Image from "next/image";
import { Fragment, Suspense } from "react";
import { ReplaySplash, Splash, SPLASH_BOOT } from "@/components/motion/splash";
import { Icon } from "@/components/shell/icon";
import { ORG } from "@/lib/org";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk · SIM Ngudi Makmur" };

const NOTICE: Record<string, string> = {
  nonaktif: "Akun ini dinonaktifkan. Hubungi admin teknis.",
};

// Membaca ?next= dan ?alasan= (data permintaan) → di balik <Suspense>; formulir kosong tampil seketika sebagai fallback.
async function LoginFormFromUrl({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const notice = typeof sp.alasan === "string" ? NOTICE[sp.alasan] : undefined;
  return <LoginForm next={next} notice={notice} />;
}

const TITLE = `Masuk ke SIM ${ORG.fullName}`;

// Login (desain 00, StyleGuide §8.1): formulir kiri; panel kanan berisi foto lahan + profil kelompok yang tidak sensitif.
// Didahului welcome splash sekali per sesi (§6.6).
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOT }} />
      <Splash />
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,608px)]">
        <div className="flex min-h-dvh flex-col px-6 py-10 sm:px-12 lg:px-24">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-fg">
              <Icon name="sprout" size={20} />
            </span>
            <span className="text-sm font-medium">{ORG.shortName}</span>
          </div>

          <div className="enter flex w-full max-w-[400px] flex-1 flex-col justify-center gap-7 py-12">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight" aria-label={TITLE}>
                {TITLE.split(" ").map((w, i) => (
                  <Fragment key={i}>
                    <span aria-hidden className="word" style={{ ["--w" as string]: i }}>
                      {w}
                    </span>{" "}
                  </Fragment>
                ))}
              </h1>
              <p className="text-sm text-text-muted">Gunakan akun yang dibuat oleh admin kelompok.</p>
            </div>
            <Suspense fallback={<LoginForm />}>
              <LoginFormFromUrl searchParams={searchParams} />
            </Suspense>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-subtle">Belum punya akun? Hubungi admin teknis kelompok.</p>
              <ReplaySplash />
            </div>
          </div>

          <p className="text-xs text-text-subtle">
            SIM Kelompok Tani {ORG.appVersion} · {ORG.builtBy} · © 2026 {ORG.fullName}
          </p>
        </div>

        <div className="hidden p-4 lg:flex">
          <div className="flex flex-1 flex-col gap-7 rounded-2xl bg-surface-muted p-10">
            <figure className="relative m-0 min-h-[360px] flex-1 overflow-hidden rounded-xl bg-border">
              <Image src="/img/login-ladang-jagung.jpg" alt="Ladang jagung" fill priority sizes="528px" className="object-cover object-[center_30%]" />
              <figcaption className="absolute bottom-3 left-3 rounded-full bg-scrim px-3 py-1 text-[11px] text-primary-fg">
                Foto sementara (Unsplash) · ganti dengan foto gudang/lahan kelompok
              </figcaption>
            </figure>
            <div className="flex flex-col gap-1.5">
              <span className="text-xl font-semibold tracking-tight">{ORG.fullName}</span>
              <span className="text-sm text-text-muted">{ORG.address}</span>
            </div>
            <dl className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-0.5">
                <dt className="order-2 text-xs text-text-subtle">Komoditas utama</dt>
                <dd className="text-sm font-medium">{ORG.commodities}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="order-2 text-xs text-text-subtle">Jam operasional gudang</dt>
                <dd className="text-sm font-medium">{ORG.warehouseHours}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
