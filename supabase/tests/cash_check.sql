-- =====================================================================
-- Uji pembayaran & kas M7 (T7.7, T1.7 sisi kas, uji wajib SRS §11) — SELALU dibatalkan.
-- Akun kas & produk uji sementara (UJI_TUNAI, UJI_BANK, UJIK) agar saldo nyata tidak tersentuh.
-- DEMO PRD §9.1: tagihan Rp50.000; bayar Rp30.000 lalu Rp20.000 (terverifikasi) → partial → paid; kas masuk Rp50.000.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
create temp table _id (k text primary key, id uuid not null) on commit drop;
create temp table _k (k text primary key, r jsonb not null) on commit drop;
grant all on _hasil, _id, _k to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.kas.admin@contoh.test', '{"full_name":"Uji Admin Kas"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.kas.ketua@contoh.test', '{"full_name":"Uji Ketua Kas"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.kas.rangkap@contoh.test', '{"full_name":"Uji Rangkap Kas"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.kas.op@contoh.test', '{"full_name":"Uji Operator Kas"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.kas.teknis@contoh.test', '{"full_name":"Uji Teknis Kas"}', now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000d1', 'admin_kelompok'), ('00000000-0000-4000-8000-0000000000d2', 'ketua'),
  ('00000000-0000-4000-8000-0000000000d3', 'admin_kelompok'), ('00000000-0000-4000-8000-0000000000d3', 'ketua'),
  ('00000000-0000-4000-8000-0000000000d4', 'operator_produksi'), ('00000000-0000-4000-8000-0000000000d5', 'admin_teknis');
insert into public.user_permissions (user_id, permission) values ('00000000-0000-4000-8000-0000000000d4', 'production.confirm');

insert into public.cash_accounts (code, name, kind) values ('UJI_TUNAI', 'Kas tunai uji', 'tunai'), ('UJI_BANK', 'Bank uji', 'bank');
insert into public.products (code, name, category, default_price_per_kg) values ('UJIK', 'Produk uji kas', 'olahan', 10000);
insert into public.customers (name) values ('Uji Pelanggan Kas');
create temp table _ctx as
  select (select id from public.cash_accounts where code = 'UJI_TUNAI') as tunai,
         (select id from public.cash_accounts where code = 'UJI_BANK') as bank,
         (select id from public.products where code = 'UJIK') as pk,
         (select id from public.products where code = 'PP') as pp,
         (select id from public.customers where name = 'Uji Pelanggan Kas') as cust,
         (now() at time zone 'Asia/Jakarta')::date as hari_ini;
grant select on _ctx to authenticated, anon;
select public._post_movement((select pk from _ctx), 'in', 20, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 120000);
create temp table _kas_awal as select count(*) as n from public.cash_transactions;
grant select on _kas_awal to authenticated, anon;

-- =============== admin kelompok ===============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

-- saldo awal (FR-CSH-01)
select public.set_opening_balance((select tunai from _ctx), 100000, null);
insert into _hasil (uji, lulus) select 'saldo awal Rp100.000 tercatat sebagai satu baris kas',
  (select balance_rp from public.cash_accounts where id = (select tunai from _ctx)) = 100000
  and (select count(*) from public.cash_transactions where account_id = (select tunai from _ctx) and source_type = 'opening_balance') = 1;
do $$ begin
  perform public.set_opening_balance((select tunai from _ctx), 5000, null);
  insert into _hasil (uji, lulus) values ('saldo awal hanya sekali (ubah lewat koreksi kas)', false);
exception when others then insert into _hasil (uji, lulus) values ('saldo awal hanya sekali (ubah lewat koreksi kas)', sqlerrm like '%koreksi kas%');
end $$;

-- pesanan DEMO 5 kg @Rp10.000
insert into _id select 'o1', public.save_order_draft(null, null, (select cust from _ctx), 'whatsapp', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select pk from _ctx), 'qty', '5')));
select public.confirm_order((select id from _id where k = 'o1'));

