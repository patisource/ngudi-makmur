import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoggedPrintControls, ThermalPaper } from "@/components/shared/thermal";
import { paymentReceipt, printCount } from "@/features/orders/receipt";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Kuitansi · SIM Ngudi Makmur" };

// Kuitansi pembayaran 80 mm (FR-RPT-02): hanya pembayaran terverifikasi; cetak ulang bertanda, tanpa mengubah kas.
export default async function PaymentReceiptPrintPage({ params }: PageProps<"/print/kuitansi/[id]">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const k = await paymentReceipt(id, await printCount("payment", id));
  if (!k) notFound();
  return (
    <>
      <LoggedPrintControls backHref={`/penjualan/${k.payment.orderId}`} docType="payment" docId={id} canPrint={canDo(user.roles, "penjualan.kelola")} />
      <ThermalPaper lines={k.lines} />
    </>
  );
}
