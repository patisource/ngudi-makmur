// Schema Zod parameter HPP kelompok (keputusan 19 Nov 2026) — form & server action. Batas = CHECK di database.
import { z } from "zod";

const dec = (label: string, min: number, max: number, places = 3) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().replace(",", ".") : v),
    z
      .string()
      .regex(new RegExp(`^\\d{1,9}(\\.\\d{1,${places}})?$`),`${label}: angka, maksimal ${places} desimal`)
      .transform(Number)
      .refine((n) => n >= min && n <= max, `${label} harus ${min}–${max}`),
  );
const rp = (label: string, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().replace(/^rp\.?\s*/i, "").replace(/[.\s]/g, "") : v),
    z.string().regex(/^\d{1,10}$/, `${label}: rupiah bulat`).transform(Number).refine((n) => n <= max, `${label} terlalu besar`),
  );
const int = (label: string, max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().regex(/^\d{1,3}$/, `${label}: bilangan bulat`).transform(Number).refine((n) => n <= max, `${label} maks. ${max}`));

export const hppSettingsSchema = z
  .object({
    kg_per_karung: dec("Kg per karung", 0.001, 1000),
    harga_tongkol_kg: rp("Harga tongkol", 1_000_000),
    rendemen_pipil_pct: dec("Rendemen pipil", 0.01, 100, 2),
    rendemen_tepung_pct: dec("Rendemen tepung", 0.01, 100, 2),
    harga_bensin_liter: rp("Harga bensin", 1_000_000),
    karung_per_liter_pipil: dec("Karung per liter", 0.001, 10000),
    liter_per_100kg_giling: dec("Liter per 100 kg", 0, 1000),
    upah_harian: rp("Upah harian", 10_000_000),
    pekerja_pipil: int("Pekerja pipil", 100),
    pekerja_giling: int("Pekerja giling", 100),
    biaya_tetap_bulanan: rp("Biaya tetap bulanan", 1_000_000_000),
  })
  .strict();

export type HppSettingsInput = z.input<typeof hppSettingsSchema>;
