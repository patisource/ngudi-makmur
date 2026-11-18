// Schema Zod batch produksi (FR-PRD-01..05, Security.md §5.2) — dipakai editor (klien) dan server action.
import { z } from "zod";
import { blankToUndefined, businessDate, kg, optRupiah, optText } from "@/lib/validation/common";

// Biaya batch: isi nilai langsung, ATAU rincian jumlah × harga satuan (liter bensin, orang-hari, kg borongan, pcs).
// Bila rincian diisi, nilai dihitung server (save_production_draft) dan nilai dari klien diabaikan.
export const costSchema = z
  .object({
    category: z.enum(["tenaga_kerja", "kemasan", "listrik_bbm", "lain"], { message: "Pilih kategori biaya" }),
    amountRp: optRupiah,
    qty: z.preprocess(blankToUndefined, kg({ label: "Jumlah", max: 1_000_000 }).optional()),
    unit: z.enum(["liter", "orang_hari", "kg", "pcs"]).optional(),
    unitPrice: optRupiah,
    sourceRef: optText(60, "Sumber biaya"),
    note: optText(200, "Keterangan"),
  })
  .strict()
  .superRefine((c, ctx) => {
    const detail = c.qty !== undefined || c.unitPrice != null;
    if (detail) {
      if (c.qty === undefined) ctx.addIssue({ code: "custom", path: ["qty"], message: "Isi jumlah" });
      if (c.unitPrice == null) ctx.addIssue({ code: "custom", path: ["unitPrice"], message: "Isi harga satuan" });
      if (!c.unit) ctx.addIssue({ code: "custom", path: ["unit"], message: "Pilih satuan" });
      if (c.qty !== undefined && c.unitPrice != null && Math.round(Number(c.qty) * c.unitPrice) <= 0) ctx.addIssue({ code: "custom", path: ["amountRp"], message: "Nilai biaya harus lebih dari 0" });
    } else if (!(c.amountRp != null && c.amountRp > 0)) {
      ctx.addIssue({ code: "custom", path: ["amountRp"], message: "Nilai biaya harus lebih dari 0" });
    }
  });

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
