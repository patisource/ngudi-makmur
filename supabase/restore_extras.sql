-- =====================================================================
-- Pelengkap restore (T9.8, docs/Operasional.md §2). Jalankan SESUDAH roles.sql → schema.sql → data.sql.
--
-- `supabase db dump` hanya membawa skema aplikasi (public). Objek milik aplikasi yang menempel di skema bawaan Supabase
-- (auth, storage) TIDAK ikut, sehingga proyek hasil restore tampak lengkap tetapi:
--   - akun baru tidak mendapat profil/peran (trigger on_auth_user_created di auth.users hilang);
--   - bukti foto tidak bisa diunggah/dibuka (bucket `proofs` dan policy storage.objects hilang).
-- Skrip ini memasang ulang ketiganya, sama persis dengan migrasi 20261101120000, 20261101150000, 20261103180000.
-- Aman dijalankan berulang. Ditemukan saat uji restore 5 Nov 2026.
-- =====================================================================
begin;

-- 1. Profil otomatis untuk akun Auth baru (fungsi public.handle_new_user sudah ada dari schema.sql)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Akun yang terpulihkan tanpa profil (mis. baris profil gagal masuk) ikut dibuatkan.
insert into public.profiles (id, full_name, email)
select u.id, coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)), coalesce(u.email, '')
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);

-- 2. Bucket privat bukti (foto/PDF maks. 5 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 3. Policy storage.objects untuk bukti jagung masuk & bukti transfer
drop policy if exists proofs_receipts_insert on storage.objects;
drop policy if exists proofs_receipts_select on storage.objects;
drop policy if exists proofs_receipts_delete on storage.objects;
drop policy if exists proofs_payments_insert on storage.objects;
drop policy if exists proofs_payments_select on storage.objects;
drop policy if exists proofs_payments_delete on storage.objects;

create policy proofs_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and name ~ '^receipts/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$' and public.has_role('admin_kelompok'));
create policy proofs_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and name like 'receipts/%'
         and (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua')));
create policy proofs_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and name like 'receipts/%' and public.has_role('admin_kelompok')
         and not exists (select 1 from public.attachments a where a.storage_path = storage.objects.name));
create policy proofs_payments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and name ~ '^payments/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$' and public.has_role('admin_kelompok'));
create policy proofs_payments_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and name like 'payments/%' and (public.has_role('admin_kelompok') or public.has_role('ketua')));
create policy proofs_payments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and name like 'payments/%' and public.has_role('admin_kelompok')
         and not exists (select 1 from public.attachments a where a.storage_path = storage.objects.name));

commit;

-- Pemeriksaan: harus 1 trigger, 1 bucket, 6 policy.
select (select count(*) from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) as trigger_profil,
       (select count(*) from storage.buckets where id = 'proofs') as bucket_proofs,
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'proofs_%') as policy_storage;
