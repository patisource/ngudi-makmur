-- =====================================================================
-- Uji modul IRT (M10, PRD §4.10) — sebagai postgres. SELALU dibatalkan.
-- Produk kelompok uji UJIT (stok 20 kg @Rp6.000) dihubungkan ke bahan "Tepung uji" IRT; pelanggan uji = IRT.
-- Alur: pesanan IRT diserahkan → tepung otomatis masuk IRT → beli bahan lain → produksi (HPP per pcs) → jual per
-- pcs/pack (tanpa kas) → batal → koreksi → retur kelompok → laporan; plus isolasi hak akses dua arah.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.irt.admin@contoh.test', '{"full_name":"Uji Admin IRT"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.irt.ketua@contoh.test', '{"full_name":"Uji Ketua IRT"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.irt.pengurus@contoh.test', '{"full_name":"Uji Pengurus IRT"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.irt.op@contoh.test', '{"full_name":"Uji Operator IRT"}', now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000b1', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000b2', 'ketua'),
  ('00000000-0000-4000-8000-0000000000b3', 'pengurus_irt'),
  ('00000000-0000-4000-8000-0000000000b4', 'operator_produksi');

insert into public.products (code, name, category, default_price_per_kg) values ('UJIT', 'Tepung uji IRT', 'olahan', 10000), ('UJIZ', 'Produk uji lain', 'olahan', 10000);
insert into public.customers (name, type) values ('Uji Mitra IRT', 'usaha'), ('Uji Pelanggan Biasa', 'perorangan');
create temp table _ctx as
  select (select id from public.products where code = 'UJIT') as pt,
         (select id from public.products where code = 'UJIZ') as pz,
         (select id from public.customers where name = 'Uji Mitra IRT') as cust_irt,
         (select id from public.customers where name = 'Uji Pelanggan Biasa') as cust_lain,
         (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;
select public._post_movement((select pt from _ctx), 'in', 20, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 120000);
select public._post_movement((select pz from _ctx), 'in', 5, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 30000);

-- =============== admin kelompok: hubungkan pelanggan IRT ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select public.irt_set_customer((select cust_irt from _ctx));
insert into _hasil (uji, lulus) select 'admin menghubungkan pelanggan IRT', (select customer_id from public.irt_settings) = (select cust_irt from _ctx);
insert into _hasil (uji, lulus) select 'admin kelompok TIDAK melihat data IRT (bahan/produk)', (select count(*) from public.irt_items) = 0;
do $$ begin
  perform public.irt_receive(null, null, null, '[]'::jsonb);
  insert into _hasil (uji, lulus) values ('admin kelompok tidak bisa mencatat bahan IRT', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('admin kelompok tidak bisa mencatat bahan IRT', true);
end $$;

-- =============== pengurus IRT: master ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
insert into _id select 'tepung', public.irt_save_item(null, 'bahan', 'Tepung uji', 'liter', null, null, null, 1, (select pt from _ctx));
insert into _id select 'gula',   public.irt_save_item(null, 'bahan', 'Gula uji', 'kg', null, null, null, 0, null);
insert into _id select 'telur',  public.irt_save_item(null, 'bahan', 'Telur uji', 'butir', null, null, null, 0, null);
insert into _id select 'kue',    public.irt_save_item(null, 'produk', 'Kue uji', 'kg', 10, 1500, 14000, 5, null);
insert into _id select 'stik',   public.irt_save_item(null, 'produk', 'Stik uji', 'pcs', null, 2000, null, 0, null);
insert into _hasil (uji, lulus) select 'bahan terhubung produk kelompok selalu kg; produk selalu pcs',
  (select unit from public.irt_items where id = (select id from _id where k = 'tepung')) = 'kg'
  and (select unit from public.irt_items where id = (select id from _id where k = 'kue')) = 'pcs'
  and (select pack_size from public.irt_items where id = (select id from _id where k = 'kue')) = 10;
do $$ begin
  perform public.irt_save_item(null, 'bahan', 'Tepung uji', 'kg', null, null, null, 0, null);
  insert into _hasil (uji, lulus) values ('nama bahan ganda ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('nama bahan ganda ditolak', sqlerrm like '%sudah dipakai%');
end $$;
do $$ begin
  insert into public.irt_items (kind, name, unit) values ('bahan', 'Langsung', 'kg');
  insert into _hasil (uji, lulus) values ('klien tidak bisa menulis tabel IRT langsung', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('klien tidak bisa menulis tabel IRT langsung', true);
end $$;
insert into _hasil (uji, lulus) select 'pengurus IRT melihat stok kelompok HANYA produk yang terhubung (baca saja)',
  (select count(*) from public.v_stock_balance where product_id = (select pt from _ctx)) = 1
  and (select count(*) from public.v_stock_balance where product_id = (select pz from _ctx)) = 0
  and (select on_hand_kg from public.v_stock_balance where product_id = (select pt from _ctx)) = 20;
insert into _hasil (uji, lulus) select 'pengurus IRT tidak melihat pesanan, pelanggan, anggota, kas, audit',
  (select count(*) from public.orders) = 0 and (select count(*) from public.customers) = 0 and (select count(*) from public.members) = 0
  and (select count(*) from public.cash_transactions) = 0 and (select count(*) from public.audit_logs) = 0;

-- =============== admin: pesanan IRT diserahkan → tepung masuk IRT otomatis ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
insert into _id select 'o_irt', public.save_order_draft(null, null, (select cust_irt from _ctx), 'langsung', null, 0,
  jsonb_build_array(jsonb_build_object('product_id', (select pt from _ctx), 'qty', '5')));
select public.confirm_order((select id from _id where k = 'o_irt'));
insert into _hasil (uji, lulus) select 'pesanan IRT baru dikonfirmasi: belum ada bahan masuk IRT',
  not exists (select 1 from public.irt_receipts where order_id = (select id from _id where k = 'o_irt'));
select public.fulfill_order((select id from _id where k = 'o_irt'), 'Pengurus IRT', null);
insert into _id select 'o_lain', public.save_order_draft(null, null, (select cust_lain from _ctx), 'langsung', null, 0,
  jsonb_build_array(jsonb_build_object('product_id', (select pt from _ctx), 'qty', '1')));
select public.confirm_order((select id from _id where k = 'o_lain'));
select public.fulfill_order((select id from _id where k = 'o_lain'), 'Pembeli', null);

reset role;
insert into _hasil (uji, lulus) select 'UJI WAJIB: serah pesanan IRT → IBM otomatis 5 kg senilai Rp50.000 (harga beli)',
  (select source = 'kelompok' and doc_number like 'IBM-%' and total_value_rp = 50000 from public.irt_receipts where order_id = (select id from _id where k = 'o_irt'))
  and (select on_hand = 5 and value_rp = 50000 from public.irt_stock_balances where item_id = (select id from _id where k = 'tepung'));
insert into _hasil (uji, lulus) select 'pesanan pelanggan lain tidak masuk IRT',
  not exists (select 1 from public.irt_receipts where order_id = (select id from _id where k = 'o_lain'));
insert into _hasil (uji, lulus) select 'stok kelompok tetap benar (20 − 5 − 1 = 14 kg)',
  (select on_hand_kg from public.stock_balances where product_id = (select pt from _ctx)) = 14;

-- =============== pengurus IRT: beli bahan lain, produksi ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
insert into _k select 'ibm', public.irt_receive(null, 'Toko Makmur', null, jsonb_build_array(
  jsonb_build_object('item_id', (select id from _id where k = 'gula'), 'qty', 2, 'value_rp', 30000),
  jsonb_build_object('item_id', (select id from _id where k = 'telur'), 'qty', 10, 'value_rp', 20000)));
insert into _hasil (uji, lulus) select 'bahan masuk manual: IBM, total Rp50.000, stok gula 2 kg & telur 10 butir',
  (select r ->> 'doc_number' like 'IBM-%' and (r ->> 'total_value_rp')::bigint = 50000 from _k where k = 'ibm')
  and (select total_value_rp from public.irt_receipts where id = (select (r ->> 'id')::uuid from _k where k = 'ibm')) = 50000
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'gula')) = 2
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'telur')) = 10;
do $$ begin
  perform public.irt_receive(null, null, null, jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'qty', 1, 'value_rp', 1)));
  insert into _hasil (uji, lulus) values ('produk jadi tidak bisa dicatat sebagai bahan masuk', false);
exception when others then insert into _hasil (uji, lulus) values ('produk jadi tidak bisa dicatat sebagai bahan masuk', true);
end $$;
do $$ begin
  perform public.irt_receive(null, null, null, jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'gula'), 'qty', 1)));
  insert into _hasil (uji, lulus) values ('harga beli wajib diisi', false);
