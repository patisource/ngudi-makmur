"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { saveReceiptDraft, type ReceiptFormState } from "@/features/receipts/actions";
import { PROOF_ACCEPT, uploadReceiptProof } from "@/features/receipts/proof-client";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { parseKgToGrams } from "@/lib/qty";
import { todayWib } from "@/lib/validation/common";

type Option = { id: string; code: string; name: string };
export type ReceiptDefaults = {
  businessDate: string;
  sourceType: "anggota" | "luar";
  memberId: string | null;
  supplierName: string | null;
  productId: string;
  weightKg: string;
  moisturePct: string;
  acquisitionCost: string;
  note: string;
};

const selectCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft aria-invalid:border-danger";
const chipCls =
  "flex h-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-fg has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-info-soft";

// Form jagung masuk (FR-RCV-01, StyleGuide §8): satu kolom di ponsel, dua kolom di layar lebar. Simpan = draft;
// stok baru berubah setelah konfirmasi. Bukti (opsional) diunggah setelah draft tersimpan.
export function ReceiptForm({ receiptId, members, products, defaults }: { receiptId: string | null; members: Option[]; products: Option[]; defaults?: ReceiptDefaults }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ReceiptFormState>({});
  const [source, setSource] = useState<"anggota" | "luar">(defaults?.sourceType ?? "anggota");
  const [weight, setWeight] = useState(defaults?.weightKg ?? "");
  const [cost, setCost] = useState(defaults?.acquisitionCost ?? "");
  const [proof, setProof] = useState<{ file: File; preview: string | null } | null>(null);

  useEffect(() => () => void (proof?.preview && URL.revokeObjectURL(proof.preview)), [proof]);

  const grams = parseKgToGrams(weight);
  const rupiah = parseRupiah(cost);
  const perKg = grams && rupiah !== null ? Math.round((rupiah * 1000) / grams) : null;
  const fe = state.fieldErrors ?? {};
  const d = defaults;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("proof");
    start(async () => {
      const res = await saveReceiptDraft(receiptId, {}, fd);
      if (res.error || !res.id) return setState(res);
      let notice = receiptId ? "ubah" : "baru";
      if (proof) {
        const err = await uploadReceiptProof(res.id, proof.file);
        if (err) notice = "bukti-gagal";
      }
      if (receiptId) {
        setState({ ok: true, message: notice === "bukti-gagal" ? "Draft disimpan, tetapi bukti gagal diunggah." : "Draft disimpan." });
        router.refresh();
      } else {
        router.push(`/jagung-masuk/${res.id}?simpan=${notice}`);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-label font-medium">Sumber jagung</legend>
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {(["anggota", "luar"] as const).map((s) => (
            <label key={s} className={chipCls}>
              <input type="radio" name="sourceType" value={s} checked={source === s} onChange={() => setSource(s)} className="sr-only" />
              {s === "anggota" ? "Anggota" : "Pemasok luar"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {source === "anggota" ? (
          <Field label="Anggota penyetor" htmlFor="memberId" error={fe.memberId} hint={members.length ? undefined : "Belum ada anggota aktif. Tambahkan di menu Anggota & produk."}>
            <select id="memberId" name="memberId" defaultValue={d?.memberId ?? ""} className={selectCls} aria-invalid={Boolean(fe.memberId)}>
              <option value="">Pilih anggota</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Nama pemasok" htmlFor="supplierName" error={fe.supplierName}>
            <Input id="supplierName" name="supplierName" maxLength={120} defaultValue={d?.supplierName ?? ""} placeholder="mis. UD Tani Jaya" aria-invalid={Boolean(fe.supplierName)} />
          </Field>
        )}
        <Field label="Tanggal terima" htmlFor="businessDate" error={fe.businessDate}>
          <Input id="businessDate" name="businessDate" type="date" max={todayWib()} defaultValue={d?.businessDate ?? todayWib()} aria-invalid={Boolean(fe.businessDate)} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-label font-medium">Jenis jagung</legend>
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {products.map((p, i) => (
            <label key={p.id} className={chipCls}>
              <input type="radio" name="productId" value={p.id} defaultChecked={d ? d.productId === p.id : i === 0} className="sr-only" />
              {p.name}
            </label>
          ))}
        </div>
        {fe.productId && (
          <p role="alert" className="text-xs text-danger">
            {fe.productId}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Berat (kg)" htmlFor="weightKg" error={fe.weightKg} hint="Timbangan bersih, maks. 3 desimal.">
          <Input id="weightKg" name="weightKg" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="mis. 100" aria-invalid={Boolean(fe.weightKg)} />
        </Field>
        <Field
          label="Biaya perolehan (Rp)"
          htmlFor="acquisitionCost"
          error={fe.acquisitionCost}
          hint={perKg !== null ? `${formatRupiah(perKg)}/kg · tidak menambah kas` : "Isi 0 bila tanpa biaya. Tidak menambah kas."}
        >
          <Input id="acquisitionCost" name="acquisitionCost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="mis. 400000" aria-invalid={Boolean(fe.acquisitionCost)} />
        </Field>
        <Field label="Kadar air (%)" htmlFor="moisturePct" error={fe.moisturePct} hint="Opsional.">
          <Input id="moisturePct" name="moisturePct" inputMode="decimal" defaultValue={d?.moisturePct ?? ""} placeholder="mis. 14" aria-invalid={Boolean(fe.moisturePct)} />
        </Field>
      </div>

      <Field label="Catatan" htmlFor="note" error={fe.note}>
        <Input id="note" name="note" maxLength={1000} defaultValue={d?.note ?? ""} placeholder="Opsional" />
      </Field>

      {!receiptId && (
        <Field label="Bukti (foto atau PDF)" htmlFor="proof" hint="Opsional, maks. 5 MB. Foto dikecilkan otomatis dan data lokasinya dibuang.">
          <Input
            id="proof"
            name="proof"
            type="file"
            accept={PROOF_ACCEPT}
            className="h-auto py-2 file:mr-3 file:rounded-sm file:border-0 file:bg-surface-muted file:px-2.5 file:py-1 file:text-label file:font-medium"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              setProof(file ? { file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null } : null);
            }}
          />
          {proof && (
            <div className="mt-1 flex items-center gap-3 rounded-md border border-border bg-surface-muted p-2">
              {proof.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal (blob:), bukan aset yang dioptimasi
                <img src={proof.preview} alt="Pratinjau bukti" className="size-16 rounded-sm object-cover" />
              ) : (
                <span className="grid size-16 place-items-center rounded-sm bg-surface text-xs font-medium text-text-muted">PDF</span>
              )}
              <span className="min-w-0 truncate text-sm">{proof.file.name}</span>
            </div>
          )}
        </Field>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" kind="primary" disabled={pending}>
          {pending ? "Menyimpan…" : receiptId ? "Simpan perubahan draft" : "Simpan draft"}
        </Button>
        <span className="text-xs text-text-subtle">Stok baru bertambah setelah draft dikonfirmasi.</span>
      </div>
    </form>
  );
}
