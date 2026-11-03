-- =====================================================================
-- Uji retur M6 (T6.7, FR-SAL-10, PRD Q7) — Supabase → SQL Editor sebagai postgres. SELALU dibatalkan.
-- Produk uji sementara UJIR: stok 10 kg bernilai Rp60.000 (Rp6.000/kg); pesanan 5 kg @Rp10.000 diserahkan.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.rtr.admin@contoh.test', '{"full_name":"Uji Admin Retur"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.rtr.ketua@contoh.test', '{"full_name":"Uji Ketua Retur"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.rtr.rangkap@contoh.test', '{"full_name":"Uji Ketua Rangkap Admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.rtr.op@contoh.test', '{"full_name":"Uji Operator Retur"}', now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000a2', 'ketua'),
  ('00000000-0000-4000-8000-0000000000a3', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000a3', 'ketua'),
  ('00000000-0000-4000-8000-0000000000a4', 'operator_produksi');

insert into public.products (code, name, category, default_price_per_kg) values ('UJIR', 'Produk uji retur', 'olahan', 10000);
insert into public.customers (name, type) values ('Uji Pelanggan Retur', 'usaha');
create temp table _ctx as
  select (select id from public.products where code = 'UJIR') as pr,
         (select id from public.customers where name = 'Uji Pelanggan Retur') as cust,
         (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;
select public._post_movement((select pr from _ctx), 'in', 10, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 60000);

-- =============== admin: pesanan 5 kg diserahkan, pesanan 1 kg baru dikonfirmasi ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into _id select 'o1', public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0,
  jsonb_build_array(jsonb_build_object('product_id', (select pr from _ctx), 'qty', '5')));
select public.confirm_order((select id from _id where k = 'o1'));
select public.fulfill_order((select id from _id where k = 'o1'), 'Uji', null);
insert into _id select 'i1', (select id from public.order_items where order_id = (select id from _id where k = 'o1'));
insert into _id select 'o2', public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0,
  jsonb_build_array(jsonb_build_object('product_id', (select pr from _ctx), 'qty', '1')));
select public.confirm_order((select id from _id where k = 'o2'));
insert into _id select 'i2', (select id from public.order_items where order_id = (select id from _id where k = 'o2'));
insert into _hasil (uji, lulus) select 'awal: stok fisik 5 kg setelah serah 5 kg (nilai keluar Rp30.000)',
  (select on_hand_kg from public.stock_balances where product_id = (select pr from _ctx)) = 5
  and (select value_rp from public.stock_movements where source_id = (select id from _id where k = 'o1') and movement_type = 'sale_out') = 30000;

-- ---------- catat retur (draft) ----------
insert into _id select 'r1', public.create_return((select id from _id where k = 'o1'), null, 'Kemasan sobek saat diantar',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '2')));
insert into _hasil (uji, lulus) select 'UJI WAJIB: draft retur tidak mengubah stok, tanpa nomor',
  (select status = 'draft' and doc_number is null and total_kg = 2 from public.order_returns where id = (select id from _id where k = 'r1'))
  and not exists (select 1 from public.stock_movements where source_type = 'return' and source_id = (select id from _id where k = 'r1'))
  and (select on_hand_kg from public.stock_balances where product_id = (select pr from _ctx)) = 5;
insert into _hasil (uji, lulus) select 'nilai jual retur (pengurang omzet) = 2/5 × Rp50.000 = Rp20.000',
  (select sales_value_rp from public.order_returns where id = (select id from _id where k = 'r1')) = 20000;

do $$ begin
  perform public.create_return((select id from _id where k = 'o1'), null, 'Terlalu banyak',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '5.001')));
  insert into _hasil (uji, lulus) values ('retur melebihi kg diserahkan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('retur melebihi kg diserahkan ditolak', sqlerrm like '%melebihi%');
end $$;
do $$ begin
  perform public.create_return((select id from _id where k = 'o1'), null, 'Nol kilogram',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '0')));
  insert into _hasil (uji, lulus) values ('retur 0 kg ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('retur 0 kg ditolak', true);
end $$;
do $$ begin
  perform public.create_return((select id from _id where k = 'o1'), null, 'abc',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '1')));
  insert into _hasil (uji, lulus) values ('alasan retur wajib (min. 5 karakter)', false);
