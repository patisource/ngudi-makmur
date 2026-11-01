// Satu-satunya sumber hak akses di aplikasi (Security.md §4.1): dipakai sidebar, guard halaman, dan guard aksi.
// Isi mengikuti matriks PRD §3.1. Menyembunyikan menu BUKAN kontrol keamanan — database tetap menegakkan RLS.
import type { AppPermission, AppRole } from "@/lib/supabase/types";

export const ROLES: readonly AppRole[] = ["admin_kelompok", "operator_produksi", "ketua", "admin_teknis"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin_kelompok: "Admin kelompok",
  operator_produksi: "Operator produksi",
  ketua: "Ketua kelompok",
  admin_teknis: "Admin teknis",
};

export const PERMISSION_LABEL: Record<AppPermission, string> = {
  "production.confirm": "Konfirmasi batch produksi",
};

export type NavGroup = "Ringkasan" | "Operasional" | "Penjualan" | "Keuangan" | "Data" | "Sistem";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  roles: readonly AppRole[];
  /** Milestone pembangunan modul; null = sudah tersedia. */
  milestone: string | null;
};

export type IconName = "dashboard" | "inbox" | "factory" | "box" | "cart" | "wallet" | "file" | "users" | "history" | "shield";

// Urutan = urutan di sidebar. Peran = siapa yang boleh membuka (L atau K pada matriks PRD §3.1).
export const NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", group: "Ringkasan", roles: ["admin_kelompok", "operator_produksi", "ketua"], milestone: null },
  { href: "/jagung-masuk", label: "Jagung masuk", icon: "inbox", group: "Operasional", roles: ["admin_kelompok", "operator_produksi", "ketua"], milestone: null },
  { href: "/produksi", label: "Produksi", icon: "factory", group: "Operasional", roles: ["admin_kelompok", "operator_produksi", "ketua"], milestone: "M5" },
  { href: "/stok", label: "Stok", icon: "box", group: "Operasional", roles: ["admin_kelompok", "operator_produksi", "ketua"], milestone: null },
  { href: "/penjualan", label: "Penjualan & nota", icon: "cart", group: "Penjualan", roles: ["admin_kelompok", "ketua"], milestone: "M6" },
  { href: "/kas", label: "Pembayaran & kas", icon: "wallet", group: "Keuangan", roles: ["admin_kelompok", "ketua"], milestone: "M7" },
  { href: "/laporan", label: "Laporan", icon: "file", group: "Data", roles: ["admin_kelompok", "operator_produksi", "ketua"], milestone: "M8" },
  { href: "/master", label: "Anggota & produk", icon: "users", group: "Data", roles: ["admin_kelompok", "operator_produksi", "ketua"], milestone: null },
  { href: "/pengaturan/akun", label: "Akun & izin", icon: "shield", group: "Sistem", roles: ["ketua", "admin_teknis"], milestone: null },
  { href: "/audit", label: "Log audit", icon: "history", group: "Sistem", roles: ["ketua", "admin_teknis"], milestone: null },
];

// Aksi tulis yang dijaga di server (selain hak buka halaman di atas).
export const ACTIONS = {
  "akun.kelola": ["admin_teknis"],
  // Master data (PRD §3.1): kelola = admin_kelompok; pelanggan & saluran hanya terlihat admin_kelompok & ketua.
  "master.kelola": ["admin_kelompok"],
  "pelanggan.lihat": ["admin_kelompok", "ketua"],
  "kontak.lihat": ["admin_kelompok", "ketua"], // NIK & no. HP anggota tanpa samaran (Security.md §7)
  // Jagung masuk (PRD §3.1): draft, konfirmasi, void, bukti = admin_kelompok; operator & ketua hanya lihat.
  "penerimaan.kelola": ["admin_kelompok"],
} as const satisfies Record<string, readonly AppRole[]>;

export type ActionKey = keyof typeof ACTIONS;

export const hasAnyRole = (roles: readonly AppRole[], allowed: readonly AppRole[]) => roles.some((r) => allowed.includes(r));

/** Item navigasi yang cocok dengan path (prefix terpanjang). */
export function navItemFor(pathname: string): NavItem | undefined {
  return [...NAV]
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export const navFor = (roles: readonly AppRole[]) => NAV.filter((n) => hasAnyRole(roles, n.roles));

export const canOpen = (roles: readonly AppRole[], pathname: string) => {
  const item = navItemFor(pathname);
  return item ? hasAnyRole(roles, item.roles) : false;
};

export const canDo = (roles: readonly AppRole[], action: ActionKey) => hasAnyRole(roles, ACTIONS[action]);

/** Halaman awal setelah login: dashboard bila boleh, selain itu menu pertama yang boleh dibuka. */
export const homeFor = (roles: readonly AppRole[]) => navFor(roles)[0]?.href ?? "/403";
