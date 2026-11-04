-- =====================================================================
-- Persiapan restore (T9.8, docs/Operasional.md §2). Jalankan di proyek TUJUAN yang masih kosong, SEBELUM schema.sql.
--
-- Proyek Supabase baru memberi `anon` & `authenticated` hak PENUH atas setiap tabel/fungsi baru di skema public
-- (ALTER DEFAULT PRIVILEGES). Dump (`supabase db dump`) hanya berisi GRANT terhadap kondisi kosong, sehingga tanpa
-- langkah ini hasil restore jauh lebih longgar daripada aslinya: anon bisa memanggil fungsi internal (write_audit),
-- kolom terkunci bisa di-UPDATE, dsb. (RLS tetap aktif, tetapi lapis hak akses kedua hilang). Ditemukan saat uji restore
-- 5 Nov 2026: 1.996 baris hak akses vs 184 di proyek asli. schema.sql memasang ulang default privileges aslinya di akhir.
-- =====================================================================
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public;
