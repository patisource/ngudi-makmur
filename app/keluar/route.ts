import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mengakhiri sesi akun yang dinonaktifkan (dipanggil dari requireUser). Logout biasa memakai Server Action
// dari menu profil; jalur GET ini hanya untuk pengalihan otomatis, jadi tujuannya tetap /login.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  if (request.nextUrl.searchParams.get("alasan") === "nonaktif") url.searchParams.set("alasan", "nonaktif");
  return NextResponse.redirect(url);
}
