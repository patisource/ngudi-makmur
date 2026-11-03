import "server-only";
import { METHOD_LABEL } from "@/lib/cash";
import { formatRupiah } from "@/lib/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";
import { createClient } from "@/lib/supabase/server";
import { center, HEADER_LINES, lr, sep, wrap, type PaperCols, type ThermalLine } from "@/lib/thermal";

// Nota penjualan & kuitansi (FR-RPT-01..03a): disusun dari transaksi yang SUDAH tersimpan; tidak menulis apa pun
// selain print_logs (dicatat terpisah lewat log_print saat benar-benar dicetak). Nomor nota = nomor pesanan (INV).

const COLS: PaperCols = 48;
const ymdToDmy = (d: string) => d.split("-").reverse().join("-");
const printedAt = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });
const qtyText = (v: number) => gramsToKgString(dbKgToGrams(v)).replace(".", ",");

export async function printCount(docType: "order" | "payment", id: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("print_logs").select("id", { count: "exact", head: true }).eq("doc_type", docType).eq("doc_id", id);
  return count ?? 0;
}

/** Nota pesanan. priorPrints = cetakan sebelumnya; > 0 → tanda "CETAK ULANG ke-n". */
export async function orderReceipt(orderId: string, priorPrints: number) {
  const supabase = await createClient();
  const [{ data: o }, { data: items }, { data: pays }, { data: refunds }, { data: bal }] = await Promise.all([
    supabase.from("orders").select("*, sales_channels(name)").eq("id", orderId).maybeSingle(),
    supabase.from("order_items").select("qty_input, qty_kg, unit_label, product_packaging_id, price_snapshot, discount_rp, line_total_rp, products(name)").eq("order_id", orderId).order("sort_order"),
    supabase.from("payments").select("doc_number, business_date, method, amount_rp").eq("order_id", orderId).eq("status", "verified").order("verified_at"),
    supabase.from("refunds").select("doc_number, amount_rp").eq("order_id", orderId).order("created_at"),
    supabase.from("v_order_balance").select("bill_rp, paid_rp, refunded_rp, outstanding_rp, returned_rp").eq("order_id", orderId).maybeSingle(),
  ]);
  if (!o || o.status === "draft") return null;

  const lines: ThermalLine[] = [
    ...HEADER_LINES(COLS),
    center("NOTA PENJUALAN", { bold: true }),
    ...(priorPrints > 0 ? [center(`*** CETAK ULANG ke-${priorPrints} ***`, { bold: true })] : []),
    ...(o.status === "cancelled" ? [center("*** PESANAN DIBATALKAN ***", { bold: true })] : []),
    sep(COLS),
    lr("No.", o.doc_number ?? "-", COLS, true),
    lr("Tanggal", ymdToDmy(o.business_date), COLS),
    lr("Pelanggan", o.customer_name, COLS),
    lr("Saluran", o.sales_channels?.name ?? o.channel, COLS),
    sep(COLS),
  ];
  for (const it of items ?? []) {
    const unit = it.product_packaging_id ? it.unit_label.toLowerCase() : "kg";
    lines.push(...wrap(it.products?.name ?? "Produk", COLS));
    lines.push(lr(`  ${qtyText(it.qty_input)} ${unit} x ${formatRupiah(it.price_snapshot)}`, formatRupiah(it.line_total_rp + it.discount_rp), COLS));
    if (it.product_packaging_id) lines.push({ text: `  = ${formatKg(dbKgToGrams(it.qty_kg))}` });
    if (it.discount_rp > 0) lines.push(lr("  Diskon", `-${formatRupiah(it.discount_rp)}`, COLS));
  }
  lines.push(
    sep(COLS),
    lr("Subtotal", formatRupiah(o.subtotal_rp), COLS),
    ...(o.discount_rp > 0 ? [lr("Diskon", `-${formatRupiah(o.discount_rp)}`, COLS)] : []),
    ...(o.shipping_rp > 0 ? [lr("Ongkos kirim", formatRupiah(o.shipping_rp), COLS)] : []),
    lr("TOTAL", formatRupiah(o.total_rp), COLS, true),
    ...((bal?.returned_rp ?? 0) > 0 ? [lr("Retur", `-${formatRupiah(bal?.returned_rp ?? 0)}`, COLS)] : []),
    sep(COLS),
  );
  for (const p of pays ?? []) lines.push(lr(`${p.doc_number} ${METHOD_LABEL[p.method]}`, formatRupiah(p.amount_rp), COLS));
  for (const r of refunds ?? []) lines.push(lr(`${r.doc_number} refund`, `-${formatRupiah(r.amount_rp)}`, COLS));
  lines.push(
    lr("Dibayar", formatRupiah((bal?.paid_rp ?? 0) - (bal?.refunded_rp ?? 0)), COLS),
    lr("Sisa tagihan", formatRupiah(bal?.outstanding_rp ?? 0), COLS, true),
    lr("Status bayar", PAYMENT_STATUS_LABEL[o.payment_status], COLS),
    lr("Status barang", ORDER_STATUS_LABEL[o.status], COLS),
    sep(COLS),
    center("Terima kasih."),
    center(`Dicetak ${printedAt.format(new Date())}`),
  );
  return { order: { id: o.id, docNumber: o.doc_number, status: o.status, paymentStatus: o.payment_status, totalRp: o.total_rp, outstandingRp: bal?.outstanding_rp ?? 0 }, lines };
}

/** Kuitansi satu pembayaran terverifikasi (FR-RPT-02). */
export async function paymentReceipt(paymentId: string, priorPrints: number) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("payments").select("id, doc_number, business_date, method, amount_rp, status, note, order_id, cash_accounts(name), orders(doc_number, customer_name)").eq("id", paymentId).maybeSingle();
  if (!p || p.status !== "verified") return null;
  const { data: bal } = await supabase.from("v_order_balance").select("outstanding_rp").eq("order_id", p.order_id).maybeSingle();
  const lines: ThermalLine[] = [
    ...HEADER_LINES(COLS),
    center("KUITANSI PEMBAYARAN", { bold: true }),
    ...(priorPrints > 0 ? [center(`*** CETAK ULANG ke-${priorPrints} ***`, { bold: true })] : []),
    sep(COLS),
    lr("No.", p.doc_number ?? "-", COLS, true),
    lr("Tanggal", ymdToDmy(p.business_date), COLS),
    lr("Untuk nota", p.orders?.doc_number ?? "-", COLS),
    lr("Dari", p.orders?.customer_name ?? "-", COLS),
    lr("Metode", `${METHOD_LABEL[p.method]} (${p.cash_accounts?.name ?? "-"})`, COLS),
    sep(COLS),
    lr("JUMLAH", formatRupiah(p.amount_rp), COLS, true),
    lr("Sisa tagihan", formatRupiah(bal?.outstanding_rp ?? 0), COLS),
    ...(p.note ? [sep(COLS), ...wrap(`Catatan: ${p.note}`, COLS)] : []),
    sep(COLS),
    lr("Penerima", "", COLS),
    { text: "" },
    { text: "" },
    lr("(................)", "", COLS),
    sep(COLS),
    center(`Dicetak ${printedAt.format(new Date())}`),
  ];
  return { payment: { id: p.id, orderId: p.order_id, docNumber: p.doc_number }, lines };
}
