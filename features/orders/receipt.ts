import "server-only";
import { formatRupiah } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";
import { createClient } from "@/lib/supabase/server";
import { center, HEADER_LINES, lr, sep, wrap, type PaperCols, type ThermalLine } from "@/lib/thermal";

// Nota penjualan (FR-RPT-01..03a; kuitansi pembayaran dihapus bersama fitur kas): disusun dari transaksi yang SUDAH tersimpan; tidak menulis apa pun
// selain print_logs (dicatat terpisah lewat log_print saat benar-benar dicetak). Nomor nota = nomor pesanan (INV).

const ymdToDmy = (d: string) => d.split("-").reverse().join("-");
const printedAt = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });
const qtyText = (v: number) => gramsToKgString(dbKgToGrams(v)).replace(".", ",");

export async function printCount(docType: "order", id: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("print_logs").select("id", { count: "exact", head: true }).eq("doc_type", docType).eq("doc_id", id);
  return count ?? 0;
}

/**
 * Nota pesanan. priorPrints = cetakan sebelumnya; > 0 → tanda "CETAK ULANG ke-n". Satu kali baca data, baris
 * disusun untuk setiap lebar kertas yang diminta (80 mm = 48 kolom, 58 mm = 32 kolom; StyleGuide §8.4).
 */
export async function orderReceipt(orderId: string, priorPrints: number, opts: { cashier?: string } = {}) {
  const supabase = await createClient();
  const [{ data: o }, { data: items }, { data: bal }] = await Promise.all([
    supabase.from("orders").select("*, sales_channels(name)").eq("id", orderId).maybeSingle(),
    supabase.from("order_items").select("qty_input, qty_kg, unit_label, product_packaging_id, price_snapshot, discount_rp, line_total_rp, products(name)").eq("order_id", orderId).order("sort_order"),
    supabase.from("v_order_balance").select("bill_rp, returned_rp").eq("order_id", orderId).maybeSingle(),
  ]);
  if (!o || o.status === "draft") return null;

  const build = (COLS: PaperCols): ThermalLine[] => {
    const lines: ThermalLine[] = [
      ...HEADER_LINES(COLS),
      center("NOTA PENJUALAN", { bold: true }),
      ...(priorPrints > 0 ? [center(`*** CETAK ULANG ke-${priorPrints} ***`, { bold: true })] : []),
      ...(o.status === "cancelled" ? [center("*** PESANAN DIBATALKAN ***", { bold: true })] : []),
      sep(COLS),
      lr("No.", o.doc_number ?? "-", COLS, true),
      lr("Tanggal", ymdToDmy(o.business_date), COLS),
      ...(opts.cashier ? [lr("Kasir", opts.cashier, COLS)] : []),
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
    lines.push(
      lr("Status barang", ORDER_STATUS_LABEL[o.status], COLS),
      sep(COLS),
      center("Terima kasih atas pembelian Anda"),
      center("Simpan struk ini sebagai bukti."),
      center(`Dicetak ${printedAt.format(new Date())}`),
    );
    return lines;
  };
  return {
    order: { id: o.id, docNumber: o.doc_number, status: o.status, totalRp: o.total_rp, netRp: bal?.bill_rp ?? o.total_rp },
    lines: build(48),
    lines58: build(32),
  };
}

