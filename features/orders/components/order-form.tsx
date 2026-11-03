"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { quickAddCustomer, saveOrderDraft, type OrderFormState } from "@/features/orders/actions";
import type { OrderFormOptions } from "@/features/orders/queries";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { summarizeOrder } from "@/lib/order";
import { dbKgToGrams, formatKg } from "@/lib/qty";
import { todayWib } from "@/lib/validation/common";

type Options = Omit<OrderFormOptions, "error">;
type Product = Options["products"][number];
type ItemRow = { productId: string; packagingId: string; qty: string; discount: string };
export type OrderDefaults = { businessDate: string; customerId: string; channel: string; note: string; shipping: string; items: ItemRow[] };

const chipCls =
  "flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-fg has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-info-soft";
const selectCls = "h-11 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:h-10 sm:text-sm aria-invalid:border-danger";
const inputCls = "h-11 text-base sm:h-10 sm:text-sm";
const iconBtn = "grid size-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-40 sm:size-10";
const kgLabel = (kg: number) => String(kg).replace(".", ",");

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warn" | "err" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone === "err" ? "text-danger" : tone === "warn" ? "text-warning" : ""}`}>{value}</span>
    </div>
  );
}

const emptyRow = (products: Product[]): ItemRow => ({ productId: products.length === 1 ? products[0].id : "", packagingId: "", qty: "", discount: "" });

