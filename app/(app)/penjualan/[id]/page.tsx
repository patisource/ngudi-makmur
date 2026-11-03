import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { OrderActions } from "@/features/orders/components/order-actions";
import { OrderForm } from "@/features/orders/components/order-form";
import { getOrder, orderFormOptions } from "@/features/orders/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/order";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";

export const metadata: Metadata = { title: "Pesanan · SIM Ngudi Makmur" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const qtyText = (v: number) => gramsToKgString(dbKgToGrams(v)).replace(".", ",");
const longDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00+07:00`));

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`text-right tabular-nums ${strong ? "font-semibold" : ""}`}>{children}</span>
    </div>
  );
}

// Detail pesanan (StyleGuide §5.2): draft → editor + konfirmasi/hapus; terkonfirmasi → baca saja + serah/batal;
// diserahkan/batal → baca saja. Ketua hanya melihat.
export default async function OrderPage({ params, searchParams }: PageProps<"/penjualan/[id]">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canManage = canDo(user.roles, "penjualan.kelola");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const { order: o, items, balance } = await getOrder(id);
  if (!o) notFound();

  const isDraft = o.status === "draft";
  const options = isDraft && canManage ? await orderFormOptions() : null;

  // Kebutuhan kg per produk (dampak konfirmasi / serah barang), nama produk dari master.
  const byProduct = new Map<string, { name: string; grams: number }>();
  for (const it of items) {
    const cur = byProduct.get(it.product_id) ?? { name: it.products?.name ?? "Produk", grams: 0 };
    cur.grams += dbKgToGrams(it.qty_kg);
    byProduct.set(it.product_id, cur);
  }
  const kgText = [...byProduct.values()].map((p) => `${p.name} ${formatKg(p.grams)}`).join(", ");
  const impact = o.status === "draft" ? `Reservasi ${kgText || "—"} · tagihan ${formatRupiah(o.total_rp)}` : kgText;

  return (
    <>
      <PageHeader
        title={o.doc_number ?? "Draft pesanan"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
            {!isDraft && o.status !== "cancelled" && <Badge tone={PAYMENT_STATUS_TONE[o.payment_status]}>{PAYMENT_STATUS_LABEL[o.payment_status]}</Badge>}
            {o.customer_name} · {o.sales_channels?.name ?? o.channel} · {longDate(o.business_date)}
          </span>
        }
        actions={
          <Link href="/penjualan" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali
          </Link>
        }
      />
      {sp.simpan === "baru" && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          Draft pesanan tersimpan. Periksa ringkasan lalu konfirmasi untuk mereservasi stok.
        </p>
      )}

      {canManage && (o.status === "draft" || o.status === "confirmed") && (
        <Card>
          <h2 className="font-semibold">{isDraft ? "Konfirmasi" : "Serah barang atau batal"}</h2>
          <OrderActions id={o.id} status={o.status} docNumber={o.doc_number} businessDate={o.business_date} impact={impact} />
        </Card>
      )}

      {isDraft && options && !options.error ? (
        <OrderForm
          orderId={o.id}
          options={{ customers: options.customers, channels: options.channels, products: options.products }}
          defaults={{
            businessDate: o.business_date,
            customerId: o.customer_id,
            channel: o.channel,
            note: o.note ?? "",
            shipping: o.shipping_rp ? String(o.shipping_rp) : "",
            items: items.map((it) => ({ productId: it.product_id, packagingId: it.product_packaging_id ?? "", qty: qtyText(it.qty_input), discount: it.discount_rp ? String(it.discount_rp) : "" })),
          }}
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <Table>
              <thead>
                <tr>
                  <Th>Produk</Th>
                  <Th num>Jumlah</Th>
                  <Th num>Berat</Th>
                  <Th num>Harga</Th>
                  <Th num>Diskon</Th>
                  <Th num>Nilai</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <Td>{it.products?.name ?? "—"}</Td>
                    <Td num>
                      {qtyText(it.qty_input)} {it.product_packaging_id ? it.unit_label.toLowerCase() : "kg"}
                    </Td>
                    <Td num>{formatKg(dbKgToGrams(it.qty_kg))}</Td>
                    <Td num>{formatRupiah(it.price_snapshot)}</Td>
                    <Td num className="text-text-muted">
                      {it.discount_rp ? `−${formatRupiah(it.discount_rp)}` : "—"}
                    </Td>
                    <Td num>{formatRupiah(it.line_total_rp)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {o.note && <p className="text-sm text-text-muted">{o.note}</p>}
            {o.status === "cancelled" && (
              <Card className="border-danger-soft">
                <h2 className="font-semibold">Dibatalkan</h2>
                <p className="text-sm text-text-muted">
                  {o.cancelled_at && timeFmt.format(new Date(o.cancelled_at))} · {o.cancel_reason}
                </p>
              </Card>
            )}
          </div>
          <Card>
            <h2 className="font-semibold">Ringkasan</h2>
            <div className="flex flex-col gap-2">
              <Row label="Subtotal">{formatRupiah(o.subtotal_rp)}</Row>
              <Row label="Diskon">{o.discount_rp ? `−${formatRupiah(o.discount_rp)}` : formatRupiah(0)}</Row>
              <Row label="Ongkos kirim">{formatRupiah(o.shipping_rp)}</Row>
              <Row label="Total tagihan" strong>
                {formatRupiah(o.total_rp)}
              </Row>
              <div className="my-1 border-t border-border" />
              <Row label="Dibayar (terverifikasi)">{formatRupiah(balance?.paid_rp ?? 0)}</Row>
              <div className="mt-1 rounded-md bg-surface-muted px-3 py-2.5">
                <span className="block text-xs text-text-muted">Sisa tagihan</span>
                <span className="text-xl font-semibold tabular-nums">{formatRupiah(balance?.outstanding_rp ?? 0)}</span>
              </div>
              <div className="my-1 border-t border-border" />
              {[...byProduct.values()].map((p) => (
                <Row key={p.name} label={p.name}>
                  {formatKg(p.grams)}
                </Row>
              ))}
            </div>
            <p className="text-xs text-text-subtle">
              {o.status === "confirmed" && "Stok sudah direservasi; belum keluar sampai barang diserahkan."}
              {o.status === "delivered" &&
                `Diserahkan ${o.delivered_on ? longDate(o.delivered_on) : ""}${o.recipient_name ? ` kepada ${o.recipient_name}` : ""}.`}
              {o.confirmed_at && ` Dikonfirmasi ${timeFmt.format(new Date(o.confirmed_at))}.`} Pembayaran dicatat di modul Pembayaran &amp; kas.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
