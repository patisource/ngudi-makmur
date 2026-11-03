-- =====================================================================
-- Uji produksi M5 (T5.5, T5.6, uji wajib SRS §11) — Supabase → SQL Editor sebagai postgres. SELALU dibatalkan.
-- Angka DEMO PRD §9.1: 100 kg PP @Rp4.000 → batch 60 kg PP → 50 kg TP + biaya proses Rp60.000 = HPP Rp6.000/kg.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;
create temp table _ctx as
  select (select id from public.products where code = 'TK') as tk, (select id from public.products where code = 'PP') as pp,
         (select id from public.products where code = 'TP') as tp, (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;
create temp table _awal as select product_id, on_hand_kg, value_rp from public.stock_balances;
grant select on _awal to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m5.op@contoh.test',     '{"full_name":"Uji Operator"}',        now(), now()),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m5.op2@contoh.test',    '{"full_name":"Uji Operator Tanpa Izin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m5.admin@contoh.test',  '{"full_name":"Uji Admin"}',           now(), now()),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m5.ketua@contoh.test',  '{"full_name":"Uji Ketua"}',           now(), now()),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m5.teknis@contoh.test', '{"full_name":"Uji Teknis"}',          now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000e1', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000e2', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000e3', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000e4', 'ketua'),
  ('00000000-0000-4000-8000-0000000000e5', 'admin_teknis');
insert into public.user_permissions (user_id, permission) values ('00000000-0000-4000-8000-0000000000e1', 'production.confirm');

-- jagung masuk DEMO: 100 kg PP, Rp400.000
select public._post_movement((select pp from _ctx), 'in', 100, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 400000);

-- ---------- HPP murni (T5.5) ----------
insert into _hasil (uji, lulus) select 'HPP: Rp300.000 ÷ 50 kg = Rp6.000/kg', public.calc_hpp(300000, 50) = 6000;
insert into _hasil (uji, lulus) select 'HPP: output 0 → kosong (data belum cukup), tanpa pembagian nol',
  public.calc_hpp(300000, 0) is null and public.calc_hpp(300000, null) is null;

-- =============== operator produksi (punya izin konfirmasi) ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

insert into _id select 'b1', public.save_production_draft(null, 'penepungan', (select hari_ini from _ctx), 'uji DEMO', 4, array[60]::numeric[], array[50]::numeric[],
  '[{"category":"tenaga_kerja","amount_rp":60000,"source_ref":"EXP-UJI","note":"upah giling"}]'::jsonb);
insert into _hasil (uji, lulus) select 'draft: tanpa nomor, tanpa mutasi stok',
  (select doc_number is null and status = 'draft' from public.production_batches where id = (select id from _id where k = 'b1'))
  and not exists (select 1 from public.stock_movements where source_id = (select id from _id where k = 'b1'));
insert into _hasil (uji, lulus) select 'draft: produk baris diambil dari aturan jenis batch (PP → TP)',
  (select product_id from public.production_lines where batch_id = (select id from _id where k = 'b1') and direction = 'input') = (select pp from _ctx)
  and (select product_id from public.production_lines where batch_id = (select id from _id where k = 'b1') and direction = 'output') = (select tp from _ctx);
insert into _hasil (uji, lulus) select 'draft: sisa/susut 10 kg & rincian sisa 4 kg tersimpan dalam kg',
  (select loss_kg = 10 and residue_kg = 4 and operator_name = 'Uji Operator' from public.production_batches where id = (select id from _id where k = 'b1'));

