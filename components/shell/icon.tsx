import {
  Box,
  FileText,
  Factory,
  History,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Store,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/auth/permissions";

// Satu peta ikon (Lucide, garis 1,75) agar nama ikon di konfigurasi navigasi tetap berupa string biasa.
const ICONS: Record<IconName | "sprout" | "pin" | "logout" | "menu" | "lock", LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  factory: Factory,
  box: Box,
  cart: ShoppingCart,
  wallet: Wallet,
  file: FileText,
  users: Users,
  history: History,
  shield: ShieldCheck,
  store: Store,
  tag: Tag,
  sprout: Sprout,
  pin: MapPin,
  logout: LogOut,
  menu: Menu,
  lock: LockKeyhole,
};

export type AnyIconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className }: { name: AnyIconName; size?: number; className?: string }) {
  const C = ICONS[name];
  return <C aria-hidden size={size} strokeWidth={1.75} className={className} />;
}
