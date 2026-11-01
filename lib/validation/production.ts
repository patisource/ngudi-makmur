// Schema Zod batch produksi (FR-PRD-01..05, Security.md §5.2) — dipakai editor (klien) dan server action.
import { z } from "zod";
import { businessDate, kg, optText, rupiah } from "@/lib/validation/common";

export const costSchema = z
  .object({
    category: z.enum(["tenaga_kerja", "kemasan", "listrik_bbm", "lain"], { message: "Pilih kategori biaya" }),
    amountRp: rupiah("Nilai biaya").refine((n) => n > 0, "Nilai biaya harus lebih dari 0"),
    sourceRef: optText(60, "Sumber biaya"),
    note: optText(200, "Keterangan"),
  })
  .strict();

export const productionDraftSchema = z
  .object({
    batchType: z.string().regex(/^[a-z_]{3,40}$/, "Pilih jenis batch"),
    businessDate: businessDate("Tanggal"),
    note: optText(1000, "Catatan"),
    residueKg: kg({ allowZero: true, label: "Rincian sisa" }),
    inputs: z.array(kg({ label: "Berat input" })).max(50, "Maksimal 50 baris input"),
    outputs: z.array(kg({ label: "Berat output" })).max(50, "Maksimal 50 baris output"),
    costs: z.array(costSchema).max(20, "Maksimal 20 baris biaya"),
  })
  .strict();

export type ProductionDraftInput = z.input<typeof productionDraftSchema>;
