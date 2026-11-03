-- =====================================================================
-- Uji stok opname, koreksi stok, pembatalan batch (T9.1, T9.2, T5.7) — SELALU dibatalkan.
-- Produk uji UJIS (10 kg @Rp6.000); batch memakai aturan penepungan nyata (PP → TP) di dalam transaksi yang dibatalkan.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.stk.admin@contoh.test', '{"full_name":"Uji Admin Stok"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.stk.op@contoh.test', '{"full_name":"Uji Operator Stok"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.stk.ketua@contoh.test', '{"full_name":"Uji Ketua Stok"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.stk.rangkap@contoh.test', '{"full_name":"Uji Rangkap Stok"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.stk.teknis@contoh.test', '{"full_name":"Uji Teknis Stok"}', now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000b1', 'admin_kelompok'), ('00000000-0000-4000-8000-0000000000b2', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000b3', 'ketua'), ('00000000-0000-4000-8000-0000000000b4', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000b4', 'ketua'), ('00000000-0000-4000-8000-0000000000b5', 'admin_teknis');
insert into public.user_permissions (user_id, permission) values ('00000000-0000-4000-8000-0000000000b2', 'production.confirm');

insert into public.products (code, name, category) values ('UJIS', 'Produk uji stok', 'olahan');
create temp table _ctx as
  select (select id from public.products where code = 'UJIS') as ps, (select id from public.products where code = 'PP') as pp,
         (select id from public.products where code = 'TP') as tp, (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;
select public._post_movement((select ps from _ctx), 'in', 10, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 60000);
select public._post_movement((select pp from _ctx), 'in', 10, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 40000);
create temp table _awal as select product_id, on_hand_kg, value_rp from public.stock_balances;
grant select on _awal to authenticated;

-- =============== stok opname (operator) ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
insert into _id select 'op1', public.save_opname_draft(null, null, 'hitung gudang', jsonb_build_array(jsonb_build_object('product_id', (select ps from _ctx), 'physical_kg', '9.5')));
insert into _hasil (uji, lulus) select 'opname draft: tanpa nomor & tanpa mutasi',
  (select status = 'draft' and doc_number is null from public.stock_opnames where id = (select id from _id where k = 'op1'))
  and not exists (select 1 from public.stock_movements where source_type = 'opname' and source_id = (select id from _id where k = 'op1'));
do $$ begin
  perform public.save_opname_draft(null, null, null, jsonb_build_array(jsonb_build_object('product_id', (select ps from _ctx), 'physical_kg', '-1')));
  insert into _hasil (uji, lulus) values ('berat fisik negatif ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('berat fisik negatif ditolak', true);
end $$;
insert into _k select 'post1', public.post_opname((select id from _id where k = 'op1'));
insert into _hasil (uji, lulus) select 'posting opname: nomor OPN, selisih −0,5 kg jadi mutasi opname_adjust bernilai rata-rata (Rp3.000)',
  (select r ->> 'doc_number' from _k where k = 'post1') ~ '^OPN-[0-9]{6}-[0-9]{2,}$'
  and (select system_kg = 10 and diff_kg = -0.5 and value_rp = 3000 from public.stock_opname_lines where opname_id = (select id from _id where k = 'op1'))
  and (select on_hand_kg from public.stock_balances where product_id = (select ps from _ctx)) = 9.5;
insert into _k select 'post1b', public.post_opname((select id from _id where k = 'op1'));
insert into _hasil (uji, lulus) select 'posting opname dua kali → tetap satu mutasi',
  (select (r ->> 'already')::boolean from _k where k = 'post1b')
  and (select count(*) from public.stock_movements where source_type = 'opname' and source_id = (select id from _id where k = 'op1')) = 1;
do $$ begin
  perform public.delete_opname_draft((select id from _id where k = 'op1'));
  insert into _hasil (uji, lulus) values ('opname terposting tidak bisa dihapus', false);
exception when others then insert into _hasil (uji, lulus) values ('opname terposting tidak bisa dihapus', true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
insert into _id select 'op2', public.save_opname_draft(null, null, null, jsonb_build_array(jsonb_build_object('product_id', (select ps from _ctx), 'physical_kg', '12')));
select public.post_opname((select id from _id where k = 'op2'));
insert into _hasil (uji, lulus) select 'opname admin: selisih +2,5 kg masuk bernilai rata-rata (Rp15.000), stok 12 kg',
  (select diff_kg = 2.5 and value_rp = 15000 from public.stock_opname_lines where opname_id = (select id from _id where k = 'op2'))
  and (select on_hand_kg from public.stock_balances where product_id = (select ps from _ctx)) = 12;
insert into _id select 'op3', public.save_opname_draft(null, null, null, jsonb_build_array(jsonb_build_object('product_id', (select ps from _ctx), 'physical_kg', '1')));
select public.delete_opname_draft((select id from _id where k = 'op3'));
insert into _hasil (uji, lulus) select 'draft opname bisa dihapus', not exists (select 1 from public.stock_opnames where id = (select id from _id where k = 'op3'));

-- =============== koreksi stok ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
insert into _k select 'a1', public.request_stock_adjustment((select ps from _ctx), 'out', 1, 'Karung bocor dimakan tikus', null);
insert into _hasil (uji, lulus) select 'koreksi stok diajukan operator: nomor ADJ, belum ada mutasi',
  (select r ->> 'doc_number' from _k where k = 'a1') ~ '^ADJ-'
  and not exists (select 1 from public.stock_movements where source_type = 'adjustment' and source_id = ((select r ->> 'id' from _k where k = 'a1'))::uuid);
do $$ begin
  perform public.decide_stock_adjustment(((select r ->> 'id' from _k where k = 'a1'))::uuid, true, null);
  insert into _hasil (uji, lulus) values ('operator tidak bisa menyetujui koreksi stok', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak bisa menyetujui koreksi stok', sqlstate = '42501');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
insert into _k select 'a2', public.request_stock_adjustment((select ps from _ctx), 'in', 1, 'Salah catat timbang', null);
do $$ begin
  perform public.decide_stock_adjustment(((select r ->> 'id' from _k where k = 'a2'))::uuid, true, null);
  insert into _hasil (uji, lulus) values ('pemisahan tugas: akun rangkap tidak menyetujui koreksi stoknya sendiri', false);
exception when others then insert into _hasil (uji, lulus) values ('pemisahan tugas: akun rangkap tidak menyetujui koreksi stoknya sendiri', sqlerrm like '%sendiri%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
select public.decide_stock_adjustment(((select r ->> 'id' from _k where k = 'a1'))::uuid, true, null);
insert into _k select 'a1b', public.decide_stock_adjustment(((select r ->> 'id' from _k where k = 'a1'))::uuid, true, null);
insert into _hasil (uji, lulus) select 'ketua menyetujui: satu mutasi correction keluar 1 kg, stok 11 kg (setujui ulang aman)',
  (select (r ->> 'already')::boolean from _k where k = 'a1b')
  and (select count(*) = 1 and sum(qty_kg) = 1 from public.stock_movements where source_type = 'adjustment' and source_id = ((select r ->> 'id' from _k where k = 'a1'))::uuid and movement_type = 'correction')
  and (select on_hand_kg from public.stock_balances where product_id = (select ps from _ctx)) = 11;
do $$ begin
  perform public.decide_stock_adjustment(((select r ->> 'id' from _k where k = 'a2'))::uuid, false, '');
  insert into _hasil (uji, lulus) values ('tolak koreksi stok wajib alasan', false);
exception when others then insert into _hasil (uji, lulus) values ('tolak koreksi stok wajib alasan', true);
end $$;
select public.decide_stock_adjustment(((select r ->> 'id' from _k where k = 'a2'))::uuid, false, 'Timbangan sudah benar');
insert into _hasil (uji, lulus) select 'koreksi ditolak: tanpa mutasi, riwayat tetap ada',
  (select status from public.stock_adjustments where id = ((select r ->> 'id' from _k where k = 'a2'))::uuid) = 'rejected'
  and not exists (select 1 from public.stock_movements where source_id = ((select r ->> 'id' from _k where k = 'a2'))::uuid);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
insert into _k select 'a3', public.request_stock_adjustment((select ps from _ctx), 'out', 100, 'Koreksi berlebihan', null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
do $$ begin
  perform public.decide_stock_adjustment(((select r ->> 'id' from _k where k = 'a3'))::uuid, true, null);
  insert into _hasil (uji, lulus) values ('koreksi keluar melebihi stok ditolak saat disetujui (stok tidak negatif)', false);
exception when others then insert into _hasil (uji, lulus) values ('koreksi keluar melebihi stok ditolak saat disetujui (stok tidak negatif)', sqlerrm like '%tidak cukup%');
end $$;
do $$ begin
  perform public.save_opname_draft(null, null, null, jsonb_build_array(jsonb_build_object('product_id', (select ps from _ctx), 'physical_kg', '1')));
  insert into _hasil (uji, lulus) values ('ketua tidak mencatat opname (hanya lihat)', false);
exception when others then insert into _hasil (uji, lulus) values ('ketua tidak mencatat opname (hanya lihat)', sqlstate = '42501');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b5","role":"authenticated"}', true);
do $$ begin
  perform public.request_stock_adjustment((select ps from _ctx), 'in', 1, 'admin teknis coba', null);
  insert into _hasil (uji, lulus) values ('admin teknis tidak dapat mengajukan koreksi stok', false);
exception when others then insert into _hasil (uji, lulus) values ('admin teknis tidak dapat mengajukan koreksi stok', sqlstate = '42501');
end $$;

-- =============== pembatalan batch dengan persetujuan ketua (T5.7) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
create temp table _pra_batch as select product_id, on_hand_kg, value_rp from public.stock_balances where product_id in ((select pp from _ctx), (select tp from _ctx));
insert into _id select 'b1', public.save_production_draft(null, 'penepungan', null, null, 0, array[6]::numeric[], array[5]::numeric[], '[{"category":"tenaga_kerja","amount_rp":6000}]'::jsonb);
select public.confirm_production((select id from _id where k = 'b1'));
do $$ begin
  perform public.request_production_void((select id from _id where k = 'b1'), 'x');
  insert into _hasil (uji, lulus) values ('pembatalan batch wajib alasan', false);
exception when others then insert into _hasil (uji, lulus) values ('pembatalan batch wajib alasan', true);
end $$;
select public.request_production_void((select id from _id where k = 'b1'), 'Salah jenis batch, dicatat ulang');
insert into _hasil (uji, lulus) select 'pengajuan pembatalan: status menunggu, stok belum berubah',
  (select status from public.production_batches where id = (select id from _id where k = 'b1')) = 'pending_void'
  and not exists (select 1 from public.stock_movements where source_id = (select id from _id where k = 'b1') and movement_type = 'reversal');
do $$ begin
  perform public.decide_production_void((select id from _id where k = 'b1'), true, null);
  insert into _hasil (uji, lulus) values ('operator tidak bisa menyetujui pembatalan batch', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak bisa menyetujui pembatalan batch', sqlstate = '42501');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
select public.decide_production_void((select id from _id where k = 'b1'), false, 'Batch sudah benar');
insert into _hasil (uji, lulus) select 'ditolak ketua: batch kembali terkonfirmasi', (select status from public.production_batches where id = (select id from _id where k = 'b1')) = 'confirmed';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select public.request_production_void((select id from _id where k = 'b1'), 'Salah jenis batch, dicatat ulang');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
select public.decide_production_void((select id from _id where k = 'b1'), true, null);
insert into _hasil (uji, lulus) select 'disetujui ketua: batch void, stok & nilai PP/TP kembali seperti sebelum batch (mutasi reversal)',
  (select status from public.production_batches where id = (select id from _id where k = 'b1')) = 'void'
  and (select bool_and(b.on_hand_kg = a.on_hand_kg and b.value_rp = a.value_rp) from public.stock_balances b join _pra_batch a using (product_id))
  and (select count(*) from public.stock_movements where source_id = (select id from _id where k = 'b1') and movement_type = 'reversal') = 2;
-- hasil batch sudah habis → pembatalan ditolak
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
insert into _id select 'b2', public.save_production_draft(null, 'penepungan', null, null, 0, array[2]::numeric[], array[2]::numeric[], '[]'::jsonb);
select public.confirm_production((select id from _id where k = 'b2'));
insert into _id select 'op4', public.save_opname_draft(null, null, 'TP habis', jsonb_build_array(jsonb_build_object('product_id', (select tp from _ctx), 'physical_kg', '0')));
select public.post_opname((select id from _id where k = 'op4'));
select public.request_production_void((select id from _id where k = 'b2'), 'Coba batal setelah habis');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
do $$ begin
  perform public.decide_production_void((select id from _id where k = 'b2'), true, null);
  insert into _hasil (uji, lulus) values ('pembatalan batch ditolak bila hasilnya sudah tidak tersedia', false);
exception when others then insert into _hasil (uji, lulus) values ('pembatalan batch ditolak bila hasilnya sudah tidak tersedia', sqlerrm like '%tidak cukup%');
end $$;

-- ---------- konsistensi ----------
reset role;
insert into _hasil (uji, lulus) select 'batas piutang pelanggan tersedia (FR-SAL-01)', exists (select 1 from information_schema.columns where table_name = 'customers' and column_name = 'credit_limit_rp');
insert into _hasil (uji, lulus) select 'audit: opname, koreksi stok, pembatalan batch tercatat',
  (select count(distinct action) from public.audit_logs where action in ('opname.created', 'opname.posted', 'opname.deleted', 'stock_adjustment.requested',
     'stock_adjustment.approved', 'stock_adjustment.rejected', 'production.void_requested', 'production.void_rejected', 'production.void_approved')
     and user_id::text like '00000000-0000-4000-8000-0000000000b%') = 9;
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
