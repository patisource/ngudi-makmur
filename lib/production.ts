// Ringkasan batch (FR-PRD-09, StyleGuide §8.3) untuk panel editor — perkiraan sebelum konfirmasi.
// Berat dalam gram bulat (lib/qty), uang rupiah bulat. Angka final (bahan rata-rata bergerak saat konfirmasi,
// HPP terkunci) dihitung database di confirm_production; rumus di sini sama agar perkiraan cocok.
import type { BatchCostCategory, BatchCostUnit, HppSettings } from "@/lib/supabase/types";

export const COST_CATEGORY_LABEL: Record<BatchCostCategory, string> = {
  tenaga_kerja: "Tenaga kerja",
  kemasan: "Kemasan",
  listrik_bbm: "BBM/listrik",
  lain: "Alokasi lain",
};

/** HPP/kg = total biaya ÷ output kg (SRS §10). Output 0 → null = "Data belum cukup untuk menghitung HPP". */
export function hppPerKg(totalRp: number, outputGrams: number): number | null {
  if (!(outputGrams > 0)) return null;
  return Math.round((totalRp * 1000) / outputGrams);
}

export type BatchSummary = {
  inputGrams: number;
  outputGrams: number;
  lossGrams: number;
  /** susut % dari input; null bila input 0 */
  lossPct: number | null;
  materialRp: number;
  otherRp: number;
  totalRp: number;
  hpp: number | null;
  outputExceedsInput: boolean;
};

/**
 * @param avgCostPerKg rata-rata biaya bahan input saat ini (Rp/kg; null bila stok 0 → bahan dihitung Rp0)
 */
export function summarizeBatch(inputs: number[], outputs: number[], costs: number[], avgCostPerKg: number | null): BatchSummary {
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const inputGrams = sum(inputs);
  const outputGrams = sum(outputs);
  const materialRp = Math.round((inputGrams * (avgCostPerKg ?? 0)) / 1000);
  const otherRp = sum(costs);
  const totalRp = materialRp + otherRp;
  return {
    inputGrams,
    outputGrams,
    lossGrams: Math.max(0, inputGrams - outputGrams),
    lossPct: inputGrams > 0 ? Math.round(((inputGrams - outputGrams) / inputGrams) * 1000) / 10 : null,
    materialRp,
    otherRp,
    totalRp,
    hpp: hppPerKg(totalRp, outputGrams),
    outputExceedsInput: outputGrams > inputGrams,
  };
}

export const COST_UNIT_LABEL: Record<BatchCostUnit, string> = { liter: "liter", orang_hari: "orang-hari", kg: "kg", pcs: "pcs" };
/** Satuan rincian yang ditawarkan per komponen biaya (tenaga: harian atau borongan per kg). */
export const COST_UNITS: Record<BatchCostCategory, BatchCostUnit[]> = {
  listrik_bbm: ["liter"],
  tenaga_kerja: ["orang_hari", "kg"],
  kemasan: ["pcs"],
  lain: ["kg", "pcs"],
};

export type HppParams = Pick<
  HppSettings,
  "kg_per_karung" | "harga_bensin_liter" | "karung_per_liter_pipil" | "liter_per_100kg_giling" | "upah_harian" | "pekerja_pipil" | "pekerja_giling" | "biaya_tetap_bulanan"
>;
export type DefaultCost = { category: BatchCostCategory; qty: number; unit: BatchCostUnit; unitPrice: number; amountRp: number; note: string };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Biaya default batch dari parameter HPP (keputusan 19 Nov 2026):
 *  - BBM pemipilan: (kg tongkol ÷ kg per karung) ÷ karung per liter × harga bensin   (1 L per 20 karung)
 *  - BBM penepungan: kg pipilan × liter per 100 kg ÷ 100 × harga bensin                (1,5 L per 100 kg)
 *  - Tenaga: pekerja (3 pipil / 2 giling) × 1 hari × upah harian
 */
export function defaultBatchCosts(batchType: string, inputGrams: number, s: HppParams): DefaultCost[] {
  const kgIn = inputGrams / 1000;
  const out: DefaultCost[] = [];
  const pipil = batchType === "pemipilan";
  const liter = round3(pipil ? kgIn / s.kg_per_karung / s.karung_per_liter_pipil : (kgIn * s.liter_per_100kg_giling) / 100);
  if (liter > 0 && s.harga_bensin_liter > 0) {
    out.push({
      category: "listrik_bbm",
      qty: liter,
      unit: "liter",
      unitPrice: s.harga_bensin_liter,
      amountRp: Math.round(liter * s.harga_bensin_liter),
      note: pipil ? `Bensin: ${round3(kgIn / s.kg_per_karung)} karung ÷ ${s.karung_per_liter_pipil}` : `Bensin: ${s.liter_per_100kg_giling} L per 100 kg`,
    });
  }
  const workers = pipil ? s.pekerja_pipil : s.pekerja_giling;
  if (workers > 0 && s.upah_harian > 0) {
    out.push({ category: "tenaga_kerja", qty: workers, unit: "orang_hari", unitPrice: s.upah_harian, amountRp: workers * s.upah_harian, note: `${workers} pekerja × 1 hari` });
  }
  return out;
}

/** Nilai satu baris biaya: rincian (jumlah × harga) bila lengkap, selain itu nilai langsung. */
export function costLineAmount(qtyGrams: number | null, unitPrice: number | null, amountRp: number | null): number {
  if (qtyGrams != null && qtyGrams > 0 && unitPrice != null) return Math.round((qtyGrams * unitPrice) / 1000);
  return amountRp ?? 0;
}
