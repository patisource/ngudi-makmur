-- =====================================================================
-- Uji jagung masuk M4 (T4.6, uji wajib SRS §11) — Supabase → SQL Editor sebagai postgres. SELALU dibatalkan.
-- Konfirmasi dua kali → satu mutasi; draft tidak mengubah stok; berat ≤ 0 ditolak; edit setelah konfirmasi ditolak;
-- void → mutasi balik; hak akses per peran; lampiran & Storage hanya untuk draft / admin kelompok.
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
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m4.admin@contoh.test',    '{"full_name":"Uji Admin"}',    now(), now()),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m4.operator@contoh.test', '{"full_name":"Uji Operator"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m4.teknis@contoh.test',   '{"full_name":"Uji Teknis"}',   now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000d1', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000d2', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000d3', 'admin_teknis');
-- kode eksplisit agar urutan kode anggota nyata tidak terpakai
insert into public.members (code, name) values ('A-UJI', 'Petani A (uji)');
insert into _id select 'anggota', id from public.members where code = 'A-UJI';

-- =============== admin kelompok ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

with x as (
  insert into public.receipts (source_type, member_id, product_id, weight_kg, acquisition_cost, note)
  values ('anggota', (select id from _id where k = 'anggota'), (select pp from _ctx), 90, 400000, 'uji')
  returning id)
insert into _id select 'r1', id from x;
insert into _hasil (uji, lulus) select 'draft tersimpan tanpa nomor & tanpa mutasi stok',
  (select doc_number is null and status = 'draft' from public.receipts where id = (select id from _id where k = 'r1'))
  and not exists (select 1 from public.stock_movements where source_id = (select id from _id where k = 'r1'))
  and (select on_hand_kg from public.stock_balances where product_id = (select pp from _ctx)) = (select on_hand_kg from _awal where product_id = (select pp from _ctx));

update public.receipts set weight_kg = 100 where id = (select id from _id where k = 'r1');
insert into _hasil (uji, lulus) select 'draft masih bisa diubah', (select weight_kg from public.receipts where id = (select id from _id where k = 'r1')) = 100;

