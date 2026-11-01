import { z } from "zod";

// Variabel publik (boleh sampai ke browser). Next.js hanya menyisipkan NEXT_PUBLIC_* yang ditulis
// langsung sebagai process.env.NAMA, jadi setiap nilai dibaca satu per satu di sini, bukan lewat loop.
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "Isi NEXT_PUBLIC_SUPABASE_URL di .env.local (Supabase → Project Settings → Data API)" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "Isi NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local (Supabase → Project Settings → API Keys)"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | undefined;

// Alamat aplikasi: NEXT_PUBLIC_SITE_URL bila diisi; di Vercel jatuh ke domain produksi yang disediakan Vercel
// otomatis saat build (NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL, tanpa skema), jadi tidak wajib diisi manual.
export function siteUrl(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit;
  const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : undefined;
}

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: siteUrl(),
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) throw new Error("Variabel lingkungan belum lengkap:\n" + z.prettifyError(parsed.error));
  cached = parsed.data;
  return cached;
}

// Dipakai halaman/proxy untuk menampilkan petunjuk penyiapan alih-alih galat saat .env.local masih kosong.
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