exception when others then insert into _hasil (uji, lulus) values ('harga beli wajib diisi', sqlerrm like '%Harga beli%');
end $$;

insert into _id select 'b1', public.irt_save_batch_draft(null, null, 'uji',
  jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'tepung'), 'qty', 2),
                    jsonb_build_object('item_id', (select id from _id where k = 'gula'), 'qty', 1),
                    jsonb_build_object('item_id', (select id from _id where k = 'telur'), 'qty', 5)),
  jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'qty', 30),
                    jsonb_build_object('item_id', (select id from _id where k = 'stik'), 'qty', 10)));
insert into _hasil (uji, lulus) select 'draft batch tidak mengubah stok, tanpa nomor',
  (select status = 'draft' and doc_number is null from public.irt_batches where id = (select id from _id where k = 'b1'))
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'tepung')) = 5
  and not exists (select 1 from public.irt_movements where source_id = (select id from _id where k = 'b1'));
do $$ begin
  perform public.irt_save_batch_draft(null, null, null,
    jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'gula'), 'qty', 1)),
    jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'qty', 2.5)));
  insert into _hasil (uji, lulus) values ('hasil produksi pecahan pcs ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('hasil produksi pecahan pcs ditolak', sqlerrm like '%bulat%');
end $$;

insert into _k select 'c1', public.irt_confirm_batch((select id from _id where k = 'b1'));
insert into _hasil (uji, lulus) select 'UJI WAJIB: HPP = (Rp20.000 tepung + Rp15.000 gula + Rp10.000 telur) ÷ 40 pcs = Rp1.125/pcs',
  (select status = 'confirmed' and doc_number like 'IPR-%' and input_value_rp = 45000 and output_pcs = 40 and hpp_per_pcs = 1125
     from public.irt_batches where id = (select id from _id where k = 'b1'));
insert into _hasil (uji, lulus) select 'nilai hasil dibagi per pcs: kue 30 pcs Rp33.750, stik 10 pcs Rp11.250; bahan berkurang',
  (select on_hand = 30 and value_rp = 33750 from public.irt_stock_balances where item_id = (select id from _id where k = 'kue'))
  and (select on_hand = 10 and value_rp = 11250 from public.irt_stock_balances where item_id = (select id from _id where k = 'stik'))
  and (select on_hand = 3 and value_rp = 30000 from public.irt_stock_balances where item_id = (select id from _id where k = 'tepung'))
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'telur')) = 5;
insert into _k select 'c1b', public.irt_confirm_batch((select id from _id where k = 'b1'));
insert into _hasil (uji, lulus) select 'konfirmasi batch dua kali tidak menggandakan stok',
  (select (r ->> 'already')::boolean from _k where k = 'c1b')
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'kue')) = 30;
do $$ begin
  perform public.irt_save_batch_draft((select id from _id where k = 'b1'), null, null,
    jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'gula'), 'qty', 1)),
    jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'qty', 1)));
  insert into _hasil (uji, lulus) values ('batch terkonfirmasi terkunci', false);
