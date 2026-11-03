import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/types";

// Klien per permintaan untuk Server Component, Server Action, dan Route Handler (sesi dari cookie).
// Jangan disimpan di variabel global: tiap permintaan punya cookie pengguna sendiri.
export async function createClient() {
  // Klien bersesi selalu dirender saat permintaan: supabase-js memanggil Date.now() saat membaca sesi, yang ditolak
  // Next (Cache Components) bila terjadi di fase prerender.
  await connection();
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Dipanggil dari Server Component (cookie tidak bisa ditulis). Aman diabaikan karena proxy.ts menyegarkan sesi.
        }
      },
    },
  });
}

// Klien dengan kunci rahasia: melewati RLS. HANYA untuk tugas admin teknis (membuat akun)
// setelah requireRole(["admin_teknis"]); jangan dipakai untuk melayani permintaan pengguna biasa.
export function createAdminClient() {
  return createSupabaseClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
