// Schema Zod jagung masuk (FR-RCV-01, Security.md §5.2) — dipakai klien dan server.
import { z } from "zod";
import { blankToUndefined, businessDate, kg, optText, rupiah, text } from "@/lib/validation/common";

const moisture = z.preprocess(
  (v) => (blankToUndefined(v) === undefined ? undefined : String(v).trim().replace(",", ".")),
  z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Kadar air dalam %, maksimal 2 desimal")
    .refine((s) => Number(s) <= 100, "Kadar air maksimal 100%")
    .optional(),
);

export const receiptSchema = z
  .object({
    businessDate: businessDate("Tanggal"),
    sourceType: z.enum(["anggota", "luar"], { message: "Pilih sumber jagung" }),
    memberId: z.preprocess(blankToUndefined, z.uuid("Pilih anggota").optional()),
    supplierName: optText(120, "Nama pemasok"),
    productId: z.uuid("Pilih jenis jagung"),
    weightKg: kg({ label: "Berat" }),
    moisturePct: moisture,
    acquisitionCost: rupiah("Biaya perolehan"),
    note: optText(1000, "Catatan"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.sourceType === "anggota" && !v.memberId) ctx.addIssue({ code: "custom", path: ["memberId"], message: "Pilih anggota penyetor" });
    if (v.sourceType === "luar" && !v.supplierName) ctx.addIssue({ code: "custom", path: ["supplierName"], message: "Nama pemasok wajib diisi" });
  })
  // hanya satu identitas sumber yang disimpan (CHECK di database)
  .transform((v) => ({ ...v, memberId: v.sourceType === "anggota" ? v.memberId : undefined, supplierName: v.sourceType === "luar" ? v.supplierName : undefined }));

export const voidReasonSchema = text(500, "Alasan pembatalan").refine((s) => s.length >= 5, "Alasan pembatalan minimal 5 karakter");

/** Path bukti di bucket `proofs`: receipts/yyyy/mm/uuid.ext (Security.md §8). */
export const proofPathSchema = z.string().regex(/^receipts\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/, "Path bukti tidak valid");

export type ReceiptInput = z.infer<typeof receiptSchema>;
