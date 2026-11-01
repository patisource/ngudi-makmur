import { PageHeader } from "@/components/ui/card";
import { MasterTabs } from "@/features/master/components/tabs";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

// Master data (PRD §5.3). Lihat: admin_kelompok, operator_produksi, ketua; kelola: admin_kelompok.
export default async function MasterLayout({ children }: LayoutProps<"/master">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const tabs = [
    { href: "/master/anggota", label: "Anggota" },
    { href: "/master/produk", label: "Produk & kemasan" },
    ...(canDo(user.roles, "pelanggan.lihat")
      ? [
          { href: "/master/pelanggan", label: "Pelanggan" },
          { href: "/master/kemasan", label: "Jenis kemasan & saluran" },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader title="Anggota & produk" description="Data master diarsip, tidak dihapus. Semua stok dalam kg; kemasan penjualan wajib punya konversi kg." />
      <MasterTabs tabs={tabs} />
      {children}
    </>
  );
}