exception when others then insert into _hasil (uji, lulus) values ('batch terkonfirmasi terkunci', sqlerrm like '%sudah dikonfirmasi%');
end $$;
insert into _id select 'b2', public.irt_save_batch_draft(null, null, null,
  jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'tepung'), 'qty', 1),
                    jsonb_build_object('item_id', (select id from _id where k = 'gula'), 'qty', 50)),
  jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'qty', 5)));
do $$ begin
  perform public.irt_confirm_batch((select id from _id where k = 'b2'));
  insert into _hasil (uji, lulus) values ('bahan kurang: batch ditolak utuh (tidak ada posting sebagian)', false);
exception when others then
  insert into _hasil (uji, lulus) select 'bahan kurang: batch ditolak utuh (tidak ada posting sebagian)',
    sqlerrm like '%tidak cukup%'
    and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'tepung')) = 3
    and (select status from public.irt_batches where id = (select id from _id where k = 'b2')) = 'draft';
end $$;
select public.irt_delete_batch_draft((select id from _id where k = 'b2'));

-- =============== penjualan per pcs & pack (tanpa kas) ===============
insert into _k select 's1', public.irt_create_sale(null, 'Warung Bu Sri', null, jsonb_build_array(
  jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'unit', 'pack', 'qty', 2),
  jsonb_build_object('item_id', (select id from _id where k = 'stik'), 'unit', 'pcs', 'qty', 3)));
