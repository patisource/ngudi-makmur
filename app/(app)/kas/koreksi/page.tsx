import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { CorrectionDecision, CorrectionForm } from "@/features/cash/components/cash-forms";
import { listAccounts, listCorrections } from "@/features/cash/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { CORRECTION_LABEL, CORRECTION_TONE } from "@/lib/cash";
import { formatRupiah } from "@/lib/money";

export const metadata: Metadata = { title: "Koreksi kas · SIM Ngudi Makmur" };

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

// Koreksi kas (FR-CSH-11): admin kelompok mengajukan; ketua menyetujui/menolak; pengaju ≠ penyetuju (juga akun rangkap).
export default async function CorrectionsPage() {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canRequest = canDo(user.roles, "kas.kelola");
  const canDecide = canDo(user.roles, "kas.putuskan");
  const [rows, accounts] = await Promise.all([listCorrections(), listAccounts()]);
  const active = accounts.filter((a) => !a.archived_at).map((a) => ({ id: a.account_id, name: a.name, balanceRp: a.balance_rp }));

  return (
    <>
      {canRequest && <CorrectionForm accounts={active} />}
      {rows.length === 0 ? (
        <EmptyState title="Belum ada koreksi kas">Koreksi diajukan bila uang fisik tidak sama dengan catatan.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((c) => {
            const summary = `${c.doc_number} (${c.direction === "in" ? "+" : "−"}${formatRupiah(c.amount_rp)} ${c.cash_accounts?.name ?? ""})`;
            return (
              <Card key={c.id} className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs font-medium">{c.doc_number}</span>
                    <Badge tone={CORRECTION_TONE[c.status]}>{CORRECTION_LABEL[c.status]}</Badge>
                  </span>
                  <span className={`font-medium tabular-nums ${c.direction === "in" ? "text-accent" : "text-danger"}`}>
                    {c.direction === "in" ? "+" : "−"}
                    {formatRupiah(c.amount_rp)}
                  </span>
                </div>
                <p className="text-sm">{c.reason}</p>
                <p className="text-xs text-text-subtle">
                  {c.cash_accounts?.name} · {dateFmt.format(new Date(`${c.business_date}T00:00:00+07:00`))} · diajukan {c.requested_by_name}
                  {c.decided_by_name && ` · diputuskan ${c.decided_by_name}`}
                  {c.decision_note && ` · ${c.decision_note}`}
                </p>
                {c.status === "pending" && canDecide && c.requested_by !== user.id && <CorrectionDecision id={c.id} summary={summary} />}
                {c.status === "pending" && canDecide && c.requested_by === user.id && (
                  <p className="text-xs text-text-subtle">Anda mengajukan koreksi ini; keputusan harus oleh ketua lain.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
