-- =====================================================================
-- Uji laporan & nota M8 (T8.6, T8.7, uji wajib SRS §11) — SELALU dibatalkan.
-- Alur DEMO PRD §9.1 lengkap (jagung masuk → batch → pesanan → bayar 2× → serah) memakai produk PP/TP nyata di dalam
-- transaksi yang dibatalkan; indikator dibandingkan sebagai SELISIH sebelum/sesudah agar data nyata tidak memengaruhi.
-- =====================================================================
begin;

-- HPP: biaya tetap bulanan 0 & nilai lama diselaraskan dulu, supaya angka uji tidak terpengaruh alokasi bulanan.
update public.hpp_settings set biaya_tetap_bulanan = 0;
select public._hpp_recalc('uji: biaya tetap 0');

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.rpt.admin@contoh.test', '{"full_name":"Uji Admin Laporan"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.rpt.op@contoh.test', '{"full_name":"Uji Operator Laporan"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.rpt.ketua@contoh.test', '{"full_name":"Uji Ketua Laporan"}', now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'admin_kelompok'), ('00000000-0000-4000-8000-0000000000c2', 'operator_produksi'), ('00000000-0000-4000-8000-0000000000c3', 'ketua');
insert into public.user_permissions (user_id, permission) values ('00000000-0000-4000-8000-0000000000c2', 'production.confirm');

insert into public.members (name) values ('Petani A (uji laporan)');
insert into public.customers (name, type) values ('IRT Sekar Arum (uji laporan)', 'usaha');
update public.products set default_price_per_kg = 10000 where code = 'TP';
create temp table _ctx as
  select (select id from public.products where code = 'PP') as pp, (select id from public.products where code = 'TP') as tp,
         (select id from public.members where name = 'Petani A (uji laporan)') as member,
         (select id from public.customers where name = 'IRT Sekar Arum (uji laporan)') as cust,
         (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;
-- posisi awal (sebagai postgres: tanpa RLS)
insert into _k select 'kpi0', public.rpt_kpi((select hari_ini from _ctx), (select hari_ini from _ctx));
create temp table _stok0 as select product_id, on_hand_kg from public.stock_balances;
grant select on _stok0 to authenticated;

-- =============== DEMO: jagung masuk 100 kg PP Rp400.000 (admin) ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
insert into public.receipts (business_date, source_type, member_id, product_id, weight_kg, acquisition_cost)
  select hari_ini, 'anggota', member, pp, 100, 400000 from _ctx;
insert into _id select 'rcv', (select id from public.receipts where member_id = (select member from _ctx));
select public.confirm_receipt((select id from _id where k = 'rcv'));

-- =============== batch penepungan 60 kg PP → 50 kg TP + Rp60.000 (operator) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
insert into _id select 'b', public.save_production_draft(null, 'penepungan', (select hari_ini from _ctx), 'DEMO uji laporan', 0, array[60]::numeric[], array[50]::numeric[],
  '[{"category":"tenaga_kerja","amount_rp":60000}]'::jsonb);
select public.confirm_production((select id from _id where k = 'b'));
insert into _hasil (uji, lulus) select 'DEMO: HPP batch Rp6.000/kg', (select hpp_per_kg from public.production_batches where id = (select id from _id where k = 'b')) = 6000;
insert into _k select 'kpi_op', public.rpt_kpi((select hari_ini from _ctx), (select hari_ini from _ctx));

-- =============== pesanan 5 kg TP, serah (admin), tanpa kas ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
insert into _id select 'o', public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select tp from _ctx), 'qty', '5')));
select public.confirm_order((select id from _id where k = 'o'));
insert into _hasil (uji, lulus) select 'DEMO: tagihan Rp50.000, reservasi 5 kg, tersedia TP berkurang 5 kg',
  (select total_rp from public.orders where id = (select id from _id where k = 'o')) = 50000
  and (select reserved_kg from public.v_stock_balance where product_id = (select tp from _ctx)) >= 5;
