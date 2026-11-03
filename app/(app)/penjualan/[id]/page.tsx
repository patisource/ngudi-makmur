import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Crumb } from "@/components/shell/crumb";
import { Badge, Card } from "@/components/ui/card";
import { PaymentsSection } from "@/features/cash/components/payments-section";
import { listAccounts, orderPayments } from "@/features/cash/queries";
import { OrderActions } from "@/features/orders/components/order-actions";
import { OrderForm } from "@/features/orders/components/order-form";
import { ReturnsSection } from "@/features/orders/components/returns-section";
import { getOrder, orderFormOptions, orderSideInfo } from "@/features/orders/queries";
import { orderReceipt } from "@/features/orders/receipt";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { METHOD_LABEL, PAYMENT_LABEL } from "@/lib/cash";
import { formatRupiah } from "@/lib/money";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/order";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";

export const metadata: Metadata = { title: "Pesanan · SIM Ngudi Makmur" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const qtyText = (v: number) => gramsToKgString(dbKgToGrams(v)).replace(".", ",");
const shortDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00+07:00`));

function Row({ label, children, strong, tone }: { label: string; children: ReactNode; strong?: boolean; tone?: "warn" | "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone === "warn" ? "text-warning" : tone === "muted" ? "text-text-muted" : ""}`}>{children}</span>
    </div>
  );
}

type Event = { at: string; title: string; meta: string };

