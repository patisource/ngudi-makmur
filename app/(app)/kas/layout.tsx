import { KasSubnav } from "@/features/cash/components/kas-subnav";
import { requireRole } from "@/lib/auth/session";

// Pembayaran & kas (PRD §5.8). Lihat: admin_kelompok & ketua. Operator produksi & admin teknis → 403 (uji wajib SRS §11).
export default async function CashLayout({ children }: LayoutProps<"/kas">) {
  await requireRole(["admin_kelompok", "ketua"]);
  return (
    <>
      <KasSubnav />
      {children}
    </>
  );
}
