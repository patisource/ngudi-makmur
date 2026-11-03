import { PageHeader } from "@/components/ui/card";
import { MasterTabs } from "@/features/master/components/tabs";
import { requireRole } from "@/lib/auth/session";

// Pembayaran & kas (PRD §5.8). Lihat: admin_kelompok & ketua. Operator produksi & admin teknis → 403 (uji wajib SRS §11).
export default async function CashLayout({ children }: LayoutProps<"/kas">) {
  await requireRole(["admin_kelompok", "ketua"]);
  return (
    <>
      <PageHeader
        title="Pembayaran & kas"
        description="Kas hanya berubah dari pembayaran terverifikasi, pemasukan lain, pengeluaran, refund, dan koreksi yang disetujui ketua — satu baris per dokumen."
      />
      <MasterTabs
        label="Bagian kas"
        tabs={[
          { href: "/kas/buku", label: "Saldo & buku kas" },
          { href: "/kas/pembayaran", label: "Pembayaran" },
          { href: "/kas/pengeluaran", label: "Pengeluaran" },
          { href: "/kas/pemasukan", label: "Pemasukan lain" },
          { href: "/kas/koreksi", label: "Koreksi kas" },
        ]}
      />
      {children}
    </>
  );
}
