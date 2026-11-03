-- =====================================================================
-- Ganti kata sandi sendiri (FR-AUTH, Security.md §3): setiap pengguna aktif boleh mengganti kata sandinya sendiri.
-- Kata sandi diubah lewat Supabase Auth (tidak pernah disimpan/dicatat di sini); yang dicatat hanya kejadiannya.
-- =====================================================================

create or replace function public.log_auth_event(p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Tidak ada sesi' using errcode = '42501';
  end if;
  if p_action not in ('auth.login', 'auth.logout', 'auth.password_changed') then
    raise exception 'Aksi audit tidak dikenal' using errcode = '22023';
  end if;
  perform public.write_audit(p_action, 'user', (select auth.uid())::text);
end;
$$;
