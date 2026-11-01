import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

// Klien Supabase untuk Client Component. Hanya memakai kunci publik; akses data dibatasi RLS.
export function createClient() {
  const env = publicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
