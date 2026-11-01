-- =====================================================================
-- M1 — Autentikasi & RBAC (T1.1, T1.6)
-- Peran (PRD §3), izin tambahan production.confirm, profil pengguna, log audit append-only,
-- fungsi pembantu has_role()/has_permission(), RLS, dan fungsi admin_teknis untuk mengelola akun.
-- Semua penulisan peran/izin/status akun lewat fungsi security definer; tidak ada policy tulis langsung.
-- =====================================================================

-- ---------- tipe ----------
create type public.app_role as enum ('admin_kelompok', 'operator_produksi', 'ketua', 'admin_teknis');
create type public.app_permission as enum ('production.confirm');

-- ---------- tabel ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  email       text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Pengguna (pengurus). Kata sandi di Supabase Auth. Diarsip lewat is_active, tidak dihapus.';

create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references public.profiles (id),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

create table public.user_permissions (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  permission  public.app_permission not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references public.profiles (id),
  primary key (user_id, permission)
);

-- Log audit (Security.md §10): append-only. user_id sengaja tanpa FK agar riwayat tetap utuh;
-- nama pelaku disalin saat kejadian.
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  actor_name  text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  ip          inet,
  user_agent  text,
  request_id  text
);
create index audit_logs_at_idx on public.audit_logs (at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- ---------- RLS: aktif di semua tabel; tanpa policy = tanpa akses ----------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.audit_logs enable row level security;

-- Pertahanan berlapis: tulis langsung dicabut; satu-satunya jalan tulis adalah fungsi di bawah.
revoke all on public.profiles, public.user_roles, public.user_permissions, public.audit_logs from anon;
revoke insert, update, delete, truncate on public.profiles, public.user_roles, public.user_permissions, public.audit_logs from authenticated;
grant select on public.profiles, public.user_roles, public.user_permissions, public.audit_logs to authenticated;

-- ---------- trigger umum ----------
create function public.prevent_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Tabel % hanya boleh ditambah; ubah/hapus ditolak', tg_table_name using errcode = 'P0001';
end;
$$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.prevent_mutation();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Profil dibuat otomatis saat akun Auth dibuat (oleh admin_teknis atau dashboard Supabase).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Akun yang sudah ada sebelum migrasi ini (mis. dibuat dari dashboard) ikut mendapat profil.
insert into public.profiles (id, full_name, email)
select u.id, coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)), coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- ---------- fungsi pembantu (Security.md §4.2) ----------
create function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role = r and p.is_active
  );
$$;

create function public.has_permission(perm public.app_permission) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_permissions up
    join public.profiles p on p.id = up.user_id
    where up.user_id = (select auth.uid()) and up.permission = perm and p.is_active
  );
$$;

-- Pencatat audit internal (dipanggil fungsi lain; tidak di-grant ke klien).
create function public.write_audit(
  p_action text, p_entity text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null, p_reason text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (user_id, actor_name, action, entity, entity_id, before, after, reason)
  values (
    (select auth.uid()),
    (select p.full_name from public.profiles p where p.id = (select auth.uid())),
    p_action, p_entity, p_entity_id, p_before, p_after, nullif(btrim(p_reason), '')
  );
$$;

-- Ringkasan peran & izin satu pengguna (untuk before/after audit).
create function public.user_access_snapshot(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'full_name', p.full_name,
    'is_active', p.is_active,
    'roles', coalesce((select jsonb_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = p.id), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(up.permission order by up.permission) from public.user_permissions up where up.user_id = p.id), '[]'::jsonb)
  )
  from public.profiles p where p.id = p_user;
$$;

