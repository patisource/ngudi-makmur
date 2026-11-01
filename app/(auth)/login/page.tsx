import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Icon } from "@/components/shell/icon";
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

// Login (StyleGuide §8.1) — tata letak sama dengan prototipe: formulir di kiri, panel foto di kanan.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <div className="enter mx-auto flex w-full max-w-[440px] flex-col justify-center gap-7 px-6 py-12">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-fg">
            <Icon name="sprout" size={20} />
          </span>
          <strong className="font-semibold">Ngudi Makmur</strong>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Selamat Datang di Dashboard</h1>
          <p className="text-text-muted">Masuk dengan akun yang diberikan admin teknis. Menu dan hak akses menyesuaikan peran Anda.</p>
        </div>
        <Suspense fallback={<LoginForm />}>
          <LoginFormFromUrl searchParams={searchParams} />
        </Suspense>
        <p className="text-xs text-text-subtle">Lupa kata sandi? Hubungi admin teknis kelompok untuk mengatur ulang.</p>
      </div>

      <div className="hidden p-4 lg:flex">
        <figure className="relative isolate m-0 flex flex-1 flex-col justify-between overflow-hidden rounded-xl bg-[#16210f] px-8 pb-6 pt-7 text-white">
          <Image src="/img/login-ladang-jagung.jpg" alt="" fill priority sizes="560px" className="-z-20 object-cover object-[center_30%]" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(9_14_7/.34)_0%,rgb(9_14_7/0)_20%),linear-gradient(to_top,rgb(9_14_7/.9)_0%,rgb(9_14_7/.62)_30%,rgb(9_14_7/0)_60%)]" />
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-black/40 py-1 pl-2 pr-3 text-xs text-white/90">
            <Icon name="pin" size={14} />
            Baturejo · Sukolilo · Pati
          </span>
          <figcaption className="flex max-w-[440px] flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">Kelompok Tani</span>
            <span className="text-[34px] font-semibold leading-10 tracking-[-0.025em]">Ngudi Makmur</span>
            <span className="text-sm leading-[21px] text-white/80">Mengolah jagung hasil panen anggota: dipipil, ditepung, lalu dijual, dengan catatan stok dan kas yang rapi.</span>
            <span className="mt-1.5 text-[11px] text-white/50">
              Foto sementara:{" "}
              <a className="underline underline-offset-2" href="https://unsplash.com/photos/nCQXxsSg3oo" target="_blank" rel="noopener noreferrer">
                Waldemar Brandt / Unsplash
              </a>
            </span>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
