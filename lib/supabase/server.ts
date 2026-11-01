import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

// Klien per permintaan untuk Server Component, Server Action, dan Route Handler (sesi dari cookie).
// Jangan disimpan di variabel global: tiap permintaan punya cookie pengguna sendiri.
export async function createClient() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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
  return createSupabaseClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
