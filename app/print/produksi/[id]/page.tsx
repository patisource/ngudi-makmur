import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintControls, ThermalPaper } from "@/components/shared/thermal";
import { getBatch } from "@/features/production/queries";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { COST_CATEGORY_LABEL } from "@/lib/production";
import { dbKgToGrams, formatKg } from "@/lib/qty";
import { center, HEADER_LINES, lr, sep, wrap, type PaperCols, type ThermalLine } from "@/lib/thermal";

export const metadata: Metadata = { title: "Cetak batch · Sistem Pengelolaan Jagung Desa Baturejo" };

const COLS: PaperCols = 48;
const printedAt = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });
const ymdToDmy = (d: string) => d.split("-").reverse().join("-");

// Cetak ringkasan batch 80 mm (T5.4). Hanya membaca; tidak mengubah stok atau HPP.
export default async function BatchPrintPage({ params }: PageProps<"/print/produksi/[id]">) {
  await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { batch: b, lines, costs } = await getBatch(id);
  if (!b) notFound();

  const inputG = dbKgToGrams(b.input_kg);
  const lossG = dbKgToGrams(b.loss_kg);
  const lineRows = (dir: "input" | "output") =>
    lines.filter((l) => l.direction === dir).map((l) => lr(`${dir === "input" ? "In " : "Out"} ${l.products?.name ?? ""}`, formatKg(dbKgToGrams(l.qty_kg)), COLS));
  const lines80: ThermalLine[] = [
    ...HEADER_LINES(COLS),
    center(`BATCH ${(b.batch_type_rules?.name ?? b.batch_type).toUpperCase()}`, { bold: true }),
    ...(b.status === "draft" ? [center("*** DRAFT - BELUM SAH ***", { bold: true })] : []),
    ...(b.status === "void" ? [center("*** DIBATALKAN ***", { bold: true })] : []),
    sep(COLS),
    lr("No.", b.doc_number ?? "-", COLS),
    lr("Tanggal", ymdToDmy(b.business_date), COLS),
    lr("Operator", b.operator_name, COLS),
    sep(COLS),
    ...lineRows("input"),
    ...lineRows("output"),
    lr("Sisa/susut", `${formatKg(lossG)} (${inputG > 0 ? String(Math.round((lossG / inputG) * 1000) / 10).replace(".", ",") : "0"}%)`, COLS),
    lr("Rincian sisa", formatKg(dbKgToGrams(b.residue_kg)), COLS),
    sep(COLS),
    lr("Bahan terpakai", b.material_cost != null ? formatRupiah(b.material_cost) : "-", COLS),
    ...costs.map((c) => lr(COST_CATEGORY_LABEL[c.category], formatRupiah(c.amount_rp), COLS)),
    lr("Total biaya", b.total_cost != null ? formatRupiah(b.total_cost) : "-", COLS, true),
    lr("HPP per kg", b.hpp_per_kg != null ? formatRupiah(b.hpp_per_kg) : "Data belum cukup", COLS, true),
    ...(b.note ? [sep(COLS), ...wrap(`Catatan: ${b.note}`, COLS)] : []),
    sep(COLS),
    center("Biaya batch tidak menambah/mengurangi kas."),
    center(`Dicetak ${printedAt.format(new Date())}`),
  ];

  return (
    <>
      <PrintControls backHref={`/produksi/${b.id}`} />
      <ThermalPaper lines={lines80} />
    </>
  );
}
