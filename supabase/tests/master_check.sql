-- =====================================================================
-- Uji master data M2 (T2.1–T2.7) — jalankan di Supabase → SQL Editor sebagai postgres.
-- Pola sama dengan rbac_check.sql: pengguna uji sementara, berpura-pura per peran, lalu SELALU dibatalkan.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
grant all on _hasil to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m2.admin@contoh.test',    '{"full_name":"Uji Admin"}',    now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m2.operator@contoh.test', '{"full_name":"Uji Operator"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m2.ketua@contoh.test',    '{"full_name":"Uji Ketua"}',    now(), now()),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.m2.teknis@contoh.test',   '{"full_name":"Uji Teknis"}',   now(), now());
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000b1', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000b2', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000b3', 'ketua'),
  ('00000000-0000-4000-8000-0000000000b4', 'admin_teknis');

-- ---------- data dasar (sebagai postgres) ----------
insert into _hasil (uji, lulus) select 'data dasar: produk TK, PP, TP semuanya kg',
  (select count(*) from public.products where code in ('TK', 'PP', 'TP') and base_unit = 'kg') = 3;
insert into _hasil (uji, lulus) select 'data dasar: TK & PP mentah, TP olahan',
  (select string_agg(code || '=' || category, ',' order by code) from public.products where code in ('TK', 'PP', 'TP')) = 'PP=mentah,TK=mentah,TP=olahan';
insert into _hasil (uji, lulus) select 'data dasar: kemasan TP pak 0,5 & 1 kg, PP karung 50 kg',
  (select count(*) from public.product_packagings pp join public.products p on p.id = pp.product_id
   where (p.code, pp.content_kg) in (('TP', 0.5), ('TP', 1.0), ('PP', 50.0))) = 3;
insert into _hasil (uji, lulus) select 'data dasar: pemipilan TK→PP, penepungan PP→TP',
  (select string_agg(r.batch_type || ':' || i.code || '>' || o.code, ',' order by r.batch_type) from public.batch_type_rules r
   join public.products i on i.id = r.input_product_id join public.products o on o.id = r.output_product_id) = 'pemipilan:TK>PP,penepungan:PP>TP';
insert into _hasil (uji, lulus) select 'data dasar: 5 saluran, 3 digital (WA, media sosial, marketplace)',
  (select count(*) from public.sales_channels) = 5 and (select string_agg(code, ',' order by code) from public.sales_channels where is_digital) = 'marketplace,media_sosial,whatsapp';
insert into _hasil (uji, lulus) select 'konversi: 2 × pak 0,5 kg = 1 kg',
  public.packaging_qty_kg((select pp.id from public.product_packagings pp join public.products p on p.id = pp.product_id where p.code = 'TP' and pp.content_kg = 0.5), 2) = 1.000;
do $$ begin
  insert into public.product_packagings (product_id, packaging_id, content_kg)
  select p.id, k.id, 0 from public.products p, public.packagings k where p.code = 'TP' and k.name = 'Pak';
  insert into _hasil (uji, lulus) values ('konversi: isi 0 kg ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('konversi: isi 0 kg ditolak', true);
end $$;

-- ---------- sebagai ADMIN KELOMPOK ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);

do $$
declare v_id uuid; v_code text;
begin
  insert into public.members (name, hamlet) values ('Uji Petani', 'Dusun Uji') returning id, code into v_id, v_code;
  insert into _hasil (uji, lulus) values ('admin: tambah anggota, kode otomatis A-…', v_code ~ '^A-\d{3,}$');
  insert into public.member_contacts (member_id, nik, phone) values (v_id, '3318011234560001', '081234560001');
  insert into _hasil (uji, lulus) select 'admin: NIK & HP tersamar otomatis di members',
    nik_masked = '3318********0001' and phone_masked = '0812****0001' from public.members where id = v_id;
end $$;
do $$ begin
  update public.members set code = 'X-999' where name = 'Uji Petani';
  insert into _hasil (uji, lulus) values ('admin: mengubah kode anggota ditolak (kolom terkunci)', false);
