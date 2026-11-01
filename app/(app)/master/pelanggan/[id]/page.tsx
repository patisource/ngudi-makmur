import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui/card";
import { ArchiveButton, CustomerForm } from "@/features/master/components/forms";
import { getCustomer } from "@/features/master/queries";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Ubah pelanggan · SIM Ngudi Makmur" };

export default async function EditCustomerPage({ params }: PageProps<"/master/pelanggan/[id]">) {
  await requireAction("master.kelola");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: c } = await getCustomer(id);
  if (!c) notFound();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{c.name}</h2>
          <span className="font-mono text-xs text-text-muted">{c.code}</span>
          {c.archived_at && <Badge>Diarsip</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <ArchiveButton table="customers" id={c.id} archived={Boolean(c.archived_at)} />
          <Link href="/master/pelanggan" className="text-sm text-text-muted hover:text-text">
            Kembali
          </Link>
        </div>
      </div>
      <CustomerForm customerId={c.id} defaults={{ name: c.name, type: c.type, phone: c.phone, address: c.address, note: c.note }} />
    </Card>
  );
}
