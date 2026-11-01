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

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
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