insert into _hasil (uji, lulus) select 'UJI WAJIB: 2 pack kue (= 20 pcs @Rp14.000/pack) + 3 pcs stik (@Rp2.000) = 23 pcs, Rp34.000',
  (select (r ->> 'total_rp')::bigint = 34000 and (r ->> 'total_pcs')::int = 23 and r ->> 'doc_number' like 'IJL-%' from _k where k = 's1')
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'kue')) = 10
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'stik')) = 7;
reset role;
insert into _hasil (uji, lulus) select 'penjualan IRT TIDAK membuat kas/pembayaran',
  not exists (select 1 from public.cash_transactions where source_id = (select (r ->> 'id')::uuid from _k where k = 's1'))
  and not exists (select 1 from public.payments where order_id = (select (r ->> 'id')::uuid from _k where k = 's1'));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
do $$ begin
  perform public.irt_create_sale(null, null, null, jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'stik'), 'unit', 'pack', 'qty', 1)));
  insert into _hasil (uji, lulus) values ('jual per pack ditolak bila produk tanpa isi pack', false);
exception when others then insert into _hasil (uji, lulus) values ('jual per pack ditolak bila produk tanpa isi pack', sqlerrm like '%isi per pack%');
end $$;
do $$ begin
  perform public.irt_create_sale(null, null, null, jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'unit', 'pcs', 'qty', 1.5)));
  insert into _hasil (uji, lulus) values ('jumlah jual pecahan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('jumlah jual pecahan ditolak', true);
end $$;
do $$ begin
  perform public.irt_create_sale(null, null, null, jsonb_build_array(jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'unit', 'pack', 'qty', 2)));
  insert into _hasil (uji, lulus) values ('jual melebihi stok ditolak (2 pack = 20 pcs > 10 pcs)', false);
exception when others then insert into _hasil (uji, lulus) values ('jual melebihi stok ditolak (2 pack = 20 pcs > 10 pcs)', sqlerrm like '%tidak cukup%');
end $$;

do $$ begin
  perform public.irt_void_sale((select (r ->> 'id')::uuid from _k where k = 's1'), 'x');
  insert into _hasil (uji, lulus) values ('batal penjualan tanpa alasan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('batal penjualan tanpa alasan ditolak', true);
end $$;
select public.irt_void_sale((select (r ->> 'id')::uuid from _k where k = 's1'), 'Salah catat pembeli');
insert into _k select 'v1b', public.irt_void_sale((select (r ->> 'id')::uuid from _k where k = 's1'), 'Salah catat pembeli');
insert into _hasil (uji, lulus) select 'batal penjualan: stok kembali senilai saat keluar; batal dua kali tidak menggandakan',
  (select on_hand = 30 and value_rp = 33750 from public.irt_stock_balances where item_id = (select id from _id where k = 'kue'))
  and (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'stik')) = 10
  and (select (r ->> 'already')::boolean from _k where k = 'v1b')
  and (select status from public.irt_sales where id = (select (r ->> 'id')::uuid from _k where k = 's1')) = 'void';
insert into _k select 's2', public.irt_create_sale(null, null, null, jsonb_build_array(
  jsonb_build_object('item_id', (select id from _id where k = 'kue'), 'unit', 'pack', 'qty', 1)));

-- =============== koreksi stok (langsung, alasan wajib) ===============
do $$ begin
  perform public.irt_adjust(null, (select id from _id where k = 'kue'), 'out', 2, 'abc');
  insert into _hasil (uji, lulus) values ('koreksi tanpa alasan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('koreksi tanpa alasan ditolak', true);
end $$;
insert into _k select 'adj', public.irt_adjust(null, (select id from _id where k = 'kue'), 'out', 2, 'Kemasan rusak terkena air');
insert into _hasil (uji, lulus) select 'koreksi keluar 2 pcs langsung berlaku (20 → 18 pcs), IKS',
  (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'kue')) = 18
  and (select r ->> 'doc_number' like 'IKS-%' from _k where k = 'adj');

