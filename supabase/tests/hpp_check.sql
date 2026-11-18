-- =====================================================================
-- Uji HPP rumus baru (19 Nov 2026, PRD §4.4 & Q25) — SELALU dibatalkan.
-- Kelompok: karung → kg, biaya jumlah × harga satuan (dihitung server), alokasi biaya tetap bulanan per kg hasil,
-- hitung ulang otomatis saat batch baru di bulan yang sama / parameter berubah, log sebelum → sesudah, buku mutasi
-- tetap terkunci di luar mesin hitung ulang. IRT: resep, gas per resep, upah & kemasan per pcs, HPP standar.
-- Batch uji memakai bulan Januari 2025 (tanpa batch lain) supaya alokasi tidak tercampur data nyata.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.hpp.admin@contoh.test', '{"full_name":"Uji Admin HPP"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.hpp.op@contoh.test', '{"full_name":"Uji Operator HPP"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.hpp.irt@contoh.test', '{"full_name":"Uji Pengurus IRT HPP"}', now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000d1', 'admin_kelompok'), ('00000000-0000-4000-8000-0000000000d2', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000d3', 'pengurus_irt');
insert into public.user_permissions (user_id, permission) values ('00000000-0000-4000-8000-0000000000d2', 'production.confirm');
insert into public.members (name) values ('Petani uji HPP');

-- parameter default dari keputusan pengguna
insert into _hasil (uji, lulus) select 'parameter default: 33 kg/karung, Rp7.650/kg, rendemen 65%/88%, bensin Rp10.000, 1 L/20 karung, 1,5 L/100 kg, upah Rp90.000 (3/2 orang), biaya tetap Rp75.000',
  kg_per_karung = 33 and harga_tongkol_kg = 7650 and rendemen_pipil_pct = 65 and rendemen_tepung_pct = 88 and harga_bensin_liter = 10000
  and karung_per_liter_pipil = 20 and liter_per_100kg_giling = 1.5 and upah_harian = 90000 and pekerja_pipil = 3 and pekerja_giling = 2
  and biaya_tetap_bulanan = 75000
  from public.hpp_settings where id = 1;
insert into _hasil (uji, lulus) select 'kemasan default: karung pipilan 5 kg Rp1.500, kemasan tepung 1 kg Rp1.200',
  exists (select 1 from public.product_packagings pp join public.products p on p.id = pp.product_id where p.code = 'PP' and pp.content_kg = 5 and pp.cost_rp = 1500)
  and exists (select 1 from public.product_packagings pp join public.products p on p.id = pp.product_id where p.code = 'TP' and pp.content_kg = 1 and pp.cost_rp = 1200);

create temp table _ctx as
  select (select id from public.products where code = 'TK') as tk, (select id from public.products where code = 'PP') as pp,
         (select id from public.products where code = 'TP') as tp, (select id from public.members where name = 'Petani uji HPP') as member,
         date '2025-01-15' as tgl;
grant select on _ctx to authenticated, anon;

-- =============== jagung masuk per karung (admin) ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
insert into public.receipts (business_date, source_type, member_id, product_id, weight_kg, sack_count, acquisition_cost)
  select tgl, 'anggota', member, tk, 1, 20, 5049000 from _ctx;   -- 20 karung × 33 kg = 660 kg @Rp7.650
insert into _id select 'rcv', (select id from public.receipts where member_id = (select member from _ctx));
insert into _hasil (uji, lulus) select 'jagung masuk 20 karung → 660 kg (dihitung server, isian kg diabaikan)',
  (select weight_kg from public.receipts where id = (select id from _id where k = 'rcv')) = 660;
select public.confirm_receipt((select id from _id where k = 'rcv'));
do $$ begin
  perform public.save_hpp_settings('{"biaya_tetap_bulanan": 1}'::jsonb);
  insert into _hasil (uji, lulus) values ('admin kelompok boleh mengubah parameter HPP', true);
end $$;
select public.save_hpp_settings('{"biaya_tetap_bulanan": 75000}'::jsonb);

-- =============== batch pemipilan: 660 kg TK → 429 kg PP (operator) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
do $$ begin
  perform public.save_hpp_settings('{"biaya_tetap_bulanan": 0}'::jsonb);
  insert into _hasil (uji, lulus) values ('operator tidak boleh mengubah parameter HPP', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak boleh mengubah parameter HPP', sqlstate = '42501');
end $$;
-- BBM 1 liter (20 karung ÷ 20) × Rp10.000; tenaga 3 orang × 1 hari × Rp90.000 — nilai dihitung server dari jumlah × harga.
insert into _id select 'b1', public.save_production_draft(null, 'pemipilan', (select tgl from _ctx), 'uji HPP pipil', 0, array[660]::numeric[], array[429]::numeric[],
  '[{"category":"listrik_bbm","qty":1,"unit":"liter","unit_price":10000,"amount_rp":1},
    {"category":"tenaga_kerja","qty":3,"unit":"orang_hari","unit_price":90000,"amount_rp":1}]'::jsonb);
insert into _hasil (uji, lulus) select 'biaya batch = jumlah × harga satuan (nilai klien diabaikan): BBM Rp10.000, tenaga Rp270.000',
  (select amount_rp from public.batch_costs where batch_id = (select id from _id where k = 'b1') and category = 'listrik_bbm') = 10000
  and (select amount_rp from public.batch_costs where batch_id = (select id from _id where k = 'b1') and category = 'tenaga_kerja') = 270000
  and (select other_cost from public.production_batches where id = (select id from _id where k = 'b1')) = 280000;
select public.confirm_production((select id from _id where k = 'b1'));
-- satu-satunya batch di Jan 2025 → menanggung seluruh biaya tetap Rp75.000
insert into _hasil (uji, lulus) select 'batch tunggal bulan itu menanggung seluruh biaya tetap Rp75.000; HPP = (5.049.000 + 280.000 + 75.000) ÷ 429',
  fixed_cost_rp = 75000 and material_cost = 5049000 and total_cost = 5404000 and hpp_per_kg = round(5404000 / 429.0)
  from public.production_batches where id = (select id from _id where k = 'b1');

-- =============== batch penepungan di bulan yang sama: 200 kg PP → 176 kg TP ===============
insert into _id select 'b2', public.save_production_draft(null, 'penepungan', (select tgl from _ctx), 'uji HPP giling', 0, array[200]::numeric[], array[176]::numeric[],
  '[{"category":"listrik_bbm","qty":3,"unit":"liter","unit_price":10000}]'::jsonb);
select public.confirm_production((select id from _id where k = 'b2'));
insert into _hasil (uji, lulus) select 'batch kedua di bulan sama: biaya tetap dibagi sebanding kg hasil (429 : 176), total tetap Rp75.000',
  (select fixed_cost_rp from public.production_batches where id = (select id from _id where k = 'b1')) = round(75000 * 429 / 605.0)
  and (select sum(fixed_cost_rp) from public.production_batches where id in ((select id from _id where k = 'b1'), (select id from _id where k = 'b2'))) = 75000;
insert into _hasil (uji, lulus) select 'HPP batch pertama ikut dihitung ulang otomatis',
  hpp_per_kg = round((5049000 + 280000 + round(75000 * 429 / 605.0)) / 429.0) from public.production_batches where id = (select id from _id where k = 'b1');
insert into _hasil (uji, lulus) select 'nilai bahan batch kedua = 200 kg × rata-rata PP baru; nilai hasil = bahan + BBM + biaya tetap',
  b.material_cost = (select value_rp from public.production_lines where batch_id = b.id and direction = 'input')
  and b.total_cost = b.material_cost + 30000 + b.fixed_cost_rp
  and (select sum(value_rp) from public.production_lines where batch_id = b.id and direction = 'output') = b.total_cost
  from public.production_batches b where b.id = (select id from _id where k = 'b2');

-- =============== buku mutasi tetap terkunci di luar mesin hitung ulang ===============
reset role;
do $$ begin
  update public.stock_movements set value_rp = value_rp + 1 where source_id = (select id from _id where k = 'b1');
  insert into _hasil (uji, lulus) values ('UJI WAJIB: nilai mutasi tidak bisa diubah langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('UJI WAJIB: nilai mutasi tidak bisa diubah langsung', true);
end $$;
do $$ begin
  update public.stock_movements set qty_kg = qty_kg + 1 where source_id = (select id from _id where k = 'b1');
  insert into _hasil (uji, lulus) values ('UJI WAJIB: kg mutasi tidak bisa diubah walau mode hitung ulang aktif', false);
exception when others then insert into _hasil (uji, lulus) values ('UJI WAJIB: kg mutasi tidak bisa diubah walau mode hitung ulang aktif', true);
end $$;
do $$ begin
  perform set_config('app.hpp_recalc', 'on', true);
  update public.stock_movements set qty_kg = qty_kg + 1 where source_id = (select id from _id where k = 'b1');
  insert into _hasil (uji, lulus) values ('kg mutasi terkunci walau flag hitung ulang aktif', false);
exception when others then insert into _hasil (uji, lulus) values ('kg mutasi terkunci walau flag hitung ulang aktif', true);
end $$;
select set_config('app.hpp_recalc', 'off', true);

-- =============== ubah parameter → semua HPP bulan itu dihitung ulang & tercatat di log ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
insert into _k select 'set', public.save_hpp_settings('{"biaya_tetap_bulanan": 150000}'::jsonb);
reset role;
insert into _hasil (uji, lulus) select 'biaya tetap Rp150.000 → alokasi bulan itu ikut berubah (total Rp150.000)',
  (select sum(fixed_cost_rp) from public.production_batches where id in ((select id from _id where k = 'b1'), (select id from _id where k = 'b2'))) = 150000;
insert into _hasil (uji, lulus) select 'hitung ulang mencatat nilai sebelum → sesudah di hpp_recalc_log',
  exists (select 1 from public.hpp_recalc_log l where l.run_id = ((select r -> 'recalc' ->> 'run_id' from _k where k = 'set'))::bigint
            and l.entity = 'production_batch' and l.entity_id = (select id from _id where k = 'b1')::text and l.before_rp <> l.after_rp);
insert into _hasil (uji, lulus) select 'nilai saldo = Σ nilai mutasi (semua produk) setelah hitung ulang',
  bool_and(b.value_rp = coalesce((select sum(case when m.direction = 'in' then m.value_rp else -m.value_rp end) from public.stock_movements m where m.product_id = b.product_id), 0))
  from public.stock_balances b;
insert into _hasil (uji, lulus) select 'hitung ulang tidak mengubah kg (saldo = Σ kg mutasi)',
  bool_and(b.on_hand_kg = coalesce((select sum(case when m.direction = 'in' then m.qty_kg else -m.qty_kg end) from public.stock_movements m where m.product_id = b.product_id), 0))
  from public.stock_balances b;
insert into _hasil (uji, lulus) select 'hitung ulang dua kali berturut-turut stabil (tidak ada perubahan kedua)',
  ((public._hpp_recalc('uji stabil')) ->> 'movements_changed')::int = 0;

-- =============== IRT: resep, biaya non-bahan, HPP standar ===============
insert into public.irt_items (kind, name, unit) values ('bahan', 'Uji bahan HPP', 'kg');
insert into public.irt_items (kind, name, unit, price_pcs) values ('produk', 'Uji mie HPP', 'pcs', 5000);
insert into _id select 'bahan', id from public.irt_items where name = 'Uji bahan HPP';
insert into _id select 'mie', id from public.irt_items where name = 'Uji mie HPP';
insert into _hasil (uji, lulus) select 'default IRT: mie jagung 90 g kemas (kemasan Rp800, upah Rp1.625, markup 50%, harga Rp6.000) + resep 2,77 pcs & gas Rp1.000',
  exists (select 1 from public.irt_items i join public.irt_recipes r on r.product_id = i.id
           where i.name = 'Mie Jagung Kering Mentah Kemas (90g)' and i.packaging_cost_pcs = 800 and i.labor_cost_pcs = 1625
             and i.target_markup_pct = 50 and i.price_pcs = 6000 and r.yield_pcs = 2.77 and r.gas_rp = 1000
             and (select count(*) from public.irt_recipe_lines where recipe_id = r.id) = 5);
insert into _hasil (uji, lulus) select 'harga standar bahan: terigu Rp12.000/kg, tapioka Rp16.000/kg, telur Rp1.500/butir, garam Rp8.000/kg',
  (select count(*) from public.irt_items where kind = 'bahan' and archived_at is null and (
     (lower(name) = 'tepung terigu' and std_price = 12000) or (lower(name) = 'tepung tapioka' and std_price = 16000)
     or (lower(name) = 'telur ayam' and std_price = 1500 and unit = 'butir') or (lower(name) = 'garam halus' and std_price = 8000))) = 4;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
select public.irt_save_item_costs((select id from _id where k = 'bahan'), 10000, null, null, null);
select public.irt_save_item_costs((select id from _id where k = 'mie'), null, 800, 1625, 50);
insert into _id select 'resep', public.irt_save_recipe((select id from _id where k = 'mie'), 2.5, 1000, 'resep uji',
  jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'bahan'), 'qty', 0.1)));
select public.irt_receive(null, 'Toko uji', null, jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'bahan'), 'qty', 1, 'value_rp', 10000)));
-- 2 resep: bahan 0,2 kg (Rp2.000), hasil 5 pcs → gas 2 × Rp1.000, upah 5 × Rp1.625, kemasan 5 × Rp800 (dihitung server)
insert into _id select 'ib', public.irt_save_batch_draft(null, null, 'uji HPP IRT',
  jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'bahan'), 'qty', 0.2)),
  jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'mie'), 'qty', 5)),
  jsonb_build_object('recipe_id', (select id from _id where k = 'resep'), 'recipe_count', 2));