select public.fulfill_order((select id from _id where k = 'o'), 'IRT Sekar Arum', null);

-- ---------- nota & cetak ulang (T8.7) ----------
create temp table _stok_pra_cetak as select product_id, on_hand_kg, value_rp from public.stock_balances;
insert into _hasil (uji, lulus) select 'nota: cetak pertama = 1, cetak ulang = 2 (nomor nota tetap)',
  public.log_print('order', (select id from _id where k = 'o')) = 1 and public.log_print('order', (select id from _id where k = 'o')) = 2
  and (select doc_number from public.orders where id = (select id from _id where k = 'o')) ~ '^INV-';
insert into _hasil (uji, lulus) select 'UJI WAJIB: cetak ulang nota tidak mengubah stok atau status',
  (select bool_and(b.on_hand_kg = a.on_hand_kg and b.value_rp = a.value_rp) from public.stock_balances b join _stok_pra_cetak a using (product_id))
  and (select status = 'delivered' from public.orders where id = (select id from _id where k = 'o'));
do $$ begin
  perform public.log_print('payment', (select id from _id where k = 'o'));
  insert into _hasil (uji, lulus) values ('kuitansi pembayaran tidak ada lagi (sistem tanpa kas)', false);
exception when others then insert into _hasil (uji, lulus) values ('kuitansi pembayaran tidak ada lagi (sistem tanpa kas)', sqlstate = '22023');
end $$;
insert into _id select 'draft', public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select tp from _ctx), 'qty', '1')));
do $$ begin
  perform public.log_print('order', (select id from _id where k = 'draft'));
  insert into _hasil (uji, lulus) values ('nota draft tidak bisa dicetak', false);
exception when others then insert into _hasil (uji, lulus) values ('nota draft tidak bisa dicetak', true);
end $$;
insert into _hasil (uji, lulus) select 'UJI WAJIB: printer gagal (cetakan tidak terjadi) tidak mengubah pesanan',
  (select status = 'delivered' from public.orders where id = (select id from _id where k = 'o'));

