-- =====================================================================
-- Bootstrap admin teknis PERTAMA (sekali saja, di Supabase → SQL Editor).
-- 1. Buat akun di Supabase → Authentication → Users → Add user (email + kata sandi Anda sendiri,
--    centang "Auto Confirm User").
-- 2. Ganti email & nama di bawah, lalu Run.
-- Admin teknis berikutnya dan semua pengurus lain dibuat dari aplikasi (/pengaturan/akun).
-- =====================================================================
do $$
declare
  v_email text := 'GANTI_EMAIL@contoh.com';
  v_name  text := 'Tim STI';
  v_id    uuid;
begin
  select id into v_id from public.profiles where lower(email) = lower(v_email);
  if v_id is null then
    raise exception 'Akun % belum ada. Buat dulu di Authentication → Users → Add user.', v_email;
  end if;

  update public.profiles set full_name = v_name, is_active = true where id = v_id;
  insert into public.user_roles (user_id, role) values (v_id, 'admin_teknis') on conflict do nothing;

  insert into public.audit_logs (user_id, actor_name, action, entity, entity_id, after, reason)
  values (null, 'SQL Editor (bootstrap)', 'user.roles_changed', 'user', v_id::text,
          public.user_access_snapshot(v_id), 'Bootstrap admin teknis pertama');

  raise notice 'Selesai: % sekarang admin teknis.', v_email;
end $$;
