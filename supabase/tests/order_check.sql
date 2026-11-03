-- =====================================================================
-- Uji pesanan M6 (T6.8, uji wajib SRS §11) — Supabase → SQL Editor sebagai postgres, atau scripts/db-query.ps1.
-- SELALU dibatalkan. Memakai produk uji sementara (kode UJIX, stok 5 kg) agar stok produk nyata tidak tersentuh.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

-- ---------- data uji (sebagai postgres) ----------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m6.admin@contoh.test',  '{"full_name":"Uji Admin M6"}',    now(), now()),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m6.ketua@contoh.test',  '{"full_name":"Uji Ketua M6"}',    now(), now()),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m6.op@contoh.test',     '{"full_name":"Uji Operator M6"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m6.teknis@contoh.test', '{"full_name":"Uji Teknis M6"}',   now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000f1', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000f2', 'ketua'),
  ('00000000-0000-4000-8000-0000000000f3', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000f4', 'admin_teknis');
insert into public.user_permissions (user_id, permission) values ('00000000-0000-4000-8000-0000000000f3', 'production.confirm');

insert into public.products (code, name, category, default_price_per_kg) values ('UJIX', 'Produk uji M6', 'olahan', 10000), ('UJIY', 'Produk uji tanpa harga', 'olahan', null);
insert into public.packagings (name) values ('Pak uji M6');
insert into public.product_packagings (product_id, packaging_id, content_kg, default_price)
  select (select id from public.products where code = 'UJIX'), (select id from public.packagings where name = 'Pak uji M6'), 0.5, 5500;
insert into public.product_packagings (product_id, packaging_id, content_kg, default_price)
  select (select id from public.products where code = 'UJIY'), (select id from public.packagings where name = 'Pak uji M6'), 1, 9000;
insert into public.customers (name, type) values ('Uji Pelanggan M6', 'usaha'), ('Uji Pelanggan Arsip M6', 'perorangan');
update public.customers set archived_at = now() where name = 'Uji Pelanggan Arsip M6';

create temp table _ctx as
  select (select id from public.products where code = 'UJIX') as px,
         (select id from public.products where code = 'UJIY') as py,
         (select pp.id from public.product_packagings pp join public.products p on p.id = pp.product_id where p.code = 'UJIX') as pak_x,
         (select pp.id from public.product_packagings pp join public.products p on p.id = pp.product_id where p.code = 'UJIY') as pak_y,
         (select id from public.customers where name = 'Uji Pelanggan M6') as cust,
         (select id from public.customers where name = 'Uji Pelanggan Arsip M6') as cust_arsip,
         (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;

-- stok awal produk uji: 5 kg bernilai Rp30.000 (Rp6.000/kg)
select public._post_movement((select px from _ctx), 'in', 5, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 30000);

-- =============== admin kelompok ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);

-- o1: 2 pak @0,5 kg (Rp5.500) + 3 kg curah @Rp10.000 diskon Rp1.000, ongkir Rp5.000 → 4 kg, total Rp45.000
insert into _id select 'o1', public.save_order_draft(null, (select hari_ini from _ctx), (select cust from _ctx), 'whatsapp', 'uji M6', 5000,
  jsonb_build_array(
    jsonb_build_object('product_id', (select px from _ctx), 'product_packaging_id', (select pak_x from _ctx), 'qty', '2', 'discount_rp', 0),
    jsonb_build_object('product_id', (select px from _ctx), 'product_packaging_id', null, 'qty', '3', 'discount_rp', 1000)));
insert into _hasil (uji, lulus) select 'konversi: 2 pak @0,5 kg = 1 kg; total kg item 4 kg',
  (select qty_kg from public.order_items where order_id = (select id from _id where k = 'o1') and product_packaging_id is not null) = 1
  and (select sum(qty_kg) from public.order_items where order_id = (select id from _id where k = 'o1')) = 4;
insert into _hasil (uji, lulus) select 'harga snapshot dari katalog (pak Rp5.500, kg Rp10.000) & label satuan',
  (select price_snapshot = 5500 and unit_label = 'Pak uji M6 0,5 kg' from public.order_items where order_id = (select id from _id where k = 'o1') and product_packaging_id is not null)
  and (select price_snapshot = 10000 and unit_label = 'kg' from public.order_items where order_id = (select id from _id where k = 'o1') and product_packaging_id is null);
insert into _hasil (uji, lulus) select 'total dihitung server: subtotal 41.000 − diskon 1.000 + ongkir 5.000 = Rp45.000',
  subtotal_rp = 41000 and discount_rp = 1000 and shipping_rp = 5000 and total_rp = 45000
  from public.orders where id = (select id from _id where k = 'o1');
insert into _hasil (uji, lulus) select 'draft: tanpa nomor, tanpa reservasi, status bayar unpaid',
  (select doc_number is null and status = 'draft' and payment_status = 'unpaid' and customer_name = 'Uji Pelanggan M6' from public.orders where id = (select id from _id where k = 'o1'))
  and not exists (select 1 from public.stock_reservations where order_id = (select id from _id where k = 'o1'));

-- o2: 4 kg curah
insert into _id select 'o2', public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0,
  jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '4')));

