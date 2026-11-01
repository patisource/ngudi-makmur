import "server-only";
import { z } from "zod";

// Rahasia server. `server-only` membuat build gagal bila berkas ini terimpor dari komponen klien,
// sehingga kunci rahasia tidak pernah masuk bundel browser (Security.md).
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1, "Isi SUPABASE_SECRET_KEY di .env.local (Supabase → Project Settings → API Keys → Secret)"),
});

export function serverEnv() {
  const parsed = serverSchema.safeParse({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
  if (!parsed.success) throw new Error("Variabel server belum lengkap:\n" + z.prettifyError(parsed.error));
  return parsed.data;
}