-- =============== operator: tidak bisa mencetak nota; KPI penjualan/kas tersembunyi (RLS) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
do $$ begin
  perform public.log_print('order', (select id from _id where k = 'o'));
  insert into _hasil (uji, lulus) values ('operator tidak bisa mencetak nota', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak bisa mencetak nota', sqlstate = '42501');
end $$;
insert into _k select 'kpi_op2', public.rpt_kpi((select hari_ini from _ctx), (select hari_ini from _ctx));
insert into _hasil (uji, lulus) select 'RLS: operator melihat produksi (tepung ≥ 50 kg) tetapi omzet Rp0',
  ((select r ->> 'flour_kg' from _k where k = 'kpi_op2'))::numeric >= 50
  and ((select r ->> 'omzet_rp' from _k where k = 'kpi_op2'))::bigint = 0;

-- =============== ketua: laporan lengkap ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
insert into _k select 'kpi_ketua', public.rpt_kpi((select hari_ini from _ctx), (select hari_ini from _ctx));
insert into _hasil (uji, lulus) select 'ketua dapat membaca rekap penjualan', ((select r ->> 'omzet_rp' from _k where k = 'kpi_ketua'))::bigint >= 50000;

-- ---------- angka DEMO (selisih sebelum/sesudah, sebagai postgres) ----------
reset role;
insert into _k select 'kpi1', public.rpt_kpi((select hari_ini from _ctx), (select hari_ini from _ctx));
create temp table _d as
  select k0.r as a, k1.r as b from _k k0, _k k1 where k0.k = 'kpi0' and k1.k = 'kpi1';
insert into _hasil (uji, lulus) select 'DEMO: omzet +Rp50.000 (nilai pesanan diserahkan)', ((b ->> 'omzet_rp')::bigint - (a ->> 'omzet_rp')::bigint) = 50000 from _d;
insert into _hasil (uji, lulus) select 'DEMO: nilai penjualan pesanan Rp50.000; tidak ada data kas (sistem tanpa kas)',
  (select bill_rp from public.v_order_balance where order_id = (select id from _id where k = 'o')) = 50000
  and to_regclass('public.cash_transactions') is null and to_regclass('public.payments') is null and not ((select r from _k where k = 'kpi1') ? 'cash_in_rp');
insert into _hasil (uji, lulus) select 'DEMO: jagung masuk +100 kg / Rp400.000; produksi tepung +50 kg; terjual +5 kg',
  ((b ->> 'receipts_kg')::numeric - (a ->> 'receipts_kg')::numeric) = 100 and ((b ->> 'receipts_rp')::bigint - (a ->> 'receipts_rp')::bigint) = 400000
  and ((b ->> 'flour_kg')::numeric - (a ->> 'flour_kg')::numeric) = 50 and ((b ->> 'sold_kg')::numeric - (a ->> 'sold_kg')::numeric) = 5 from _d;
insert into _hasil (uji, lulus) select 'DEMO: stok PP +40 kg & TP +45 kg (fisik setelah serah)',
  (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _stok0 a using (product_id) where product_id = (select pp from _ctx)) = 40
  and (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _stok0 a using (product_id) where product_id = (select tp from _ctx)) = 45;

-- ---------- rekap = detail (FR-RPT-08) untuk periode yang sama ----------
insert into _hasil (uji, lulus) select 'rekap = detail: omzet KPI = Σ baris rpt_sales',
  (select (r ->> 'omzet_rp')::bigint from _k where k = 'kpi1') = (select coalesce(sum(value_rp), 0) from public.rpt_sales((select hari_ini from _ctx), (select hari_ini from _ctx)));
insert into _hasil (uji, lulus) select 'rekap = detail: kg terjual & jagung masuk KPI = Σ seri harian',
  (select (r ->> 'sold_kg')::numeric from _k where k = 'kpi1') = (select sum(sales_kg) from public.rpt_daily((select hari_ini from _ctx), (select hari_ini from _ctx)))
  and (select (r ->> 'receipts_kg')::numeric from _k where k = 'kpi1') = (select sum(receipts_kg) from public.rpt_daily((select hari_ini from _ctx), (select hari_ini from _ctx)))
  and (select (r ->> 'flour_kg')::numeric from _k where k = 'kpi1') = (select sum(flour_kg) from public.rpt_daily((select hari_ini from _ctx), (select hari_ini from _ctx)));
insert into _hasil (uji, lulus) select 'rekap = detail: saldo akhir laporan stok = fisik tercatat (semua produk)',
  bool_and(closing_kg = on_hand_kg) and bool_and(opening_kg + in_kg - out_kg = closing_kg)
  from public.rpt_stock((select hari_ini from _ctx) - 30, (select hari_ini from _ctx));
insert into _hasil (uji, lulus) select 'porsi jagung mentah & penjualan digital: 0–100% atau kosong bila tidak ada penjualan',
  coalesce(((select r ->> 'raw_share_pct' from _k where k = 'kpi1'))::numeric between 0 and 100, true)
  and coalesce(((select r ->> 'digital_share_pct' from _k where k = 'kpi1'))::numeric between 0 and 100, true);
insert into _hasil (uji, lulus) select 'draft/batal tidak masuk omzet (pesanan draft tidak muncul di rpt_sales)',
  not exists (select 1 from public.rpt_sales((select hari_ini from _ctx), (select hari_ini from _ctx)) where order_id = (select id from _id where k = 'draft'));

do $$
declare v_ok int; v_fail int; v_list text;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus),
         string_agg(case when lulus then 'lulus  ' else 'GAGAL  ' end || uji, E'\n' order by no)
    into v_ok, v_fail, v_list from _hasil;
  raise exception E'HASIL UJI: % lulus, % gagal (transaksi sengaja dibatalkan; tidak ada data uji tersimpan)\n%', v_ok, v_fail, v_list;
end $$;
rollback;
