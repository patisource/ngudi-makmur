import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/card";
import { EmptyState, Sub, Table, Td, Th } from "@/components/ui/table";
import { OpnameForm } from "@/features/stock/components/stock-forms";
import { countableProducts, listOpnames } from "@/features/stock/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Stok opname · SIM Ngudi Makmur" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

// Stok opname (FR-STK-03, T9.1): hitung fisik → draft → posting (selisih jadi mutasi stok opname). Kelola: admin & operator.
export default async function OpnamePage() {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canCount = canDo(user.roles, "stok.hitung");
  const [rows, products] = await Promise.all([listOpnames(), canCount ? countableProducts() : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title="Stok opname"
        description="Cocokkan stok fisik dengan catatan. Selisih dicatat sebagai mutasi stok opname saat diposting; riwayat tidak dihapus."
        actions={
          <Link href="/stok" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali ke stok
          </Link>
        }
      />
      {canCount && products.length > 0 && <OpnameForm opnameId={null} products={products} />}
      {rows.length === 0 ? (
        <EmptyState title="Belum ada stok opname">{canCount ? "Isi hitungan fisik di atas lalu simpan sebagai draft." : "Admin kelompok atau operator belum mencatat opname."}</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Tanggal</Th>
              <Th>Nomor</Th>
              <Th num>Produk dihitung</Th>
              <Th num>Total selisih</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const diffG = o.stock_opname_lines.reduce((s, l) => s + (l.diff_kg == null ? 0 : dbKgToGrams(Math.abs(l.diff_kg)) * Math.sign(l.diff_kg)), 0);
              return (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap">{dateFmt.format(new Date(`${o.business_date}T00:00:00+07:00`))}</Td>
                  <Td>
                    <Link href={`/stok/opname/${o.id}`} className="font-mono text-xs font-medium underline-offset-4 hover:underline">
                      {o.doc_number ?? "Draft"}
                    </Link>
                    <Sub>
                      {o.created_by_name}
                      {o.note ? ` · ${o.note}` : ""}
                    </Sub>
                  </Td>
                  <Td num>{o.stock_opname_lines.length}</Td>
                  <Td num>{o.status === "posted" ? `${diffG > 0 ? "+" : diffG < 0 ? "−" : ""}${formatKg(Math.abs(diffG))}` : "—"}</Td>
                  <Td>
                    <Badge tone={o.status === "posted" ? "info" : "neutral"}>{o.status === "posted" ? "Diposting" : "Draft"}</Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
