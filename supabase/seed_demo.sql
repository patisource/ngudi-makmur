-- =====================================================================
-- Seed DEMO (PRD §9.1, SRS §10) — HANYA untuk lingkungan dev/DEMO. JANGAN dijalankan di proyek data nyata
-- (Security.md §7). Data dasar (produk TK/PP/TP, kemasan, aturan batch, saluran) sudah dimuat lewat migrasi.
-- Bagian transaksi (jagung masuk, batch, pesanan, pembayaran) ditambahkan setelah modulnya ada (M4–M7).
-- =====================================================================
update public.products set default_price_per_kg = 10000, min_stock_kg = 30 where code = 'TP';
update public.products set min_stock_kg = 20 where code = 'PP';

update public.product_packagings pp set default_price = case when pp.content_kg = 0.5 then 5500 else 10000 end
from public.products p where p.id = pp.product_id and p.code = 'TP';

insert into public.members (name, hamlet) values ('Petani A', 'Baturejo'), ('Petani B', 'Baturejo');
insert into public.customers (name, type) values ('IRT Sekar Arum', 'usaha'), ('Pelanggan umum', 'perorangan');