-- validasi
do $$ begin
  perform public.save_order_draft(null, null, (select cust_arsip from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '1')));
  insert into _hasil (uji, lulus) values ('pelanggan arsip ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('pelanggan arsip ditolak', sqlerrm like '%pelanggan%');
end $$;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'tidak_ada', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '1')));
  insert into _hasil (uji, lulus) values ('saluran tak dikenal ditolak (saluran wajib)', false);
exception when others then insert into _hasil (uji, lulus) values ('saluran tak dikenal ditolak (saluran wajib)', sqlerrm like '%saluran%');
end $$;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '0')));
  insert into _hasil (uji, lulus) values ('jumlah 0 ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('jumlah 0 ditolak', true);
end $$;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '-1')));
  insert into _hasil (uji, lulus) values ('jumlah negatif ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('jumlah negatif ditolak', true);
end $$;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0,
    jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'product_packaging_id', (select pak_y from _ctx), 'qty', '1')));
  insert into _hasil (uji, lulus) values ('kemasan milik produk lain ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('kemasan milik produk lain ditolak', sqlerrm like '%kemasan%');
end $$;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select py from _ctx), 'qty', '1')));
  insert into _hasil (uji, lulus) values ('harga katalog belum ditetapkan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('harga katalog belum ditetapkan ditolak', sqlerrm like '%belum ditetapkan%');
end $$;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0,
    jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '1', 'discount_rp', 10001)));
  insert into _hasil (uji, lulus) values ('diskon melebihi nilai baris ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('diskon melebihi nilai baris ditolak', sqlerrm like '%diskon%');
end $$;
do $$ begin
  perform public.save_order_draft(null, (select hari_ini + 1 from _ctx), (select cust from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '1')));
  insert into _hasil (uji, lulus) values ('tanggal besok ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('tanggal besok ditolak', true);
end $$;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, -1, '[]'::jsonb);
  insert into _hasil (uji, lulus) values ('ongkir negatif ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('ongkir negatif ditolak', true);
end $$;
do $$ begin
  insert into public.orders (customer_id, customer_name, channel, total_rp) values ((select cust from _ctx), 'x', 'langsung', 1);
  insert into _hasil (uji, lulus) values ('klien tidak bisa menulis tabel pesanan langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa menulis tabel pesanan langsung', true);
end $$;
do $$ begin
  update public.order_items set price_snapshot = 1 where order_id = (select id from _id where k = 'o1');
  insert into _hasil (uji, lulus) select 'klien tidak bisa mengubah harga item langsung',
    (select price_snapshot from public.order_items where order_id = (select id from _id where k = 'o1') and product_packaging_id is not null) = 5500;
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa mengubah harga item langsung', true);
end $$;
insert into _id select 'kosong', public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, '[]'::jsonb);
do $$ begin
  perform public.confirm_order((select id from _id where k = 'kosong'));
  insert into _hasil (uji, lulus) values ('konfirmasi pesanan tanpa item ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('konfirmasi pesanan tanpa item ditolak', sqlerrm like '%minimal satu item%');
end $$;

-- ---------- konfirmasi & reservasi (FR-SAL-04) ----------
insert into _k select 'c1', public.confirm_order((select id from _id where k = 'o1'));
insert into _hasil (uji, lulus) select 'konfirmasi: nomor INV-YYYYMM-NNNN',
  (select r ->> 'doc_number' from _k where k = 'c1') ~ ('^INV-' || to_char((select hari_ini from _ctx), 'YYYYMM') || '-[0-9]{4,}$');
insert into _hasil (uji, lulus) select 'konfirmasi: reservasi 4 kg aktif, fisik tetap 5 kg, tersedia 1 kg',
  (select qty_kg = 4 and status = 'active' from public.stock_reservations where order_id = (select id from _id where k = 'o1'))
  and (select on_hand_kg = 5 and reserved_kg = 4 and available_kg = 1 from public.v_stock_balance where product_id = (select px from _ctx));
insert into _hasil (uji, lulus) select 'konfirmasi: dua baris produk sama digabung jadi satu reservasi',
  (select count(*) from public.stock_reservations where order_id = (select id from _id where k = 'o1')) = 1;

do $$ begin
  perform public.confirm_order((select id from _id where k = 'o2'));
  insert into _hasil (uji, lulus) values ('UJI WAJIB: stok 5 kg, pesanan kedua @4 kg ditolak (hanya satu terkonfirmasi)', false);
exception when others then insert into _hasil (uji, lulus) values ('UJI WAJIB: stok 5 kg, pesanan kedua @4 kg ditolak (hanya satu terkonfirmasi)', sqlerrm like '%tidak cukup%');
end $$;
insert into _hasil (uji, lulus) select 'pesanan yang ditolak tetap draft tanpa nomor & reservasi',
  (select status = 'draft' and doc_number is null from public.orders where id = (select id from _id where k = 'o2'))
  and not exists (select 1 from public.stock_reservations where order_id = (select id from _id where k = 'o2'));

insert into _k select 'c1b', public.confirm_order((select id from _id where k = 'o1'));
insert into _hasil (uji, lulus) select 'konfirmasi dua kali → nomor sama, tetap satu reservasi 4 kg',
  (select (r ->> 'already')::boolean from _k where k = 'c1b')
  and (select r ->> 'doc_number' from _k where k = 'c1b') = (select r ->> 'doc_number' from _k where k = 'c1')
  and (select reserved_kg from public.v_stock_balance where product_id = (select px from _ctx)) = 4;

do $$ begin
  perform public.save_order_draft((select id from _id where k = 'o1'), null, (select cust from _ctx), 'langsung', null, 0,
    jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'qty', '1')));
  insert into _hasil (uji, lulus) values ('pesanan terkonfirmasi tidak bisa diedit', false);
