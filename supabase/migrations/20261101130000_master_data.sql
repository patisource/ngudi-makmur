-- =====================================================================
-- M2 — Master data (T2.1, T2.6, T2.7 data dasar)
-- Anggota (+ kontak pribadi terpisah), produk TK/PP/TP (kg), jenis kemasan, konversi kemasan,
-- pelanggan, saluran penjualan, aturan jenis batch. Master diarsip (archived_at), tidak dihapus.
-- Setiap insert/update tercatat di audit_logs lewat trigger. Matriks hak: PRD §3.1.
-- =====================================================================

create type public.product_category as enum ('mentah', 'olahan');
create type public.customer_type as enum ('perorangan', 'usaha');

-- ---------- pembantu ----------
create function public.mask_nik(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null or p = '' then null else left(p, 4) || repeat('*', greatest(char_length(p) - 8, 0)) || right(p, 4) end;
$$;

create function public.mask_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null or p = '' then null else left(p, 4) || repeat('*', greatest(char_length(p) - 8, 0)) || right(p, 4) end;
$$;

-- Stok fisik tercatat per produk. SEMENTARA 0: diganti versi sebenarnya (dari stock_movements) di migrasi M3.
create function public.product_on_hand(p_product uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select 0::numeric;
$$;

-- Audit generik untuk tabel master: <tabel>.created / .updated / .archived / .restored, sebelum & sesudah.
create function public.audit_master_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
  v_before jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_after jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    v_action := tg_table_name || '.created';
  elsif (v_before ->> 'archived_at') is null and (v_after ->> 'archived_at') is not null then
    v_action := tg_table_name || '.archived';
  elsif (v_before ->> 'archived_at') is not null and (v_after ->> 'archived_at') is null then
    v_action := tg_table_name || '.restored';
  else
    if v_before - 'updated_at' = v_after - 'updated_at' then
      return new; -- tidak ada perubahan berarti
    end if;
    v_action := tg_table_name || '.updated';
  end if;
  perform public.write_audit(v_action, tg_table_name, coalesce(v_after ->> 'id', v_after ->> 'code'), v_before - 'updated_at', v_after - 'updated_at',
                             nullif(current_setting('app.audit_reason', true), ''));
  return new;
end;
$$;

-- ---------- anggota ----------
create sequence public.member_code_seq;

create table public.members (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default ('A-' || lpad(nextval('public.member_code_seq')::text, 3, '0')),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  hamlet        text check (char_length(hamlet) <= 120),          -- dusun
  address       text check (char_length(address) <= 300),
  land_area_ha  numeric(10, 3) check (land_area_ha >= 0 and land_area_ha <= 10000),
  joined_on     date,
  nik_masked    text,                                             -- diisi trigger dari member_contacts
  phone_masked  text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index members_name_idx on public.members (lower(name));

-- Data pribadi (Security.md §7): hanya admin_kelompok & ketua. Peran lain hanya melihat kolom *_masked di members.
create table public.member_contacts (
  member_id   uuid primary key references public.members (id) on delete cascade,
  nik         text check (nik ~ '^\d{16}$'),
  phone       text check (phone ~ '^(\+62|0)8\d{7,12}$'),
  updated_at  timestamptz not null default now()
);

create function public.sync_member_masks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.members
     set nik_masked = public.mask_nik(new.nik), phone_masked = public.mask_phone(new.phone)
   where id = new.member_id
     and (nik_masked is distinct from public.mask_nik(new.nik) or phone_masked is distinct from public.mask_phone(new.phone));
  return new;
end;
$$;

-- ---------- produk & kemasan ----------
create table public.products (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^[A-Z]{2,6}$'),
  name                  text not null check (char_length(btrim(name)) between 1 and 120),
  category              public.product_category not null,
  base_unit             text not null default 'kg' check (base_unit = 'kg'),
  default_price_per_kg  bigint check (default_price_per_kg between 0 and 10000000000),
  min_stock_kg          numeric(14, 3) not null default 0 check (min_stock_kg >= 0 and min_stock_kg <= 1000000),
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Kode, kategori, dan satuan dipakai logika aplikasi → terkunci; arsip ditolak bila stok > 0 (FR-MST-05, T2.6).
create function public.guard_product_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.code <> old.code or new.category <> old.category or new.base_unit <> old.base_unit then
    raise exception 'Kode, kategori, dan satuan produk tidak dapat diubah' using errcode = 'P0001';
  end if;
  if old.archived_at is null and new.archived_at is not null and public.product_on_hand(new.id) > 0 then
    raise exception 'Produk masih punya stok, tidak dapat diarsipkan' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create table public.packagings (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (char_length(btrim(name)) between 1 and 60),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Konversi kemasan per produk: isi_kg > 0 (PRD §4.1; nol/negatif ditolak). Isi kg terkunci setelah dibuat.
create table public.product_packagings (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id),
  packaging_id   uuid not null references public.packagings (id),
  content_kg     numeric(14, 3) not null check (content_kg > 0 and content_kg <= 100000),
  default_price  bigint check (default_price between 0 and 10000000000),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (product_id, packaging_id, content_kg)
);
create index product_packagings_product_idx on public.product_packagings (product_id);

create function public.guard_product_packaging_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.product_id <> old.product_id or new.packaging_id <> old.packaging_id or new.content_kg <> old.content_kg then
    raise exception 'Produk, kemasan, dan isi kg tidak dapat diubah; arsipkan lalu buat konversi baru' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Konversi kemasan → kg (dipakai penjualan di M6): 2 × pak 0,5 kg = 1 kg.
create function public.packaging_qty_kg(p_product_packaging uuid, p_qty numeric) returns numeric
language sql stable set search_path = '' as $$
  select round(p_qty * pp.content_kg, 3) from public.product_packagings pp where pp.id = p_product_packaging;
$$;

-- ---------- pelanggan & saluran ----------
create sequence public.customer_code_seq;

create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default ('PLG-' || lpad(nextval('public.customer_code_seq')::text, 3, '0')),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  type         public.customer_type not null default 'perorangan',
  phone        text check (phone ~ '^(\+62|0)8\d{7,12}$'),
  address      text check (char_length(address) <= 300),
  note         text check (char_length(note) <= 1000),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));

create table public.sales_channels (
  code         text primary key check (code ~ '^[a-z_]{3,40}$'),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  is_digital   boolean not null default false,   -- dipakai indikator penjualan digital (PRD §4.8, §5.9)
  sort_order   integer not null default 100,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- aturan jenis batch (PRD §4.0: data, bukan hardcode) ----------
create table public.batch_type_rules (
  batch_type         text primary key check (batch_type ~ '^[a-z_]{3,40}$'),
  name               text not null,
  input_product_id   uuid not null references public.products (id),
  output_product_id  uuid not null references public.products (id),
  check (input_product_id <> output_product_id)
);

-- ---------- trigger ----------
create trigger members_touch before update on public.members for each row execute function public.touch_updated_at();
create trigger member_contacts_touch before update on public.member_contacts for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger packagings_touch before update on public.packagings for each row execute function public.touch_updated_at();
create trigger product_packagings_touch before update on public.product_packagings for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger sales_channels_touch before update on public.sales_channels for each row execute function public.touch_updated_at();

create trigger member_contacts_sync after insert or update on public.member_contacts for each row execute function public.sync_member_masks();
create trigger products_guard before update on public.products for each row execute function public.guard_product_update();
create trigger product_packagings_guard before update on public.product_packagings for each row execute function public.guard_product_packaging_update();

-- Audit (Security.md §10). member_contacts tidak diaudit langsung: perubahannya tercatat lewat kolom *_masked di members.
create trigger members_audit after insert or update on public.members for each row execute function public.audit_master_row();
create trigger products_audit after insert or update on public.products for each row execute function public.audit_master_row();
create trigger packagings_audit after insert or update on public.packagings for each row execute function public.audit_master_row();
create trigger product_packagings_audit after insert or update on public.product_packagings for each row execute function public.audit_master_row();
create trigger customers_audit after insert or update on public.customers for each row execute function public.audit_master_row();
create trigger sales_channels_audit after insert or update on public.sales_channels for each row execute function public.audit_master_row();

-- ---------- RLS & hak kolom ----------
alter table public.members enable row level security;
alter table public.member_contacts enable row level security;
alter table public.products enable row level security;
alter table public.packagings enable row level security;
alter table public.product_packagings enable row level security;
alter table public.customers enable row level security;
alter table public.sales_channels enable row level security;
alter table public.batch_type_rules enable row level security;

revoke all on public.members, public.member_contacts, public.products, public.packagings, public.product_packagings,
  public.customers, public.sales_channels, public.batch_type_rules from anon, authenticated;
revoke all on sequence public.member_code_seq, public.customer_code_seq from anon, authenticated;

-- Baca (L/K pada matriks). Tulis hanya kolom yang boleh diisi pengguna (cegah mass assignment; kolom hitungan diisi DB).
grant select on public.members, public.member_contacts, public.products, public.packagings, public.product_packagings,
  public.customers, public.sales_channels, public.batch_type_rules to authenticated;
grant insert (name, hamlet, address, land_area_ha, joined_on) on public.members to authenticated;
grant update (name, hamlet, address, land_area_ha, joined_on, archived_at) on public.members to authenticated;
grant insert (member_id, nik, phone), update (nik, phone) on public.member_contacts to authenticated;
grant update (name, default_price_per_kg, min_stock_kg, archived_at) on public.products to authenticated;
grant insert (name), update (name, archived_at) on public.packagings to authenticated;
grant insert (product_id, packaging_id, content_kg, default_price), update (default_price, archived_at) on public.product_packagings to authenticated;
grant insert (name, type, phone, address, note), update (name, type, phone, address, note, archived_at) on public.customers to authenticated;
grant insert (code, name, is_digital, sort_order), update (name, is_digital, sort_order, archived_at) on public.sales_channels to authenticated;
grant usage on sequence public.member_code_seq, public.customer_code_seq to authenticated;

-- Anggota: lihat = admin_kelompok, operator_produksi, ketua; kelola = admin_kelompok.
create policy members_select on public.members for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy members_insert on public.members for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy members_update on public.members for update to authenticated
  using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

create policy member_contacts_select on public.member_contacts for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy member_contacts_insert on public.member_contacts for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy member_contacts_update on public.member_contacts for update to authenticated
  using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

-- Produk, kemasan, konversi: lihat = tiga peran usaha; kelola = admin_kelompok. Produk baru tidak dibuat dari aplikasi.
create policy products_select on public.products for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy products_update on public.products for update to authenticated
  using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

create policy packagings_select on public.packagings for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy packagings_insert on public.packagings for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy packagings_update on public.packagings for update to authenticated
  using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

create policy product_packagings_select on public.product_packagings for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy product_packagings_insert on public.product_packagings for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy product_packagings_update on public.product_packagings for update to authenticated
  using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

-- Pelanggan & saluran: lihat = admin_kelompok, ketua; kelola = admin_kelompok (operator tidak punya akses).
create policy customers_select on public.customers for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy customers_insert on public.customers for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy customers_update on public.customers for update to authenticated
  using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

create policy sales_channels_select on public.sales_channels for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy sales_channels_insert on public.sales_channels for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy sales_channels_update on public.sales_channels for update to authenticated
  using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

create policy batch_type_rules_select on public.batch_type_rules for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));

-- ---------- hak fungsi ----------
revoke execute on function public.mask_nik(text), public.mask_phone(text), public.product_on_hand(uuid),
  public.audit_master_row(), public.sync_member_masks(), public.guard_product_update(),
  public.guard_product_packaging_update(), public.packaging_qty_kg(uuid, numeric) from public, anon;
grant execute on function public.product_on_hand(uuid), public.packaging_qty_kg(uuid, numeric) to authenticated;

-- ---------- data dasar (T2.7) — dimasukkan lewat migrasi karena proyek Supabase asli tidak menjalankan seed.sql ----------
-- Nama tampilan sementara (PRD §4.0); harga jual & stok minimum diisi admin (PRD Q1: harga resmi belum ditetapkan).
insert into public.products (code, name, category) values
  ('TK', 'Jagung tongkol', 'mentah'),
  ('PP', 'Jagung pipilan', 'mentah'),
  ('TP', 'Tepung jagung', 'olahan');

insert into public.packagings (name) values ('Pak'), ('Karung');

insert into public.product_packagings (product_id, packaging_id, content_kg)
select p.id, k.id, x.kg
from (values ('TP', 'Pak', 0.5), ('TP', 'Pak', 1.0), ('PP', 'Karung', 50.0)) as x (product_code, packaging_name, kg)
join public.products p on p.code = x.product_code
join public.packagings k on k.name = x.packaging_name;

insert into public.batch_type_rules (batch_type, name, input_product_id, output_product_id)
select x.batch_type, x.name, i.id, o.id
from (values ('pemipilan', 'Pemipilan', 'TK', 'PP'), ('penepungan', 'Penepungan', 'PP', 'TP')) as x (batch_type, name, input_code, output_code)
join public.products i on i.code = x.input_code
join public.products o on o.code = x.output_code;

insert into public.sales_channels (code, name, is_digital, sort_order) values
  ('langsung', 'Langsung', false, 10),
  ('whatsapp', 'WhatsApp', true, 20),
  ('media_sosial', 'Media sosial', true, 30),
  ('marketplace', 'Marketplace', true, 40),
  ('lainnya', 'Lainnya', false, 50);