do $$ begin
  perform public.save_production_draft(null, 'penepungan', null, null, 0, array[10]::numeric[], array[11]::numeric[], '[]');
  insert into _hasil (uji, lulus) values ('output melebihi input ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('output melebihi input ditolak', sqlerrm like 'Output%');
end $$;
do $$ begin
  perform public.save_production_draft(null, 'penepungan', null, null, 0, array[0]::numeric[], array[1]::numeric[], '[]');
  insert into _hasil (uji, lulus) values ('berat 0 kg ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('berat 0 kg ditolak', true);
end $$;
do $$ begin
  perform public.save_production_draft(null, 'penepungan', null, null, 3, array[10]::numeric[], array[9]::numeric[], '[]');
  insert into _hasil (uji, lulus) values ('rincian sisa melebihi input − output ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('rincian sisa melebihi input − output ditolak', true);
end $$;
do $$ begin
  perform public.save_production_draft(null, 'penepungan', null, null, 0, array[10]::numeric[], array[9]::numeric[], '[{"category":"kas","amount_rp":1}]');
  insert into _hasil (uji, lulus) values ('kategori biaya tak dikenal ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('kategori biaya tak dikenal ditolak', true);
end $$;
do $$ begin
  perform public.save_production_draft(null, 'penepungan', (select hari_ini + 1 from _ctx), null, 0, array[10]::numeric[], array[9]::numeric[], '[]');
  insert into _hasil (uji, lulus) values ('tanggal besok ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('tanggal besok ditolak', true);
end $$;
insert into _id select 'kosong', public.save_production_draft(null, 'penepungan', null, null, 0, array[5]::numeric[], array[]::numeric[], '[]');
do $$ begin
  perform public.confirm_production((select id from _id where k = 'kosong'));
  insert into _hasil (uji, lulus) values ('konfirmasi tanpa output ditolak (min. 1 input & 1 output)', false);
exception when others then insert into _hasil (uji, lulus) values ('konfirmasi tanpa output ditolak (min. 1 input & 1 output)', sqlerrm like '%minimal satu%');
end $$;
do $$ begin
  insert into public.production_lines (batch_id, direction, product_id, qty_kg) values ((select id from _id where k = 'b1'), 'output', (select tk from _ctx), 1);
  insert into _hasil (uji, lulus) values ('klien tidak bisa menulis baris batch langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa menulis baris batch langsung', true);
end $$;

-- ---------- konfirmasi DEMO ----------
insert into _k select 'k1', public.confirm_production((select id from _id where k = 'b1'));
insert into _hasil (uji, lulus) select 'konfirmasi: nomor PRD-YYYYMMDD-NN',
  (select r ->> 'doc_number' from _k where k = 'k1') ~ ('^PRD-' || to_char((select hari_ini from _ctx), 'YYYYMMDD') || '-[0-9]{2}$');
insert into _hasil (uji, lulus) select 'DEMO: bahan Rp240.000 + biaya Rp60.000 → HPP Rp6.000/kg',
  material_cost = 240000 and other_cost = 60000 and total_cost = 300000 and hpp_per_kg = 6000
  from public.production_batches where id = (select id from _id where k = 'b1');
insert into _hasil (uji, lulus) select 'DEMO: stok PP 40 kg, TP 50 kg bernilai Rp300.000',
  (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _awal a using (product_id) where product_id = (select pp from _ctx)) = 40
  and (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _awal a using (product_id) where product_id = (select tp from _ctx)) = 50
  and (select b.value_rp - a.value_rp from public.stock_balances b join _awal a using (product_id) where product_id = (select tp from _ctx)) = 300000;
insert into _k select 'k2', public.confirm_production((select id from _id where k = 'b1'));
insert into _hasil (uji, lulus) select 'konfirmasi dua kali → tetap satu perubahan stok (2 mutasi: keluar & masuk)',
  (select count(*) from public.stock_movements where source_type = 'production_batch' and source_id = (select id from _id where k = 'b1')) = 2
  and (select (r ->> 'already')::boolean from _k where k = 'k2')
  and (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _awal a using (product_id) where product_id = (select tp from _ctx)) = 50;
do $$ begin
  perform public.save_production_draft((select id from _id where k = 'b1'), 'penepungan', null, null, 0, array[1]::numeric[], array[1]::numeric[], '[]');
  insert into _hasil (uji, lulus) values ('edit batch terkonfirmasi ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('edit batch terkonfirmasi ditolak', sqlerrm like '%terkunci%');
end $$;
do $$ begin
  perform public.delete_production_draft((select id from _id where k = 'b1'));
  insert into _hasil (uji, lulus) values ('hapus batch terkonfirmasi ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('hapus batch terkonfirmasi ditolak', true);
end $$;

-- ---------- bahan tidak cukup (T5.6) ----------
insert into _id select 'b2', public.save_production_draft(null, 'pemipilan', null, null, 0, array[999999]::numeric[], array[1]::numeric[], '[]');
do $$ begin
  perform public.confirm_production((select id from _id where k = 'b2'));
  insert into _hasil (uji, lulus) values ('bahan tidak cukup ditolak (INSUFFICIENT_STOCK), batch tetap draft', false);
exception when others then insert into _hasil (uji, lulus) values ('bahan tidak cukup ditolak (INSUFFICIENT_STOCK), batch tetap draft', sqlerrm like 'Stok % tidak cukup%');
end $$;
insert into _hasil (uji, lulus) select 'stok tidak berubah & tanpa nomor setelah konfirmasi gagal',
  (select status = 'draft' and doc_number is null from public.production_batches where id = (select id from _id where k = 'b2'))
  and not exists (select 1 from public.stock_movements where source_id = (select id from _id where k = 'b2'));

-- ---------- beberapa baris output: Σ nilai masuk = total biaya persis ----------
insert into _id select 'b3', public.save_production_draft(null, 'penepungan', null, null, 0, array[6, 4]::numeric[], array[3, 3, 2]::numeric[],
  '[{"category":"kemasan","amount_rp":1},{"category":"listrik_bbm","amount_rp":2500}]'::jsonb);
insert into _k select 'k3', public.confirm_production((select id from _id where k = 'b3'));
insert into _hasil (uji, lulus) select 'banyak baris: Σ nilai output = total biaya, HPP = total ÷ kg output',
  (select sum(value_rp) from public.production_lines where batch_id = (select id from _id where k = 'b3') and direction = 'output') = b.total_cost
  and b.total_cost = b.material_cost + 2501 and b.hpp_per_kg = round(b.total_cost / 8.0)
  from public.production_batches b where b.id = (select id from _id where k = 'b3');

insert into _id select 'b4', public.save_production_draft(null, 'pemipilan', null, 'akan dihapus', 0, array[1]::numeric[], array[]::numeric[], '[]');
select public.delete_production_draft((select id from _id where k = 'b4'));
insert into _hasil (uji, lulus) select 'draft bisa dihapus', not exists (select 1 from public.production_batches where id = (select id from _id where k = 'b4'));

-- =============== operator tanpa izin, admin, ketua, teknis ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
do $$ begin
  perform public.confirm_production((select id from _id where k = 'kosong'));
  insert into _hasil (uji, lulus) values ('operator tanpa izin production.confirm tidak bisa konfirmasi', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('operator tanpa izin production.confirm tidak bisa konfirmasi', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin kelompok: melihat batch', (select count(*) from public.production_batches where id in (select id from _id)) >= 3;
do $$ begin
  perform public.save_production_draft(null, 'penepungan', null, null, 0, array[1]::numeric[], array[1]::numeric[], '[]');
  insert into _hasil (uji, lulus) values ('admin kelompok: tidak bisa membuat batch', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('admin kelompok: tidak bisa membuat batch', true);
end $$;
do $$ begin
  perform public.confirm_production((select id from _id where k = 'kosong'));
  insert into _hasil (uji, lulus) values ('admin kelompok: tidak bisa konfirmasi batch', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('admin kelompok: tidak bisa konfirmasi batch', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e4","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'ketua: melihat batch & biaya', (select count(*) from public.production_batches where id in (select id from _id)) >= 3
  and (select count(*) from public.batch_costs where batch_id = (select id from _id where k = 'b1')) = 1;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin teknis: tidak melihat batch', (select count(*) from public.production_batches) = 0;

-- =============== sebagai postgres: kunci tetap berlaku ===============
reset role;
do $$ begin
  update public.production_batches set hpp_per_kg = 1 where id = (select id from _id where k = 'b1');
  insert into _hasil (uji, lulus) values ('kunci DB: HPP batch terkonfirmasi tidak bisa diubah', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: HPP batch terkonfirmasi tidak bisa diubah', sqlerrm like '%terkunci%');
end $$;
do $$ begin
  update public.production_lines set qty_kg = 1 where batch_id = (select id from _id where k = 'b1');
  insert into _hasil (uji, lulus) values ('kunci DB: baris batch terkonfirmasi tidak bisa diubah', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: baris batch terkonfirmasi tidak bisa diubah', true);
end $$;
insert into _hasil (uji, lulus) select 'biaya batch tidak membuat kas (FR-PRD-05)', not exists (select 1 from public.cash_transactions where source_id in (select id from _id));
insert into _hasil (uji, lulus) select 'audit: draft dibuat & konfirmasi tercatat',
  exists (select 1 from public.audit_logs where action = 'production.draft_created' and entity_id = (select id from _id where k = 'b1')::text)
  and exists (select 1 from public.audit_logs where action = 'production.confirmed' and entity_id = (select id from _id where k = 'b1')::text)
  and exists (select 1 from public.audit_logs where action = 'production.draft_deleted' and entity_id = (select id from _id where k = 'b4')::text);
insert into _hasil (uji, lulus) select 'nilai saldo = Σ nilai mutasi (semua produk)',
  bool_and(b.value_rp = coalesce((select sum(case when m.direction = 'in' then m.value_rp else -m.value_rp end) from public.stock_movements m where m.product_id = b.product_id), 0))
  from public.stock_balances b;

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
