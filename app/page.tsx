import { redirect } from "next/navigation";

// "/" tidak punya isi sendiri. Bila Supabase sudah dikonfigurasi, proxy.ts sudah mengalihkan ke /login atau /dashboard
// sebelum halaman ini dirender; yang sampai ke sini hanya saat .env belum diisi.
export default function Root() {
  redirect("/penyiapan");
}