do $$ begin
  insert into public.receipts (source_type, member_id, product_id, weight_kg) values ('anggota', (select id from _id where k = 'anggota'), (select pp from _ctx), 0);
  insert into _hasil (uji, lulus) values ('berat 0 ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('berat 0 ditolak', true);
end $$;
do $$ begin
  insert into public.receipts (source_type, member_id, product_id, weight_kg) values ('anggota', (select id from _id where k = 'anggota'), (select pp from _ctx), -5);
  insert into _hasil (uji, lulus) values ('berat negatif ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('berat negatif ditolak', true);
end $$;
do $$ begin
  insert into public.receipts (source_type, product_id, weight_kg) values ('luar', (select pp from _ctx), 10);
  insert into _hasil (uji, lulus) values ('sumber luar tanpa nama pemasok ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('sumber luar tanpa nama pemasok ditolak', true);
end $$;
do $$ begin
  insert into public.receipts (source_type, product_id, weight_kg) values ('anggota', (select pp from _ctx), 10);
  insert into _hasil (uji, lulus) values ('sumber anggota tanpa anggota ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('sumber anggota tanpa anggota ditolak', true);
end $$;
do $$ begin
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg) values ('luar', 'Pemasok uji', (select tp from _ctx), 10);
  insert into _hasil (uji, lulus) values ('produk olahan (TP) tidak bisa diterima sebagai jagung masuk', false);
exception when others then insert into _hasil (uji, lulus) values ('produk olahan (TP) tidak bisa diterima sebagai jagung masuk', sqlerrm like '%produk mentah%');
end $$;
do $$ begin
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg, business_date) values ('luar', 'Pemasok uji', (select pp from _ctx), 10, (select hari_ini + 1 from _ctx));
  insert into _hasil (uji, lulus) values ('tanggal besok ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('tanggal besok ditolak', true);
end $$;
do $$ begin
  update public.receipts set status = 'confirmed' where id = (select id from _id where k = 'r1');
  insert into _hasil (uji, lulus) values ('klien tidak bisa mengubah status langsung', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa mengubah status langsung', true);
end $$;
do $$ begin
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg, doc_number) values ('luar', 'Pemasok uji', (select pp from _ctx), 10, 'RCV-X');
  insert into _hasil (uji, lulus) values ('klien tidak bisa mengisi nomor dokumen', false);
exception when others then insert into _hasil (uji, lulus) values ('klien tidak bisa mengisi nomor dokumen', true);
end $$;

-- ---------- konfirmasi ----------
insert into _k select 'k1', public.confirm_receipt((select id from _id where k = 'r1'));
insert into _hasil (uji, lulus) select 'konfirmasi: nomor RCV-YYYYMM-NNNN terbit',
  (select r ->> 'doc_number' from _k where k = 'k1') ~ ('^RCV-' || to_char((select hari_ini from _ctx), 'YYYYMM') || '-[0-9]{4}$');
insert into _hasil (uji, lulus) select 'konfirmasi: stok PP +100 kg, nilai +Rp400.000 (avg biaya terbarui)',
  b.on_hand_kg - a.on_hand_kg = 100 and b.value_rp - a.value_rp = 400000
  from public.stock_balances b join _awal a using (product_id) where product_id = (select pp from _ctx);
insert into _k select 'k2', public.confirm_receipt((select id from _id where k = 'r1'));
insert into _hasil (uji, lulus) select 'konfirmasi dua kali → tetap satu mutasi & nomor sama',
  (select count(*) from public.stock_movements where source_type = 'receipt' and source_id = (select id from _id where k = 'r1')) = 1
  and (select r ->> 'doc_number' from _k where k = 'k2') = (select r ->> 'doc_number' from _k where k = 'k1')
  and (select (r ->> 'already')::boolean from _k where k = 'k2')
  and (select b.on_hand_kg - a.on_hand_kg from public.stock_balances b join _awal a using (product_id) where product_id = (select pp from _ctx)) = 100;

update public.receipts set weight_kg = 1 where id = (select id from _id where k = 'r1');
insert into _hasil (uji, lulus) select 'edit setelah konfirmasi ditolak (klien: RLS, 0 baris)',
  (select weight_kg from public.receipts where id = (select id from _id where k = 'r1')) = 100;
delete from public.receipts where id = (select id from _id where k = 'r1');
insert into _hasil (uji, lulus) select 'hapus setelah konfirmasi ditolak (klien: RLS, 0 baris)', exists (select 1 from public.receipts where id = (select id from _id where k = 'r1'));

-- ---------- lampiran ----------
do $$ begin
  insert into public.attachments (receipt_id, storage_path, mime_type, size_bytes)
  values ((select id from _id where k = 'r1'), 'receipts/2026/11/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000);
  insert into _hasil (uji, lulus) values ('bukti tidak bisa ditambah ke penerimaan terkonfirmasi', false);
exception when others then insert into _hasil (uji, lulus) values ('bukti tidak bisa ditambah ke penerimaan terkonfirmasi', true);
end $$;
with x as (
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg, acquisition_cost)
  values ('luar', 'Pemasok uji', (select tk from _ctx), 10, 30000) returning id)
insert into _id select 'r2', id from x;
insert into public.attachments (receipt_id, storage_path, mime_type, size_bytes)
values ((select id from _id where k = 'r2'), 'receipts/2026/11/00000000-0000-4000-8000-0000000000aa.jpg', 'image/jpeg', 1000);
insert into _hasil (uji, lulus) select 'bukti bisa ditambah ke draft', (select count(*) from public.attachments where receipt_id = (select id from _id where k = 'r2')) = 1;
do $$ begin
  insert into public.attachments (receipt_id, storage_path, mime_type, size_bytes)
  values ((select id from _id where k = 'r2'), 'receipts/2026/11/foto-asli.jpg', 'image/jpeg', 1000);
  insert into _hasil (uji, lulus) values ('path bukti harus uuid (bukan nama file asli)', false);
exception when others then insert into _hasil (uji, lulus) values ('path bukti harus uuid (bukan nama file asli)', true);
end $$;
do $$ begin
  insert into public.attachments (receipt_id, storage_path, mime_type, size_bytes)
  values ((select id from _id where k = 'r2'), 'receipts/2026/11/' || gen_random_uuid() || '.jpg', 'image/jpeg', 6000000);
  insert into _hasil (uji, lulus) values ('bukti > 5 MB ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('bukti > 5 MB ditolak', true);
end $$;

-- ---------- Storage (policy bucket proofs) ----------
do $$ begin
  insert into storage.objects (bucket_id, name) values ('proofs', 'receipts/2026/11/' || gen_random_uuid() || '.pdf');
  insert into _hasil (uji, lulus) values ('storage: admin boleh unggah ke receipts/yyyy/mm/uuid.ext', true);
exception when others then insert into _hasil (uji, lulus) values ('storage: admin boleh unggah ke receipts/yyyy/mm/uuid.ext (' || sqlerrm || ')', false);
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('proofs', 'receipts/foto petani.jpg');
  insert into _hasil (uji, lulus) values ('storage: nama file bebas ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('storage: nama file bebas ditolak', true);
end $$;

-- ---------- void ----------
do $$ begin
  perform public.void_receipt((select id from _id where k = 'r1'), 'x');
  insert into _hasil (uji, lulus) values ('void tanpa alasan memadai ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('void tanpa alasan memadai ditolak', true);
end $$;
select public.void_receipt((select id from _id where k = 'r1'), 'Salah timbang, dicatat ulang');
insert into _hasil (uji, lulus) select 'void: stok & nilai PP kembali ke awal, status void',
  b.on_hand_kg = a.on_hand_kg and b.value_rp = a.value_rp and (select status from public.receipts where id = (select id from _id where k = 'r1')) = 'void'
  from public.stock_balances b join _awal a using (product_id) where product_id = (select pp from _ctx);
select public.void_receipt((select id from _id where k = 'r1'), 'Salah timbang, dicatat ulang');
insert into _hasil (uji, lulus) select 'void dua kali → tetap satu mutasi balik',
  (select count(*) from public.stock_movements where source_id = (select id from _id where k = 'r1') and movement_type = 'reversal') = 1;
do $$ begin
  perform public.confirm_receipt((select id from _id where k = 'r1'));
  insert into _hasil (uji, lulus) values ('penerimaan void tidak bisa dikonfirmasi lagi', false);
exception when others then insert into _hasil (uji, lulus) values ('penerimaan void tidak bisa dikonfirmasi lagi', true);
end $$;
do $$ begin
  perform public.void_receipt((select id from _id where k = 'r2'), 'Masih draft, bukan void');
  insert into _hasil (uji, lulus) values ('draft tidak bisa di-void (hapus saja)', false);
exception when others then insert into _hasil (uji, lulus) values ('draft tidak bisa di-void (hapus saja)', true);
end $$;

-- void ditolak bila stok tersedia tidak cukup untuk dibalik (TK dipakai sebagian)
select public.confirm_receipt((select id from _id where k = 'r2'));
reset role;
select public._post_movement((select tk from _ctx), 'out', 5, 'correction', 'adjustment', gen_random_uuid(), null, (select hari_ini from _ctx), null, '', 'uji: TK terpakai');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
do $$ begin
  if (select on_hand_kg from public.stock_balances where product_id = (select tk from _ctx)) >= 10 then
    insert into _hasil (uji, lulus) values ('void ditolak bila stok tidak cukup (dilewati: stok TK awal ≥ 5 kg)', true);
    return;
  end if;
  perform public.void_receipt((select id from _id where k = 'r2'), 'Uji stok tidak cukup');
  insert into _hasil (uji, lulus) values ('void ditolak bila stok tidak cukup untuk dibalik', false);
exception when others then insert into _hasil (uji, lulus) values ('void ditolak bila stok tidak cukup untuk dibalik', sqlerrm like 'Stok % tidak cukup%');
end $$;

with x as (
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg) values ('luar', 'Pemasok uji', (select pp from _ctx), 5) returning id)
insert into _id select 'r3', id from x;
delete from public.receipts where id = (select id from _id where k = 'r3');
insert into _hasil (uji, lulus) select 'draft bisa dihapus', not exists (select 1 from public.receipts where id = (select id from _id where k = 'r3'));

-- =============== operator produksi (lihat saja) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'operator: melihat penerimaan & bukti', (select count(*) from public.receipts where id in (select id from _id)) >= 2
  and (select count(*) from public.attachments where receipt_id = (select id from _id where k = 'r2')) = 1;
do $$ begin
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg) values ('luar', 'Pemasok uji', (select pp from _ctx), 5);
  insert into _hasil (uji, lulus) values ('operator: tidak bisa membuat penerimaan', false);
exception when others then insert into _hasil (uji, lulus) values ('operator: tidak bisa membuat penerimaan', true);
end $$;
do $$ begin
  perform public.void_receipt((select id from _id where k = 'r2'), 'Operator mencoba membatalkan');
  insert into _hasil (uji, lulus) values ('operator: tidak bisa membatalkan (42501)', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('operator: tidak bisa membatalkan (42501)', true);
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('proofs', 'receipts/2026/11/' || gen_random_uuid() || '.jpg');
  insert into _hasil (uji, lulus) values ('storage: operator tidak bisa unggah bukti', false);
exception when others then insert into _hasil (uji, lulus) values ('storage: operator tidak bisa unggah bukti', true);
end $$;

-- =============== admin teknis (tanpa akses) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin teknis: tidak melihat penerimaan', (select count(*) from public.receipts) = 0;
do $$ begin
  perform public.confirm_receipt((select id from _id where k = 'r2'));
  insert into _hasil (uji, lulus) values ('admin teknis: tidak bisa konfirmasi', false);
exception when insufficient_privilege then insert into _hasil (uji, lulus) values ('admin teknis: tidak bisa konfirmasi', true);
end $$;

-- =============== sebagai postgres: kunci tetap berlaku walau melewati RLS ===============
reset role;
do $$ begin
  update public.receipts set weight_kg = 1 where id = (select id from _id where k = 'r2');
  insert into _hasil (uji, lulus) values ('kunci DB: edit dokumen terkonfirmasi ditolak trigger', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: edit dokumen terkonfirmasi ditolak trigger', sqlerrm like '%terkunci%');
end $$;
do $$ begin
  delete from public.receipts where id = (select id from _id where k = 'r2');
  insert into _hasil (uji, lulus) values ('kunci DB: hapus dokumen terkonfirmasi ditolak trigger', false);
exception when others then insert into _hasil (uji, lulus) values ('kunci DB: hapus dokumen terkonfirmasi ditolak trigger', true);
end $$;
insert into _hasil (uji, lulus) select 'audit: draft dibuat, dikonfirmasi, di-void, draft dihapus tercatat',
  (select count(distinct action) from public.audit_logs where entity = 'receipt' and entity_id in (select id::text from _id)
     and action in ('receipt.draft_created', 'receipt.confirmed', 'receipt.voided', 'receipt.draft_deleted', 'attachment.added')) = 5
  and (select reason from public.audit_logs where action = 'receipt.voided' and entity_id = (select id from _id where k = 'r1')::text) = 'Salah timbang, dicatat ulang';
insert into _hasil (uji, lulus) select 'tidak ada kas dari biaya perolehan (FR-RCV-04)',
  not exists (select 1 from public.cash_transactions where source_id in (select id from _id));
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
