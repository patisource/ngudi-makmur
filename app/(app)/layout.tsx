import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/shell/icon";
import { CrumbProvider } from "@/components/shell/crumb";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { Topbar } from "@/components/shell/topbar";
import { pendingFor } from "@/features/shell/queries";
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
  const pending = await pendingFor(user.roles);
  const badges: Record<string, number> = {};
  // Badge menu hanya untuk keputusan ketua (desain 07); hal lain cukup di lonceng & dashboard.
  for (const p of pending) if (p.approval) badges[p.nav] = (badges[p.nav] ?? 0) + p.count;

  return (
    <CrumbProvider>
    <div className="flex min-h-dvh">
      <SidebarNav items={items} badges={badges}>
        <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-2">
          {/* Nama → halaman Akun saya (ganti kata sandi) */}
          <Link href="/akun" title="Akun saya & ganti kata sandi" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-0.5 hover:bg-surface">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initials(user.fullName)}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{user.fullName}</span>
              <span className="block truncate text-xs text-text-muted">{user.roles.map((r) => ROLE_LABEL[r]).join(", ") || "Tanpa peran"}</span>
            </span>
          </Link>
          <form action={logout}>
            <button type="submit" aria-label="Keluar" title="Keluar" className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text">
              <Icon name="logout" size={17} />
            </button>
          </form>
        </div>
      </SidebarNav>
      <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 pb-12 pt-3 sm:px-8 lg:pt-3">
        <Topbar nav={items} pending={pending} />
        <main className="enter flex min-w-0 flex-col gap-5">{children}</main>
      </div>
    </div>
    </CrumbProvider>
  );
}

// Kerangka (StyleGuide: skeleton kontras rendah) selama sesi dibaca; bentuknya sama dengan shell agar tidak melompat.
function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Memuat">
      <div className="hidden w-[248px] shrink-0 border-r border-border bg-surface lg:block" />
      <div className="flex flex-1 flex-col gap-5 px-4 pt-16 sm:px-8 lg:pt-16">
        <div className="h-8 w-56 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-surface" />
      </div>
    </div>
  );
}
