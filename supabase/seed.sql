-- =====================================================================
-- Seed dasar (T2.7). Data dasar yang WAJIB ada di setiap lingkungan — produk TK/PP/TP (kg), jenis kemasan & konversi,
-- aturan jenis batch (pemipilan TK→PP, penepungan PP→TP), saluran penjualan, akun kas (tunai & bank), kategori
-- pengeluaran & pemasukan lain — sudah dimuat oleh migrasi (supabase/migrations/*), sehingga juga ada di proyek nyata
-- tanpa menjalankan seed. Berkas ini sengaja kosong selain penjelasan ini.
--
-- Data contoh DEMO (PRD §9.1) ada di seed_demo.sql dan hanya dimuat oleh `supabase db reset` lokal/DEMO
-- (config.toml [db.seed]); `supabase db push` ke proyek nyata TIDAK menjalankan seed.
-- =====================================================================
select 1;