exception when others then insert into _hasil (uji, lulus) values ('pesanan terkonfirmasi tidak bisa diedit', sqlerrm like '%terkunci%');
end $$;
do $$ begin
  perform public.delete_order_draft((select id from _id where k = 'o1'));
  insert into _hasil (uji, lulus) values ('pesanan terkonfirmasi tidak bisa dihapus', false);
exception when others then insert into _hasil (uji, lulus) values ('pesanan terkonfirmasi tidak bisa dihapus', true);
end $$;

-- ---------- harga katalog berubah (FR-SAL-02a) ----------
reset role;
update public.product_packagings set default_price = 6000 where id = (select pak_x from _ctx);
update public.products set default_price_per_kg = 12000 where id = (select px from _ctx);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'UJI WAJIB: harga katalog baru tidak mengubah pesanan lama',
  (select total_rp from public.orders where id = (select id from _id where k = 'o1')) = 45000
  and (select price_snapshot from public.order_items where order_id = (select id from _id where k = 'o1') and product_packaging_id is not null) = 5500;
insert into _id select 'o3', public.save_order_draft(null, null, (select cust from _ctx), 'marketplace', null, 0,
  jsonb_build_array(jsonb_build_object('product_id', (select px from _ctx), 'product_packaging_id', (select pak_x from _ctx), 'qty', '1')));
insert into _hasil (uji, lulus) select 'pesanan baru memakai harga katalog terbaru (Rp6.000)',
  (select total_rp from public.orders where id = (select id from _id where k = 'o3')) = 6000;
select public.delete_order_draft((select id from _id where k = 'o3'));
insert into _hasil (uji, lulus) select 'hapus draft: pesanan & item hilang, tercatat di audit',
  not exists (select 1 from public.orders where id = (select id from _id where k = 'o3'))
  and not exists (select 1 from public.order_items where order_id = (select id from _id where k = 'o3'));

