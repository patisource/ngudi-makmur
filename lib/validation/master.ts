// Schema Zod master data — dipakai klien (pesan cepat) dan server (wajib sebelum menyentuh DB). Security.md §5.
import { z } from "zod";
import { blankToUndefined, kg, optRupiah, optText, text, todayWib } from "@/lib/validation/common";

export const phoneSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v),
  z.preprocess(blankToUndefined, z.string().regex(/^(\+62|0)8\d{7,12}$/, "No. HP tidak valid (mis. 081234567890)").optional()),
);
export const nikSchema = z.preprocess(blankToUndefined, z.string().trim().regex(/^\d{16}$/, "NIK harus 16 digit angka").optional());

export const memberSchema = z
  .object({
    name: text(120, "Nama"),
    hamlet: optText(120, "Dusun"),
    address: optText(300, "Alamat"),
    landAreaHa: z.preprocess(
      (v) => (blankToUndefined(v) === undefined ? undefined : String(v).replace(",", ".")),
      z.string().regex(/^\d+(\.\d{1,3})?$/, "Luas lahan dalam ha, maksimal 3 desimal").refine((s) => Number(s) <= 10000, "Luas lahan terlalu besar").optional(),
    ),
    joinedOn: z.preprocess(blankToUndefined, z.iso.date("Tanggal tidak valid").refine((d) => d <= todayWib(), "Tanggal bergabung tidak boleh di masa depan").optional()),
    nik: nikSchema,
    phone: phoneSchema,
  })
  .strict();

export const customerSchema = z
  .object({
    name: text(120, "Nama"),
    type: z.enum(["perorangan", "usaha"], { message: "Pilih jenis pelanggan" }),
    phone: phoneSchema,
    address: optText(300, "Alamat"),
    note: optText(1000, "Catatan"),
    creditLimitRp: optRupiah,
  })
  .strict();

export const productUpdateSchema = z
  .object({
    name: text(120, "Nama"),
    defaultPricePerKg: optRupiah,
    minStockKg: kg({ allowZero: true, label: "Stok minimum" }),
  })
  .strict();

export const packagingSchema = z.object({ name: text(60, "Nama kemasan") }).strict();

export const productPackagingSchema = z
  .object({
    productId: z.uuid(),
    packagingId: z.uuid("Pilih jenis kemasan"),
    contentKg: kg({ label: "Isi kemasan", max: 100_000 }),
    defaultPrice: optRupiah,
  })
  .strict();

export const channelSchema = z
  .object({
    code: z.string().trim().toLowerCase().regex(/^[a-z_]{3,40}$/, "Kode 3–40 huruf kecil/garis bawah, mis. toko_online"),
    name: text(60, "Nama saluran"),
    isDigital: z.boolean(),
  })
  .strict();

export type MemberInput = z.infer<typeof memberSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