-- =============== retur kelompok atas pesanan IRT ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
insert into _id select 'r1', public.create_return((select id from _id where k = 'o_irt'), null, 'Tepung menggumpal',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from _id where k = 'o_irt')), 'qty_kg', '1')));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select public.verify_return((select id from _id where k = 'r1'));
reset role;
insert into _hasil (uji, lulus) select 'retur 1 kg dari pesanan IRT: tepung keluar dari stok IRT (3 → 2 kg), masuk stok kelompok',
  (select on_hand from public.irt_stock_balances where item_id = (select id from _id where k = 'tepung')) = 2
  and exists (select 1 from public.irt_movements where source_type = 'order_return' and source_id = (select id from _id where k = 'r1') and movement_type = 'retur_kelompok')
  and (select on_hand_kg from public.stock_balances where product_id = (select pt from _ctx)) = 15;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
insert into _id select 'r2', public.create_return((select id from _id where k = 'o_irt'), null, 'Retur sisa pesanan',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from _id where k = 'o_irt')), 'qty_kg', '4')));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  perform public.verify_return((select id from _id where k = 'r2'));
  insert into _hasil (uji, lulus) values ('retur 4 kg ditolak karena tepung IRT tinggal 2 kg (sudah dipakai produksi)', false);
exception when others then
  insert into _hasil (uji, lulus) select 'retur 4 kg ditolak karena tepung IRT tinggal 2 kg (sudah dipakai produksi)',
    sqlerrm like '%sudah terpakai%' and (select status from public.order_returns where id = (select id from _id where k = 'r2')) = 'draft';
end $$;

-- =============== ketua: baca saja; operator: tidak melihat ===============
insert into _hasil (uji, lulus) select 'ketua membaca data IRT (pengawasan)',
  (select count(*) from public.irt_items) = 5 and (select count(*) from public.irt_sales) = 2;
do $$ begin
  perform public.irt_adjust(null, (select id from _id where k = 'kue'), 'out', 1, 'Dicoba ketua');
  insert into _hasil (uji, lulus) values ('ketua tidak bisa mengubah data IRT', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('ketua tidak bisa mengubah data IRT', true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'operator produksi tidak melihat data IRT',
  (select count(*) from public.irt_items) = 0 and (select count(*) from public.irt_movements) = 0 and (select count(*) from public.irt_sales) = 0;

-- =============== laporan ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'laporan IRT: kue diproduksi 30 pcs, terjual 10 pcs (penjualan batal tidak dihitung), omzet Rp14.000, stok 18',
  (select produced_pcs = 30 and sold_pcs = 10 and omzet_rp = 14000 and hpp_rp = 33750 and stock_pcs = 18
     from public.irt_report((select hari_ini from _ctx), (select hari_ini from _ctx)) where item_id = (select id from _id where k = 'kue'));

-- =============== isolasi menyeluruh: pengurus IRT hanya melihat tabel yang diizinkan ===============
do $$
declare
  t record;
  n bigint;
  bocor text := '';
begin
  for t in
    select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind in ('r', 'v')
       and c.relname not like 'irt\_%' and c.relname not in ('v_irt_stock', 'products', 'stock_balances', 'stock_reservations', 'v_stock_balance', 'profiles', 'user_roles', 'user_permissions')
  loop
    begin
      execute format('select count(*) from public.%I', t.relname) into n;
    exception when insufficient_privilege then n := 0;
    end;
    if n > 0 then bocor := bocor || t.relname || ' '; end if;
  end loop;
  insert into _hasil (uji, lulus) values ('isolasi: pengurus IRT tidak membaca tabel kelompok lain' || case when bocor <> '' then ' — terbaca: ' || bocor else '' end, bocor = '');
end $$;
insert into _hasil (uji, lulus) select 'pengurus IRT hanya membaca profil & perannya sendiri',
  (select count(*) from public.profiles) = 1 and (select count(*) from public.user_roles) = 1;

-- ---------- audit ----------
reset role;
insert into _hasil (uji, lulus) select 'setiap posting IRT tercatat di audit',
  (select count(distinct action) from public.audit_logs where action in ('irt.receipt.auto', 'irt.receipt.created', 'irt.batch.confirmed', 'irt.sale.created', 'irt.sale.voided', 'irt.stock.adjusted', 'irt.customer_linked')) = 7;

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
