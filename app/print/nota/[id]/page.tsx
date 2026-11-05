import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoggedPrintControls, ThermalPaper } from "@/components/shared/thermal";
import { orderReceipt, printCount } from "@/features/orders/receipt";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nota · Sistem Pengelolaan Jagung Desa Baturejo" };

// Nota thermal 80 mm (T8.3, FR-RPT-01..03b): dari transaksi tersimpan; cetak ulang = nomor sama + "CETAK ULANG ke-n".
export default async function OrderReceiptPrintPage({ params }: PageProps<"/print/nota/[id]">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const nota = await orderReceipt(id, await printCount("order", id));
  if (!nota) notFound();
  return (
    <>
      <LoggedPrintControls backHref={`/penjualan/${id}`} docType="order" docId={id} canPrint={canDo(user.roles, "penjualan.kelola")} />
      <ThermalPaper lines={nota.lines} />
    </>
  );
}