do $$ begin
  perform public.record_payment((select id from _id where k = 'o1'), null, 'tunai', (select tunai from _ctx), 0, null, true);
  insert into _hasil (uji, lulus) values ('UJI WAJIB: jumlah bayar 0 ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('UJI WAJIB: jumlah bayar 0 ditolak', true);
end $$;
do $$ begin
  perform public.record_payment((select id from _id where k = 'o1'), null, 'tunai', (select tunai from _ctx), -1000, null, true);
  insert into _hasil (uji, lulus) values ('UJI WAJIB: jumlah bayar negatif ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('UJI WAJIB: jumlah bayar negatif ditolak', true);
end $$;

-- transfer Rp30.000 dicatat pending dulu
insert into _k select 'p1', public.record_payment((select id from _id where k = 'o1'), null, 'transfer', (select bank from _ctx), 30000, 'transfer BRI', false);
insert into _hasil (uji, lulus) select 'UJI WAJIB: pembayaran pending tidak membuat kas & tidak mengurangi tagihan',
  (select r ->> 'status' from _k where k = 'p1') = 'pending'
  and not exists (select 1 from public.cash_transactions where source_type = 'payment' and source_id = ((select r ->> 'id' from _k where k = 'p1'))::uuid)
  and (select payment_status from public.orders where id = (select id from _id where k = 'o1')) = 'unpaid'
  and (select outstanding_rp = 50000 and pending_rp = 30000 from public.v_order_balance where order_id = (select id from _id where k = 'o1'));
insert into _k select 'v1', public.verify_payment(((select r ->> 'id' from _k where k = 'p1'))::uuid);
insert into _hasil (uji, lulus) select 'verifikasi: nomor PAY, satu kas masuk Rp30.000, status partial',
  (select r ->> 'doc_number' from _k where k = 'v1') ~ '^PAY-[0-9]{6}-[0-9]{4,}$'
  and (select count(*) = 1 and sum(amount_rp) = 30000 from public.cash_transactions where source_type = 'payment' and source_id = ((select r ->> 'id' from _k where k = 'p1'))::uuid)
  and (select payment_status from public.orders where id = (select id from _id where k = 'o1')) = 'partial'
  and (select balance_rp from public.cash_accounts where id = (select bank from _ctx)) = 30000;
insert into _k select 'v1b', public.verify_payment(((select r ->> 'id' from _k where k = 'p1'))::uuid);
insert into _hasil (uji, lulus) select 'UJI WAJIB: verifikasi pembayaran yang sama dua kali → tetap 1 pembayaran, 1 kas masuk',
  (select (r ->> 'already')::boolean from _k where k = 'v1b')
  and (select count(*) from public.cash_transactions where source_type = 'payment' and source_id = ((select r ->> 'id' from _k where k = 'p1'))::uuid) = 1
  and (select balance_rp from public.cash_accounts where id = (select bank from _ctx)) = 30000;
do $$ begin
  perform public.record_payment((select id from _id where k = 'o1'), null, 'tunai', (select tunai from _ctx), 30000, null, true);
  insert into _hasil (uji, lulus) values ('UJI WAJIB: pembayaran kedua tidak boleh melebihi tagihan tersisa (Rp20.000)', false);
exception when others then insert into _hasil (uji, lulus) values ('UJI WAJIB: pembayaran kedua tidak boleh melebihi tagihan tersisa (Rp20.000)', sqlerrm like '%melebihi tagihan%');
end $$;
-- pending yang ditolak
insert into _k select 'p2', public.record_payment((select id from _id where k = 'o1'), null, 'transfer', (select bank from _ctx), 5000, 'bukti tidak jelas', false);
do $$ begin
  perform public.reject_payment(((select r ->> 'id' from _k where k = 'p2'))::uuid, '');
  insert into _hasil (uji, lulus) values ('tolak pembayaran wajib alasan', false);
exception when others then insert into _hasil (uji, lulus) values ('tolak pembayaran wajib alasan', true);
end $$;
select public.reject_payment(((select r ->> 'id' from _k where k = 'p2'))::uuid, 'Mutasi rekening tidak ditemukan');
do $$ begin
  perform public.verify_payment(((select r ->> 'id' from _k where k = 'p2'))::uuid);
  insert into _hasil (uji, lulus) values ('pembayaran ditolak: tanpa kas & tidak bisa diverifikasi', false);
exception when others then insert into _hasil (uji, lulus) values ('pembayaran ditolak: tanpa kas & tidak bisa diverifikasi',
  not exists (select 1 from public.cash_transactions where source_id = ((select r ->> 'id' from _k where k = 'p2'))::uuid));
end $$;
-- tunai Rp20.000 dicatat & diverifikasi sekaligus
insert into _k select 'p3', public.record_payment((select id from _id where k = 'o1'), null, 'tunai', (select tunai from _ctx), 20000, null, true);
insert into _hasil (uji, lulus) select 'DEMO: Rp30.000 + Rp20.000 → lunas; kas masuk Rp50.000 (dua baris kas)',
  (select payment_status from public.orders where id = (select id from _id where k = 'o1')) = 'paid'
  and (select count(*) = 2 and sum(c.amount_rp) = 50000 from public.cash_transactions c join public.payments p on p.id = c.source_id
        where c.source_type = 'payment' and p.order_id = (select id from _id where k = 'o1'))
  and (select outstanding_rp = 0 and paid_rp = 50000 from public.v_order_balance where order_id = (select id from _id where k = 'o1'));
insert into _hasil (uji, lulus) select 'UJI WAJIB: lunas tidak mengubah status barang (tetap confirmed)',
  (select status from public.orders where id = (select id from _id where k = 'o1')) = 'confirmed';
do $$ begin
  perform public.record_payment((select id from _id where k = 'o1'), null, 'tunai', (select tunai from _ctx), 1, null, true);
  insert into _hasil (uji, lulus) values ('pesanan lunas menolak pembayaran tambahan', false);
exception when others then insert into _hasil (uji, lulus) values ('pesanan lunas menolak pembayaran tambahan', true);
end $$;
select public.fulfill_order((select id from _id where k = 'o1'), null, null);
insert into _hasil (uji, lulus) select 'DEMO: serah → stok berkurang 5 kg, status bayar tetap lunas, piutang Rp0',
  (select status = 'delivered' and payment_status = 'paid' from public.orders where id = (select id from _id where k = 'o1'))
  and (select outstanding_rp from public.v_order_balance where order_id = (select id from _id where k = 'o1')) = 0;

-- ---------- pengeluaran & pemasukan lain ----------
insert into _k select 'e1', public.create_expense(null, 'upah', (select tunai from _ctx), 40000, 'Upah giling 2 hari', 'PRD-UJI');
insert into _hasil (uji, lulus) select 'pengeluaran: nomor EXP, satu kas keluar, saldo tunai 120.000 → 80.000',
  (select r ->> 'doc_number' from _k where k = 'e1') ~ '^EXP-'
  and (select count(*) from public.cash_transactions where source_type = 'expense' and source_id = ((select r ->> 'id' from _k where k = 'e1'))::uuid) = 1
  and (select balance_rp from public.cash_accounts where id = (select tunai from _ctx)) = 80000;
do $$ begin
  perform public.create_expense(null, 'upah', (select tunai from _ctx), 80001, 'Melebihi saldo', null);
  insert into _hasil (uji, lulus) values ('pengeluaran tidak boleh membuat saldo negatif (FR-CSH-08)', false);
exception when others then insert into _hasil (uji, lulus) values ('pengeluaran tidak boleh membuat saldo negatif (FR-CSH-08)', sqlerrm like '%tidak cukup%');
end $$;
do $$ begin
  perform public.create_expense(null, 'tidak_ada', (select tunai from _ctx), 1000, 'x', null);
  insert into _hasil (uji, lulus) values ('kategori pengeluaran tak dikenal ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('kategori pengeluaran tak dikenal ditolak', true);
end $$;
insert into _k select 'i1', public.create_other_income(null, 'iuran_anggota', (select tunai from _ctx), 15000, 'Iuran November');
insert into _hasil (uji, lulus) select 'pemasukan lain: nomor INC, satu kas masuk, saldo 95.000',
  (select r ->> 'doc_number' from _k where k = 'i1') ~ '^INC-'
  and (select balance_rp from public.cash_accounts where id = (select tunai from _ctx)) = 95000;

-- ---------- batal sesudah bayar → refund otomatis ----------
insert into _id select 'o2', public.save_order_draft(null, null, (select cust from _ctx), 'langsung', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select pk from _ctx), 'qty', '2')));
select public.confirm_order((select id from _id where k = 'o2'));
select public.record_payment((select id from _id where k = 'o2'), null, 'tunai', (select tunai from _ctx), 10000, null, true);
insert into _k select 'p4', public.record_payment((select id from _id where k = 'o2'), null, 'transfer', (select bank from _ctx), 1, 'pending saat batal', false);
do $$ begin
  perform public.cancel_order((select id from _id where k = 'o2'), 'Pelanggan batal', null);
  insert into _hasil (uji, lulus) values ('batal sesudah bayar wajib memilih akun refund', false);
