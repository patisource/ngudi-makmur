import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

// Halaman yang boleh dibuka tanpa sesi.
const PUBLIC_PATHS = ["/login", "/penyiapan", "/403", "/keluar"];
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

// Menyegarkan token sesi Supabase di setiap permintaan, lalu:
// - tanpa sesi di halaman non-publik → /login?next=<path>
// - sudah login tetapi membuka /login atau / → /dashboard (halaman tujuan menyaring lagi sesuai peran)
// Pemeriksaan peran per halaman ada di server (requireRole), bukan di sini.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response; // .env belum diisi: biarkan halaman /penyiapan tampil

  const path = request.nextUrl.pathname;
  let signedIn = false;
  try {
    const env = publicEnv();
    const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch (e) {
    // Env salah format atau Supabase tak terjangkau: jangan jatuhkan seluruh situs (500); catat di log server.
    // Pesan Zod hanya menyebut nama variabel, tidak menyertakan nilainya.
    console.error("[proxy] penyegaran sesi Supabase gagal:", e instanceof Error ? e.message : e);
    return response;
  }

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    const [pathname, query] = target.split("?");
    url.pathname = pathname;
    url.search = query ? "?" + query : "";
    const res = NextResponse.redirect(url);
    // Bawa cookie sesi yang baru disegarkan ke respons pengalihan.
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // API: tanpa sesi → 401 JSON (bentuk respons PRD §8.1), bukan pengalihan ke halaman login.
  if (!signedIn && path.startsWith("/api/")) {
    return NextResponse.json({ data: null, error: { code: "UNAUTHENTICATED", message: "Sesi berakhir. Silakan masuk lagi." } }, { status: 401 });
  }
  if (!signedIn && !isPublic(path)) {
    const next = path === "/" ? "" : "?next=" + encodeURIComponent(path + request.nextUrl.search);
    return redirectTo("/login" + next);
  }
  if (signedIn && (path === "/" || path === "/login")) return redirectTo("/dashboard");
  return response;
}