exception when others then insert into _hasil (uji, lulus) values ('admin: mengubah kode anggota ditolak (kolom terkunci)', true);
end $$;
do $$ begin
  insert into public.member_contacts (member_id, nik) select id, '123' from public.members where name = 'Uji Petani'
  on conflict (member_id) do update set nik = excluded.nik;
  insert into _hasil (uji, lulus) values ('admin: NIK bukan 16 digit ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('admin: NIK bukan 16 digit ditolak', true);
end $$;
do $$ begin
  update public.products set default_price_per_kg = 10000, min_stock_kg = 30 where code = 'TP';
  insert into _hasil (uji, lulus) select 'admin: ubah harga & stok minimum produk', default_price_per_kg = 10000 from public.products where code = 'TP';
end $$;
do $$ begin
  update public.products set code = 'TX' where code = 'TP';
  insert into _hasil (uji, lulus) values ('admin: mengubah kode produk ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('admin: mengubah kode produk ditolak', true);
end $$;
do $$ begin
  insert into public.products (code, name, category) values ('MJ', 'Mie jagung', 'olahan');
  insert into _hasil (uji, lulus) values ('admin: menambah produk baru dari aplikasi ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('admin: menambah produk baru dari aplikasi ditolak', true);
end $$;
do $$ begin
  update public.product_packagings set content_kg = 2 where content_kg = 0.5;
  insert into _hasil (uji, lulus) values ('admin: mengubah isi kg konversi ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('admin: mengubah isi kg konversi ditolak', true);
end $$;
do $$ declare v_code text; begin
  insert into public.customers (name, type, phone) values ('Uji IRT', 'usaha', '081299990000') returning code into v_code;
  insert into _hasil (uji, lulus) values ('admin: tambah pelanggan usaha, kode PLG-…', v_code ~ '^PLG-\d{3,}$');
end $$;
do $$ begin
  update public.members set archived_at = now() where name = 'Uji Petani';
  insert into _hasil (uji, lulus) select 'admin: arsip anggota (tidak dihapus)', archived_at is not null from public.members where name = 'Uji Petani';
end $$;
do $$ begin
  delete from public.members where name = 'Uji Petani';
  insert into _hasil (uji, lulus) select 'admin: menghapus anggota tidak berefek/ditolak', exists (select 1 from public.members where name = 'Uji Petani');
exception when others then insert into _hasil (uji, lulus) values ('admin: menghapus anggota tidak berefek/ditolak', true);
end $$;

-- ---------- sebagai OPERATOR PRODUKSI ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'operator: melihat anggota & produk', (select count(*) from public.members where name = 'Uji Petani') = 1 and (select count(*) from public.products) >= 3;
insert into _hasil (uji, lulus) select 'operator: NIK/HP asli tidak terbaca (hanya tersamar)', (select count(*) from public.member_contacts) = 0
  and (select nik_masked from public.members where name = 'Uji Petani') = '3318********0001';
insert into _hasil (uji, lulus) select 'operator: tidak melihat pelanggan & saluran', (select count(*) from public.customers) = 0 and (select count(*) from public.sales_channels) = 0;
insert into _hasil (uji, lulus) select 'operator: melihat aturan jenis batch', (select count(*) from public.batch_type_rules) = 2;
do $$ begin
  insert into public.members (name) values ('Dari Operator');
  insert into _hasil (uji, lulus) values ('operator: menambah anggota ditolak', false);
exception when others then insert into _hasil (uji, lulus) values ('operator: menambah anggota ditolak', true);
end $$;
do $$ begin
  update public.products set default_price_per_kg = 1 where code = 'TP';
  insert into _hasil (uji, lulus) select 'operator: mengubah harga produk tidak berefek', default_price_per_kg = 10000 from public.products where code = 'TP';
exception when others then insert into _hasil (uji, lulus) values ('operator: mengubah harga produk tidak berefek', true);
end $$;

-- ---------- sebagai KETUA ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'ketua: melihat NIK/HP asli & pelanggan', (select count(*) from public.member_contacts mc join public.members m on m.id = mc.member_id where m.name = 'Uji Petani') = 1
  and (select count(*) from public.customers where name = 'Uji IRT') = 1;
do $$ begin
  insert into public.customers (name) values ('Dari Ketua');
  insert into _hasil (uji, lulus) values ('ketua: menambah pelanggan ditolak (hanya lihat)', false);
exception when others then insert into _hasil (uji, lulus) values ('ketua: menambah pelanggan ditolak (hanya lihat)', true);
end $$;

-- ---------- sebagai ADMIN TEKNIS ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin teknis: tidak melihat data usaha (anggota, produk, pelanggan)',
  (select count(*) from public.members) = 0 and (select count(*) from public.products) = 0 and (select count(*) from public.customers) = 0;
insert into _hasil (uji, lulus) select 'audit: tambah/arsip anggota & pelanggan tercatat',
  (select count(*) from public.audit_logs where action in ('members.created', 'members.archived', 'customers.created') and actor_name = 'Uji Admin') >= 3;
insert into _hasil (uji, lulus) select 'audit: NIK asli tidak pernah tersimpan di log (hanya tersamar)',
  not exists (select 1 from public.audit_logs where after::text like '%3318011234560001%' or before::text like '%3318011234560001%');

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