exception when others then insert into _hasil (uji, lulus) values ('batal sesudah bayar wajib memilih akun refund', sqlerrm like '%refund%');
end $$;
insert into _k select 'x2', public.cancel_order((select id from _id where k = 'o2'), 'Pelanggan batal', (select tunai from _ctx));
insert into _hasil (uji, lulus) select 'batal sesudah bayar: refund RFD Rp10.000 (kas keluar sekali), status refunded, pending ditolak',
  (select r ->> 'refund_doc' from _k where k = 'x2') ~ '^RFD-'
  and (select status = 'cancelled' and payment_status = 'refunded' from public.orders where id = (select id from _id where k = 'o2'))
  and (select count(*) = 1 and sum(c.amount_rp) = 10000 from public.cash_transactions c join public.refunds f on f.id = c.source_id where c.source_type = 'refund' and f.order_id = (select id from _id where k = 'o2'))
  and (select status from public.payments where id = ((select r ->> 'id' from _k where k = 'p4'))::uuid) = 'rejected'
  and (select balance_rp from public.cash_accounts where id = (select tunai from _ctx)) = 95000;
do $$ begin
  perform public.create_refund((select id from _id where k = 'o2'), (select tunai from _ctx), 1, 'Refund kedua', null);
  insert into _hasil (uji, lulus) values ('refund melebihi pembayaran bersih ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('refund melebihi pembayaran bersih ditolak', sqlerrm like '%melebihi%');
end $$;

-- ---------- retur mengurangi tagihan; refund atas retur ----------
insert into _id select 'o3', public.save_order_draft(null, null, (select cust from _ctx), 'marketplace', null, 0, jsonb_build_array(jsonb_build_object('product_id', (select pk from _ctx), 'qty', '2')));
select public.confirm_order((select id from _id where k = 'o3'));
select public.fulfill_order((select id from _id where k = 'o3'), null, null);
select public.record_payment((select id from _id where k = 'o3'), null, 'transfer', (select bank from _ctx), 20000, null, true);
insert into _id select 'r3', public.create_return((select id from _id where k = 'o3'), null, 'Satu kilo lembap',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from _id where k = 'o3')), 'qty_kg', '1')));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
select public.verify_return((select id from _id where k = 'r3'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'retur terverifikasi mengurangi tagihan: tagihan Rp10.000, kelebihan bayar Rp10.000',
  (select bill_rp = 10000 and credit_rp = 10000 and outstanding_rp = 0 from public.v_order_balance where order_id = (select id from _id where k = 'o3'));
select public.create_refund((select id from _id where k = 'o3'), (select bank from _ctx), 10000, 'Refund retur lembap', null, (select id from _id where k = 'r3'));
insert into _hasil (uji, lulus) select 'refund atas retur: pembayaran bersih = tagihan → lunas, tanpa kelebihan',
  (select payment_status from public.orders where id = (select id from _id where k = 'o3')) = 'paid'
  and (select credit_rp = 0 and refunded_rp = 10000 from public.v_order_balance where order_id = (select id from _id where k = 'o3'));

-- ---------- koreksi kas (pengaju ≠ penyetuju) ----------
insert into _k select 'c1', public.request_cash_correction((select tunai from _ctx), 'in', 5000, 'Selisih hitung uang laci', null);
insert into _hasil (uji, lulus) select 'koreksi diajukan: nomor KAS, belum ada kas',
  (select r ->> 'doc_number' from _k where k = 'c1') ~ '^KAS-'
  and not exists (select 1 from public.cash_transactions where source_type = 'cash_correction' and source_id = ((select r ->> 'id' from _k where k = 'c1'))::uuid);
do $$ begin
  perform public.decide_cash_correction(((select r ->> 'id' from _k where k = 'c1'))::uuid, true, null);
  insert into _hasil (uji, lulus) values ('admin kelompok tidak bisa menyetujui koreksi kas', false);
exception when others then insert into _hasil (uji, lulus) values ('admin kelompok tidak bisa menyetujui koreksi kas', sqlstate = '42501');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
insert into _k select 'c2', public.request_cash_correction((select tunai from _ctx), 'out', 1000, 'Uang palsu ditemukan', null);
do $$ begin
  perform public.decide_cash_correction(((select r ->> 'id' from _k where k = 'c2'))::uuid, true, null);
  insert into _hasil (uji, lulus) values ('pemisahan tugas: akun rangkap tidak menyetujui koreksinya sendiri', false);
exception when others then insert into _hasil (uji, lulus) values ('pemisahan tugas: akun rangkap tidak menyetujui koreksinya sendiri', sqlerrm like '%sendiri%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
select public.decide_cash_correction(((select r ->> 'id' from _k where k = 'c1'))::uuid, true, null);
insert into _k select 'c1b', public.decide_cash_correction(((select r ->> 'id' from _k where k = 'c1'))::uuid, true, null);
insert into _hasil (uji, lulus) select 'ketua menyetujui koreksi: satu kas masuk Rp5.000 (setujui ulang aman)',
  (select (r ->> 'already')::boolean from _k where k = 'c1b')
  and (select count(*) from public.cash_transactions where source_type = 'cash_correction' and source_id = ((select r ->> 'id' from _k where k = 'c1'))::uuid) = 1
  and (select balance_rp from public.cash_accounts where id = (select tunai from _ctx)) = 100000;
do $$ begin
  perform public.decide_cash_correction(((select r ->> 'id' from _k where k = 'c2'))::uuid, false, '');
  insert into _hasil (uji, lulus) values ('tolak koreksi wajib alasan', false);
exception when others then insert into _hasil (uji, lulus) values ('tolak koreksi wajib alasan', true);
end $$;
select public.decide_cash_correction(((select r ->> 'id' from _k where k = 'c2'))::uuid, false, 'Bukti belum ada');
insert into _hasil (uji, lulus) select 'koreksi ditolak: tanpa kas',
  (select status from public.cash_corrections where id = ((select r ->> 'id' from _k where k = 'c2'))::uuid) = 'rejected'
  and not exists (select 1 from public.cash_transactions where source_id = ((select r ->> 'id' from _k where k = 'c2'))::uuid);
insert into _hasil (uji, lulus) select 'ketua dapat melihat kas & pembayaran', (select count(*) from public.payments where order_id = (select id from _id where k = 'o1')) = 3;
do $$ begin
  perform public.record_payment((select id from _id where k = 'o3'), null, 'tunai', (select tunai from _ctx), 1, null, true);
  insert into _hasil (uji, lulus) values ('ketua tidak mencatat pembayaran', false);
exception when others then insert into _hasil (uji, lulus) values ('ketua tidak mencatat pembayaran', sqlstate = '42501');
end $$;

-- =============== operator produksi: TIDAK BOLEH menyentuh pembayaran/kas (uji wajib SRS §11) ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'UJI WAJIB: operator tidak dapat melihat pembayaran, kas, pengeluaran (RLS)',
  (select count(*) from public.payments) = 0 and (select count(*) from public.cash_transactions) = 0
  and (select count(*) from public.expenses) = 0 and (select count(*) from public.cash_accounts) = 0;
do $$ declare v_n int := 0; begin
  begin perform public.record_payment((select id from _id where k = 'o3'), null, 'tunai', (select tunai from _ctx), 1, null, true); exception when others then if sqlstate = '42501' then v_n := v_n + 1; end if; end;
  begin perform public.verify_payment(((select r ->> 'id' from _k where k = 'p1'))::uuid); exception when others then if sqlstate = '42501' then v_n := v_n + 1; end if; end;
  begin perform public.create_expense(null, 'upah', (select tunai from _ctx), 1, 'x', null); exception when others then if sqlstate = '42501' then v_n := v_n + 1; end if; end;
  begin perform public.create_other_income(null, 'lainnya', (select tunai from _ctx), 1, 'x'); exception when others then if sqlstate = '42501' then v_n := v_n + 1; end if; end;
  begin perform public.create_refund((select id from _id where k = 'o3'), (select tunai from _ctx), 1, 'coba refund', null); exception when others then if sqlstate = '42501' then v_n := v_n + 1; end if; end;
  begin perform public.request_cash_correction((select tunai from _ctx), 'in', 1, 'coba koreksi', null); exception when others then if sqlstate = '42501' then v_n := v_n + 1; end if; end;
  begin perform public.set_opening_balance((select bank from _ctx), 1, null); exception when others then if sqlstate = '42501' then v_n := v_n + 1; end if; end;
  begin update public.cash_accounts set balance_rp = 999 where code = 'UJI_TUNAI'; if not found then v_n := v_n + 1; end if; exception when others then v_n := v_n + 1; end;
  insert into _hasil (uji, lulus) values ('UJI WAJIB: operator ditolak di semua fungsi pembayaran/kas (8/8)', v_n = 8);
end $$;

-- batch produksi dengan biaya tidak membuat kas (FR-CSH-10)
reset role;
select public._post_movement((select pp from _ctx), 'in', 10, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-UJI', (select hari_ini from _ctx), 40000);
create temp table _kas_sebelum_batch as select count(*) as n from public.cash_transactions;
grant select on _kas_sebelum_batch to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
insert into _id select 'b1', public.save_production_draft(null, 'penepungan', null, null, 0, array[6]::numeric[], array[5]::numeric[],
  '[{"category":"tenaga_kerja","amount_rp":6000,"source_ref":"EXP-UJI"}]'::jsonb);
select public.confirm_production((select id from _id where k = 'b1'));
insert into _hasil (uji, lulus) select 'UJI WAJIB: biaya batch (sudah dibayar lewat pengeluaran) tidak membuat kas kedua',
  (select count(*) from public.cash_transactions) = 0;   -- operator tidak melihat kas; dicek ulang sebagai postgres di bawah

-- =============== admin teknis: bukan pencatat transaksi ===============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d5","role":"authenticated"}', true);
do $$ begin
  perform public.create_expense(null, 'upah', (select tunai from _ctx), 1, 'x', null);
  insert into _hasil (uji, lulus) values ('admin teknis tidak dapat mencatat transaksi kas', false);
exception when others then insert into _hasil (uji, lulus) values ('admin teknis tidak dapat mencatat transaksi kas', sqlstate = '42501');
end $$;

-- ---------- kunci DB & konsistensi ----------
reset role;
update _hasil set lulus = lulus and (select count(*) from public.cash_transactions) = (select n from _kas_sebelum_batch)
 where uji like 'UJI WAJIB: biaya batch%';
do $$ begin
  update public.cash_transactions set amount_rp = 1 where account_id = (select tunai from _ctx);
  insert into _hasil (uji, lulus) values ('buku kas append-only (UPDATE ditolak)', false);
exception when others then insert into _hasil (uji, lulus) values ('buku kas append-only (UPDATE ditolak)', true);
end $$;
do $$ begin
  insert into public.cash_transactions (account_id, direction, amount_rp, balance_after_rp, source_type, source_id, business_date)
  values ((select tunai from _ctx), 'in', 30000, 0, 'payment', ((select r ->> 'id' from _k where k = 'p1'))::uuid, (select hari_ini from _ctx));
  insert into _hasil (uji, lulus) values ('UNIQUE (source_type, source_id): kas kedua untuk pembayaran yang sama ditolak DB', false);
exception when others then insert into _hasil (uji, lulus) values ('UNIQUE (source_type, source_id): kas kedua untuk pembayaran yang sama ditolak DB', sqlstate = '23505');
end $$;
do $$ begin
  insert into public.cash_transactions (account_id, direction, amount_rp, balance_after_rp, source_type, source_id, business_date)
  values ((select tunai from _ctx), 'out', 1, 0, 'production_batch', gen_random_uuid(), (select hari_ini from _ctx));
  insert into _hasil (uji, lulus) values ('sumber kas selain 6 jenis sah (mis. batch) ditolak DB', false);
exception when others then insert into _hasil (uji, lulus) values ('sumber kas selain 6 jenis sah (mis. batch) ditolak DB', sqlstate = '23514');
end $$;
do $$ begin
  update public.payments set amount_rp = 1 where id = ((select r ->> 'id' from _k where k = 'p1'))::uuid;
  insert into _hasil (uji, lulus) values ('pembayaran terverifikasi terkunci', false);
exception when others then insert into _hasil (uji, lulus) values ('pembayaran terverifikasi terkunci', sqlerrm like '%terkunci%');
end $$;
insert into _hasil (uji, lulus) select 'saldo akun = Σ masuk − Σ keluar = saldo setelah baris terakhir (akun uji)',
  bool_and(a.balance_rp = coalesce((select sum(case when c.direction = 'in' then c.amount_rp else -c.amount_rp end) from public.cash_transactions c where c.account_id = a.id), 0)
           and a.balance_rp = coalesce((select c.balance_after_rp from public.cash_transactions c where c.account_id = a.id order by c.id desc limit 1), 0))
  from public.cash_accounts a where a.code like 'UJI_%';
insert into _hasil (uji, lulus) select 'rumus kas: tunai = awal 100.000 + bayar 30.000 + lain 15.000 − keluar 40.000 − refund 10.000 + koreksi 5.000 = 100.000; bank = 30.000 + 20.000 − refund 10.000',
  (select balance_rp from public.cash_accounts where code = 'UJI_TUNAI') = 100000
  and (select balance_rp from public.cash_accounts where code = 'UJI_BANK') = 30000 + 20000 - 10000;
insert into _hasil (uji, lulus) select 'audit: pembayaran, verifikasi, tolak, refund, pengeluaran, pemasukan, koreksi tercatat',
  (select count(distinct action) from public.audit_logs where action in ('payment.recorded', 'payment.verified', 'payment.rejected', 'refund.created',
     'expense.created', 'other_income.created', 'cash_correction.requested', 'cash_correction.approved', 'cash_correction.rejected', 'cash.opening_set')
     and at >= now() - interval '1 hour' and user_id::text like '00000000-0000-4000-8000-0000000000d%') = 10;

do $$
declare v_ok int; v_fail int; v_list text;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus),
         string_agg(case when lulus then 'lulus  ' else 'GAGAL  ' end || uji, E'\n' order by no)
    into v_ok, v_fail, v_list from _hasil;
  raise exception E'HASIL UJI: % lulus, % gagal (transaksi sengaja dibatalkan; tidak ada data uji tersimpan)\n%', v_ok, v_fail, v_list;
end $$;
rollback;
