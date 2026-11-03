-- =====================================================================
-- Seed DEMO (PRD §9.1, SRS §10, T2.7) — HANYA untuk lingkungan lokal/DEMO. JANGAN dijalankan di proyek data nyata
-- (Security.md §7): berisi akun dengan kata sandi yang diketahui umum.
-- Dimuat otomatis oleh `supabase db reset` (config.toml [db.seed]); `supabase db push` tidak menjalankan seed.
--
-- Akun DEMO (kata sandi semua: demo-ngudi-makmur):
--   admin.demo@contoh.test    admin_kelompok
--   operator.demo@contoh.test operator_produksi (+ izin production.confirm)
--   ketua.demo@contoh.test    ketua
--   teknis.demo@contoh.test   admin_teknis
--
-- Alur transaksi dijalankan lewat fungsi posting yang sama dengan aplikasi, sehingga hasilnya harus:
--   HPP Rp6.000/kg · stok PP 40 kg & TP 45 kg · kas masuk Rp50.000 · piutang Rp0 (uji: supabase/tests/report_check.sql).
-- =====================================================================

-- ---------- master contoh ----------
update public.products set default_price_per_kg = 10000, min_stock_kg = 30 where code = 'TP';
update public.products set min_stock_kg = 20 where code = 'PP';
update public.product_packagings pp set default_price = case when pp.content_kg = 0.5 then 5500 else 10000 end
from public.products p where p.id = pp.product_id and p.code = 'TP';

insert into public.members (name, hamlet) values ('Petani A', 'Baturejo'), ('Petani B', 'Baturejo');
insert into public.customers (name, type) values ('IRT Sekar Arum', 'usaha'), ('Pelanggan umum', 'perorangan');

-- ---------- akun DEMO ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('demo-ngudi-makmur', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from (values
  ('0d000000-0000-4000-8000-000000000001'::uuid, 'admin.demo@contoh.test', 'Admin Demo'),
  ('0d000000-0000-4000-8000-000000000002'::uuid, 'operator.demo@contoh.test', 'Operator Demo'),
  ('0d000000-0000-4000-8000-000000000003'::uuid, 'ketua.demo@contoh.test', 'Ketua Demo'),
  ('0d000000-0000-4000-8000-000000000004'::uuid, 'teknis.demo@contoh.test', 'Teknis Demo')
) as u (id, email, full_name);
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like '%.demo@contoh.test';
insert into public.user_roles (user_id, role) values
  ('0d000000-0000-4000-8000-000000000001', 'admin_kelompok'),
  ('0d000000-0000-4000-8000-000000000002', 'operator_produksi'),
  ('0d000000-0000-4000-8000-000000000003', 'ketua'),
  ('0d000000-0000-4000-8000-000000000004', 'admin_teknis');
insert into public.user_permissions (user_id, permission) values ('0d000000-0000-4000-8000-000000000002', 'production.confirm');

-- ---------- alur DEMO lewat fungsi posting ----------
-- 1) admin: saldo awal kas 0 (diisi), jagung masuk 100 kg PP dari Petani A, biaya perolehan Rp400.000
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
set role authenticated;
select public.set_opening_balance(id, 0, null) from public.cash_accounts where code in ('TUNAI', 'BANK');
insert into public.receipts (business_date, source_type, member_id, product_id, weight_kg, acquisition_cost, note)
select (now() at time zone 'Asia/Jakarta')::date, 'anggota', m.id, p.id, 100, 400000, 'DEMO PRD §9.1'
from public.members m, public.products p where m.name = 'Petani A' and p.code = 'PP';
select public.confirm_receipt(id) from public.receipts where note = 'DEMO PRD §9.1';

-- 2) operator: batch penepungan 60 kg PP → 50 kg TP, biaya proses Rp60.000 → HPP Rp6.000/kg
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000002","role":"authenticated"}', false);
select public.confirm_production(public.save_production_draft(null, 'penepungan', null, 'DEMO PRD §9.1', 0, array[60]::numeric[], array[50]::numeric[],
  '[{"category":"tenaga_kerja","amount_rp":60000,"note":"upah giling"}]'::jsonb));

-- 3) admin: pesanan 5 kg TP @Rp10.000 (IRT Sekar Arum), bayar Rp30.000 + Rp20.000 (terverifikasi), serah barang
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select public.save_order_draft(null, null, c.id, 'langsung', 'DEMO PRD §9.1', 0, jsonb_build_array(jsonb_build_object('product_id', p.id, 'qty', '5')))
from public.customers c, public.products p where c.name = 'IRT Sekar Arum' and p.code = 'TP';
select public.confirm_order(id) from public.orders where note = 'DEMO PRD §9.1';
select public.record_payment(o.id, null, 'tunai', a.id, 30000, 'DEMO cicilan 1', true) from public.orders o, public.cash_accounts a where o.note = 'DEMO PRD §9.1' and a.code = 'TUNAI';
select public.record_payment(o.id, null, 'transfer', a.id, 20000, 'DEMO cicilan 2', true) from public.orders o, public.cash_accounts a where o.note = 'DEMO PRD §9.1' and a.code = 'BANK';
select public.fulfill_order(id, 'IRT Sekar Arum', null) from public.orders where note = 'DEMO PRD §9.1';

reset role;
select set_config('request.jwt.claims', '', false);
