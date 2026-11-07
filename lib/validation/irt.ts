// Schema Zod modul IRT (M10, PRD §4.10, Security.md §5.2). Dipakai server action; database memvalidasi ulang.
import { z } from "zod";
import { parseWhole } from "@/lib/irt";
import { businessDate, kg, optRupiah, optText, rupiah, text } from "@/lib/validation/common";

/** Jumlah pcs/pack: bilangan bulat 1–100.000. */
const whole = (label: string) =>
  z.preprocess(
    (v) => parseWhole(String(v ?? "")) ?? Number.NaN,
    z.number({ message: `${label} harus bilangan bulat ≥ 1` }).int().min(1).max(100_000, `${label} terlalu besar`),
  );
/** Jumlah bahan (boleh desimal, maks. 3 angka di belakang koma) → string numeric. */
const qty = (label: string) => kg({ label, max: 1_000_000 });
const reason = text(500, "Alasan").refine((s) => s.length >= 5, "Alasan minimal 5 karakter");

export const irtItemSchema = z
  .object({
    kind: z.enum(["bahan", "produk"], { message: "Pilih bahan atau produk" }),
    name: text(80, "Nama").refine((s) => s.length >= 2, "Nama minimal 2 karakter"),
    unit: z.enum(["kg", "gram", "liter", "ml", "butir", "pcs"], { message: "Pilih satuan" }),
    packSize: z.preprocess(
      (v) => (v === "" || v == null ? null : (parseWhole(String(v)) ?? Number.NaN)),
      z.number({ message: "Isi per pack harus bilangan bulat" }).int().min(2, "Isi per pack minimal 2 pcs").max(1000, "Isi per pack maksimal 1.000 pcs").nullable(),
    ),
    pricePcs: optRupiah,
    pricePack: optRupiah,
    minStock: kg({ allowZero: true, label: "Stok minimum" }),
    kelompokProductId: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid("Produk kelompok tidak valid").nullable()),
  })
  .strict()
  .refine((d) => d.kind === "bahan" || d.pricePcs != null, { message: "Harga per pcs wajib diisi untuk produk", path: ["pricePcs"] })
  .refine((d) => d.kind === "bahan" || d.pricePack == null || d.packSize != null, { message: "Isi per pack wajib bila harga pack diisi", path: ["packSize"] });

export const irtReceiveSchema = z
  .object({
    businessDate: businessDate("Tanggal"),
    supplier: optText(120, "Pemasok"),
    note: optText(500, "Catatan"),
    lines: z
      .array(z.object({ itemId: z.uuid("Pilih bahan"), qty: qty("Jumlah"), valueRp: rupiah("Harga beli") }).strict())
      .min(1, "Isi minimal satu bahan")
      .max(30, "Maksimal 30 baris"),
  })
  .strict();

export const irtBatchSchema = z
  .object({
    businessDate: businessDate("Tanggal produksi"),
    note: optText(500, "Catatan"),
    inputs: z.array(z.object({ itemId: z.uuid("Pilih bahan"), qty: qty("Jumlah bahan") }).strict()).min(1, "Isi minimal satu bahan").max(30),
    outputs: z.array(z.object({ itemId: z.uuid("Pilih produk"), qty: whole("Hasil (pcs)") }).strict()).min(1, "Isi minimal satu hasil").max(30),
  })
  .strict();

export const irtSaleSchema = z
  .object({
    businessDate: businessDate("Tanggal"),
    buyer: optText(120, "Pembeli"),
    note: optText(500, "Catatan"),
    lines: z
      .array(z.object({ itemId: z.uuid("Pilih produk"), unit: z.enum(["pcs", "pack"]), qty: whole("Jumlah") }).strict())
      .min(1, "Isi minimal satu produk")
      .max(30, "Maksimal 30 baris"),
  })
  .strict();

export const irtAdjustSchema = z
  .object({
    itemId: z.uuid("Pilih bahan/produk"),
    direction: z.enum(["in", "out"], { message: "Pilih tambah atau kurang" }),
    qty: qty("Jumlah koreksi"),
    reason,
    businessDate: businessDate("Tanggal"),
  })
  .strict();

export const irtReasonSchema = z.object({ reason }).strict();

export type IrtItemInput = z.input<typeof irtItemSchema>;
export type IrtReceiveInput = z.input<typeof irtReceiveSchema>;
export type IrtBatchInput = z.input<typeof irtBatchSchema>;
export type IrtSaleInput = z.input<typeof irtSaleSchema>;
export type IrtAdjustInput = z.input<typeof irtAdjustSchema>;
