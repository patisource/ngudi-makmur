-- =====================================================================
-- Uji RBAC & RLS M1 (T1.7) — jalankan di Supabase → SQL Editor (atau psql) sebagai postgres.
-- Membuat pengguna uji sementara, berpura-pura menjadi tiap peran (role authenticated + klaim JWT),
-- lalu SELALU dibatalkan di akhir: hasil ditampilkan sebagai pesan galat "HASIL UJI ..." dan
-- tidak ada data uji yang tersimpan. Gagal = ada baris "GAGAL" di pesan tersebut.
-- =====================================================================
begin;

create temp table _hasil (no serial primary key, uji text not null, lulus boolean not null) on commit drop;
grant all on _hasil to authenticated, anon;
grant usage on sequence _hasil_no_seq to authenticated, anon;

-- Pengguna uji (profil dibuat otomatis oleh trigger on_auth_user_created)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.admin@contoh.test',    '{"full_name":"Uji Admin Kelompok"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.operator@contoh.test', '{"full_name":"Uji Operator"}',       now(), now()),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.ketua@contoh.test',    '{"full_name":"Uji Ketua"}',          now(), now()),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.teknis@contoh.test',   '{"full_name":"Uji Teknis"}',         now(), now()),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'uji.nonaktif@contoh.test', '{"full_name":"Uji Nonaktif"}',       now(), now());

insert into _hasil (uji, lulus)
select 'trigger membuat profil untuk 5 akun baru', count(*) = 5 from public.profiles where email like 'uji.%@contoh.test';

insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin_kelompok'),
  ('00000000-0000-4000-8000-0000000000a2', 'operator_produksi'),
  ('00000000-0000-4000-8000-0000000000a3', 'ketua'),
  ('00000000-0000-4000-8000-0000000000a4', 'admin_teknis'),
  ('00000000-0000-4000-8000-0000000000a5', 'admin_kelompok');
insert into public.user_permissions (user_id, permission) values ('00000000-0000-4000-8000-0000000000a2', 'production.confirm');
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-0000000000a5';

-- ---------- sebagai OPERATOR PRODUKSI ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

