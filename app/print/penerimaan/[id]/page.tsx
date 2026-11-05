import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintControls, ThermalPaper } from "@/components/shared/thermal";
import { getReceipt } from "@/features/receipts/queries";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";
import { center, HEADER_LINES, lr, sep, wrap, type PaperCols, type ThermalLine } from "@/lib/thermal";

export const metadata: Metadata = { title: "Bukti penerimaan · Sistem Pengelolaan Jagung Desa Baturejo" };

const COLS: PaperCols = 48; // kertas 80 mm (default)
const printedAt = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });
const ymdToDmy = (d: string) => d.split("-").reverse().join("-");

// Bukti penerimaan 80 mm (T4.4). Hanya membaca dokumen tersimpan; mencetak ulang memakai nomor yang sama
// dan tidak mengubah stok (PRD §5.4 kriteria penerimaan).
export default async function ReceiptPrintPage({ params }: PageProps<"/print/penerimaan/[id]">) {
  await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { receipt: r } = await getReceipt(id);
  if (!r) notFound();

  const grams = dbKgToGrams(r.weight_kg);
  const lines: ThermalLine[] = [
    ...HEADER_LINES(COLS),
    center("BUKTI PENERIMAAN JAGUNG", { bold: true }),
    ...(r.status === "void" ? [center("*** DIBATALKAN ***", { bold: true })] : []),
    ...(r.status === "draft" ? [center("*** DRAFT - BELUM SAH ***", { bold: true })] : []),
    sep(COLS),
    lr("No.", r.doc_number ?? "-", COLS),
    lr("Tanggal", ymdToDmy(r.business_date), COLS),
    r.source_type === "anggota" ? lr("Anggota", `${r.members?.name ?? "-"} (${r.members?.code ?? ""})`, COLS) : lr("Pemasok", r.supplier_name ?? "-", COLS),
    lr("Jenis", r.products?.name ?? "-", COLS),
    sep(COLS),
    lr("Berat", formatKg(grams), COLS, true),
    ...(r.moisture_pct != null ? [lr("Kadar air", `${String(r.moisture_pct).replace(".", ",")}%`, COLS)] : []),
    lr("Biaya perolehan", formatRupiah(r.acquisition_cost), COLS),
    ...(grams > 0 ? [lr("Biaya per kg", formatRupiah(Math.round((r.acquisition_cost * 1000) / grams)), COLS)] : []),
    ...(r.note ? [sep(COLS), ...wrap(`Catatan: ${r.note}`, COLS)] : []),
    ...(r.status === "void" && r.void_reason ? [sep(COLS), ...wrap(`Alasan batal: ${r.void_reason}`, COLS)] : []),
    sep(COLS),
    lr("Penyetor", "Petugas", COLS),
    { text: "" },
    { text: "" },
    lr("(................)", "(................)", COLS),
    sep(COLS),
    center("Simpan bukti ini."),
    center(`Dicetak ${printedAt.format(new Date())}`),
  ];

  return (
    <>
      <PrintControls backHref={`/jagung-masuk/${r.id}`} />
      <ThermalPaper lines={lines} />
    </>
  );
}
