import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { ProofManager } from "@/features/receipts/components/proof-manager";
import { ReceiptActions } from "@/features/receipts/components/receipt-actions";
import { ReceiptForm } from "@/features/receipts/components/receipt-form";
import { getReceipt, RECEIPT_STATUS_LABEL, receiptOptions } from "@/features/receipts/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";

export const metadata: Metadata = { title: "Jagung masuk · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const NOTICE: Record<string, { tone: "ok" | "warn"; text: string }> = {
  baru: { tone: "ok", text: "Draft tersimpan. Periksa lalu konfirmasi untuk menambah stok." },
  ubah: { tone: "ok", text: "Perubahan draft disimpan." },
  "bukti-gagal": { tone: "warn", text: "Draft tersimpan, tetapi bukti gagal diunggah. Tambahkan lagi di bagian Bukti." },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

// Detail penerimaan (FR-RCV-02/03/05): rincian, bukti, ubah draft, konfirmasi, batal, cetak bukti 80 mm.
export default async function ReceiptPage({ params, searchParams }: PageProps<"/jagung-masuk/[id]">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canManage = canDo(user.roles, "penerimaan.kelola");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const [{ receipt: r, proofs }, options] = await Promise.all([getReceipt(id), canManage ? receiptOptions() : null]);
  if (!r) notFound();

  const grams = dbKgToGrams(r.weight_kg);
  const perKg = grams > 0 ? Math.round((r.acquisition_cost * 1000) / grams) : null;
  const productName = r.products?.name ?? "Produk";
  const notice = typeof sp.simpan === "string" ? NOTICE[sp.simpan] : undefined;
  const isDraft = r.status === "draft";

  return (
    <>
      <PageHeader
        title={r.doc_number ?? "Draft penerimaan"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={r.status === "confirmed" ? "ok" : r.status === "void" ? "err" : "neutral"}>{RECEIPT_STATUS_LABEL[r.status]}</Badge>
            {dateFmt.format(new Date(`${r.business_date}T00:00:00+07:00`))}
          </span>
        }
        actions={
          <>
            <Link href="/jagung-masuk" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Kembali
            </Link>
            {!isDraft && (
              <Link
                href={`/print/penerimaan/${r.id}`}
                target="_blank"
                className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
              >
                Cetak bukti
              </Link>
            )}
          </>
        }
      />
      {notice && (
        <p role="status" className={notice.tone === "ok" ? "rounded-md bg-accent-soft px-3 py-2 text-label text-accent" : "rounded-md bg-warning-soft px-3 py-2 text-label text-warning"}>
          {notice.text}
        </p>
      )}

      {/* Ponsel: Rincian → Konfirmasi & Bukti → Ubah draft (aksi tidak tertimbun form). Layar lebar: aksi di kolom kanan. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Card className="lg:col-start-1">
            <h2 className="font-semibold">Rincian</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Row label="Sumber">
                {r.source_type === "anggota" ? `${r.members?.name ?? "—"} (${r.members?.code ?? ""})` : r.supplier_name}
                <span className="block text-xs font-normal text-text-muted">{r.source_type === "anggota" ? "Anggota" : "Pemasok luar"}</span>
              </Row>
              <Row label="Jenis jagung">{productName}</Row>
              <Row label="Berat">{formatKg(grams)}</Row>
              <Row label="Biaya perolehan">{formatRupiah(r.acquisition_cost)}</Row>
              <Row label="Biaya per kg">{perKg !== null ? formatRupiah(perKg) : "—"}</Row>
              <Row label="Kadar air">{r.moisture_pct != null ? `${String(r.moisture_pct).replace(".", ",")}%` : "—"}</Row>
            </dl>
            {r.note && <p className="text-sm text-text-muted">{r.note}</p>}
            <p className="text-xs text-text-subtle">
              Biaya perolehan hanya untuk nilai persediaan dan HPP, tidak menambah kas. Bila jagung dibayar tunai, catat sebagai pengeluaran.
              {r.confirmed_at && ` Dikonfirmasi ${timeFmt.format(new Date(r.confirmed_at))}.`}
            </p>
          </Card>

          <div className="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-span-3 lg:row-start-1">
            {canManage && r.status !== "void" && (
              <Card>
                <h2 className="font-semibold">{isDraft ? "Konfirmasi" : "Tindakan"}</h2>
                <ReceiptActions id={r.id} status={r.status} impact={`${productName} +${formatKg(grams)}, nilai persediaan +${formatRupiah(r.acquisition_cost)}`} />
              </Card>
            )}
            <Card>
              <h2 className="font-semibold">Bukti</h2>
              <ProofManager receiptId={r.id} proofs={proofs} canEdit={canManage && isDraft} />
            </Card>
          </div>

          {r.status === "void" && (
            <Card className="border-danger-soft lg:col-start-1">
              <h2 className="font-semibold text-danger">Dibatalkan</h2>
              <p className="text-sm">{r.void_reason}</p>
              {r.voided_at && <p className="text-xs text-text-subtle">{timeFmt.format(new Date(r.voided_at))} · stok sudah dikurangi kembali lewat mutasi balik.</p>}
            </Card>
          )}

          {canManage && isDraft && options && (
            <Card className="lg:col-start-1">
              <h2 className="font-semibold">Ubah draft</h2>
              <ReceiptForm
                receiptId={r.id}
                members={options.members}
                products={options.products}
                defaults={{
                  businessDate: r.business_date,
                  sourceType: r.source_type,
                  memberId: r.member_id,
                  supplierName: r.supplier_name,
                  productId: r.product_id,
                  weightKg: gramsToKgString(grams).replace(".", ","),
                  moisturePct: r.moisture_pct != null ? String(r.moisture_pct).replace(".", ",") : "",
                  acquisitionCost: String(r.acquisition_cost),
                  note: r.note ?? "",
                }}
              />
            </Card>
          )}
      </div>
    </>
  );
}