// Detail pesanan (desain 02, StyleGuide §5.2): draft → editor + konfirmasi/hapus; terkonfirmasi/diserahkan → item,
// pembayaran, retur; kolom kanan tagihan tersisa, pelanggan, riwayat. Ketua hanya melihat.
export default async function OrderPage({ params, searchParams }: PageProps<"/penjualan/[id]">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canManage = canDo(user.roles, "penjualan.kelola");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const { order: o, items, balance, returns } = await getOrder(id);
  if (!o) notFound();

  const isDraft = o.status === "draft";
  const [{ payments, refunds }, accounts, side, options] = await Promise.all([
    isDraft ? Promise.resolve({ payments: [], refunds: [] }) : orderPayments(o.id),
    isDraft ? Promise.resolve([]) : listAccounts(),
    orderSideInfo(o.id, o.customer_id),
    isDraft && canManage ? orderFormOptions() : Promise.resolve(null),
  ]);
  const nota = isDraft ? null : await orderReceipt(o.id, side.prints.length, { cashier: user.fullName });
  const activeAccounts = accounts.filter((a) => a.archived_at === null).map((a) => ({ id: a.account_id, name: a.name, kind: a.kind, balanceRp: a.balance_rp }));
  const netPaid = (balance?.paid_rp ?? 0) - (balance?.refunded_rp ?? 0);

  // Retur: sisa per baris = kg diserahkan − retur terverifikasi (draft dicek ulang database saat verifikasi).
  const returnedByItem = new Map<string, number>();
  for (const r of returns)
    if (r.status === "verified")
      for (const ri of r.order_return_items ?? []) returnedByItem.set(ri.order_item_id, (returnedByItem.get(ri.order_item_id) ?? 0) + dbKgToGrams(ri.qty_kg));
  const returnItems = items.map((it) => ({
    id: it.id,
    name: `${it.products?.name ?? "Produk"} (${qtyText(it.qty_input)} ${it.product_packaging_id ? it.unit_label.toLowerCase() : "kg"})`,
    soldGrams: dbKgToGrams(it.qty_kg),
    returnedGrams: returnedByItem.get(it.id) ?? 0,
  }));

  // Kebutuhan kg per produk (dampak konfirmasi / serah barang), nama produk dari master.
  const byProduct = new Map<string, { name: string; grams: number }>();
  for (const it of items) {
    const cur = byProduct.get(it.product_id) ?? { name: it.products?.name ?? "Produk", grams: 0 };
    cur.grams += dbKgToGrams(it.qty_kg);
    byProduct.set(it.product_id, cur);
  }
  const kgText = [...byProduct.values()].map((p) => `${p.name} ${formatKg(p.grams)}`).join(", ");
  const impact = isDraft ? `Reservasi ${kgText || "—"} · tagihan ${formatRupiah(o.total_rp)}` : kgText;

  // Riwayat dari dokumen itu sendiri (tanpa log audit: admin tidak membaca audit_logs).
  const events: Event[] = [{ at: o.created_at, title: "Dibuat sebagai draft", meta: "" }];
  if (o.confirmed_at) events.push({ at: o.confirmed_at, title: `Dikonfirmasi · ${kgText} direservasi`, meta: o.doc_number ?? "" });
  for (const p of payments)
    events.push({ at: p.verified_at ?? p.created_at, title: `Pembayaran ${METHOD_LABEL[p.method].toLowerCase()} ${formatRupiah(p.amount_rp)} · ${PAYMENT_LABEL[p.status].toLowerCase()}`, meta: p.doc_number ?? "" });
  side.prints.forEach((at, i) => events.push({ at, title: i === 0 ? "Nota thermal dicetak" : `Nota dicetak ulang ke-${i}`, meta: i === 0 ? "cetakan pertama" : "" }));
  if (o.delivered_at) events.push({ at: o.delivered_at, title: `Barang diserahkan${o.recipient_name ? ` kepada ${o.recipient_name}` : ""}`, meta: "" });
  for (const r of returns) events.push({ at: r.verified_at ?? r.business_date, title: `Retur ${formatKg(dbKgToGrams(r.total_kg))} · ${r.status === "verified" ? "diverifikasi" : "menunggu verifikasi"}`, meta: r.doc_number ?? r.created_by_name });
  for (const r of refunds) events.push({ at: r.created_at, title: `Refund ${formatRupiah(r.amount_rp)}`, meta: r.doc_number });
  if (o.cancelled_at) events.push({ at: o.cancelled_at, title: "Dibatalkan", meta: o.cancel_reason ?? "" });
  events.sort((a, b) => a.at.localeCompare(b.at));

  const bill = balance?.bill_rp ?? o.total_rp;
  const paidRatio = bill > 0 ? Math.max(0, Math.min(1, netPaid / bill)) : 0;
  const limit = side.customer?.credit_limit_rp ?? null;

  return (
    <>
      <Crumb label={o.doc_number ?? "Draft pesanan"} />
      <div className="flex flex-col gap-2">
        <Link href="/penjualan" className="inline-flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text">
          <ArrowLeft size={15} strokeWidth={1.75} /> Penjualan
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{o.doc_number ?? "Draft pesanan"}</h1>
              <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
              {!isDraft && o.status !== "cancelled" && <Badge tone={PAYMENT_STATUS_TONE[o.payment_status]}>{PAYMENT_STATUS_LABEL[o.payment_status]}</Badge>}
            </div>
            <p className="text-sm text-text-muted">
              {shortDate(o.business_date)} · sumber pasar {o.sales_channels?.name ?? o.channel} · {o.customer_name}
            </p>
          </div>
          <OrderActions
            id={o.id}
            status={o.status}
            docNumber={o.doc_number}
            businessDate={o.business_date}
            impact={impact}
            netPaidRp={netPaid}
            accounts={activeAccounts}
            canManage={canManage}
            receipt={nota ? { lines80: nota.lines, lines58: nota.lines58, printed: side.prints.length, canPrint: canManage } : undefined}
          />
        </div>
      </div>
      {sp.simpan === "baru" && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          Draft pesanan tersimpan. Periksa ringkasan lalu konfirmasi untuk mereservasi stok.
        </p>
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
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <section className="overflow-hidden rounded-xl border border-border bg-surface">
              <h2 className="px-5 pb-3 pt-5 font-semibold">Item</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="bg-surface-muted text-xs text-text-muted">
                      <th className="py-2.5 pl-5 pr-3 text-left font-medium">Produk</th>
                      <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                      <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Harga</th>
                      <th className="py-2.5 pl-3 pr-5 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="py-3.5 pl-5 pr-3">
                          <span className="font-medium">{it.products?.name ?? "—"}</span>
                          <span className="mt-0.5 block text-xs text-text-subtle">
                            <span className="sm:hidden">@ {formatRupiah(it.price_snapshot)} · </span>
                            {formatKg(dbKgToGrams(it.qty_kg))}
                            {it.discount_rp ? ` · diskon ${formatRupiah(it.discount_rp)}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right whitespace-nowrap">
                          {qtyText(it.qty_input)} {it.product_packaging_id ? it.unit_label.toLowerCase() : "kg"}
                        </td>
                        <td className="hidden px-3 py-3.5 text-right whitespace-nowrap sm:table-cell">{formatRupiah(it.price_snapshot)}</td>
                        <td className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">{formatRupiah(it.line_total_rp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
                <Row label="Subtotal">{formatRupiah(o.subtotal_rp)}</Row>
                {o.discount_rp > 0 && <Row label="Diskon">−{formatRupiah(o.discount_rp)}</Row>}
                <Row label="Ongkos kirim">{formatRupiah(o.shipping_rp)}</Row>
                <Row label="Total" strong>
                  {formatRupiah(o.total_rp)}
                </Row>
              </div>
              {o.note && <p className="border-t border-border px-5 py-3 text-sm text-text-muted">{o.note}</p>}
            </section>

            {balance && (
              <PaymentsSection
                orderId={o.id}
                docNumber={o.doc_number}
                customerName={o.customer_name}
                open={o.status === "confirmed" || o.status === "delivered"}
                delivered={o.status === "delivered"}
                balance={{
                  billRp: balance.bill_rp,
                  paidRp: balance.paid_rp,
                  refundedRp: balance.refunded_rp,
                  outstandingRp: balance.outstanding_rp,
                  creditRp: balance.credit_rp,
                  pendingRp: balance.pending_rp,
                }}
                payments={payments.map((p) => ({
                  id: p.id,
                  docNumber: p.doc_number,
                  businessDate: p.business_date,
                  createdAt: p.created_at,
                  method: p.method,
                  amountRp: p.amount_rp,
                  status: p.status,
                  note: p.note,
                  rejectReason: p.reject_reason,
                  accountName: p.cash_accounts?.name ?? "—",
                  proofs: p.proofs,
                }))}
                refunds={refunds.map((r) => ({ id: r.id, docNumber: r.doc_number, businessDate: r.business_date, amountRp: r.amount_rp, reason: r.reason, accountName: r.cash_accounts?.name ?? "—" }))}
                accounts={activeAccounts}
                returns={returns.filter((r) => r.status === "verified").map((r) => ({ id: r.id, label: `${r.doc_number} · ${formatKg(dbKgToGrams(r.total_kg))} · ${formatRupiah(r.sales_value_rp)}` }))}
                canManage={canDo(user.roles, "kas.kelola")}
              />
            )}

            {o.status === "delivered" && o.delivered_on && (
              <ReturnsSection
                orderId={o.id}
                deliveredOn={o.delivered_on}
                items={returnItems}
                returns={returns.map((r) => ({
                  id: r.id,
                  docNumber: r.doc_number,
                  status: r.status,
                  businessDate: r.business_date,
                  reason: r.reason,
                  totalGrams: dbKgToGrams(r.total_kg),
                  salesValueRp: r.sales_value_rp,
                  createdBy: r.created_by,
                  createdByName: r.created_by_name,
                  verifiedAt: r.verified_at,
                  verifiedByName: r.verified_by_name,
                }))}
                canRecord={canDo(user.roles, "retur.catat")}
                canVerify={canDo(user.roles, "retur.verifikasi")}
                userId={user.id}
              />
            )}
          </div>

          <div className="flex flex-col gap-5 lg:sticky lg:top-6">
            <Card className="gap-3">
              <span className="text-label text-text-muted">Tagihan tersisa</span>
              <span className="flex items-baseline gap-1.5 font-semibold tracking-tight tabular-nums">
                <span className="text-base text-text-muted">Rp</span>
                <span className="text-[32px] leading-tight">{new Intl.NumberFormat("id-ID").format(balance?.outstanding_rp ?? 0)}</span>
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="meter" aria-label="Porsi tagihan yang sudah dibayar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(paidRatio * 100)}>
                <div className="bar-fill h-full rounded-full bg-accent" style={{ ["--p" as string]: Math.round(paidRatio * 100) }} />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <Row label="Total">{formatRupiah(o.total_rp)}</Row>
                {(balance?.returned_rp ?? 0) > 0 && <Row label="Retur sah">−{formatRupiah(balance?.returned_rp ?? 0)}</Row>}
                <Row label="Dibayar">{formatRupiah(balance?.paid_rp ?? 0)}</Row>
                <Row label="Refund">{formatRupiah(balance?.refunded_rp ?? 0)}</Row>
                {(balance?.pending_rp ?? 0) > 0 && (
                  <Row label="Menunggu verifikasi" tone="warn">
                    {formatRupiah(balance?.pending_rp ?? 0)}
                  </Row>
                )}
                {(balance?.credit_rp ?? 0) > 0 && (
                  <Row label="Kelebihan bayar (perlu refund)" tone="warn">
                    {formatRupiah(balance?.credit_rp ?? 0)}
                  </Row>
                )}
              </div>
              {o.status === "confirmed" && <p className="text-xs text-text-subtle">Stok sudah direservasi; keluar saat barang diserahkan.</p>}
            </Card>

            <Card className="gap-2.5">
              <span className="text-label text-text-muted">Pelanggan</span>
              <span className="text-lg font-semibold">{o.customer_name}</span>
              {(side.customer?.address || side.customer?.phone) && <p className="text-sm text-text-muted">{[side.customer?.address, side.customer?.phone].filter(Boolean).join(" · ")}</p>}
              <div className="flex flex-col gap-2 pt-1">
                <Row label="Batas piutang">{limit ? formatRupiah(limit) : "Tidak dibatasi"}</Row>
                <Row label="Piutang berjalan" tone={side.customerOutstandingRp > 0 ? "warn" : undefined}>
                  {formatRupiah(side.customerOutstandingRp)}
                </Row>
              </div>
            </Card>

            <Card className="gap-3">
              <h2 className="font-semibold">Riwayat</h2>
              <ol className="flex flex-col gap-3.5">
                {events.map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-border-strong" />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm">{e.title}</span>
                      <span className="text-xs text-text-subtle">{[timeFmt.format(new Date(e.at)), e.meta].filter(Boolean).join(" · ")}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