insert into _hasil (uji, lulus) select 'operator: has_role(operator_produksi) = true', public.has_role('operator_produksi');
insert into _hasil (uji, lulus) select 'operator: has_role(admin_kelompok) = false', not public.has_role('admin_kelompok');
insert into _hasil (uji, lulus) select 'operator: has_permission(production.confirm) = true', public.has_permission('production.confirm');
insert into _hasil (uji, lulus) select 'operator: hanya melihat profil sendiri', (select count(*) from public.profiles) = 1;
insert into _hasil (uji, lulus) select 'operator: tidak bisa membaca log audit', (select count(*) from public.audit_logs) = 0;
do $$ begin
  insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000a2', 'admin_kelompok');
  insert into _hasil (uji, lulus) values ('operator: menambah peran sendiri ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('operator: menambah peran sendiri ditolak', true);
end $$;
do $$ begin
  perform public.admin_set_roles('00000000-0000-4000-8000-0000000000a2', array['admin_kelompok']::public.app_role[]);
  insert into _hasil (uji, lulus) values ('operator: admin_set_roles ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('operator: admin_set_roles ditolak', true);
end $$;
do $$ begin
  update public.profiles set full_name = 'Diubah' where id = '00000000-0000-4000-8000-0000000000a2';
  insert into _hasil (uji, lulus) values ('operator: ubah profil langsung ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('operator: ubah profil langsung ditolak', true);
end $$;

-- ---------- sebagai ADMIN KELOMPOK ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin kelompok: hanya melihat profil sendiri', (select count(*) from public.profiles) = 1;
insert into _hasil (uji, lulus) select 'admin kelompok: tidak bisa membaca log audit', (select count(*) from public.audit_logs) = 0;
do $$ begin
  perform public.admin_set_active('00000000-0000-4000-8000-0000000000a2', false, 'uji');
  insert into _hasil (uji, lulus) values ('admin kelompok: menonaktifkan akun ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('admin kelompok: menonaktifkan akun ditolak', true);
end $$;

-- ---------- sebagai KETUA ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'ketua: melihat semua profil uji', (select count(*) from public.profiles where email like 'uji.%@contoh.test') = 5;
do $$ begin
  perform public.admin_set_roles('00000000-0000-4000-8000-0000000000a1', array['ketua']::public.app_role[]);
  insert into _hasil (uji, lulus) values ('ketua: mengubah peran ditolak (hanya admin teknis)', false);
exception when others then
  insert into _hasil (uji, lulus) values ('ketua: mengubah peran ditolak (hanya admin teknis)', true);
end $$;

-- ---------- sebagai AKUN NONAKTIF ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'akun nonaktif: has_role = false walau punya peran', not public.has_role('admin_kelompok');

-- ---------- sebagai ADMIN TEKNIS ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
insert into _hasil (uji, lulus) select 'admin teknis: melihat semua profil uji', (select count(*) from public.profiles where email like 'uji.%@contoh.test') = 5;
do $$
declare v jsonb;
begin
  v := public.admin_set_roles('00000000-0000-4000-8000-0000000000a1', array['admin_kelompok', 'operator_produksi']::public.app_role[], 'uji rangkap');
  insert into _hasil (uji, lulus) values ('admin teknis: menambah operator → production.confirm otomatis', v -> 'permissions' ? 'production.confirm');
  v := public.admin_set_roles('00000000-0000-4000-8000-0000000000a1', array['admin_kelompok']::public.app_role[], 'uji cabut');
  insert into _hasil (uji, lulus) values ('admin teknis: mencabut operator → production.confirm ikut dicabut', not (v -> 'permissions' ? 'production.confirm'));
  v := public.admin_set_permission('00000000-0000-4000-8000-0000000000a2', 'production.confirm', false, 'uji cabut izin');
  insert into _hasil (uji, lulus) values ('admin teknis: mencabut izin konfirmasi batch', not (v -> 'permissions' ? 'production.confirm'));
  v := public.admin_set_active('00000000-0000-4000-8000-0000000000a2', false, 'uji nonaktif');
  insert into _hasil (uji, lulus) values ('admin teknis: menonaktifkan akun', (v ->> 'is_active')::boolean = false);
end $$;
insert into _hasil (uji, lulus) select 'admin teknis: perubahan tercatat di log audit (≥ 4 baris)',
  (select count(*) from public.audit_logs where entity = 'user' and entity_id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2')) >= 4;
do $$ begin
  perform public.admin_set_active('00000000-0000-4000-8000-0000000000a4', false, 'uji');
  insert into _hasil (uji, lulus) values ('admin teknis: menonaktifkan akun sendiri ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('admin teknis: menonaktifkan akun sendiri ditolak', true);
end $$;
do $$ begin
  perform public.admin_set_active('00000000-0000-4000-8000-0000000000a1', false, '   ');
  insert into _hasil (uji, lulus) values ('admin teknis: nonaktif tanpa alasan ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('admin teknis: nonaktif tanpa alasan ditolak', true);
end $$;
do $$ begin
  perform public.write_audit('palsu', 'user', 'x');
  insert into _hasil (uji, lulus) values ('klien tidak bisa memanggil write_audit langsung', false);
exception when others then
  insert into _hasil (uji, lulus) values ('klien tidak bisa memanggil write_audit langsung', true);
end $$;

-- ---------- sebagai ANON (tanpa login) ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform count(*) from public.profiles;
  insert into _hasil (uji, lulus) values ('anon: membaca profil ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('anon: membaca profil ditolak', true);
end $$;
do $$ begin
  perform public.has_role('admin_teknis');
  insert into _hasil (uji, lulus) values ('anon: memanggil has_role ditolak', false);
exception when others then
  insert into _hasil (uji, lulus) values ('anon: memanggil has_role ditolak', true);
end $$;

-- ---------- log audit append-only, bahkan untuk postgres ----------
reset role;
do $$ begin
  update public.audit_logs set action = 'diubah' where entity_id = '00000000-0000-4000-8000-0000000000a2';
  insert into _hasil (uji, lulus) values ('log audit: UPDATE ditolak (append-only)', false);
exception when others then
  insert into _hasil (uji, lulus) values ('log audit: UPDATE ditolak (append-only)', true);
end $$;

-- ---------- ringkasan; transaksi SENGAJA dibatalkan agar data uji tidak tersimpan ----------
do $$
declare
  v_ok int; v_fail int; v_list text;
begin
  select count(*) filter (where lulus), count(*) filter (where not lulus),
         string_agg(case when lulus then 'lulus  ' else 'GAGAL  ' end || uji, E'\n' order by no)
    into v_ok, v_fail, v_list from _hasil;
  raise exception E'HASIL UJI: % lulus, % gagal (transaksi sengaja dibatalkan; tidak ada data uji tersimpan)\n%', v_ok, v_fail, v_list;
end $$;
rollback;
