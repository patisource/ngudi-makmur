-- =====================================================================
-- Uji inti stok & penomoran M3 (T3.1–T3.5, T3.7 bagian berurutan) — Supabase → SQL Editor sebagai postgres.
-- Mengikuti angka seed DEMO PRD §9.1. Tanggal 2099 agar nomor dokumen nyata tidak terpakai. SELALU dibatalkan.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
grant all on _hasil to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;
create temp table _ctx as
  select (select id from public.products where code = 'PP') as pp, (select id from public.products where code = 'TP') as tp,
         '00000000-0000-4000-8000-00000000c0d1'::uuid as order1, '00000000-0000-4000-8000-00000000c0d2'::uuid as order2;
grant select on _ctx to authenticated, anon;

-- ---------- penomoran (T3.1) ----------
insert into _hasil (uji, lulus) select 'nomor: RCV-209901-0001 lalu -0002 (urut per bulan)',
  public.next_doc_number('RCV', '2099-01-15') = 'RCV-209901-0001' and public.next_doc_number('RCV', '2099-01-20') = 'RCV-209901-0002';
insert into _hasil (uji, lulus) select 'nomor: bulan baru mulai lagi dari 0001', public.next_doc_number('RCV', '2099-02-01') = 'RCV-209902-0001';
insert into _hasil (uji, lulus) select 'nomor: batch per hari PRD-20990103-01', public.next_doc_number('PRD', '2099-01-03') = 'PRD-20990103-01';
insert into _hasil (uji, lulus) select 'nomor: opname 2 digit OPN-209901-01', public.next_doc_number('OPN', '2099-01-03') = 'OPN-209901-01';
do $$ begin
  perform public.next_doc_number('XYZ', '2099-01-01');
  insert into _hasil (uji, lulus) values ('nomor: jenis tak dikenal ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('nomor: jenis tak dikenal ditolak', true);
end $$;

-- ---------- alur DEMO PRD §9.1 ----------
-- mulai dari saldo yang ada (proyek baru: 0); semua angka di bawah relatif terhadap saldo awal ini
create temp table _awal as select product_id, on_hand_kg, value_rp from public.stock_balances where product_id in ((select pp from _ctx), (select tp from _ctx));

select public._post_movement((select pp from _ctx), 'in', 100, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-209901-0001', '2099-01-15', 400000);
insert into _hasil (uji, lulus) select 'jagung masuk 100 kg PP Rp400.000 → avg Rp4.000/kg',
  b.on_hand_kg - a.on_hand_kg = 100 and b.value_rp - a.value_rp = 400000
  from public.stock_balances b join _awal a using (product_id) where product_id = (select pp from _ctx);

do $$ declare v_batch uuid := gen_random_uuid(); begin
  perform public._post_movement((select pp from _ctx), 'out', 60, 'production_out', 'production_batch', v_batch, 'PRD-20990103-01', '2099-01-16', null, 'in-1');
  perform public._post_movement((select tp from _ctx), 'in', 50, 'production_in', 'production_batch', v_batch, 'PRD-20990103-01', '2099-01-16', 300000, 'out-1');
  insert into _hasil (uji, lulus) select 'batch: 60 kg PP keluar bernilai Rp240.000 (rata-rata)',
    (select value_rp from public.stock_movements where source_id = v_batch and direction = 'out') = 240000;
  -- uji ulang: konfirmasi ganda baris yang sama ditolak (baris masuk: tidak ada cek stok, yang menolak murni UNIQUE)
  begin
    perform public._post_movement((select tp from _ctx), 'in', 50, 'production_in', 'production_batch', v_batch, 'PRD-20990103-01', '2099-01-16', 300000, 'out-1');
    insert into _hasil (uji, lulus) values ('posting ganda dokumen+baris yang sama ditolak', false);
  exception when unique_violation then insert into _hasil (uji, lulus) values ('posting ganda dokumen+baris yang sama ditolak', true);
  end;
end $$;
insert into _hasil (uji, lulus) select 'stok PP 40 kg, TP 50 kg setelah batch (HPP Rp6.000/kg)',
  (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _awal a using (product_id) where product_id = (select pp from _ctx)) = 40
  and (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _awal a using (product_id) where product_id = (select tp from _ctx)) = 50;

-- ---------- reservasi & tersedia (§4.3, FR-STK-05) ----------
select public._reserve_stock((select order1 from _ctx), (select tp from _ctx), 5);
insert into _hasil (uji, lulus) select 'pesanan 5 kg TP → reservasi 5, tersedia berkurang 5',
  reserved_kg = 5 and available_kg = on_hand_kg - 5 from public.v_stock_balance where product_id = (select tp from _ctx);
do $$ begin
  perform public._reserve_stock((select order2 from _ctx), (select tp from _ctx), (select available_kg + 0.001 from public.v_stock_balance where product_id = (select tp from _ctx)));
  insert into _hasil (uji, lulus) values ('reservasi melebihi tersedia ditolak (INSUFFICIENT_STOCK)', false);
exception when others then insert into _hasil (uji, lulus) values ('reservasi melebihi tersedia ditolak (INSUFFICIENT_STOCK)', sqlerrm like 'Stok % tidak cukup%');
end $$;
do $$ begin
  perform public._post_movement((select tp from _ctx), 'out', (select on_hand_kg from public.stock_balances where product_id = (select tp from _ctx)), 'correction', 'adjustment', gen_random_uuid(), null, '2099-01-17');
  insert into _hasil (uji, lulus) values ('keluar biasa tidak boleh memakai kg yang direservasi', false);
exception when others then insert into _hasil (uji, lulus) values ('keluar biasa tidak boleh memakai kg yang direservasi', true);
end $$;

-- serah barang: reservasi → fulfilled, stok keluar 5 kg dengan nilai rata-rata
select public._close_reservations((select order1 from _ctx), 'fulfilled');
select public._post_movement((select tp from _ctx), 'out', 5, 'sale_out', 'order', (select order1 from _ctx), 'INV-209901-0001', '2099-01-18', null, '', null, true);
insert into _hasil (uji, lulus) select 'serah barang: TP fisik 45 kg, reservasi 0, nilai Rp270.000',
  (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _awal a using (product_id) where product_id = (select tp from _ctx)) = 45
  and (select reserved_kg from public.v_stock_balance where product_id = (select tp from _ctx)) = 0
  and (select b.value_rp - a.value_rp from public.stock_balances b join _awal a using (product_id) where product_id = (select tp from _ctx)) = 270000;

do $$ begin
  perform public._post_movement((select pp from _ctx), 'out', 1000000, 'correction', 'adjustment', gen_random_uuid(), null, '2099-01-18');
  insert into _hasil (uji, lulus) values ('stok tidak boleh negatif', false);
exception when others then insert into _hasil (uji, lulus) values ('stok tidak boleh negatif', true);
end $$;
insert into _hasil (uji, lulus) select 'nilai saldo = Σ nilai masuk − Σ nilai keluar (PP & TP)',
  bool_and(b.value_rp = coalesce((select sum(case when m.direction = 'in' then m.value_rp else -m.value_rp end) from public.stock_movements m where m.product_id = b.product_id), 0))
  from public.stock_balances b where b.product_id in ((select pp from _ctx), (select tp from _ctx));
insert into _hasil (uji, lulus) select 'saldo berjalan baris terakhir = saldo produk',
  (select balance_after_kg from public.stock_movements where product_id = (select tp from _ctx) order by id desc limit 1)
  = (select on_hand_kg from public.stock_balances where product_id = (select tp from _ctx));

do $$ begin
  update public.stock_movements set qty_kg = 1 where product_id = (select pp from _ctx);
  insert into _hasil (uji, lulus) values ('buku mutasi append-only: UPDATE ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('buku mutasi append-only: UPDATE ditolak', true);
end $$;
do $$ begin
  delete from public.stock_movements where product_id = (select pp from _ctx);
  insert into _hasil (uji, lulus) values ('buku mutasi append-only: DELETE ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('buku mutasi append-only: DELETE ditolak', true);
end $$;
do $$ begin
  update public.products set archived_at = now() where code = 'PP';
  insert into _hasil (uji, lulus) values ('produk berstok tidak bisa diarsip (T2.6 aktif)', false);
exception when others then insert into _hasil (uji, lulus) values ('produk berstok tidak bisa diarsip (T2.6 aktif)', true);
end $$;

-- ---------- hak akses ----------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m3.operator@contoh.test', '{"full_name":"Uji Operator"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m3.teknis@contoh.test',   '{"full_name":"Uji Teknis"}',   now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m3.admin@contoh.test',    '{"full_name":"Uji Admin"}',    now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000c2', 'admin_teknis'),
  ('00000000-0000-4000-8000-0000000000c3', 'admin_kelompok');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'operator: melihat saldo & mutasi stok',
  (select count(*) from public.v_stock_balance) >= 3 and (select count(*) from public.stock_movements) >= 4;
do $$ begin
  perform public._post_movement((select pp from _ctx), 'in', 1, 'receipt_in', 'receipt', gen_random_uuid(), null, '2099-01-19', 0);
  insert into _hasil (uji, lulus) values ('klien tidak bisa memanggil _post_movement langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa memanggil _post_movement langsung', true);
end $$;
do $$ begin
  insert into public.stock_movements (product_id, movement_type, direction, qty_kg, value_rp, balance_after_kg, source_type, source_id, business_date)
  values ((select pp from _ctx), 'receipt_in', 'in', 1, 0, 1, 'receipt', gen_random_uuid(), '2099-01-19');
  insert into _hasil (uji, lulus) values ('klien tidak bisa menulis buku mutasi langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa menulis buku mutasi langsung', true);
end $$;
do $$ begin
  perform public.next_doc_number('RCV', '2099-01-19');
  insert into _hasil (uji, lulus) values ('klien tidak bisa mengambil nomor dokumen langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa mengambil nomor dokumen langsung', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin teknis: tidak melihat stok', (select count(*) from public.v_stock_balance) = 0 and (select count(*) from public.stock_movements) = 0;

-- ---------- idempotensi (T3.5) ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'idempotensi: kunci baru → new', public.idem_begin('11111111-1111-4111-8111-111111111111', 'uji', 'h1') ->> 'state' = 'new';
insert into _hasil (uji, lulus) select 'idempotensi: kunci sama saat masih berjalan → busy', public.idem_begin('11111111-1111-4111-8111-111111111111', 'uji', 'h1') ->> 'state' = 'busy';
select public.idem_finish('11111111-1111-4111-8111-111111111111', '{"nomor":"RCV-209901-0001"}');
insert into _hasil (uji, lulus) select 'idempotensi: kunci sama setelah selesai → hasil tersimpan',
  public.idem_begin('11111111-1111-4111-8111-111111111111', 'uji', 'h1') -> 'response' ->> 'nomor' = 'RCV-209901-0001';
insert into _hasil (uji, lulus) select 'idempotensi: kunci sama, isi berbeda → conflict (409)', public.idem_begin('11111111-1111-4111-8111-111111111111', 'uji', 'h2') ->> 'state' = 'conflict';

-- ---------- ringkasan; transaksi SENGAJA dibatalkan ----------
reset role;
do $$
declare v_ok int; v_fail int; v_list text;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus),
         string_agg(case when lulus then 'lulus  ' else 'GAGAL  ' end || uji, E'\n' order by no)
    into v_ok, v_fail, v_list from _hasil;
  raise exception E'HASIL UJI: % lulus, % gagal (transaksi sengaja dibatalkan; tidak ada data uji tersimpan)\n%', v_ok, v_fail, v_list;
end $$;
rollback;
