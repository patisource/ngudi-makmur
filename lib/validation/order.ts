// Schema Zod pesanan (FR-SAL-02, FR-SAL-05, FR-SAL-06; Security.md §5.2) — dipakai form (klien), server action, dan API.
// Harga, total, kg, status, dan nomor TIDAK diterima dari klien (CLAUDE.md aturan 5); schema .strict() menolaknya.
import { z } from "zod";
import { blankToUndefined, businessDate, kg, optText, rupiah, text } from "@/lib/validation/common";

export const orderItemSchema = z
  .object({
    productId: z.uuid("Pilih produk"),
    /** kosong = kg curah */
    packagingId: z.preprocess((v) => blankToUndefined(v) ?? null, z.uuid("Kemasan tidak valid").nullable()),
    qty: kg({ label: "Jumlah" }),
    discountRp: z.preprocess((v) => blankToUndefined(v) ?? "0", rupiah("Diskon")),
  })
  .strict();

export const orderDraftSchema = z
  .object({
    businessDate: businessDate("Tanggal"),
    customerId: z.uuid("Pilih pelanggan"),
    channel: z.string().regex(/^[a-z_]{3,40}$/, "Pilih sumber pasar/saluran"),
    note: optText(1000, "Catatan"),
    shippingRp: z.preprocess((v) => blankToUndefined(v) ?? "0", rupiah("Ongkos kirim")),
    items: z.array(orderItemSchema).min(1, "Tambahkan minimal satu item").max(50, "Maksimal 50 item"),
  })
  .strict();

export const cancelOrderSchema = z
  .object({ reason: text(500, "Alasan pembatalan").refine((s) => s.length >= 5, "Alasan pembatalan minimal 5 karakter") })
  .strict();

export const fulfillOrderSchema = z
  .object({
    recipient: optText(120, "Nama penerima"),
    deliveredOn: businessDate("Tanggal serah"),
  })
  .strict();

export const quickCustomerSchema = z
  .object({
    name: text(120, "Nama pelanggan"),
    type: z.enum(["perorangan", "usaha"], { message: "Pilih jenis pelanggan" }),
  })
  .strict();

export type OrderDraftInput = z.input<typeof orderDraftSchema>;
export type FulfillOrderInput = z.input<typeof fulfillOrderSchema>;
