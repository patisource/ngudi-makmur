// Schema Zod stok opname & koreksi stok (FR-STK-03/04, Security.md §5.2).
import { z } from "zod";
import { businessDate, kg, optText, text } from "@/lib/validation/common";

export const opnameSchema = z
  .object({
    businessDate: businessDate("Tanggal opname"),
    note: optText(1000, "Catatan"),
    lines: z
      .array(z.object({ productId: z.uuid("Produk tidak valid"), physicalKg: kg({ allowZero: true, label: "Berat fisik" }) }).strict())
      .min(1, "Isi berat fisik minimal satu produk")
      .max(100, "Maksimal 100 produk"),
  })
  .strict();

export const adjustmentSchema = z
  .object({
    productId: z.uuid("Pilih produk"),
    direction: z.enum(["in", "out"], { message: "Pilih tambah atau kurang" }),
    qtyKg: kg({ label: "Berat koreksi" }),
    reason: text(500, "Alasan").refine((s) => s.length >= 5, "Alasan minimal 5 karakter"),
    businessDate: businessDate("Tanggal"),
  })
  .strict();

export const reasonSchema = z.object({ reason: text(500, "Alasan").refine((s) => s.length >= 5, "Alasan minimal 5 karakter") }).strict();

export type OpnameInput = z.input<typeof opnameSchema>;
export type AdjustmentInput = z.input<typeof adjustmentSchema>;
