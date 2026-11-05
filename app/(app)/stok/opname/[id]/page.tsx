import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { OpnameActions, OpnameForm } from "@/features/stock/components/stock-forms";
import { countableProducts, getOpname } from "@/features/stock/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";

export const metadata: Metadata = { title: "Stok opname · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
const signedKg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatKg(dbKgToGrams(Math.abs(v)))}`;

export default async function OpnameDetailPage({ params }: PageProps<"/stok/opname/[id]">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canCount = canDo(user.roles, "stok.hitung");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { opname: o, lines } = await getOpname(id);
  if (!o) notFound();
  const isDraft = o.status === "draft";
  const products = isDraft && canCount ? await countableProducts() : [];
  const onHand = new Map(products.map((p) => [p.id, p.onHandKg]));
  const preview = lines.map((l) => ({ name: l.products?.name ?? "Produk", diffG: dbKgToGrams(l.physical_kg) - dbKgToGrams(onHand.get(l.product_id) ?? 0) }));
  const impact = preview.filter((p) => p.diffG !== 0).map((p) => `${p.name} ${p.diffG > 0 ? "+" : "−"}${formatKg(Math.abs(p.diffG))}`).join(", ") || "Tidak ada selisih";

  return (
    <>
      <PageHeader
        title={o.doc_number ?? "Draft stok opname"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={isDraft ? "neutral" : "info"}>{isDraft ? "Draft" : "Diposting"}</Badge>
            {dateFmt.format(new Date(`${o.business_date}T00:00:00+07:00`))} · {o.created_by_name}
          </span>
        }
        actions={
          <Link href="/stok/opname" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali
          </Link>
        }
      />
      {isDraft && canCount ? (
        <>
          <Card>
            <h2 className="font-semibold">Posting</h2>
            <OpnameActions id={o.id} impact={impact} />
          </Card>
          <OpnameForm
            opnameId={o.id}
            products={products}
            defaults={{ date: o.business_date, note: o.note ?? "", physical: Object.fromEntries(lines.map((l) => [l.product_id, gramsToKgString(dbKgToGrams(l.physical_kg)).replace(".", ",")])) }}
          />
        </>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Produk</Th>
              <Th num>Tercatat</Th>
              <Th num>Fisik</Th>
              <Th num>Selisih</Th>
              <Th num>Nilai penyesuaian</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <Td>{l.products?.name}</Td>
                <Td num>{l.system_kg != null ? formatKg(dbKgToGrams(l.system_kg)) : "—"}</Td>
                <Td num>{formatKg(dbKgToGrams(l.physical_kg))}</Td>
                <Td num>{l.diff_kg != null ? signedKg(l.diff_kg) : "—"}</Td>
                <Td num>{l.value_rp != null ? formatRupiah(l.value_rp) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {o.note && !isDraft && <p className="text-sm text-text-muted">{o.note}</p>}
    </>
  );
}