exception when others then insert into _hasil (uji, lulus) values ('alasan retur wajib (min. 5 karakter)', sqlerrm like '%Alasan%');
end $$;
do $$ begin
  perform public.create_return((select id from _id where k = 'o2'), null, 'Belum diserahkan',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i2'), 'qty_kg', '1')));
  insert into _hasil (uji, lulus) values ('retur pesanan yang belum diserahkan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('retur pesanan yang belum diserahkan ditolak', sqlerrm like '%diserahkan%');
end $$;
do $$ begin
  perform public.create_return((select id from _id where k = 'o1'), null, 'Item pesanan lain',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i2'), 'qty_kg', '1')));
  insert into _hasil (uji, lulus) values ('item dari pesanan lain ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('item dari pesanan lain ditolak', sqlerrm like '%bukan bagian%');
end $$;
do $$ begin
  perform public.create_return((select id from _id where k = 'o1'), (select hari_ini + 1 from _ctx), 'Tanggal besok',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '1')));
  insert into _hasil (uji, lulus) values ('tanggal retur besok ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('tanggal retur besok ditolak', true);
end $$;
do $$ begin
  perform public.verify_return((select id from _id where k = 'r1'));
  insert into _hasil (uji, lulus) values ('admin kelompok tidak bisa memverifikasi retur', false);
exception when others then insert into _hasil (uji, lulus) values ('admin kelompok tidak bisa memverifikasi retur', sqlstate = '42501');
end $$;
do $$ begin
  insert into public.order_returns (order_id, reason, created_by_name) values ((select id from _id where k = 'o1'), 'langsung tulis', 'x');
  insert into _hasil (uji, lulus) values ('klien tidak bisa menulis tabel retur langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa menulis tabel retur langsung', true);
end $$;

-- =============== operator: tanpa akses ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'operator tidak dapat melihat retur (RLS)', (select count(*) from public.order_returns) = 0;
do $$ begin
  perform public.verify_return((select id from _id where k = 'r1'));
  insert into _hasil (uji, lulus) values ('operator tidak bisa memverifikasi retur', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak bisa memverifikasi retur', sqlstate = '42501');
end $$;

-- =============== ketua: verifikasi fisik ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'ketua dapat melihat retur & rinciannya',
  (select count(*) from public.order_return_items where return_id = (select id from _id where k = 'r1')) = 1;
do $$ begin
  perform public.create_return((select id from _id where k = 'o1'), null, 'Ketua mencatat',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '1')));
  insert into _hasil (uji, lulus) values ('ketua tidak mencatat retur (hanya verifikasi)', false);
exception when others then insert into _hasil (uji, lulus) values ('ketua tidak mencatat retur (hanya verifikasi)', sqlstate = '42501');
end $$;
insert into _k select 'v1', public.verify_return((select id from _id where k = 'r1'));
insert into _hasil (uji, lulus) select 'verifikasi: nomor RTR-YYYYMM-NNNN, pemverifikasi tercatat',
  (select r ->> 'doc_number' from _k where k = 'v1') ~ ('^RTR-' || to_char((select hari_ini from _ctx), 'YYYYMM') || '-[0-9]{4,}$')
  and (select status = 'verified' and verified_by = '00000000-0000-4000-8000-0000000000a2' and verified_by_name = 'Uji Ketua Retur' and verified_at is not null
         from public.order_returns where id = (select id from _id where k = 'r1'));
insert into _hasil (uji, lulus) select 'UJI WAJIB: retur terverifikasi → return_in 2 kg, stok fisik 7 kg',
  (select count(*) = 1 and sum(qty_kg) = 2 from public.stock_movements where source_type = 'return' and source_id = (select id from _id where k = 'r1') and movement_type = 'return_in')
  and (select on_hand_kg from public.stock_balances where product_id = (select pr from _ctx)) = 7;
insert into _hasil (uji, lulus) select 'nilai persediaan masuk = nilai saat keluar (2 kg × Rp6.000 = Rp12.000)',
  (select stock_value_rp from public.order_returns where id = (select id from _id where k = 'r1')) = 12000
  and (select value_rp from public.stock_movements where source_type = 'return' and source_id = (select id from _id where k = 'r1')) = 12000;
insert into _k select 'v1b', public.verify_return((select id from _id where k = 'r1'));
insert into _hasil (uji, lulus) select 'verifikasi dua kali → tetap satu mutasi masuk',
  (select (r ->> 'already')::boolean from _k where k = 'v1b')
  and (select count(*) from public.stock_movements where source_type = 'return' and source_id = (select id from _id where k = 'r1')) = 1
  and (select on_hand_kg from public.stock_balances where product_id = (select pr from _ctx)) = 7;

-- ---------- dua draft bersaing atas sisa 3 kg ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
insert into _id select 'r2', public.create_return((select id from _id where k = 'o1'), null, 'Sisa diretur pelanggan',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '3')));
do $$ begin
  perform public.verify_return((select id from _id where k = 'r2'));
  insert into _hasil (uji, lulus) values ('pemisahan tugas: akun rangkap admin+ketua tidak memverifikasi retur catatannya sendiri', false);
