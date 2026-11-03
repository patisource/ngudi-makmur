-- =====================================================================
-- Uji transfer antar akun kas (FR-CSH-09) & bukti pembayaran (FR-CSH-02, Security.md §8) — SELALU dibatalkan.
-- Akun kas & produk uji sementara agar saldo nyata tidak tersentuh.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
grant all on _hasil, _id to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.trf.admin@contoh.test', '{"full_name":"Uji Admin Trf"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.trf.ketua@contoh.test', '{"full_name":"Uji Ketua Trf"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.trf.op@contoh.test', '{"full_name":"Uji Operator Trf"}', now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000e1', 'admin_kelompok'), ('00000000-0000-4000-8000-0000000000e2', 'ketua'),
  ('00000000-0000-4000-8000-0000000000e3', 'operator_produksi');

insert into public.cash_accounts (code, name, kind) values ('UJI_T2', 'Kas tunai uji 2', 'tunai'), ('UJI_B2', 'Bank uji 2', 'bank');
insert into public.products (code, name, category, default_price_per_kg) values ('UJIT', 'Produk uji transfer', 'olahan', 10000);
insert into public.customers (name) values ('Uji Pelanggan Trf');
create temp table _ctx as
  select (select id from public.cash_accounts where code = 'UJI_T2') as tunai,
         (select id from public.cash_accounts where code = 'UJI_B2') as bank,
         (select id from public.products where code = 'UJIT') as pk,
         (select id from public.customers where name = 'Uji Pelanggan Trf') as cust,
         (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;
select public._post_movement((select pk from _ctx), 'in', 20, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 120000);
create temp table _kpi0 as select public.rpt_kpi((now() at time zone 'Asia/Jakarta')::date, (now() at time zone 'Asia/Jakarta')::date) as k;
grant select on _kpi0 to authenticated, anon;

-- =============== admin kelompok ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select public.set_opening_balance((select tunai from _ctx), 500000, null);
select public.set_opening_balance((select bank from _ctx), 0, null);

-- ---------- transfer ----------
insert into _id select 't1', (public.create_cash_transfer(null, (select tunai from _ctx), (select bank from _ctx), 200000, 'Setor ke BRI') ->> 'id')::uuid;
insert into _hasil (uji, lulus) select 'transfer Rp200.000: tunai 500.000 → 300.000, bank 0 → 200.000',
  (select balance_rp from public.cash_accounts where code = 'UJI_T2') = 300000 and (select balance_rp from public.cash_accounts where code = 'UJI_B2') = 200000;
insert into _hasil (uji, lulus) select 'satu dokumen TRF = dua baris kas (keluar & masuk) dengan nomor sama',
  (select count(*) from public.cash_transactions where source_id = (select id from _id where k = 't1')) = 2
  and (select count(distinct doc_number) from public.cash_transactions where source_id = (select id from _id where k = 't1')) = 1
  and (select doc_number from public.cash_transfers where id = (select id from _id where k = 't1')) like 'TRF-%';
insert into _hasil (uji, lulus) select 'kas total tidak berubah oleh transfer',
  (select sum(balance_rp) from public.cash_accounts where code in ('UJI_T2', 'UJI_B2')) = 500000;
insert into _hasil (uji, lulus) select 'ringkasan: transfer tidak dihitung sebagai kas masuk/keluar (hanya saldo awal yang menambah)',
  ((public.rpt_kpi((select hari_ini from _ctx), (select hari_ini from _ctx)) ->> 'cash_out_rp')::bigint = ((select k from _kpi0) ->> 'cash_out_rp')::bigint)
  and ((public.rpt_kpi((select hari_ini from _ctx), (select hari_ini from _ctx)) ->> 'cash_in_rp')::bigint = ((select k from _kpi0) ->> 'cash_in_rp')::bigint + 500000);
do $$ begin
  perform public.create_cash_transfer(null, (select tunai from _ctx), (select bank from _ctx), 300001, 'Melebihi saldo');
  insert into _hasil (uji, lulus) values ('transfer melebihi saldo asal ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('transfer melebihi saldo asal ditolak', sqlerrm like '%tidak cukup%');
end $$;
do $$ begin
  perform public.create_cash_transfer(null, (select tunai from _ctx), (select tunai from _ctx), 1000, 'Akun sama');
  insert into _hasil (uji, lulus) values ('transfer ke akun yang sama ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('transfer ke akun yang sama ditolak', sqlerrm like '%berbeda%');
end $$;
do $$ begin
  perform public.create_cash_transfer(null, (select tunai from _ctx), (select bank from _ctx), 1000, '  ');
  insert into _hasil (uji, lulus) values ('transfer tanpa keterangan ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('transfer tanpa keterangan ditolak', sqlerrm like '%Keterangan%');
end $$;
do $$ begin
  update public.cash_transfers set amount_rp = 1 where id = (select id from _id where k = 't1');
  insert into _hasil (uji, lulus) values ('dokumen transfer tidak bisa diubah', false);
exception when others then insert into _hasil (uji, lulus) values ('dokumen transfer tidak bisa diubah', true);
end $$;

-- ---------- bukti pembayaran ----------
insert into _id select 'o1', public.save_order_draft(null, null, (select cust from _ctx), 'whatsapp', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select pk from _ctx), 'qty', '5')));
select public.confirm_order((select id from _id where k = 'o1'));
insert into _id select 'p1', (public.record_payment((select id from _id where k = 'o1'), null, 'transfer', (select bank from _ctx), 20000, null, false) ->> 'id')::uuid;
insert into public.attachments (payment_id, storage_path, mime_type, size_bytes)
  values ((select id from _id where k = 'p1'), 'payments/2026/11/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000);
insert into _hasil (uji, lulus) select 'bukti transfer bisa dilampirkan ke pembayaran menunggu verifikasi',
  (select count(*) from public.attachments where payment_id = (select id from _id where k = 'p1')) = 1;
do $$ begin
  insert into public.attachments (payment_id, storage_path, mime_type, size_bytes)
    values ((select id from _id where k = 'p1'), 'receipts/2026/11/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000);
  insert into _hasil (uji, lulus) values ('bukti pembayaran wajib di folder payments/', false);
exception when others then insert into _hasil (uji, lulus) values ('bukti pembayaran wajib di folder payments/', true);
end $$;
select public.verify_payment((select id from _id where k = 'p1'));
do $$ begin
  delete from public.attachments where payment_id = (select id from _id where k = 'p1');
  insert into _hasil (uji, lulus) values ('bukti pembayaran terverifikasi tidak bisa dihapus',
    (select count(*) from public.attachments where payment_id = (select id from _id where k = 'p1')) = 1);
exception when others then insert into _hasil (uji, lulus) values ('bukti pembayaran terverifikasi tidak bisa dihapus', sqlerrm like '%tidak dapat dihapus%');
end $$;
insert into public.attachments (payment_id, storage_path, mime_type, size_bytes)
  values ((select id from _id where k = 'p1'), 'payments/2026/11/' || gen_random_uuid() || '.pdf', 'application/pdf', 2000);
insert into public.attachments (payment_id, storage_path, mime_type, size_bytes)
  values ((select id from _id where k = 'p1'), 'payments/2026/11/' || gen_random_uuid() || '.pdf', 'application/pdf', 2000);
do $$ begin
  insert into public.attachments (payment_id, storage_path, mime_type, size_bytes)
    values ((select id from _id where k = 'p1'), 'payments/2026/11/' || gen_random_uuid() || '.pdf', 'application/pdf', 2000);
  insert into _hasil (uji, lulus) values ('maksimal 3 bukti per pembayaran', false);
exception when others then insert into _hasil (uji, lulus) values ('maksimal 3 bukti per pembayaran', sqlerrm like '%Maksimal 3%');
end $$;
insert into _id select 'p2', (public.record_payment((select id from _id where k = 'o1'), null, 'transfer', (select bank from _ctx), 10000, null, false) ->> 'id')::uuid;
select public.reject_payment((select id from _id where k = 'p2'), 'Mutasi tidak ditemukan');
do $$ begin
  insert into public.attachments (payment_id, storage_path, mime_type, size_bytes)
    values ((select id from _id where k = 'p2'), 'payments/2026/11/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000);
  insert into _hasil (uji, lulus) values ('pembayaran ditolak tidak menerima bukti', false);
exception when others then insert into _hasil (uji, lulus) values ('pembayaran ditolak tidak menerima bukti', true);
end $$;

-- =============== ketua: lihat, tidak menulis ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'ketua melihat transfer & bukti pembayaran',
  (select count(*) from public.cash_transfers where id = (select id from _id where k = 't1')) = 1
  and (select count(*) from public.attachments where payment_id = (select id from _id where k = 'p1')) = 3;
do $$ begin
  perform public.create_cash_transfer(null, (select tunai from _ctx), (select bank from _ctx), 1000, 'Ketua mencoba');
  insert into _hasil (uji, lulus) values ('ketua tidak boleh mencatat transfer', false);
exception when others then insert into _hasil (uji, lulus) values ('ketua tidak boleh mencatat transfer', sqlstate = '42501');
end $$;

-- =============== operator: tidak melihat & tidak menulis (uji wajib SRS §11) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'operator tidak melihat transfer & bukti pembayaran',
  (select count(*) from public.cash_transfers) = 0 and (select count(*) from public.attachments where payment_id is not null) = 0;
do $$ begin
  perform public.create_cash_transfer(null, (select tunai from _ctx), (select bank from _ctx), 1000, 'Operator mencoba');
  insert into _hasil (uji, lulus) values ('operator tidak boleh mencatat transfer', false);
exception when others then insert into _hasil (uji, lulus) values ('operator tidak boleh mencatat transfer', sqlstate = '42501');
end $$;

reset role;
insert into _hasil (uji, lulus) select 'audit transfer & lampiran tercatat',
  (select count(*) from public.audit_logs where action = 'cash_transfer.created' and entity_id = (select id from _id where k = 't1')::text) = 1
  and (select count(*) from public.audit_logs where action = 'attachment.added' and entity = 'payment' and entity_id = (select id from _id where k = 'p1')::text) = 3;

do $$
declare v_ok int; v_fail int; v_list text;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus),
         string_agg(case when lulus then 'lulus  ' else 'GAGAL  ' end || uji, E'\n' order by no)
    into v_ok, v_fail, v_list from _hasil;
  raise exception E'HASIL UJI: % lulus, % gagal (transaksi sengaja dibatalkan; tidak ada data uji tersimpan)\n%', v_ok, v_fail, v_list;
end $$;
rollback;