insert into _hasil (uji, lulus) select 'draft IRT: gas = gas resep × jumlah resep, upah & kemasan = pcs × tarif produk',
  gas_rp = 2000 and labor_rp = 8125 and packaging_rp = 4000 and other_rp = 0 and recipe_count = 2
  from public.irt_batches where id = (select id from _id where k = 'ib');
insert into _k select 'ic', public.irt_confirm_batch((select id from _id where k = 'ib'));
insert into _hasil (uji, lulus) select 'HPP per pcs IRT = (bahan 2.000 + gas 2.000 + upah 8.125 + kemasan 4.000) ÷ 5 = Rp3.225',
  input_value_rp = 2000 and total_cost_rp = 16125 and hpp_per_pcs = 3225
  from public.irt_batches where id = (select id from _id where k = 'ib');
insert into _hasil (uji, lulus) select 'nilai stok produk = total biaya batch',
  (select value_rp from public.irt_stock_balances where item_id = (select id from _id where k = 'mie')) = 16125;
insert into _hasil (uji, lulus) select 'HPP standar resep = 0,1 kg × Rp10.000 ÷ 2,5 + gas Rp1.000 ÷ 2,5 + Rp1.625 + Rp800 = Rp3.225; aktual sama',
  std_hpp_per_pcs = 3225 and pcs = 5 and total_rp = 16125 and labor_rp = 8125 and packaging_rp = 4000 and gas_rp = 2000
  from public.irt_hpp_summary(date '2000-01-01', (now() at time zone 'Asia/Jakarta')::date) where product_id = (select id from _id where k = 'mie');
