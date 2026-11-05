import type { Metadata } from "next";
import Link from "next/link";
import { DecisionPanel } from "@/components/shared/decision-panel";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { decideAdjustment } from "@/features/stock/actions";
import { AdjustmentForm } from "@/features/stock/components/stock-forms";
import { countableProducts, listAdjustments } from "@/features/stock/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { CORRECTION_LABEL, CORRECTION_TONE } from "@/lib/cash";
import { formatRupiah } from "@/lib/money";
import { dbKgToGrams, formatKg } from "@/lib/qty";

export const metadata: Metadata = { title: "Koreksi stok · Sistem Pengelolaan Jagung Desa Baturejo" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

// Koreksi stok (FR-STK-04, T9.2): ajukan admin/operator → setujui/tolak ketua (pengaju ≠ penyetuju); riwayat tetap ada.
export default async function AdjustmentsPage() {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canRequest = canDo(user.roles, "stok.hitung");
  const canDecide = canDo(user.roles, "stok.putuskan");
  const [rows, products] = await Promise.all([listAdjustments(), canRequest ? countableProducts() : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title="Koreksi stok"
        description="Penyesuaian di luar transaksi (rusak, hilang, salah catat). Stok berubah setelah ketua menyetujui."
        actions={
          <Link href="/stok" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Kembali ke stok
          </Link>
        }
      />
      {canRequest && products.length > 0 && <AdjustmentForm products={products} />}
      {rows.length === 0 ? (
        <EmptyState title="Belum ada koreksi stok">Koreksi diajukan bila stok berubah di luar transaksi.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((a) => {
            const qty = `${a.direction === "in" ? "+" : "−"}${formatKg(dbKgToGrams(a.qty_kg))}`;
            return (
              <Card key={a.id} className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs font-medium">{a.doc_number}</span>
                    <Badge tone={CORRECTION_TONE[a.status]}>{CORRECTION_LABEL[a.status]}</Badge>
                  </span>
                  <span className={`font-medium tabular-nums ${a.direction === "in" ? "text-accent" : "text-danger"}`}>
                    {a.products?.name} {qty}
                  </span>
                </div>
                <p className="text-sm">{a.reason}</p>
                <p className="text-xs text-text-subtle">
                  {dateFmt.format(new Date(`${a.business_date}T00:00:00+07:00`))} · diajukan {a.requested_by_name}
                  {a.decided_by_name && ` · diputuskan ${a.decided_by_name}`}
                  {a.decision_note && ` · ${a.decision_note}`}
                  {a.value_rp != null && ` · nilai ${formatRupiah(a.value_rp)}`}
                </p>
                {a.status === "pending" && canDecide && a.requested_by !== user.id && (
                  <DecisionPanel decide={decideAdjustment.bind(null, a.id)} approveText="Setujui koreksi" rejectText="Tolak koreksi" summary={`Koreksi ${a.doc_number}: ${a.products?.name} ${qty}.`} />
                )}
                {a.status === "pending" && canDecide && a.requested_by === user.id && <p className="text-xs text-text-subtle">Anda mengajukan koreksi ini; keputusan harus oleh ketua lain.</p>}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
