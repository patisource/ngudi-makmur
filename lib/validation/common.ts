// Potongan schema Zod bersama (Security.md §5.2): teks, rupiah, kg, tanggal WIB.
import { z } from "zod";
import { MAX_RUPIAH, parseRupiah } from "@/lib/money";
import { gramsToKgString, parseKgToGrams } from "@/lib/qty";
import { todayWib } from "@/lib/today";

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const text = (max: number, label: string) =>
  z.string().trim().min(1, `${label} wajib diisi`).max(max, `${label} maksimal ${max} karakter`).refine((s) => !CONTROL.test(s), `${label} berisi karakter tidak valid`);
export const optText = (max: number, label: string) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `${label} maksimal ${max} karakter`).refine((s) => !CONTROL.test(s), `${label} berisi karakter tidak valid`).optional());

/** Rupiah opsional ("" → null = belum ditetapkan). */
export const optRupiah = z.preprocess(
  (v) => (blankToUndefined(v) === undefined ? null : parseRupiah(v as string) ?? Number.NaN),
  z.number({ message: "Harga harus bilangan bulat rupiah" }).int().min(0).max(MAX_RUPIAH).nullable(),
);

/** Rupiah wajib (boleh 0). */
export const rupiah = (label: string) =>
  z.preprocess(
    (v) => (blankToUndefined(v) === undefined ? Number.NaN : parseRupiah(v as string) ?? Number.NaN),
    z.number({ message: `${label} wajib diisi, bilangan bulat rupiah` }).int().min(0).max(MAX_RUPIAH, `${label} terlalu besar`),
  );

/** kg > 0 (atau ≥ 0 bila allowZero), maks 3 desimal → string untuk numeric(14,3). */
export const kg = (opts: { allowZero?: boolean; max?: number; label: string }) =>
  z.preprocess(
    (v) => parseKgToGrams(v as string) ?? Number.NaN,
    z
      .number({ message: `${opts.label} harus angka kg, maksimal 3 desimal` })
      .int()
      .refine((g) => (opts.allowZero ? g >= 0 : g > 0), opts.allowZero ? `${opts.label} tidak boleh negatif` : `${opts.label} harus lebih dari 0`)
      .refine((g) => g <= (opts.max ?? 1_000_000) * 1000, `${opts.label} terlalu besar`)
      .transform(gramsToKgString),
  );

/** Tanggal hari ini di Asia/Jakarta, format YYYY-MM-DD (tanggal bisnis, CLAUDE.md aturan 8). */
export { todayWib };

/** Tanggal transaksi: wajib, tidak melebihi hari ini (WIB). */
export const businessDate = (label: string) =>
  z.iso.date(`${label} tidak valid`).refine((d) => d <= todayWib(), `${label} tidak boleh melebihi hari ini`);