-- ---------- event autentikasi dari aplikasi (login/logout) ----------
create function public.log_auth_event(p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Tidak ada sesi' using errcode = '42501';
  end if;
  if p_action not in ('auth.login', 'auth.logout') then
    raise exception 'Aksi audit tidak dikenal' using errcode = '22023';
  end if;
  perform public.write_audit(p_action, 'user', (select auth.uid())::text);
end;
$$;

-- ---------- fungsi admin_teknis (T1.5) ----------
-- Pengecekan bersama: pemanggil harus admin_teknis aktif.
create function public.assert_admin_teknis() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('admin_teknis') then
    raise exception 'Hanya admin teknis yang boleh mengelola akun' using errcode = '42501';
  end if;
end;
$$;

-- Jumlah admin_teknis aktif selain p_user: mencegah sistem terkunci tanpa admin teknis.
create function public.other_active_admins(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.user_roles ur join public.profiles p on p.id = ur.user_id
  where ur.role = 'admin_teknis' and p.is_active and ur.user_id <> p_user;
$$;

-- Set peran lengkap seorang pengguna. operator_produksi otomatis mendapat production.confirm (PRD §3.1, Q11);
-- izin itu ikut dicabut bila peran operator dicabut.
create function public.admin_set_roles(p_user uuid, p_roles public.app_role[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_had_operator boolean;
begin
  perform public.assert_admin_teknis();
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'Minimal satu peran' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Pengguna tidak ditemukan' using errcode = 'P0002';
  end if;
  if not ('admin_teknis' = any (p_roles))
     and exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_teknis')
     and public.other_active_admins(p_user) = 0 then
    raise exception 'Tidak boleh mencabut admin teknis terakhir' using errcode = 'P0001';
  end if;

  perform 1 from public.profiles where id = p_user for update;
  v_before := public.user_access_snapshot(p_user);
  v_had_operator := exists (select 1 from public.user_roles where user_id = p_user and role = 'operator_produksi');

  delete from public.user_roles where user_id = p_user and not (role = any (p_roles));
  insert into public.user_roles (user_id, role, granted_by)
  select p_user, r, (select auth.uid()) from unnest(p_roles) as r
  on conflict (user_id, role) do nothing;

  if 'operator_produksi' = any (p_roles) and not v_had_operator then
    insert into public.user_permissions (user_id, permission, granted_by)
    values (p_user, 'production.confirm', (select auth.uid()))
    on conflict (user_id, permission) do nothing;
  elsif not ('operator_produksi' = any (p_roles)) then
    delete from public.user_permissions where user_id = p_user and permission = 'production.confirm';
  end if;

  v_after := public.user_access_snapshot(p_user);
  if v_before is distinct from v_after then
    perform public.write_audit('user.roles_changed', 'user', p_user::text, v_before, v_after, p_reason);
  end if;
  return v_after;
end;
$$;

create function public.admin_set_permission(p_user uuid, p_permission public.app_permission, p_granted boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.assert_admin_teknis();
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Pengguna tidak ditemukan' using errcode = 'P0002';
  end if;
  perform 1 from public.profiles where id = p_user for update;
  v_before := public.user_access_snapshot(p_user);
  if p_granted then
    insert into public.user_permissions (user_id, permission, granted_by)
    values (p_user, p_permission, (select auth.uid()))
    on conflict (user_id, permission) do nothing;
  else
    delete from public.user_permissions where user_id = p_user and permission = p_permission;
  end if;
  v_after := public.user_access_snapshot(p_user);
  if v_before is distinct from v_after then
    perform public.write_audit('user.permission_changed', 'user', p_user::text, v_before, v_after, p_reason);
  end if;
  return v_after;
end;
$$;

-- Aktif/nonaktif akun. Pencabutan sesi (ban di Supabase Auth) dilakukan server setelah fungsi ini berhasil.
create function public.admin_set_active(p_user uuid, p_active boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.assert_admin_teknis();
  if p_user = (select auth.uid()) and not p_active then
    raise exception 'Tidak boleh menonaktifkan akun sendiri' using errcode = 'P0001';
  end if;
  if not p_active and nullif(btrim(p_reason), '') is null then
    raise exception 'Alasan wajib diisi' using errcode = '22023';
  end if;
  if not p_active
     and exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_teknis')
     and public.other_active_admins(p_user) = 0 then
    raise exception 'Tidak boleh menonaktifkan admin teknis terakhir' using errcode = 'P0001';
  end if;
  select public.user_access_snapshot(p_user) into v_before;
  if v_before is null then
    raise exception 'Pengguna tidak ditemukan' using errcode = 'P0002';
  end if;
  update public.profiles set is_active = p_active where id = p_user;
  v_after := public.user_access_snapshot(p_user);
  if v_before is distinct from v_after then
    perform public.write_audit(case when p_active then 'user.activated' else 'user.deactivated' end, 'user', p_user::text, v_before, v_after, p_reason);
  end if;
  return v_after;
end;
$$;

-- Melengkapi akun baru (dibuat server lewat Admin API): nama + peran awal, tercatat sebagai user.created.
create function public.admin_register_user(p_user uuid, p_full_name text, p_roles public.app_role[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_after jsonb;
begin
  perform public.assert_admin_teknis();
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'Minimal satu peran' using errcode = '22023';
  end if;
  update public.profiles set full_name = btrim(p_full_name) where id = p_user;
  if not found then
    raise exception 'Pengguna tidak ditemukan' using errcode = 'P0002';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  select p_user, r, (select auth.uid()) from unnest(p_roles) as r
  on conflict (user_id, role) do nothing;
  if 'operator_produksi' = any (p_roles) then
    insert into public.user_permissions (user_id, permission, granted_by)
    values (p_user, 'production.confirm', (select auth.uid()))
    on conflict (user_id, permission) do nothing;
  end if;
  v_after := public.user_access_snapshot(p_user);
  perform public.write_audit('user.created', 'user', p_user::text, null, v_after, null);
  return v_after;
end;
$$;

-- Kata sandi diganti server lewat Admin API (PRD Q13: pengurus tanpa email); fungsi ini hanya mencatatnya.
create function public.admin_note_password_reset(p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin_teknis();
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Pengguna tidak ditemukan' using errcode = 'P0002';
  end if;
  perform public.write_audit('user.password_reset', 'user', p_user::text, null, null, p_reason);
end;
$$;

-- ---------- hak eksekusi fungsi ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.has_role(public.app_role),
  public.has_permission(public.app_permission),
  public.log_auth_event(text),
  public.admin_set_roles(uuid, public.app_role[], text),
  public.admin_set_permission(uuid, public.app_permission, boolean, text),
  public.admin_set_active(uuid, boolean, text),
  public.admin_register_user(uuid, text, public.app_role[]),
  public.admin_note_password_reset(uuid, text)
to authenticated;
-- write_audit, user_access_snapshot, assert_admin_teknis, other_active_admins, handle_new_user,
-- prevent_mutation, touch_updated_at: internal, tidak dapat dipanggil langsung oleh klien.
revoke execute on function
  public.write_audit(text, text, text, jsonb, jsonb, text),
  public.user_access_snapshot(uuid),
  public.assert_admin_teknis(),
  public.other_active_admins(uuid)
from authenticated;

-- ---------- policy baca (PRD §3.1: "Pengguna, peran & izin" — ketua L, admin_teknis K) ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_role('admin_teknis') or public.has_role('ketua'));

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin_teknis') or public.has_role('ketua'));

create policy user_permissions_select on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin_teknis') or public.has_role('ketua'));

-- Log audit hanya dibaca ketua & admin_teknis (Security.md §10).
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_role('ketua') or public.has_role('admin_teknis'));
