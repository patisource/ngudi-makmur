// Ringkasan batch (FR-PRD-09, StyleGuide §8.3) untuk panel editor — perkiraan sebelum konfirmasi.
// Berat dalam gram bulat (lib/qty), uang rupiah bulat. Angka final (bahan rata-rata bergerak saat konfirmasi,
// HPP terkunci) dihitung database di confirm_production; rumus di sini sama agar perkiraan cocok.
import type { BatchCostCategory } from "@/lib/supabase/types";

export const COST_CATEGORY_LABEL: Record<BatchCostCategory, string> = {
  tenaga_kerja: "Tenaga kerja",
  kemasan: "Kemasan",
  listrik_bbm: "Listrik/BBM",
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
