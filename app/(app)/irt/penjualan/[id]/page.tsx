import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumb } from "@/components/shell/crumb";
import { Badge, PageHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { IrtVoidSaleButton } from "@/features/irt/components/irt-actions";
import { irtSale } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Penjualan IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

export default async function IrtSalePage({ params }: PageProps<"/irt/penjualan/[id]">) {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: s } = await irtSale(id);
  if (!s) notFound();
  const canManage = canDo(user.roles, "irt.kelola");
  const lines = [...s.irt_sale_lines].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <Crumb label={s.doc_number} />
      <Link href="/irt/penjualan" className="w-fit text-sm text-text-muted hover:text-text">
        ← Penjualan IRT
      </Link>
      <PageHeader
        title={s.doc_number}
        description={`${day.format(new Date(`${s.business_date}T00:00:00+07:00`))} · ${s.buyer_name ?? "Pembeli tidak dicatat"} · dicatat ${s.created_by_name}`}
        actions={
          <>
            <Badge tone={s.status === "void" ? "err" : "ok"}>{s.status === "void" ? "Dibatalkan" : "Tercatat"}</Badge>
            {canManage && s.status === "confirmed" && <IrtVoidSaleButton saleId={s.id} docNumber={s.doc_number} />}
          </>
        }
      />
      {s.status === "void" && (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">Dibatalkan: {s.void_reason}. Produk sudah dikembalikan ke stok.</p>
      )}
      <Table>
        <thead>
          <tr>
            <Th>Produk</Th>
            <Th num>Jumlah</Th>
            <Th num>Harga</Th>
            <Th num>Subtotal</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <Td>{l.irt_items?.name}</Td>
              <Td num>
                {l.qty_input} {l.unit === "pack" ? `pack (${l.qty_pcs} pcs)` : "pcs"}
              </Td>
              <Td num>
                {formatRupiah(l.price_snapshot)}/{l.unit}
              </Td>
              <Td num>{formatRupiah(l.line_total_rp)}</Td>
            </tr>
          ))}
          <tr>
            <Td className="font-semibold">Total</Td>
            <Td num className="font-semibold">
              {s.total_pcs} pcs
            </Td>
            <Td />
            <Td num className="font-semibold">
              {formatRupiah(s.total_rp)}
            </Td>
          </tr>
        </tbody>
      </Table>
      {s.note && <p className="text-sm text-text-muted">Catatan: {s.note}</p>}
      <p className="text-xs text-text-subtle">Penjualan IRT tidak mencatat pembayaran atau kas.</p>
    </>
  );
}
