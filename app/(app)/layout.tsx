import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/shell/icon";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { navFor, ROLE_LABEL } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { logout } from "../(auth)/login/actions";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

// App shell untuk semua halaman bersesi. Dengan Cache Components, membaca sesi (cookie) wajib di balik <Suspense>:
// shell statis (latar & kerangka) tampil seketika, sidebar sesuai peran + halaman mengalir setelah sesi terbaca.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = navFor(user.roles);

  return (
    <div className="flex min-h-dvh">
      <SidebarNav items={items}>
        <div className="flex items-center gap-2.5 rounded-lg bg-surface-muted p-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initials(user.fullName)}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.fullName}</div>
            <div className="truncate text-xs text-text-muted">{user.roles.map((r) => ROLE_LABEL[r]).join(", ") || "Tanpa peran"}</div>
          </div>
          <Link href="/akun" aria-label="Akun saya & ganti kata sandi" title="Akun saya & ganti kata sandi" className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text">
            <Icon name="lock" size={17} />
          </Link>
          <form action={logout}>
            <button type="submit" aria-label="Keluar" title="Keluar" className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text">
              <Icon name="logout" size={17} />
            </button>
          </form>
        </div>
      </SidebarNav>
      <main className="enter flex min-w-0 flex-1 flex-col gap-5 px-4 pb-12 pt-16 sm:px-8 lg:pt-8">{children}</main>
    </div>
  );
}

// Kerangka (StyleGuide: skeleton kontras rendah) selama sesi dibaca; bentuknya sama dengan shell agar tidak melompat.
function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Memuat">
      <div className="hidden w-[232px] shrink-0 border-r border-border bg-surface lg:block" />
      <div className="flex flex-1 flex-col gap-5 px-4 pt-16 sm:px-8 lg:pt-8">
        <div className="h-8 w-56 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-surface" />
      </div>
    </div>
  );
}