do $$ begin
  perform public.save_hpp_settings('{"biaya_tetap_bulanan": 0}'::jsonb);
  insert into _hasil (uji, lulus) values ('pengurus IRT tidak boleh mengubah parameter HPP kelompok', false);
exception when others then insert into _hasil (uji, lulus) values ('pengurus IRT tidak boleh mengubah parameter HPP kelompok', sqlstate = '42501');
end $$;
insert into _hasil (uji, lulus) select 'pengurus IRT tidak melihat parameter & log HPP kelompok (RLS)',
  (select count(*) from public.hpp_settings) = 0 and (select count(*) from public.hpp_recalc_log) = 0;

reset role;
insert into _hasil (uji, lulus) select 'hitung ulang IRT stabil (tanpa perubahan setelah konfirmasi)',
  ((public._irt_recalc('uji stabil IRT')) ->> 'movements_changed')::int = 0;
insert into _hasil (uji, lulus) select 'tidak ada tabel kas (sistem tanpa kas)',
  to_regclass('public.cash_accounts') is null and to_regclass('public.cash_transactions') is null and to_regclass('public.payments') is null
  and to_regclass('public.expenses') is null and to_regclass('public.other_incomes') is null and to_regclass('arsip_kas.payments') is not null;

-- ---------- ringkasan; transaksi SENGAJA dibatalkan ----------
do $$
declare v_ok int; v_fail int; v_list text;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus),
         string_agg(case when lulus then 'lulus  ' else 'GAGAL  ' end || uji, E'\n' order by no)
    into v_ok, v_fail, v_list from _hasil;
  raise exception E'HASIL UJI: % lulus, % gagal (transaksi sengaja dibatalkan; tidak ada data uji tersimpan)\n%', v_ok, v_fail, v_list;
end $$;
rollback;
