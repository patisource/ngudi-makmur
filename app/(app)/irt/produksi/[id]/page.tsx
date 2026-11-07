import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumb } from "@/components/shell/crumb";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { IrtBatchEditor } from "@/features/irt/components/batch-editor";
import { irtBatch, irtStock } from "@/features/irt/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatIrtQty, pcsWithPack } from "@/lib/irt";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Batch produksi IRT · Sistem Pengelolaan Jagung Desa Baturejo" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

// Detail batch IRT: draft → editor (pengurus IRT); terkonfirmasi → baca saja dengan nilai & HPP terkunci.
export default async function IrtBatchPage({ params }: PageProps<"/irt/produksi/[id]">) {
  const user = await requireRole(["pengurus_irt", "ketua"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: b } = await irtBatch(id);
  if (!b) notFound();
  const canManage = canDo(user.roles, "irt.kelola");
  const lines = [...b.irt_batch_lines].sort((x, y) => x.sort_order - y.sort_order);
  const bahanLines = lines.filter((l) => l.role === "bahan");
  const hasilLines = lines.filter((l) => l.role === "hasil");

  if (b.status === "draft" && canManage) {
    const { data } = await irtStock();
    const bahan = (data ?? []).filter((r) => r.kind === "bahan");
    const produk = (data ?? []).filter((r) => r.kind === "produk");
    return (
      <>
        <Crumb label="Draft" />
        <PageHeader title="Draft produksi" description={`Dibuat ${b.created_by_name}. Stok belum berubah sampai dikonfirmasi.`} />
        <IrtBatchEditor
          defaults={{
            id: b.id,
            date: b.business_date,
            note: b.note ?? "",
            inputs: bahanLines.map((l) => ({ itemId: l.item_id, qty: String(l.qty).replace(".", ",") })),
            outputs: hasilLines.map((l) => ({ itemId: l.item_id, qty: String(Number(l.qty)) })),
          }}
          bahan={bahan.map((r) => ({ item_id: r.item_id, name: r.name, unit: r.unit, on_hand: Number(r.on_hand), avg_cost: r.avg_cost }))}
          produk={produk.map((r) => ({ item_id: r.item_id, name: r.name, pack_size: r.pack_size }))}
        />
      </>
    );
  }

  return (
    <>
      <Crumb label={b.doc_number ?? "Draft"} />
      <Link href="/irt/produksi" className="w-fit text-sm text-text-muted hover:text-text">
        ← Produksi IRT
      </Link>
      <PageHeader
        title={b.doc_number ?? "Draft produksi"}
        description={`${day.format(new Date(`${b.business_date}T00:00:00+07:00`))} · ${b.created_by_name}${b.note ? ` · ${b.note}` : ""}`}
        actions={<Badge tone={b.status === "confirmed" ? "ok" : "neutral"}>{b.status === "confirmed" ? "Terkonfirmasi" : "Draft"}</Badge>}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Table>
            <thead>
              <tr>
                <Th>Bahan dipakai</Th>
                <Th num>Jumlah</Th>
                <Th num>Nilai</Th>
              </tr>
            </thead>
            <tbody>
              {bahanLines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.irt_items?.name}</Td>
                  <Td num>{l.irt_items ? formatIrtQty(Number(l.qty), l.irt_items.unit) : l.qty}</Td>
                  <Td num>{l.value_rp != null ? formatRupiah(l.value_rp) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Table>
            <thead>
              <tr>
                <Th>Hasil</Th>
                <Th num>Jumlah</Th>
                <Th num>Nilai persediaan</Th>
              </tr>
            </thead>
            <tbody>
              {hasilLines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.irt_items?.name}</Td>
                  <Td num>{pcsWithPack(Number(l.qty), l.irt_items?.pack_size ?? null)}</Td>
                  <Td num>{l.value_rp != null ? formatRupiah(l.value_rp) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <Card className="gap-3">
          <h2 className="font-semibold">HPP</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Nilai bahan</dt>
              <dd className="tabular-nums">{b.input_value_rp != null ? formatRupiah(b.input_value_rp) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Hasil</dt>
              <dd className="tabular-nums">{b.output_pcs ?? "—"} pcs</dd>
            </div>
          </dl>
          <div className="rounded-lg bg-surface-muted px-4 py-3">
            <span className="block text-xs text-text-muted">HPP per pcs</span>
            <span className="text-xl font-semibold tabular-nums">{b.hpp_per_pcs != null ? formatRupiah(b.hpp_per_pcs) : "—"}</span>
          </div>
          <p className="text-xs text-text-subtle">Batch terkonfirmasi tidak bisa diubah. Selisih stok diperbaiki lewat koreksi di menu Stok IRT.</p>
        </Card>
      </div>
    </>
  );
}
