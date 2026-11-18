import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Crumb } from "@/components/shell/crumb";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { DecisionPanel } from "@/components/shared/decision-panel";
import { BatchActions } from "@/features/production/components/batch-actions";
import { decideBatchVoid } from "@/features/stock/actions";
import { BatchVoidRequest } from "@/features/stock/components/stock-forms";
import { hppSettings } from "@/features/hpp/queries";
import { BatchEditor } from "@/features/production/components/batch-editor";
import { BATCH_STATUS_LABEL, BATCH_STATUS_TONE, batchTypeOptions, getBatch } from "@/features/production/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { COST_CATEGORY_LABEL, COST_UNIT_LABEL, summarizeBatch } from "@/lib/production";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";

export const metadata: Metadata = { title: "Batch produksi · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const kgInput = (v: number) => gramsToKgString(dbKgToGrams(v)).replace(".", ",");
const pct = (part: number, whole: number) => (whole > 0 ? `${String(Math.round((part / whole) * 1000) / 10).replace(".", ",")}%` : "—");

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`text-right tabular-nums ${strong ? "font-semibold" : ""}`}>{children}</span>
    </div>
  );
}

// Detail batch (FR-PRD-07, FR-PRD-09, T5.4): draft → editor + konfirmasi; terkonfirmasi → baca saja + cetak.
export default async function BatchPage({ params, searchParams }: PageProps<"/produksi/[id]">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canManage = canDo(user.roles, "produksi.kelola");
  const canConfirm = user.permissions.includes("production.confirm");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const [{ batch: b, lines, costs }, options, hppParams] = await Promise.all([getBatch(id), batchTypeOptions(), hppSettings()]);
  if (!b) notFound();

  const isDraft = b.status === "draft";
  const inputs = lines.filter((l) => l.direction === "input");
  const outputs = lines.filter((l) => l.direction === "output");
  const opt = options.find((o) => o.batchType === b.batch_type);
  const inName = opt?.input?.name ?? inputs[0]?.products?.name ?? "Bahan";
  const outName = opt?.output?.name ?? outputs[0]?.products?.name ?? "Hasil";
  const inputG = dbKgToGrams(b.input_kg);
  const outputG = dbKgToGrams(b.output_kg);
  const lossG = dbKgToGrams(b.loss_kg);
  const residueG = dbKgToGrams(b.residue_kg);
  const estimate = summarizeBatch(inputs.map((l) => dbKgToGrams(l.qty_kg)), outputs.map((l) => dbKgToGrams(l.qty_kg)), costs.map((c) => c.amount_rp), opt?.inputAvgCost ?? null);
  const impact = `${inName} −${formatKg(estimate.inputGrams)}, ${outName} +${formatKg(estimate.outputGrams)}, sisa/susut ${formatKg(estimate.lossGrams)}${estimate.hpp != null ? `, HPP ± ${formatRupiah(estimate.hpp)}/kg` : ""}`;

  if (isDraft && canManage && opt) {
    return (
      <>
        <Crumb label={`Batch ${b.batch_type_rules?.name.toLowerCase() ?? ""}`} />
        {sp.simpan === "baru" && (
          <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
            Draft batch tersimpan. Periksa ringkasan lalu konfirmasi untuk memperbarui stok.
          </p>
        )}
        <BatchEditor
          batchId={b.id}
          options={options}
          params={hppParams}
          header={{ title: `Batch ${b.batch_type_rules?.name.toLowerCase() ?? ""} baru`, subtitle: `Operator: ${b.operator_name} · kode batch terbit saat dikonfirmasi` }}
          actions={<BatchActions id={b.id} impact={impact} canConfirm={canConfirm} canDelete={canManage} />}
          defaults={{
            batchType: b.batch_type,
            businessDate: b.business_date,
            note: b.note ?? "",
            residueKg: kgInput(b.residue_kg),
            inputs: inputs.map((l) => kgInput(l.qty_kg)),
            outputs: outputs.map((l) => kgInput(l.qty_kg)),
            costs: costs.map((c) => ({
              category: c.category,
              amount: c.qty != null ? "" : String(c.amount_rp),
              qty: c.qty != null ? kgInput(c.qty) : "",
              unit: c.unit ?? "",
              unitPrice: c.unit_price != null ? String(c.unit_price) : "",
              sourceRef: c.source_ref ?? "",
              note: c.note ?? "",
            })),
          }}
        />
      </>
    );
  }

  return (
    <>
      <Crumb label={b.doc_number ?? "Draft batch"} />
      <PageHeader
        title={b.doc_number ?? `Draft ${b.batch_type_rules?.name.toLowerCase() ?? "batch"}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={BATCH_STATUS_TONE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</Badge>
            {b.batch_type_rules?.name} · {dateFmt.format(new Date(`${b.business_date}T00:00:00+07:00`))} · {b.operator_name}
          </span>
        }
        actions={
          <>
            <Link href="/produksi" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Kembali
            </Link>
            {!isDraft && (
              <Link href={`/print/produksi/${b.id}`} target="_blank" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
                Cetak
              </Link>
            )}
          </>
        }
      />
      {sp.simpan === "baru" && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          Draft batch tersimpan. Periksa ringkasan lalu konfirmasi untuk memperbarui stok.
        </p>
      )}

      {isDraft && canConfirm && (
        <div className="flex flex-wrap gap-2">
          <BatchActions id={b.id} impact={impact} canConfirm={canConfirm} canDelete={false} />
        </div>
      )}

      {(b.status === "confirmed" || b.status === "pending_void" || b.status === "void") && (b.void_reason || canDo(user.roles, "produksi.batal.ajukan")) && (
        <Card>
          <h2 className="font-semibold">Pembatalan batch</h2>
          {b.status === "pending_void" && <p className="text-sm text-warning">Menunggu persetujuan ketua · alasan: {b.void_reason}</p>}
          {b.status === "void" && (
            <p className="text-sm text-danger">
              Dibatalkan{b.voided_at ? ` ${timeFmt.format(new Date(b.voided_at))}` : ""} · alasan: {b.void_reason}. Hasil dikeluarkan dan bahan dikembalikan ke stok.
            </p>
          )}
          {b.status === "confirmed" && canDo(user.roles, "produksi.batal.ajukan") && <BatchVoidRequest batchId={b.id} docNumber={b.doc_number ?? ""} />}
          {b.status === "pending_void" && canDo(user.roles, "produksi.batal.putuskan") && b.void_requested_by !== user.id && (
            <DecisionPanel
              decide={decideBatchVoid.bind(null, b.id)}
              approveText="Setujui pembatalan"
              rejectText="Tolak pembatalan"
              summary={`Batalkan ${b.doc_number}: ${outName} −${formatKg(outputG)}, ${inName} +${formatKg(inputG)} kembali ke stok.`}
            />
          )}
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Table>
              <thead>
                <tr>
                  <Th>Baris</Th>
                  <Th>Produk</Th>
                  <Th num>Berat</Th>
                  <Th num>Nilai</Th>
                </tr>
              </thead>
              <tbody>
                {[...inputs, ...outputs].map((l) => (
                  <tr key={l.id}>
                    <Td>{l.direction === "input" ? "Input" : "Output"}</Td>
                    <Td>{l.products?.name ?? "—"}</Td>
                    <Td num>{formatKg(dbKgToGrams(l.qty_kg))}</Td>
                    <Td num className="text-text-muted">
                      {l.value_rp != null ? formatRupiah(l.value_rp) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {costs.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Biaya batch</Th>
                    <Th>Rincian</Th>
                    <Th num>Nilai</Th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr key={c.id}>
                      <Td>{COST_CATEGORY_LABEL[c.category]}</Td>
                      <Td className="text-text-muted">
                        {c.qty != null && c.unit_price != null ? `${String(c.qty).replace(".", ",")} ${COST_UNIT_LABEL[c.unit ?? "kg"]} × ${formatRupiah(c.unit_price)}` : (c.source_ref ?? "—")}
                        {c.note && <span className="block text-xs text-text-subtle">{c.note}</span>}
                      </Td>
                      <Td num>{formatRupiah(c.amount_rp)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {b.note && <p className="text-sm text-text-muted">{b.note}</p>}
          </div>
          <Card>
            <h2 className="font-semibold">Ringkasan</h2>
            <div className="flex flex-col gap-2">
              <Row label="Total input">{formatKg(inputG)}</Row>
              <Row label="Total output">{formatKg(outputG)}</Row>
              <Row label="Sisa/susut">
                {formatKg(lossG)} · {pct(lossG, inputG)}
              </Row>
              <Row label="· rincian sisa">{formatKg(residueG)}</Row>
              <Row label="· susut">{formatKg(lossG - residueG)}</Row>
              <div className="my-1 border-t border-border" />
              <Row label="Bahan terpakai">{b.material_cost != null ? formatRupiah(b.material_cost) : "Dihitung saat konfirmasi"}</Row>
              <Row label="Biaya batch (BBM, tenaga, lain)">{formatRupiah(b.other_cost)}</Row>
              <Row label="Biaya tetap bulanan (alokasi)">{isDraft ? "Dibagi saat konfirmasi" : formatRupiah(b.fixed_cost_rp)}</Row>
              <Row label="Total biaya" strong>
                {b.total_cost != null ? formatRupiah(b.total_cost) : "—"}
              </Row>
              <div className="mt-1 rounded-md bg-surface-muted px-3 py-2.5">
                <span className="block text-xs text-text-muted">HPP per kg {isDraft ? "(perkiraan)" : "(rumus HPP 19 Nov 2026)"}</span>
                <span className="text-xl font-semibold tabular-nums">{b.hpp_per_kg != null ? formatRupiah(b.hpp_per_kg) : "—"}</span>
                {b.hpp_per_kg == null && <span className="block text-xs text-text-muted">Data belum cukup untuk menghitung HPP</span>}
              </div>
            </div>
            <p className="text-xs text-text-subtle">
              Biaya batch & biaya tetap hanya untuk HPP (sistem tanpa kas). HPP bisa berubah bila ada batch baru/batal di bulan yang sama.
              {b.confirmed_at && ` Dikonfirmasi ${timeFmt.format(new Date(b.confirmed_at))}.`}
            </p>
          </Card>
      </div>
    </>
  );
}