-- ---------- batal (FR-SAL-06) ----------
do $$ begin
  perform public.cancel_order((select id from _id where k = 'o1'), '');
  insert into _hasil (uji, lulus) values ('batal tanpa alasan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('batal tanpa alasan ditolak', sqlerrm like '%Alasan%');
end $$;
insert into _k select 'x1', public.cancel_order((select id from _id where k = 'o1'), 'Pelanggan membatalkan');
insert into _hasil (uji, lulus) select 'UJI WAJIB: batal melepas reservasi (tersedia kembali 5 kg)',
  (select status = 'cancelled' and cancel_reason = 'Pelanggan membatalkan' from public.orders where id = (select id from _id where k = 'o1'))
  and (select status from public.stock_reservations where order_id = (select id from _id where k = 'o1')) = 'released'
  and (select on_hand_kg = 5 and available_kg = 5 from public.v_stock_balance where product_id = (select px from _ctx));
insert into _k select 'x2', public.cancel_order((select id from _id where k = 'o1'), 'Pelanggan membatalkan');
insert into _hasil (uji, lulus) select 'batal dua kali aman (already)', (select (r ->> 'already')::boolean from _k where k = 'x2');
do $$ begin
  perform public.confirm_order((select id from _id where k = 'o1'));
  insert into _hasil (uji, lulus) values ('pesanan batal tidak bisa dikonfirmasi lagi', false);
exception when others then insert into _hasil (uji, lulus) values ('pesanan batal tidak bisa dikonfirmasi lagi', true);
end $$;
do $$ begin
  perform public.cancel_order((select id from _id where k = 'o2'), 'masih draft');
  insert into _hasil (uji, lulus) values ('draft tidak dibatalkan (dihapus saja)', false);
exception when others then insert into _hasil (uji, lulus) values ('draft tidak dibatalkan (dihapus saja)', sqlerrm like '%hapus%');
end $$;

-- o2 kini bisa dikonfirmasi karena reservasi o1 dilepas
insert into _k select 'c2', public.confirm_order((select id from _id where k = 'o2'));
insert into _hasil (uji, lulus) select 'setelah reservasi dilepas, pesanan 4 kg lain bisa dikonfirmasi',
  (select status from public.orders where id = (select id from _id where k = 'o2')) = 'confirmed';

-- ---------- serah barang (FR-SAL-05) ----------
do $$ begin
  perform public.fulfill_order((select id from _id where k = 'o2'), 'Bu Sari', (select hari_ini + 1 from _ctx));
  insert into _hasil (uji, lulus) values ('tanggal serah besok ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('tanggal serah besok ditolak', true);
end $$;
insert into _k select 'f1', public.fulfill_order((select id from _id where k = 'o2'), 'Bu Sari', null);
insert into _hasil (uji, lulus) select 'serah: reservasi → sale_out 4 kg, fisik 1 kg, reservasi fulfilled',
  (select count(*) = 1 and sum(qty_kg) = 4 from public.stock_movements where source_type = 'order' and source_id = (select id from _id where k = 'o2') and movement_type = 'sale_out')
  and (select on_hand_kg = 1 and reserved_kg = 0 and available_kg = 1 from public.v_stock_balance where product_id = (select px from _ctx))
  and (select status from public.stock_reservations where order_id = (select id from _id where k = 'o2')) = 'fulfilled';
insert into _hasil (uji, lulus) select 'serah: nilai keluar = rata-rata bergerak (4 kg × Rp6.000 = Rp24.000)',
  (select value_rp from public.stock_movements where source_type = 'order' and source_id = (select id from _id where k = 'o2')) = 24000;
insert into _hasil (uji, lulus) select 'UJI WAJIB: serah tidak bergantung bayar — delivered tetap unpaid',
  (select status = 'delivered' and payment_status = 'unpaid' and recipient_name = 'Bu Sari' and delivered_on = (select hari_ini from _ctx)
     from public.orders where id = (select id from _id where k = 'o2'));
insert into _k select 'f2', public.fulfill_order((select id from _id where k = 'o2'), 'Bu Sari', null);
insert into _hasil (uji, lulus) select 'serah dua kali → tetap satu mutasi keluar',
  (select (r ->> 'already')::boolean from _k where k = 'f2')
  and (select count(*) from public.stock_movements where source_type = 'order' and source_id = (select id from _id where k = 'o2')) = 1;
do $$ begin
  perform public.cancel_order((select id from _id where k = 'o2'), 'Ingin batal setelah serah');
  insert into _hasil (uji, lulus) values ('UJI WAJIB: barang diserahkan tidak kembali ke stok lewat batal (harus retur)', false);
exception when others then insert into _hasil (uji, lulus) values ('UJI WAJIB: barang diserahkan tidak kembali ke stok lewat batal (harus retur)',
  sqlerrm like '%retur%' and (select on_hand_kg from public.stock_balances where product_id = (select px from _ctx)) = 1);
end $$;
do $$ begin
  perform public.fulfill_order((select id from _id where k = 'o1'), null, null);
  insert into _hasil (uji, lulus) values ('pesanan batal tidak bisa diserahkan', false);
exception when others then insert into _hasil (uji, lulus) values ('pesanan batal tidak bisa diserahkan', true);
end $$;
insert into _hasil (uji, lulus) select 'v_order_balance: tagihan pesanan diserahkan = total, pesanan batal = 0',
  (select outstanding_rp from public.v_order_balance where order_id = (select id from _id where k = 'o2')) = 40000
  and (select outstanding_rp from public.v_order_balance where order_id = (select id from _id where k = 'o1')) = 0;

-- =============== ketua: lihat saja ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'ketua dapat melihat pesanan & item',
  (select count(*) from public.orders where id in (select id from _id where k in ('o1', 'o2'))) = 2
  and (select count(*) from public.order_items where order_id = (select id from _id where k = 'o1')) = 2;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, '[]'::jsonb);
  insert into _hasil (uji, lulus) values ('ketua tidak bisa membuat pesanan', false);
exception when others then insert into _hasil (uji, lulus) values ('ketua tidak bisa membuat pesanan', sqlstate = '42501');
end $$;

-- =============== operator produksi: tanpa akses ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'operator tidak dapat melihat pesanan (RLS)',
  (select count(*) from public.orders) = 0 and (select count(*) from public.order_items) = 0;
do $$ begin
  perform public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, '[]'::jsonb);
  insert into _hasil (uji, lulus) values ('operator tidak bisa membuat pesanan', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak bisa membuat pesanan', sqlstate = '42501');
end $$;
do $$ begin
  perform public.fulfill_order((select id from _id where k = 'o2'), null, null);
  insert into _hasil (uji, lulus) values ('operator tidak bisa serah barang / konfirmasi pesanan', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak bisa serah barang / konfirmasi pesanan', sqlstate = '42501');
end $$;

-- =============== admin teknis: bukan pencatat transaksi ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f4","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin teknis tidak dapat melihat pesanan', (select count(*) from public.orders) = 0;
do $$ begin
  perform public.confirm_order((select id from _id where k = 'o2'));
  insert into _hasil (uji, lulus) values ('admin teknis tidak bisa mengonfirmasi pesanan', false);
exception when others then insert into _hasil (uji, lulus) values ('admin teknis tidak bisa mengonfirmasi pesanan', sqlstate = '42501');
end $$;

-- ---------- kunci DB & konsistensi (sebagai postgres) ----------
reset role;
do $$ begin
  update public.orders set total_rp = 1, subtotal_rp = 1, discount_rp = 0, shipping_rp = 0 where id = (select id from _id where k = 'o2');
  insert into _hasil (uji, lulus) values ('kunci DB: total pesanan terkonfirmasi tidak bisa diubah', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: total pesanan terkonfirmasi tidak bisa diubah', sqlerrm like '%terkunci%');
end $$;
do $$ begin
  update public.order_items set qty_kg = 1 where order_id = (select id from _id where k = 'o2');
  insert into _hasil (uji, lulus) values ('kunci DB: item pesanan terkonfirmasi tidak bisa diubah', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: item pesanan terkonfirmasi tidak bisa diubah', true);
end $$;
do $$ begin
  update public.orders set status = 'confirmed' where id = (select id from _id where k = 'o2');
  insert into _hasil (uji, lulus) values ('kunci DB: delivered tidak bisa kembali ke confirmed', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: delivered tidak bisa kembali ke confirmed', true);
end $$;
insert into _hasil (uji, lulus) select 'pesanan tidak membuat kas (kas hanya dari pembayaran terverifikasi, M7)', to_regclass('public.cash_transactions') is null;
insert into _hasil (uji, lulus) select 'audit: draft, konfirmasi, batal (dengan alasan), serah, hapus tercatat',
  exists (select 1 from public.audit_logs where action = 'order.draft_created' and entity_id = (select id from _id where k = 'o1')::text)
  and exists (select 1 from public.audit_logs where action = 'order.confirmed' and entity_id = (select id from _id where k = 'o1')::text)
  and exists (select 1 from public.audit_logs where action = 'order.cancelled' and entity_id = (select id from _id where k = 'o1')::text and reason = 'Pelanggan membatalkan')
  and exists (select 1 from public.audit_logs where action = 'order.delivered' and entity_id = (select id from _id where k = 'o2')::text)
  and exists (select 1 from public.audit_logs where action = 'order.draft_deleted' and entity_id = (select id from _id where k = 'o3')::text);
insert into _hasil (uji, lulus) select 'nilai saldo = Σ nilai mutasi (semua produk)',
  bool_and(b.value_rp = coalesce((select sum(case when m.direction = 'in' then m.value_rp else -m.value_rp end) from public.stock_movements m where m.product_id = b.product_id), 0))
  from public.stock_balances b;
insert into _hasil (uji, lulus) select 'reservasi aktif tidak pernah melebihi stok fisik (semua produk)',
  bool_and(reserved_kg <= on_hand_kg) from public.v_stock_balance;

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
