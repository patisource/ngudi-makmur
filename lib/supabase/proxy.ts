import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

// Menyegarkan token sesi Supabase di setiap permintaan dan menulis cookie barunya ke respons.
// Pengalihan ke /login untuk halaman yang butuh sesi ditambahkan di T1.2.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response; // .env.local belum diisi: biarkan halaman petunjuk penyiapan tampil

  try {
    const env = publicEnv();
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // getUser() memvalidasi token ke server Auth (bukan sekadar membaca cookie) dan memicu penyegaran sesi.
    await supabase.auth.getUser();
  } catch (e) {
    // Env salah format atau Supabase tak terjangkau: jangan jatuhkan seluruh situs (500); catat di log server.
    // Pesan Zod hanya menyebut nama variabel, tidak menyertakan nilainya.
    console.error("[proxy] penyegaran sesi Supabase gagal:", e instanceof Error ? e.message : e);
  }
  return response;
}