// Editor pesanan (FR-SAL-02, StyleGuide §8.3): pilih saluran & pelanggan, lalu baris item (produk, kemasan atau kg curah,
// jumlah, diskon). Harga diambil dari katalog dan dikunci sebagai snapshot saat disimpan; total final dihitung server.
// Di ponsel setiap baris menjadi kartu dan ringkasan menjadi bilah bawah berisi total + tombol simpan.
export function OrderForm({ orderId, options, defaults }: { orderId: string | null; options: Options; defaults?: OrderDefaults }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<OrderFormState>({});
  const [customers, setCustomers] = useState(options.customers);
  const [date, setDate] = useState(defaults?.businessDate ?? todayWib());
  const [customerId, setCustomerId] = useState(defaults?.customerId ?? "");
  const [channel, setChannel] = useState(defaults?.channel ?? options.channels[0]?.code ?? "");
  const [note, setNote] = useState(defaults?.note ?? "");
  const [shipping, setShipping] = useState(defaults?.shipping ?? "");
  const [items, setItems] = useState<ItemRow[]>(defaults?.items.length ? defaults.items : [emptyRow(options.products)]);
  const [quick, setQuick] = useState<null | { name: string; type: "perorangan" | "usaha"; error?: string }>(null);
  const [quickPending, startQuick] = useTransition();

  const productOf = (id: string) => options.products.find((p) => p.id === id);
  const packOf = (row: ItemRow) => productOf(row.productId)?.packagings.find((k) => k.id === row.packagingId);
  const priceOf = (row: ItemRow) => {
    const p = productOf(row.productId);
    if (!p) return null;
    return row.packagingId ? (packOf(row)?.price ?? null) : p.pricePerKg;
  };
  const summary = summarizeOrder(
    items.map((r) => ({ qty: r.qty, price: priceOf(r), contentKg: r.packagingId ? (packOf(r)?.contentKg ?? null) : null, discountRp: parseRupiah(r.discount) ?? 0 })),
    parseRupiah(shipping) ?? 0,
  );
  // Kebutuhan kg per produk vs stok tersedia (peringatan; konfirmasi tetap dicek database dengan kunci baris).
  const needByProduct = new Map<string, number>();
  items.forEach((r, i) => r.productId && needByProduct.set(r.productId, (needByProduct.get(r.productId) ?? 0) + summary.lines[i].grams));
  const shortages = [...needByProduct].map(([id, g]) => ({ p: productOf(id), need: g })).filter((x) => x.p && x.need > dbKgToGrams(x.p.availableKg));
  // Peringatan P1 (T6.6): harga di bawah HPP rata-rata produk & piutang pelanggan melewati batas. Tidak memblokir.
  const belowHpp = (row: ItemRow) => {
    const p = productOf(row.productId);
    const price = priceOf(row);
    const pack = packOf(row);
    if (!p || price == null || p.avgCostPerKg == null) return null;
    const perKg = pack ? Math.round((price * 1000) / Math.max(1, dbKgToGrams(pack.contentKg))) : price;
    return perKg < p.avgCostPerKg ? p.avgCostPerKg : null;
  };
  const customer = customers.find((c) => c.id === customerId);
  const projectedDebt = customer ? customer.outstandingRp + summary.totalRp : 0;
  const overLimit = customer?.creditLimitRp != null && projectedDebt > customer.creditLimitRp;
  const fe = state.fieldErrors ?? {};

  const setItem = (i: number, patch: Partial<ItemRow>) => setItems(items.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const res = await saveOrderDraft(orderId, {
        businessDate: date,
        customerId,
        channel,
        note,
        shippingRp: shipping,
        // baris tanpa produk & jumlah diabaikan agar admin bisa menyisakan baris kosong
        items: items
          .filter((r) => r.productId || r.qty.trim())
          .map((r) => ({ productId: r.productId, packagingId: r.packagingId, qty: r.qty, discountRp: r.discount })),
      });
      setState(res);
      if (res.error || !res.id) return;
      if (orderId) router.refresh();
      else router.push(`/penjualan/${res.id}?simpan=baru`);
    });
  }

  function addCustomer() {
    if (!quick) return;
    startQuick(async () => {
      const res = await quickAddCustomer({ name: quick.name, type: quick.type });
      if (res.error || !res.customer) return setQuick({ ...quick, error: res.error });
      setCustomers([...customers, { ...res.customer, creditLimitRp: null, outstandingRp: 0 }].sort((a, b) => a.name.localeCompare(b.name, "id")));
      setCustomerId(res.customer.id);
      setQuick(null);
    });
  }

  const saveLabel = pending ? "Menyimpan…" : orderId ? "Simpan perubahan draft" : "Simpan draft";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-label font-medium">Sumber pasar / saluran *</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {options.channels.map((c) => (
                  <label key={c.code} className={chipCls}>
                    <input type="radio" name="channel" value={c.code} checked={channel === c.code} onChange={() => setChannel(c.code)} className="sr-only" />
                    {c.name}
                  </label>
                ))}
              </div>
              {fe.channel && <p className="text-xs text-danger">{fe.channel}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pelanggan *" htmlFor="customerId" error={fe.customerId}>
                <select id="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={selectCls} aria-invalid={Boolean(fe.customerId)}>
                  <option value="">Pilih pelanggan</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.type === "usaha" ? " (usaha)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tanggal pesanan *" htmlFor="businessDate" error={fe.businessDate}>
                <Input id="businessDate" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </Field>
            </div>
            {quick ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <Field label="Nama pelanggan baru" htmlFor="quickName" error={quick.error}>
                    <Input id="quickName" maxLength={120} value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} className={inputCls} placeholder="mis. IRT Sekar Arum" />
                  </Field>
                  <Field label="Jenis" htmlFor="quickType">
                    <select id="quickType" value={quick.type} onChange={(e) => setQuick({ ...quick, type: e.target.value as "perorangan" | "usaha" })} className={selectCls}>
                      <option value="perorangan">Perorangan</option>
                      <option value="usaha">Usaha</option>
                    </select>
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={quickPending || !quick.name.trim()} onClick={addCustomer}>
                    {quickPending ? "Menambahkan…" : "Tambah pelanggan"}
                  </Button>
                  <Button size="sm" kind="ghost" disabled={quickPending} onClick={() => setQuick(null)}>
                    Tutup
                  </Button>
                </div>
                <p className="text-xs text-text-subtle">No. HP dan alamat bisa dilengkapi nanti di menu Anggota &amp; produk → Pelanggan.</p>
              </div>
            ) : (
              <Button size="sm" kind="ghost" className="w-fit" onClick={() => setQuick({ name: "", type: "perorangan" })}>
                <Plus size={14} /> Pelanggan baru
              </Button>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Item pesanan</h2>
              <span className="text-xs text-text-subtle">Harga dari katalog produk; dikunci saat draft disimpan.</span>
            </div>
            {fe.items && <p className="text-xs text-danger">{fe.items}</p>}
            {items.map((r, i) => {
              const p = productOf(r.productId);
              const pack = packOf(r);
              const price = priceOf(r);
              const line = summary.lines[i];
              const unitName = pack ? pack.name.toLowerCase() : "kg";
              return (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_8rem_auto] md:items-start">
                    <div className="flex flex-col gap-1">
                      <select
                        aria-label={`Produk baris ${i + 1}`}
                        value={r.productId}
                        onChange={(e) => setItem(i, { productId: e.target.value, packagingId: "" })}
                        className={selectCls}
                        aria-invalid={Boolean(fe[`items.${i}.productId`])}
                      >
                        <option value="">Pilih produk</option>
                        {options.products.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.name}
                          </option>
                        ))}
                      </select>
                      {fe[`items.${i}.productId`] && <p className="text-xs text-danger">{fe[`items.${i}.productId`]}</p>}
                    </div>
                    <select aria-label={`Kemasan baris ${i + 1}`} value={r.packagingId} onChange={(e) => setItem(i, { packagingId: e.target.value })} className={selectCls} disabled={!p}>
                      <option value="">kg curah</option>
                      {p?.packagings.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name} {kgLabel(k.contentKg)} kg
                        </option>
                      ))}
                    </select>
                    {/* pasangan pendek jumlah + diskon tetap berdampingan di ponsel (StyleGuide §5.3) */}
                    <div className="grid grid-cols-2 gap-2 sm:col-span-2 md:contents">
                      <div className="flex flex-col gap-1">
                        <Input
                          inputMode="decimal"
                          value={r.qty}
                          onChange={(e) => setItem(i, { qty: e.target.value })}
                          placeholder={`Jumlah ${unitName}`}
                          aria-label={`Jumlah baris ${i + 1} (${unitName})`}
                          aria-invalid={Boolean(fe[`items.${i}.qty`])}
                          className={inputCls}
                        />
                        {fe[`items.${i}.qty`] && <p className="text-xs text-danger">{fe[`items.${i}.qty`]}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Input
                          inputMode="numeric"
                          value={r.discount}
                          onChange={(e) => setItem(i, { discount: e.target.value })}
                          placeholder="Diskon Rp"
                          aria-label={`Diskon baris ${i + 1} (Rp)`}
                          aria-invalid={Boolean(fe[`items.${i}.discountRp`]) || line.discountTooHigh}
                          className={inputCls}
                        />
                        {fe[`items.${i}.discountRp`] && <p className="text-xs text-danger">{fe[`items.${i}.discountRp`]}</p>}
                      </div>
                    </div>
                    <button type="button" className={`${iconBtn} hidden md:grid`} disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Hapus baris ${i + 1}`}>
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span className="text-text-muted">
                      {p ? (
                        <>
                          {pack && line.grams > 0 && `${r.qty} ${unitName} ${kgLabel(pack.contentKg)} kg = ${formatKg(line.grams)} · `}
                          {price != null ? `${formatRupiah(price)}/${pack ? unitName : "kg"}` : <span className="text-danger">Harga belum ditetapkan di katalog</span>}
                        </>
                      ) : (
                        "Pilih produk untuk melihat harga"
                      )}
                      {line.discountTooHigh && <span className="text-danger"> · diskon melebihi nilai baris</span>}
                      {belowHpp(r) != null && <span className="text-warning"> · di bawah HPP rata-rata {formatRupiah(belowHpp(r) ?? 0)}/kg</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">{formatRupiah(line.totalRp)}</span>
                      <button type="button" className={`${iconBtn} md:hidden`} disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Hapus baris ${i + 1}`}>
                        <X size={16} />
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
            <Button size="sm" kind="ghost" className="w-fit" disabled={items.length >= 50} onClick={() => setItems([...items, emptyRow(options.products)])}>
              <Plus size={14} /> Tambah item
            </Button>
          </Card>

          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ongkos kirim (Rp)" htmlFor="shipping" error={fe.shippingRp} hint="Kosongkan bila tanpa ongkir.">
                <Input id="shipping" inputMode="numeric" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" className={inputCls} />
              </Field>
              <Field label="Catatan" htmlFor="note" error={fe.note}>
                <Input id="note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional, mis. diantar Sabtu" className={inputCls} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3 lg:sticky lg:top-8">
          <Card>
            <h2 className="font-semibold">Ringkasan</h2>
            <div className="flex flex-col gap-2">
              <Row label="Subtotal" value={formatRupiah(summary.subtotalRp)} />
              <Row label="Diskon" value={summary.discountRp ? `−${formatRupiah(summary.discountRp)}` : formatRupiah(0)} />
              <Row label="Ongkos kirim" value={formatRupiah(summary.shippingRp)} />
              <div className="mt-1 rounded-md bg-surface-muted px-3 py-2.5">
                <span className="block text-xs text-text-muted">Total tagihan (perkiraan)</span>
                <span className="text-xl font-semibold tabular-nums">{formatRupiah(summary.totalRp)}</span>
              </div>
              <div className="my-1 border-t border-border" />
              {[...needByProduct].map(([id, g]) => {
                const p = productOf(id);
                const short = p ? g > dbKgToGrams(p.availableKg) : false;
                return (
                  <Row key={id} label={p?.name ?? "Produk"} value={`${formatKg(g)} / tersedia ${formatKg(dbKgToGrams(p?.availableKg ?? 0))}`} tone={short ? "warn" : undefined} />
                );
              })}
            </div>
            {overLimit && customer && (
              <p className="text-xs text-warning">
                Piutang {customer.name} akan menjadi {formatRupiah(projectedDebt)}, melebihi batas {formatRupiah(customer.creditLimitRp ?? 0)}.
              </p>
            )}
            {items.some((r) => belowHpp(r) != null) && <p className="text-xs text-warning">Ada harga jual di bawah HPP rata-rata; periksa sebelum konfirmasi.</p>}
            {shortages.length > 0 && <p className="text-xs text-warning">Jumlah melebihi stok tersedia; draft boleh disimpan, tetapi konfirmasi akan ditolak.</p>}
            {!summary.complete && summary.grams > 0 && <p className="text-xs text-warning">Ada baris tanpa harga atau dengan diskon berlebih; perbaiki sebelum menyimpan.</p>}
            <p className="text-xs text-text-subtle">Total final dihitung server dari harga katalog saat draft disimpan. Pesanan belum mengubah stok sampai dikonfirmasi.</p>
          </Card>
          {state.error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
              {fe._ ?? state.error}
            </p>
          )}
          {state.ok && state.message && (
            <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
              {state.message}
            </p>
          )}
          <div className="hidden lg:block">
            <Button type="submit" kind={orderId ? "secondary" : "primary"} disabled={pending} className="w-full">
              {saveLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* Ponsel & tablet: bilah bawah berisi total + aksi utama (StyleGuide §5.3) */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 sm:-mx-8 sm:px-8 lg:hidden">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-text-muted">Total tagihan</span>
          <span className="text-lg font-semibold tabular-nums">{formatRupiah(summary.totalRp)}</span>
        </div>
        <Button type="submit" kind={orderId ? "secondary" : "primary"} disabled={pending}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}
