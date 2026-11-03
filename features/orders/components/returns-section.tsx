"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "@/features/master/actions";
import { createReturn, deleteReturnDraft, verifyReturn } from "@/features/orders/actions";
import { formatRupiah } from "@/lib/money";
import { formatKg, parseKgToGrams } from "@/lib/qty";
import type { ReturnStatus } from "@/lib/supabase/types";
import { todayWib } from "@/lib/validation/common";

export type ReturnItemOption = { id: string; name: string; soldGrams: number; returnedGrams: number };
export type ReturnRow = {
  id: string;
  docNumber: string | null;
  status: ReturnStatus;
  businessDate: string;
  reason: string;
  totalGrams: number;
  salesValueRp: number;
  createdBy: string;
  createdByName: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
};

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const panelCls = "flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4";
const inputCls = "h-11 text-base sm:h-10 sm:text-sm";
const textareaCls = "rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:text-sm";

function Notice({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
        {state.message}
      </p>
    );
  return null;
}

// Retur barang (FR-SAL-10, PRD Q7) di detail pesanan yang sudah diserahkan: admin kelompok mencatat draft (stok belum
// berubah), ketua memverifikasi barang fisik (stok bertambah). Pencatat tidak bisa memverifikasi catatannya sendiri.
export function ReturnsSection({
  orderId,
  deliveredOn,
  items,
  returns,
  canRecord,
  canVerify,
  userId,
}: {
  orderId: string;
  deliveredOn: string;
  items: ReturnItemOption[];
  returns: ReturnRow[];
  canRecord: boolean;
  canVerify: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  const [form, setForm] = useState<null | { date: string; reason: string; qty: Record<string, string> }>(null);
  const [panel, setPanel] = useState<null | { kind: "verify" | "delete"; id: string; key: string }>(null);

  const remaining = items.map((it) => ({ ...it, leftGrams: Math.max(0, it.soldGrams - it.returnedGrams) }));
  const anyLeft = remaining.some((it) => it.leftGrams > 0);
  const fe = state.fieldErrors ?? {};

  // Kunci idempotensi verifikasi dibuat saat panel dibuka dan dipakai ulang untuk percobaan ulang (Security.md §6).
  const openPanel = (kind: "verify" | "delete", id: string) => {
    setState({});
    setPanel({ kind, id, key: crypto.randomUUID() });
  };
  const openForm = () => {
    setState({});
    setForm({ date: todayWib(), reason: "", qty: {} });
  };
  const run = (fn: () => Promise<FormState>, after: () => void) =>
    start(async () => {
      const res = await fn();
      setState(res);
      if (res.ok) {
        after();
        router.refresh();
      }
    });

  const submit = () => {
    if (!form) return;
    const lines = remaining.map((it) => ({ orderItemId: it.id, qtyKg: (form.qty[it.id] ?? "").trim() })).filter((l) => l.qtyKg !== "");
    run(() => createReturn(orderId, { businessDate: form.date, reason: form.reason, items: lines }), () => setForm(null));
  };

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Retur barang</h2>
        <span className="text-xs text-text-subtle">Barang kembali ke stok hanya setelah ketua memverifikasi fisiknya.</span>
      </div>

      {returns.length === 0 && !form && <p className="text-sm text-text-muted">Belum ada retur untuk pesanan ini.</p>}
      {returns.map((r) => {
        const own = r.createdBy === userId;
        return (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs font-medium">{r.docNumber ?? "Draft retur"}</span>
                <Badge tone={r.status === "verified" ? "ok" : "warn"}>{r.status === "verified" ? "Terverifikasi" : "Menunggu verifikasi"}</Badge>
              </span>
              <span className="text-sm tabular-nums">
                {formatKg(r.totalGrams)} · {formatRupiah(r.salesValueRp)}
              </span>
            </div>
            <p className="text-sm text-text-muted">{r.reason}</p>
            <p className="text-xs text-text-subtle">
              {dateFmt.format(new Date(`${r.businessDate}T00:00:00+07:00`))} · dicatat {r.createdByName}
              {r.verifiedByName && ` · diverifikasi ${r.verifiedByName}`}
            </p>
            {r.status === "draft" && panel?.id !== r.id && (canVerify || canRecord) && (
              <div className="flex flex-wrap gap-2">
                {canVerify && !own && (
                  <Button size="sm" kind="primary" onClick={() => openPanel("verify", r.id)}>
                    Verifikasi barang fisik
                  </Button>
                )}
                {canVerify && own && <span className="text-xs text-text-subtle">Anda mencatat retur ini; verifikasi harus oleh ketua lain.</span>}
                {canRecord && (
                  <Button size="sm" kind="ghost" onClick={() => openPanel("delete", r.id)}>
                    Hapus draft
                  </Button>
                )}
              </div>
            )}
            {panel?.id === r.id && panel.kind === "verify" && (
              <div className={panelCls}>
                <p className="text-sm">
                  Barang retur <strong className="font-semibold">{formatKg(r.totalGrams)}</strong> sudah diperiksa fisik dan masuk kembali ke stok? Nomor RTR terbit dan retur dikunci.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button kind="primary" disabled={pending} onClick={() => run(() => verifyReturn(orderId, r.id, panel.key), () => setPanel(null))}>
                    {pending ? "Memverifikasi…" : "Ya, verifikasi retur"}
                  </Button>
                  <Button disabled={pending} onClick={() => setPanel(null)}>
                    Tutup
                  </Button>
                </div>
              </div>
            )}
            {panel?.id === r.id && panel.kind === "delete" && (
              <div className={panelCls}>
                <p className="text-sm">Hapus draft retur ini? Draft belum mengubah stok.</p>
                <div className="flex flex-wrap gap-2">
                  <Button kind="danger" disabled={pending} onClick={() => run(() => deleteReturnDraft(orderId, r.id), () => setPanel(null))}>
                    {pending ? "Menghapus…" : "Ya, hapus draft retur"}
                  </Button>
                  <Button disabled={pending} onClick={() => setPanel(null)}>
                    Tutup
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {canRecord && !form && anyLeft && (
        <Button kind="secondary" className="w-fit" onClick={openForm}>
          Catat retur
        </Button>
      )}
      {canRecord && !anyLeft && returns.length > 0 && <p className="text-xs text-text-subtle">Seluruh barang pesanan ini sudah diretur dan diverifikasi.</p>}

      {form && (
        <div className={panelCls}>
          <p className="text-sm">Isi berat yang dikembalikan per item (kg). Stok belum berubah sampai ketua memverifikasi.</p>
          {remaining.map((it, i) => {
            const g = parseKgToGrams(form.qty[it.id] ?? "");
            const over = g !== null && g > it.leftGrams;
            return (
              <Field key={it.id} label={`${it.name} · bisa diretur ${formatKg(it.leftGrams)}`} htmlFor={`rtr-${it.id}`} error={over ? "Melebihi sisa yang bisa diretur" : fe[`items.${i}.qtyKg`]}>
                <Input
                  id={`rtr-${it.id}`}
                  inputMode="decimal"
                  disabled={it.leftGrams === 0}
                  value={form.qty[it.id] ?? ""}
                  onChange={(e) => setForm({ ...form, qty: { ...form.qty, [it.id]: e.target.value } })}
                  placeholder="kg, kosongkan bila tidak diretur"
                  aria-invalid={over}
                  className={`${inputCls} sm:max-w-56`}
                />
              </Field>
            );
          })}
          <Field label="Tanggal barang kembali" htmlFor="rtr-date" error={fe.businessDate}>
            <Input id="rtr-date" type="date" min={deliveredOn} max={todayWib()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${inputCls} sm:max-w-56`} />
          </Field>
          <label htmlFor="rtr-reason" className="text-label font-medium">
            Alasan retur *
          </label>
          <textarea
            id="rtr-reason"
            rows={2}
            maxLength={500}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="mis. Kemasan sobek saat diantar"
            className={textareaCls}
          />
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" disabled={pending || form.reason.trim().length < 5} onClick={submit}>
              {pending ? "Menyimpan…" : "Simpan draft retur"}
            </Button>
            <Button disabled={pending} onClick={() => setForm(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      <Notice state={state} />
    </Card>
  );
}