exception when others then insert into _hasil (uji, lulus) values ('pemisahan tugas: akun rangkap admin+ketua tidak memverifikasi retur catatannya sendiri', sqlerrm like '%sendiri%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into _id select 'r3', public.create_return((select id from _id where k = 'o1'), null, 'Dicatat dua kali oleh petugas lain',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '3')));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select public.verify_return((select id from _id where k = 'r2'));
do $$ begin
  perform public.verify_return((select id from _id where k = 'r3'));
  insert into _hasil (uji, lulus) values ('draft kedua atas sisa yang sama ditolak saat verifikasi', false);
exception when others then insert into _hasil (uji, lulus) values ('draft kedua atas sisa yang sama ditolak saat verifikasi', sqlerrm like '%melebihi%');
end $$;
insert into _hasil (uji, lulus) select 'retur total = kg diserahkan (5 kg): stok kembali 10 kg, nilai kembali Rp30.000',
  (select on_hand_kg from public.stock_balances where product_id = (select pr from _ctx)) = 10
  and (select sum(value_rp) from public.stock_movements m join public.order_returns r on r.id = m.source_id
        where m.source_type = 'return' and r.order_id = (select id from _id where k = 'o1')) = 30000;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  perform public.create_return((select id from _id where k = 'o1'), null, 'Sudah habis diretur',
    jsonb_build_array(jsonb_build_object('order_item_id', (select id from _id where k = 'i1'), 'qty_kg', '0.001')));
  insert into _hasil (uji, lulus) values ('tidak ada sisa → retur baru ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('tidak ada sisa → retur baru ditolak', sqlerrm like '%melebihi%');
end $$;
do $$ begin
  perform public.delete_return_draft((select id from _id where k = 'r1'));
  insert into _hasil (uji, lulus) values ('retur terverifikasi tidak bisa dihapus', false);
exception when others then insert into _hasil (uji, lulus) values ('retur terverifikasi tidak bisa dihapus', true);
end $$;
select public.delete_return_draft((select id from _id where k = 'r3'));
insert into _hasil (uji, lulus) select 'draft retur bisa dihapus admin', not exists (select 1 from public.order_returns where id = (select id from _id where k = 'r3'));

-- ---------- kunci DB & konsistensi ----------
reset role;
do $$ begin
  update public.order_returns set total_kg = 1 where id = (select id from _id where k = 'r1');
  insert into _hasil (uji, lulus) values ('kunci DB: retur terverifikasi tidak bisa diubah', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: retur terverifikasi tidak bisa diubah', sqlerrm like '%terkunci%');
end $$;
do $$ begin
  update public.order_return_items set qty_kg = 1 where return_id = (select id from _id where k = 'r1');
  insert into _hasil (uji, lulus) values ('kunci DB: rincian retur terverifikasi tidak bisa diubah', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: rincian retur terverifikasi tidak bisa diubah', true);
end $$;
insert into _hasil (uji, lulus) select 'pesanan tetap delivered; retur tidak mengubah status barang atau bayar',
  (select status = 'delivered' and payment_status = 'unpaid' from public.orders where id = (select id from _id where k = 'o1'));
insert into _hasil (uji, lulus) select 'audit: retur dicatat (dengan alasan), diverifikasi, dihapus',
  exists (select 1 from public.audit_logs where action = 'return.draft_created' and entity_id = (select id from _id where k = 'r1')::text and reason = 'Kemasan sobek saat diantar')
  and exists (select 1 from public.audit_logs where action = 'return.verified' and entity_id = (select id from _id where k = 'r1')::text)
  and exists (select 1 from public.audit_logs where action = 'return.draft_deleted' and entity_id = (select id from _id where k = 'r3')::text);
insert into _hasil (uji, lulus) select 'nilai saldo = Σ nilai mutasi (semua produk)',
  bool_and(b.value_rp = coalesce((select sum(case when m.direction = 'in' then m.value_rp else -m.value_rp end) from public.stock_movements m where m.product_id = b.product_id), 0))
  from public.stock_balances b;

do $$
declare v_ok int; v_fail int; v_list text;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus),
         string_agg(case when lulus then 'lulus  ' else 'GAGAL  ' end || uji, E'\n' order by no)
    into v_ok, v_fail, v_list from _hasil;
  raise exception E'HASIL UJI: % lulus, % gagal (transaksi sengaja dibatalkan; tidak ada data uji tersimpan)\n%', v_ok, v_fail, v_list;
end $$;
rollback;
