-- =====================================================================
-- M10 — Modul usaha IRT Sekar Arum (keputusan pengguna 5–6 Nov 2026, PRD §4.10)
--   bahan masuk (IBM) → produksi (IPR) → stok produk jadi (pcs; pack = isi pcs tetap) → penjualan (IJL), koreksi (IKS)
--   * TANPA kas: penjualan IRT mencatat jumlah & omzet saja; nilai bahan hanya untuk HPP.
--   * Tepung yang dibeli IRT dari kelompok masuk otomatis saat pesanan pelanggan IRT diserahkan (trigger, fungsi
--     posting kelompok tidak diubah); retur kelompok atas pesanan itu mengeluarkannya lagi.
--   * Peran `pengurus_irt`: kelola modul IRT; baca stok kelompok hanya untuk produk yang dihubungkan ke bahan IRT.
--     `ketua` membaca data IRT (pengawasan). Peran kelompok lain tidak melihat data IRT.
--   * Semua tulis lewat fungsi security definer (cek peran, kunci saldo, audit). Buku mutasi IRT append-only.
-- =====================================================================

-- ---------- pengaturan (satu baris: satu IRT) ----------
create table public.irt_settings (
  id           smallint primary key default 1 check (id = 1),
  name         text not null default 'IRT Sekar Arum' check (char_length(btrim(name)) between 2 and 80),
  customer_id  uuid references public.customers (id) on delete set null,   -- pelanggan kelompok yang = IRT ini
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
-- Hubungkan otomatis ke pelanggan bernama "IRT Sekar Arum" bila ada (bisa diganti di aplikasi oleh admin).
insert into public.irt_settings (id, customer_id)
values (1, (select id from public.customers where lower(btrim(name)) like 'irt sekar arum%' and archived_at is null order by created_at limit 1));

-- ---------- master bahan & produk ----------
create table public.irt_items (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('bahan', 'produk')),
  name                 text not null check (char_length(btrim(name)) between 2 and 80),
  unit                 text not null check (unit in ('kg', 'gram', 'liter', 'ml', 'butir', 'pcs')),
  pack_size            integer check (pack_size between 2 and 1000),          -- produk: isi 1 pack (pcs)
  price_pcs            bigint check (price_pcs between 0 and 100000000),       -- harga jual per pcs
  price_pack           bigint check (price_pack between 0 and 1000000000),     -- harga jual per pack (opsional)
  min_stock            numeric(14, 3) not null default 0 check (min_stock >= 0),
  kelompok_product_id  uuid unique references public.products (id),          -- bahan yang dibeli dari kelompok (mis. TP)
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (kind = 'bahan' or unit = 'pcs'),
  check (kind = 'produk' or (pack_size is null and price_pcs is null and price_pack is null)),
  check (kelompok_product_id is null or (kind = 'bahan' and unit = 'kg')),
  check (price_pack is null or pack_size is not null)
);
create unique index irt_items_name_uq on public.irt_items (kind, lower(btrim(name))) where archived_at is null;
create trigger irt_items_touch before update on public.irt_items for each row execute function public.touch_updated_at();

-- ---------- saldo & buku mutasi ----------
create table public.irt_stock_balances (
  item_id     uuid primary key references public.irt_items (id),
  on_hand     numeric(14, 3) not null default 0 check (on_hand >= 0),
  value_rp    bigint not null default 0 check (value_rp >= 0),
  updated_at  timestamptz not null default now()
);

create table public.irt_movements (
  id             bigint generated always as identity primary key,
  item_id        uuid not null references public.irt_items (id),
  movement_type  text not null check (movement_type in ('bahan_masuk', 'retur_kelompok', 'produksi_bahan', 'produksi_hasil', 'penjualan', 'penjualan_batal', 'koreksi')),
  direction      public.stock_direction not null,
  qty            numeric(14, 3) not null check (qty > 0),
  value_rp       bigint not null check (value_rp >= 0),
  balance_after  numeric(14, 3) not null check (balance_after >= 0),
  source_type    text not null check (source_type in ('irt_receipt', 'irt_batch', 'irt_sale', 'irt_adjustment', 'order_return')),
  source_id      uuid not null,
  source_line    text not null default '',
  doc_number     text,
  business_date  date not null,
  note           text check (char_length(note) <= 500),
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (source_type, source_id, source_line, movement_type, direction)     -- posting ganda tidak menggandakan stok
);
create index irt_movements_item_idx on public.irt_movements (item_id, id desc);
create index irt_movements_date_idx on public.irt_movements (business_date);
create trigger irt_movements_append_only before update or delete on public.irt_movements for each row execute function public.prevent_mutation();
create trigger irt_movements_no_truncate before truncate on public.irt_movements for each statement execute function public.prevent_mutation();

create function public.irt_ensure_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.irt_stock_balances (item_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger irt_items_balance after insert on public.irt_items for each row execute function public.irt_ensure_balance();

-- ---------- dokumen ----------
create table public.irt_receipts (
  id                uuid primary key default gen_random_uuid(),
  doc_number        text not null unique,
  source            text not null check (source in ('kelompok', 'beli')),
  order_id          uuid unique references public.orders (id),
  order_doc_number  text,
  business_date     date not null,
  supplier          text check (char_length(supplier) <= 120),
  note              text check (char_length(note) <= 500),
  total_value_rp    bigint not null default 0 check (total_value_rp >= 0),
  created_by        uuid default auth.uid(),
  created_by_name   text not null,
  created_at        timestamptz not null default now(),
  check ((source = 'kelompok') = (order_id is not null))
);
create index irt_receipts_date_idx on public.irt_receipts (business_date desc);
create table public.irt_receipt_lines (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.irt_receipts (id),
  item_id     uuid not null references public.irt_items (id),
  qty         numeric(14, 3) not null check (qty > 0),
  value_rp    bigint not null check (value_rp >= 0),
  sort_order  integer not null default 0,
  unique (receipt_id, item_id)
);
create trigger irt_receipts_append_only before update or delete on public.irt_receipts for each row execute function public.prevent_mutation();
create trigger irt_receipt_lines_append_only before update or delete on public.irt_receipt_lines for each row execute function public.prevent_mutation();

create table public.irt_batches (
  id               uuid primary key default gen_random_uuid(),
  doc_number       text unique,
  status           text not null default 'draft' check (status in ('draft', 'confirmed')),
  business_date    date not null default (now() at time zone 'Asia/Jakarta')::date,
  note             text check (char_length(note) <= 500),
  input_value_rp   bigint check (input_value_rp >= 0),
  output_pcs       integer check (output_pcs > 0),
  hpp_per_pcs      bigint check (hpp_per_pcs >= 0),
  created_by       uuid default auth.uid(),
  created_by_name  text not null,
  confirmed_at     timestamptz,
  confirmed_by     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'draft') = (doc_number is null)),
  check ((status = 'confirmed') = (confirmed_at is not null))
);
create index irt_batches_date_idx on public.irt_batches (business_date desc);
create trigger irt_batches_touch before update on public.irt_batches for each row execute function public.touch_updated_at();
create table public.irt_batch_lines (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.irt_batches (id) on delete cascade,
  item_id     uuid not null references public.irt_items (id),
  role        text not null check (role in ('bahan', 'hasil')),
  qty         numeric(14, 3) not null check (qty > 0),
  value_rp    bigint check (value_rp >= 0),                  -- diisi saat konfirmasi
  sort_order  integer not null default 0,
  unique (batch_id, role, item_id)
);

-- Batch terkonfirmasi terkunci (lapis kedua; fungsi posting sudah menolak).
create function public.irt_guard_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.status = 'confirmed' then
    raise exception 'Batch % sudah dikonfirmasi dan tidak dapat dihapus', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    raise exception 'Batch % sudah dikonfirmasi dan tidak dapat diubah', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger irt_batches_guard before update or delete on public.irt_batches for each row execute function public.irt_guard_batch();

create function public.irt_guard_batch_line() returns trigger
language plpgsql set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.irt_batches where id = coalesce(new.batch_id, old.batch_id);
  if v_status = 'confirmed' then
    raise exception 'Baris batch terkonfirmasi tidak dapat diubah' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger irt_batch_lines_guard before insert or update or delete on public.irt_batch_lines for each row execute function public.irt_guard_batch_line();

create table public.irt_sales (
  id               uuid primary key default gen_random_uuid(),
  doc_number       text not null unique,
  status           text not null default 'confirmed' check (status in ('confirmed', 'void')),
  business_date    date not null,
  buyer_name       text check (char_length(buyer_name) <= 120),
  note             text check (char_length(note) <= 500),
  total_pcs        integer not null check (total_pcs > 0),
  total_rp         bigint not null check (total_rp >= 0),
  created_by       uuid default auth.uid(),
  created_by_name  text not null,
  created_at       timestamptz not null default now(),
  void_reason      text check (char_length(void_reason) <= 500),
  voided_at        timestamptz,
  voided_by        uuid,
  check ((status = 'void') = (voided_at is not null))
);
create index irt_sales_date_idx on public.irt_sales (business_date desc);
create table public.irt_sale_lines (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references public.irt_sales (id),
  item_id         uuid not null references public.irt_items (id),
  unit            text not null check (unit in ('pcs', 'pack')),
  qty_input       integer not null check (qty_input between 1 and 100000),
  qty_pcs         integer not null check (qty_pcs > 0),
  price_snapshot  bigint not null check (price_snapshot >= 0),
  line_total_rp   bigint not null check (line_total_rp >= 0),
  sort_order      integer not null default 0,
  check (line_total_rp = qty_input * price_snapshot)
);
create trigger irt_sale_lines_append_only before update or delete on public.irt_sale_lines for each row execute function public.prevent_mutation();

create table public.irt_adjustments (
  id               uuid primary key default gen_random_uuid(),
  doc_number       text not null unique,
  business_date    date not null,
  item_id          uuid not null references public.irt_items (id),
  direction        public.stock_direction not null,
  qty              numeric(14, 3) not null check (qty > 0),
  reason           text not null check (char_length(reason) between 5 and 500),
  value_rp         bigint not null check (value_rp >= 0),
  created_by       uuid default auth.uid(),
  created_by_name  text not null,
  created_at       timestamptz not null default now()
);
create trigger irt_adjustments_append_only before update or delete on public.irt_adjustments for each row execute function public.prevent_mutation();

-- ---------- nomor dokumen: + IBM, IPR, IJL, IKS ----------
create or replace function public.next_doc_number(p_type text, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_period text;
  v_width int;
  v_no int;
begin
  if p_type not in ('RCV', 'PRD', 'INV', 'PAY', 'EXP', 'INC', 'RFD', 'RTR', 'OPN', 'ADJ', 'KAS', 'TRF', 'IBM', 'IPR', 'IJL', 'IKS') then
    raise exception 'Jenis dokumen % tidak dikenal', p_type using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Tanggal dokumen wajib' using errcode = '22023';
  end if;
  v_period := case when p_type = 'PRD' then to_char(p_date, 'YYYYMMDD') else to_char(p_date, 'YYYYMM') end;
  v_width := case when p_type in ('PRD', 'OPN') then 2 else 4 end;

  insert into public.document_sequences as s (doc_type, period, last_no) values (p_type, v_period, 1)
  on conflict (doc_type, period) do update set last_no = s.last_no + 1
  returning last_no into v_no;

  return p_type || '-' || v_period || '-' || lpad(v_no::text, greatest(v_width, char_length(v_no::text)), '0');
end;
$$;

-- ---------- fungsi internal ----------
create function public._irt_actor() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Sistem');
$$;

create function public._irt_date(p_date date) returns date
language plpgsql stable set search_path = '' as $$
begin
  if p_date is null then
    return (now() at time zone 'Asia/Jakarta')::date;
  end if;
  if p_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  return p_date;
end;
$$;

create function public._irt_require() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('pengurus_irt') then
    raise exception 'Hanya pengurus IRT yang dapat mencatat data IRT' using errcode = '42501';
  end if;
end;
$$;

-- Satu mutasi IRT: kunci saldo item, tolak saldo negatif, nilai rata-rata bergerak (pola _post_movement kelompok).
-- Produk jadi dihitung per pcs utuh.
create function public._irt_post(
  p_item uuid, p_direction public.stock_direction, p_qty numeric, p_type text,
  p_source_type text, p_source_id uuid, p_doc text, p_date date,
  p_value_rp bigint default null, p_line text default '', p_note text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.irt_items%rowtype;
  v_bal public.irt_stock_balances%rowtype;
  v_value bigint;
  v_id bigint;
begin
  select * into v_item from public.irt_items where id = p_item;
  if not found then
    raise exception 'Bahan/produk IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'Jumlah harus lebih dari 0 dengan maksimal 3 desimal' using errcode = '22023';
  end if;
  if v_item.kind = 'produk' and p_qty <> trunc(p_qty) then
    raise exception 'Jumlah % harus bilangan bulat pcs', v_item.name using errcode = '22023';
  end if;

  insert into public.irt_stock_balances (item_id) values (p_item) on conflict do nothing;
  select * into v_bal from public.irt_stock_balances where item_id = p_item for update;

  if p_direction = 'in' then
    if p_value_rp is null or p_value_rp < 0 then
      raise exception 'Nilai mutasi masuk wajib (rupiah ≥ 0)' using errcode = '22023';
    end if;
    v_value := p_value_rp;
    update public.irt_stock_balances set on_hand = on_hand + p_qty, value_rp = value_rp + v_value, updated_at = now()
     where item_id = p_item returning * into v_bal;
  else
    if v_bal.on_hand < p_qty then
      raise exception 'Stok IRT % tidak cukup: tersedia % %, diminta % %', v_item.name, v_bal.on_hand, v_item.unit, p_qty, v_item.unit
        using errcode = 'P0001', hint = 'INSUFFICIENT_STOCK';
    end if;
    if v_bal.on_hand = p_qty then
      v_value := v_bal.value_rp;
    elsif p_value_rp is not null then
      v_value := least(p_value_rp, v_bal.value_rp);
    else
      v_value := round(p_qty * v_bal.value_rp / v_bal.on_hand)::bigint;
    end if;
    update public.irt_stock_balances set on_hand = on_hand - p_qty, value_rp = value_rp - v_value, updated_at = now()
     where item_id = p_item returning * into v_bal;
  end if;

  insert into public.irt_movements (item_id, movement_type, direction, qty, value_rp, balance_after, source_type, source_id, source_line, doc_number, business_date, note)
  values (p_item, p_type, p_direction, p_qty, v_value, v_bal.on_hand, p_source_type, p_source_id, coalesce(p_line, ''), p_doc, p_date, p_note)
  returning id into v_id;
  return v_value;   -- nilai yang benar-benar diposting (dipakai HPP)
end;
$$;

-- ---------- master ----------
create function public.irt_save_item(
  p_id uuid, p_kind text, p_name text, p_unit text, p_pack_size integer, p_price_pcs bigint, p_price_pack bigint,
  p_min_stock numeric, p_kelompok_product uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.irt_items%rowtype;
  v_after public.irt_items%rowtype;
  v_unit text := case when p_kind = 'produk' then 'pcs' else p_unit end;
begin
  perform public._irt_require();
  if p_kind = 'bahan' then
    p_pack_size := null; p_price_pcs := null; p_price_pack := null;
  else
    p_kelompok_product := null;
  end if;
  if p_kelompok_product is not null and not exists (select 1 from public.products where id = p_kelompok_product and archived_at is null) then
    raise exception 'Produk kelompok tidak ditemukan atau diarsip' using errcode = '22023';
  end if;
  if p_kelompok_product is not null then
    v_unit := 'kg';                                   -- stok kelompok selalu kg
  end if;

  if p_id is null then
    insert into public.irt_items (kind, name, unit, pack_size, price_pcs, price_pack, min_stock, kelompok_product_id)
    values (p_kind, btrim(p_name), v_unit, p_pack_size, p_price_pcs, p_price_pack, coalesce(p_min_stock, 0), p_kelompok_product)
    returning * into v_after;
    perform public.write_audit('irt.item.created', 'irt_item', v_after.id::text, null, to_jsonb(v_after) - 'updated_at');
  else
    select * into v_before from public.irt_items where id = p_id for update;
    if not found then
      raise exception 'Bahan/produk IRT tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_before.kind <> p_kind then
      raise exception 'Jenis (bahan/produk) tidak dapat diubah' using errcode = '22023';
    end if;
    if v_before.unit <> v_unit and exists (select 1 from public.irt_movements where item_id = p_id) then
      raise exception 'Satuan tidak dapat diubah karena sudah ada mutasi stok' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    update public.irt_items
       set name = btrim(p_name), unit = v_unit, pack_size = p_pack_size, price_pcs = p_price_pcs, price_pack = p_price_pack,
           min_stock = coalesce(p_min_stock, 0), kelompok_product_id = p_kelompok_product
     where id = p_id returning * into v_after;
    perform public.write_audit('irt.item.updated', 'irt_item', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
  end if;
  return v_after.id;
exception
  when unique_violation then
    raise exception 'Nama sudah dipakai, atau produk kelompok sudah dihubungkan ke bahan lain' using errcode = '22023';
end;
$$;

create function public.irt_archive_item(p_id uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before public.irt_items%rowtype;
begin
  perform public._irt_require();
  select * into v_before from public.irt_items where id = p_id for update;
  if not found then
    raise exception 'Bahan/produk IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  if p_archive and coalesce((select on_hand from public.irt_stock_balances where item_id = p_id), 0) > 0 then
    raise exception 'Habiskan atau koreksi stok % dulu sebelum diarsip', v_before.name using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  update public.irt_items set archived_at = case when p_archive then coalesce(archived_at, now()) end where id = p_id;
  perform public.write_audit(case when p_archive then 'irt.item.archived' else 'irt.item.restored' end, 'irt_item', p_id::text);
end;
$$;

-- Produk kelompok yang bisa dihubungkan ke bahan IRT (nama & kode saja; pengurus IRT tidak membaca tabel produk lain).
create function public.irt_kelompok_products() returns table (id uuid, code text, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._irt_require();
  return query select p.id, p.code, p.name from public.products p where p.archived_at is null order by p.code;
end;
$$;

-- Admin kelompok / admin teknis menetapkan pelanggan kelompok yang merupakan IRT ini (null = putuskan).
create function public.irt_set_customer(p_customer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before public.irt_settings%rowtype;
begin
  if not (public.has_role('admin_kelompok') or public.has_role('admin_teknis')) then
    raise exception 'Hanya admin kelompok atau admin teknis yang dapat menghubungkan pelanggan IRT' using errcode = '42501';
  end if;
  if p_customer is not null and not exists (select 1 from public.customers where id = p_customer and archived_at is null) then
    raise exception 'Pelanggan tidak ditemukan atau diarsip' using errcode = '22023';
  end if;
  select * into v_before from public.irt_settings where id = 1 for update;
  update public.irt_settings set customer_id = p_customer, updated_at = now(), updated_by = (select auth.uid()) where id = 1;
  perform public.write_audit('irt.customer_linked', 'irt_settings', '1', jsonb_build_object('customer_id', v_before.customer_id), jsonb_build_object('customer_id', p_customer));
end;
$$;

-- ---------- bahan masuk manual (IBM) ----------
-- p_lines: [{item_id, qty, value_rp}] — value_rp = harga beli total baris (untuk HPP; TIDAK membuat kas).
create function public.irt_receive(p_date date, p_supplier text, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_date date := public._irt_date(p_date);
  v_doc text;
  v_line jsonb;
  v_item public.irt_items%rowtype;
  v_qty numeric;
  v_value bigint;
  v_total bigint := 0;
  v_n int := 0;
begin
  perform public._irt_require();
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Isi minimal satu bahan' using errcode = '22023';
  end if;
  -- validasi & total dulu: kepala dokumen append-only, jadi total harus final saat disisipkan
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from public.irt_items where id = (v_line ->> 'item_id')::uuid;
    if not found or v_item.kind <> 'bahan' or v_item.archived_at is not null then
      raise exception 'Bahan tidak ditemukan, diarsip, atau bukan bahan' using errcode = '22023';
    end if;
    v_value := (v_line ->> 'value_rp')::bigint;
    if v_value is null or v_value < 0 or v_value > 10000000000 then
      raise exception 'Harga beli % wajib diisi (Rp ≥ 0)', v_item.name using errcode = '22023';
    end if;
    v_total := v_total + v_value;
  end loop;

  v_doc := public.next_doc_number('IBM', v_date);
  insert into public.irt_receipts (id, doc_number, source, business_date, supplier, note, total_value_rp, created_by_name)
  values (v_id, v_doc, 'beli', v_date, nullif(btrim(p_supplier), ''), nullif(btrim(p_note), ''), v_total, public._irt_actor());
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::numeric;
    v_value := (v_line ->> 'value_rp')::bigint;
    perform public._irt_post((v_line ->> 'item_id')::uuid, 'in', v_qty, 'bahan_masuk', 'irt_receipt', v_id, v_doc, v_date, v_value, v_line ->> 'item_id');
    insert into public.irt_receipt_lines (receipt_id, item_id, qty, value_rp, sort_order) values (v_id, (v_line ->> 'item_id')::uuid, v_qty, v_value, v_n);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit('irt.receipt.created', 'irt_receipt', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'business_date', v_date, 'total_value_rp', v_total, 'lines', p_lines));
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'total_value_rp', v_total);
exception
  when unique_violation then
    raise exception 'Bahan yang sama tercantum dua kali' using errcode = '22023';
end;
$$;

-- ---------- tepung dari kelompok: otomatis saat pesanan IRT diserahkan ----------
create function public._irt_on_order_delivered() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_doc text;
  v_date date := coalesce(new.delivered_on, new.business_date);
  r record;
  v_total bigint := 0;
  v_n int := 0;
begin
  if not (new.status = 'delivered' and old.status is distinct from 'delivered') then
    return new;
  end if;
  if new.customer_id is distinct from (select customer_id from public.irt_settings where id = 1) or new.customer_id is null then
    return new;
  end if;
  if not exists (select 1 from public.order_items oi join public.irt_items i on i.kelompok_product_id = oi.product_id
                  where oi.order_id = new.id and i.archived_at is null) then
    return new;
  end if;

  v_doc := public.next_doc_number('IBM', v_date);
  for r in
    select i.id as item_id, sum(oi.qty_kg) as qty, sum(oi.line_total_rp)::bigint as value_rp
      from public.order_items oi join public.irt_items i on i.kelompok_product_id = oi.product_id and i.archived_at is null
     where oi.order_id = new.id
     group by i.id
  loop
    v_total := v_total + r.value_rp;
  end loop;
  -- kepala dulu (lines merujuk ke kepala), total sudah dihitung
  insert into public.irt_receipts (id, doc_number, source, order_id, order_doc_number, business_date, supplier, total_value_rp, created_by_name, note)
  values (v_id, v_doc, 'kelompok', new.id, new.doc_number, v_date, 'Kelompok Tani (pesanan ' || coalesce(new.doc_number, '-') || ')', v_total,
          public._irt_actor(), 'Otomatis saat pesanan diserahkan');
  for r in
    select i.id as item_id, sum(oi.qty_kg) as qty, sum(oi.line_total_rp)::bigint as value_rp
      from public.order_items oi join public.irt_items i on i.kelompok_product_id = oi.product_id and i.archived_at is null
     where oi.order_id = new.id
     group by i.id
     order by min(oi.sort_order)
  loop
    perform public._irt_post(r.item_id, 'in', r.qty, 'bahan_masuk', 'irt_receipt', v_id, v_doc, v_date, r.value_rp, r.item_id::text);
    insert into public.irt_receipt_lines (receipt_id, item_id, qty, value_rp, sort_order) values (v_id, r.item_id, r.qty, r.value_rp, v_n);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit('irt.receipt.auto', 'irt_receipt', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'order_doc_number', new.doc_number, 'total_value_rp', v_total));
  return new;
end;
$$;
create trigger orders_irt_receipt after update of status on public.orders
  for each row execute function public._irt_on_order_delivered();

-- Retur kelompok atas pesanan IRT: tepung keluar lagi dari stok bahan IRT. Ditolak bila sudah terpakai produksi.
create function public._irt_on_return_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
  r record;
begin
  if not (new.status = 'verified' and old.status is distinct from 'verified') then
    return new;
  end if;
  select customer_id into v_customer from public.orders where id = new.order_id;
  if v_customer is null or v_customer is distinct from (select customer_id from public.irt_settings where id = 1) then
    return new;
  end if;
  if not exists (select 1 from public.irt_receipts where order_id = new.order_id) then
    return new;                                  -- pesanan diserahkan sebelum IRT terhubung: tidak ada bahan IRT
  end if;
  for r in
    select i.id as item_id, sum(ri.qty_kg) as qty, sum(ri.sales_value_rp)::bigint as value_rp
      from public.order_return_items ri join public.irt_items i on i.kelompok_product_id = ri.product_id
     where ri.return_id = new.id
     group by i.id
  loop
    begin
      perform public._irt_post(r.item_id, 'out', r.qty, 'retur_kelompok', 'order_return', new.id, new.doc_number, new.business_date, r.value_rp, r.item_id::text,
                               'Retur ke kelompok');
    exception when sqlstate 'P0001' then
      raise exception 'Bahan IRT dari pesanan ini sudah terpakai produksi, retur tidak bisa diverifikasi (stok bahan IRT kurang)'
        using errcode = 'P0001', hint = 'INSUFFICIENT_STOCK';
    end;
  end loop;
  return new;
end;
$$;
create trigger order_returns_irt after update of status on public.order_returns
  for each row execute function public._irt_on_return_verified();

-- ---------- produksi (IPR) ----------
-- p_inputs: [{item_id, qty}] bahan; p_outputs: [{item_id, qty}] produk (pcs bulat).
create function public.irt_save_batch_draft(p_id uuid, p_date date, p_note text, p_inputs jsonb, p_outputs jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_date date := public._irt_date(p_date);
  v_line jsonb;
  v_item public.irt_items%rowtype;
  v_qty numeric;
  v_status text;
  v_n int := 0;
begin
  perform public._irt_require();
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' or jsonb_array_length(p_inputs) = 0 then
    raise exception 'Isi minimal satu bahan' using errcode = '22023';
  end if;
  if p_outputs is null or jsonb_typeof(p_outputs) <> 'array' or jsonb_array_length(p_outputs) = 0 then
    raise exception 'Isi minimal satu hasil produk' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.irt_batches (id, business_date, note, created_by_name) values (v_id, v_date, nullif(btrim(p_note), ''), public._irt_actor());
  else
    select status into v_status from public.irt_batches where id = p_id for update;
    if not found then
      raise exception 'Batch IRT tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_status <> 'draft' then
      raise exception 'Batch sudah dikonfirmasi dan tidak dapat diubah' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    update public.irt_batches set business_date = v_date, note = nullif(btrim(p_note), '') where id = p_id;
    delete from public.irt_batch_lines where batch_id = p_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_inputs) loop
    select * into v_item from public.irt_items where id = (v_line ->> 'item_id')::uuid;
    if not found or v_item.kind <> 'bahan' or v_item.archived_at is not null then
      raise exception 'Bahan produksi tidak ditemukan, diarsip, atau bukan bahan' using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, 3) then
      raise exception 'Jumlah bahan % tidak valid', v_item.name using errcode = '22023';
    end if;
    insert into public.irt_batch_lines (batch_id, item_id, role, qty, sort_order) values (v_id, v_item.id, 'bahan', v_qty, v_n);
    v_n := v_n + 1;
  end loop;
  for v_line in select * from jsonb_array_elements(p_outputs) loop
    select * into v_item from public.irt_items where id = (v_line ->> 'item_id')::uuid;
    if not found or v_item.kind <> 'produk' or v_item.archived_at is not null then
      raise exception 'Hasil produksi tidak ditemukan, diarsip, atau bukan produk' using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then
      raise exception 'Hasil % harus bilangan bulat pcs', v_item.name using errcode = '22023';
    end if;
    insert into public.irt_batch_lines (batch_id, item_id, role, qty, sort_order) values (v_id, v_item.id, 'hasil', v_qty, v_n);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit(case when p_id is null then 'irt.batch.draft_created' else 'irt.batch.draft_updated' end, 'irt_batch', v_id::text);
  return v_id;
exception
  when unique_violation then
    raise exception 'Bahan atau produk yang sama tercantum dua kali' using errcode = '22023';
end;
$$;

create function public.irt_delete_batch_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  perform public._irt_require();
  select status into v_status from public.irt_batches where id = p_id for update;
  if not found then
    raise exception 'Batch IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Batch sudah dikonfirmasi dan tidak dapat dihapus' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  delete from public.irt_batches where id = p_id;
  perform public.write_audit('irt.batch.draft_deleted', 'irt_batch', p_id::text);
end;
$$;

-- Konfirmasi: bahan keluar (nilai rata-rata), hasil masuk dengan nilai = total bahan dibagi rata per pcs.
create function public.irt_confirm_batch(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.irt_batches%rowtype;
  v_doc text;
  r record;
  v_input bigint := 0;
  v_pcs bigint;
  v_left bigint;
  v_val bigint;
  v_n int;
  v_i int := 0;
begin
  perform public._irt_require();
  select * into v_b from public.irt_batches where id = p_id for update;
  if not found then
    raise exception 'Batch IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_b.status = 'confirmed' then
    return jsonb_build_object('id', v_b.id, 'doc_number', v_b.doc_number, 'already', true);
  end if;
  if v_b.business_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  select coalesce(sum(qty), 0)::bigint, count(*) into v_pcs, v_n from public.irt_batch_lines where batch_id = p_id and role = 'hasil';
  if v_pcs = 0 or not exists (select 1 from public.irt_batch_lines where batch_id = p_id and role = 'bahan') then
    raise exception 'Batch belum lengkap: isi bahan dan hasil' using errcode = '22023';
  end if;

  v_doc := public.next_doc_number('IPR', v_b.business_date);
  for r in select * from public.irt_batch_lines where batch_id = p_id and role = 'bahan' order by sort_order loop
    v_val := public._irt_post(r.item_id, 'out', r.qty, 'produksi_bahan', 'irt_batch', p_id, v_doc, v_b.business_date, null, r.id::text);
    update public.irt_batch_lines set value_rp = v_val where id = r.id;
    v_input := v_input + v_val;
  end loop;
  v_left := v_input;
  for r in select * from public.irt_batch_lines where batch_id = p_id and role = 'hasil' order by sort_order loop
    v_i := v_i + 1;
    v_val := case when v_i = v_n then v_left else round(v_input::numeric * r.qty / v_pcs)::bigint end;
    v_left := v_left - v_val;
    perform public._irt_post(r.item_id, 'in', r.qty, 'produksi_hasil', 'irt_batch', p_id, v_doc, v_b.business_date, v_val, r.id::text);
    update public.irt_batch_lines set value_rp = v_val where id = r.id;
  end loop;

  update public.irt_batches
     set status = 'confirmed', doc_number = v_doc, input_value_rp = v_input, output_pcs = v_pcs,
         hpp_per_pcs = round(v_input::numeric / v_pcs)::bigint, confirmed_at = now(), confirmed_by = (select auth.uid())
   where id = p_id;
  perform public.write_audit('irt.batch.confirmed', 'irt_batch', p_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'input_value_rp', v_input, 'output_pcs', v_pcs, 'hpp_per_pcs', round(v_input::numeric / v_pcs)::bigint));
  return jsonb_build_object('id', p_id, 'doc_number', v_doc, 'hpp_per_pcs', round(v_input::numeric / v_pcs)::bigint, 'already', false);
end;
$$;

-- ---------- penjualan (IJL) — tanpa kas ----------
-- p_lines: [{item_id, unit: 'pcs'|'pack', qty}] — harga dari daftar harga IRT (dihitung server).
create function public.irt_create_sale(p_date date, p_buyer text, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_date date := public._irt_date(p_date);
  v_doc text;
  v_line jsonb;
  v_item public.irt_items%rowtype;
  v_unit text;
  v_qty integer;
  v_pcs integer;
  v_price bigint;
  v_total bigint := 0;
  v_total_pcs integer := 0;
  v_rows jsonb := '[]'::jsonb;
  r jsonb;
  v_line_id uuid;
  v_n int := 0;
begin
  perform public._irt_require();
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Isi minimal satu produk' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from public.irt_items where id = (v_line ->> 'item_id')::uuid;
    if not found or v_item.kind <> 'produk' or v_item.archived_at is not null then
      raise exception 'Produk IRT tidak ditemukan, diarsip, atau bukan produk jadi' using errcode = '22023';
    end if;
    v_unit := coalesce(v_line ->> 'unit', 'pcs');
    if v_unit not in ('pcs', 'pack') then
      raise exception 'Satuan jual harus pcs atau pack' using errcode = '22023';
    end if;
    begin
      v_qty := (v_line ->> 'qty')::integer;
    exception when others then
      raise exception 'Jumlah % harus bilangan bulat', v_item.name using errcode = '22023';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 100000 or (v_line ->> 'qty')::numeric <> v_qty then
      raise exception 'Jumlah % harus bilangan bulat 1–100.000', v_item.name using errcode = '22023';
    end if;
    if v_unit = 'pack' then
      if v_item.pack_size is null then
        raise exception '% belum punya isi per pack', v_item.name using errcode = '22023';
      end if;
      v_pcs := v_qty * v_item.pack_size;
      v_price := coalesce(v_item.price_pack, v_item.price_pcs * v_item.pack_size);
    else
      v_pcs := v_qty;
      v_price := v_item.price_pcs;
    end if;
    if v_price is null then
      raise exception 'Harga jual % belum diisi di daftar produk', v_item.name using errcode = '22023';
    end if;
    v_rows := v_rows || jsonb_build_object('item_id', v_item.id, 'unit', v_unit, 'qty', v_qty, 'pcs', v_pcs, 'price', v_price, 'n', v_n);
    v_total := v_total + v_qty * v_price;
    v_total_pcs := v_total_pcs + v_pcs;
    v_n := v_n + 1;
  end loop;

  v_doc := public.next_doc_number('IJL', v_date);
  insert into public.irt_sales (id, doc_number, business_date, buyer_name, note, total_pcs, total_rp, created_by_name)
  values (v_id, v_doc, v_date, nullif(btrim(p_buyer), ''), nullif(btrim(p_note), ''), v_total_pcs, v_total, public._irt_actor());
  for r in select * from jsonb_array_elements(v_rows) loop
    insert into public.irt_sale_lines (sale_id, item_id, unit, qty_input, qty_pcs, price_snapshot, line_total_rp, sort_order)
    values (v_id, (r ->> 'item_id')::uuid, r ->> 'unit', (r ->> 'qty')::int, (r ->> 'pcs')::int, (r ->> 'price')::bigint,
            (r ->> 'qty')::bigint * (r ->> 'price')::bigint, (r ->> 'n')::int)
    returning id into v_line_id;
    perform public._irt_post((r ->> 'item_id')::uuid, 'out', (r ->> 'pcs')::numeric, 'penjualan', 'irt_sale', v_id, v_doc, v_date, null, v_line_id::text);
  end loop;
  perform public.write_audit('irt.sale.created', 'irt_sale', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'total_rp', v_total, 'total_pcs', v_total_pcs));
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'total_rp', v_total, 'total_pcs', v_total_pcs);
end;
$$;

-- Batal penjualan: alasan wajib; stok kembali senilai saat keluar.
create function public.irt_void_sale(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.irt_sales%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  r record;
begin
  perform public._irt_require();
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan pembatalan wajib (5–500 karakter)' using errcode = '22023';
  end if;
  select * into v_s from public.irt_sales where id = p_id for update;
  if not found then
    raise exception 'Penjualan IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_s.status = 'void' then
    return jsonb_build_object('id', p_id, 'doc_number', v_s.doc_number, 'already', true);
  end if;
  for r in
    select m.item_id, m.qty, m.value_rp, m.source_line
      from public.irt_movements m
     where m.source_type = 'irt_sale' and m.source_id = p_id and m.movement_type = 'penjualan' and m.direction = 'out'
  loop
    perform public._irt_post(r.item_id, 'in', r.qty, 'penjualan_batal', 'irt_sale', p_id, v_s.doc_number, v_s.business_date, r.value_rp, r.source_line, v_reason);
  end loop;
  update public.irt_sales set status = 'void', void_reason = v_reason, voided_at = now(), voided_by = (select auth.uid()) where id = p_id;
  perform public.write_audit('irt.sale.voided', 'irt_sale', p_id::text, jsonb_build_object('status', 'confirmed'), jsonb_build_object('status', 'void'), v_reason);
  return jsonb_build_object('id', p_id, 'doc_number', v_s.doc_number, 'already', false);
end;
$$;

-- ---------- koreksi stok (IKS): langsung berlaku, alasan wajib, tercatat di audit ----------
create function public.irt_adjust(p_date date, p_item uuid, p_direction public.stock_direction, p_qty numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_date date := public._irt_date(p_date);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_doc text;
  v_bal public.irt_stock_balances%rowtype;
  v_value bigint;
begin
  perform public._irt_require();
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan koreksi wajib (5–500 karakter)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.irt_items where id = p_item) then
    raise exception 'Bahan/produk IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  v_doc := public.next_doc_number('IKS', v_date);
  if p_direction = 'in' then
    select * into v_bal from public.irt_stock_balances where item_id = p_item;
    v_value := case when coalesce(v_bal.on_hand, 0) > 0 then round(p_qty * v_bal.value_rp / v_bal.on_hand)::bigint else 0 end;
    v_value := public._irt_post(p_item, 'in', p_qty, 'koreksi', 'irt_adjustment', v_id, v_doc, v_date, v_value, '', v_reason);
  else
    v_value := public._irt_post(p_item, 'out', p_qty, 'koreksi', 'irt_adjustment', v_id, v_doc, v_date, null, '', v_reason);
  end if;
  insert into public.irt_adjustments (id, doc_number, business_date, item_id, direction, qty, reason, value_rp, created_by_name)
  values (v_id, v_doc, v_date, p_item, p_direction, p_qty, v_reason, v_value, public._irt_actor());
  perform public.write_audit('irt.stock.adjusted', 'irt_adjustment', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'item_id', p_item, 'direction', p_direction, 'qty', p_qty), v_reason);
  return jsonb_build_object('id', v_id, 'doc_number', v_doc);
end;
$$;

-- ---------- laporan (security invoker: tunduk RLS) ----------
create view public.v_irt_stock with (security_invoker = true) as
select i.id as item_id, i.kind, i.name, i.unit, i.pack_size, i.price_pcs, i.price_pack, i.min_stock, i.kelompok_product_id, i.archived_at,
       coalesce(b.on_hand, 0) as on_hand, coalesce(b.value_rp, 0) as value_rp,
       case when coalesce(b.on_hand, 0) > 0 then round(b.value_rp / b.on_hand)::bigint end as avg_cost,
       coalesce(b.on_hand, 0) < i.min_stock as below_min
  from public.irt_items i
  left join public.irt_stock_balances b on b.item_id = i.id;

-- Ringkasan per produk & total untuk periode (dashboard + laporan + CSV IRT).
create function public.irt_report(p_from date, p_to date)
returns table (item_id uuid, name text, pack_size integer, produced_pcs bigint, sold_pcs bigint, omzet_rp bigint, hpp_rp bigint, stock_pcs numeric)
language sql stable security invoker set search_path = '' as $$
  select i.id, i.name, i.pack_size,
         coalesce((select sum(l.qty)::bigint from public.irt_batch_lines l join public.irt_batches b on b.id = l.batch_id
                    where l.item_id = i.id and l.role = 'hasil' and b.status = 'confirmed' and b.business_date between p_from and p_to), 0),
         coalesce((select sum(l.qty_pcs)::bigint from public.irt_sale_lines l join public.irt_sales s on s.id = l.sale_id
                    where l.item_id = i.id and s.status = 'confirmed' and s.business_date between p_from and p_to), 0),
         coalesce((select sum(l.line_total_rp)::bigint from public.irt_sale_lines l join public.irt_sales s on s.id = l.sale_id
                    where l.item_id = i.id and s.status = 'confirmed' and s.business_date between p_from and p_to), 0),
         coalesce((select sum(l.value_rp)::bigint from public.irt_batch_lines l join public.irt_batches b on b.id = l.batch_id
                    where l.item_id = i.id and l.role = 'hasil' and b.status = 'confirmed' and b.business_date between p_from and p_to), 0),
         coalesce((select on_hand from public.irt_stock_balances where item_id = i.id), 0)
    from public.irt_items i
   where i.kind = 'produk'
   order by i.archived_at nulls first, i.name;
$$;

-- ---------- RLS & hak ----------
alter table public.irt_settings enable row level security;
alter table public.irt_items enable row level security;
alter table public.irt_stock_balances enable row level security;
alter table public.irt_movements enable row level security;
alter table public.irt_receipts enable row level security;
alter table public.irt_receipt_lines enable row level security;
alter table public.irt_batches enable row level security;
alter table public.irt_batch_lines enable row level security;
alter table public.irt_sales enable row level security;
alter table public.irt_sale_lines enable row level security;
alter table public.irt_adjustments enable row level security;

revoke all on public.irt_settings, public.irt_items, public.irt_stock_balances, public.irt_movements, public.irt_receipts,
  public.irt_receipt_lines, public.irt_batches, public.irt_batch_lines, public.irt_sales, public.irt_sale_lines,
  public.irt_adjustments, public.v_irt_stock from anon, authenticated;
grant select on public.irt_settings, public.irt_items, public.irt_stock_balances, public.irt_movements, public.irt_receipts,
  public.irt_receipt_lines, public.irt_batches, public.irt_batch_lines, public.irt_sales, public.irt_sale_lines,
  public.irt_adjustments, public.v_irt_stock to authenticated;

-- Data IRT: pengurus IRT (kelola lewat fungsi) dan ketua (baca, pengawasan). Peran kelompok lain: tidak terlihat.
create policy irt_settings_select on public.irt_settings for select to authenticated
  using (public.has_role('pengurus_irt') or public.has_role('ketua') or public.has_role('admin_kelompok') or public.has_role('admin_teknis'));
create policy irt_items_select on public.irt_items for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_stock_balances_select on public.irt_stock_balances for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_movements_select on public.irt_movements for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_receipts_select on public.irt_receipts for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_receipt_lines_select on public.irt_receipt_lines for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_batches_select on public.irt_batches for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_batch_lines_select on public.irt_batch_lines for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_sales_select on public.irt_sales for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_sale_lines_select on public.irt_sale_lines for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_adjustments_select on public.irt_adjustments for select to authenticated using (public.has_role('pengurus_irt') or public.has_role('ketua'));

-- Stok kelompok untuk pengurus IRT: hanya produk yang dihubungkan ke bahan IRT (mis. tepung), baca saja.
create function public.irt_linked_product(p_product uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.irt_items where kelompok_product_id = p_product and archived_at is null);
$$;
create policy products_select_irt on public.products for select to authenticated
  using (public.has_role('pengurus_irt') and public.irt_linked_product(id));
create policy stock_balances_select_irt on public.stock_balances for select to authenticated
  using (public.has_role('pengurus_irt') and public.irt_linked_product(product_id));
create policy stock_reservations_select_irt on public.stock_reservations for select to authenticated
  using (public.has_role('pengurus_irt') and public.irt_linked_product(product_id));

revoke execute on function public._irt_actor(), public._irt_date(date), public._irt_require(),
  public._irt_post(uuid, public.stock_direction, numeric, text, text, uuid, text, date, bigint, text, text),
  public._irt_on_order_delivered(), public._irt_on_return_verified(), public.irt_ensure_balance(),
  public.irt_guard_batch(), public.irt_guard_batch_line()
from public, anon, authenticated;
revoke execute on function public.irt_save_item(uuid, text, text, text, integer, bigint, bigint, numeric, uuid),
  public.irt_archive_item(uuid, boolean), public.irt_kelompok_products(), public.irt_set_customer(uuid),
  public.irt_receive(date, text, text, jsonb), public.irt_save_batch_draft(uuid, date, text, jsonb, jsonb),
  public.irt_delete_batch_draft(uuid), public.irt_confirm_batch(uuid), public.irt_create_sale(date, text, text, jsonb),
  public.irt_void_sale(uuid, text), public.irt_adjust(date, uuid, public.stock_direction, numeric, text), public.irt_report(date, date)
from public, anon;
grant execute on function public.irt_save_item(uuid, text, text, text, integer, bigint, bigint, numeric, uuid),
  public.irt_archive_item(uuid, boolean), public.irt_kelompok_products(), public.irt_set_customer(uuid),
  public.irt_receive(date, text, text, jsonb), public.irt_save_batch_draft(uuid, date, text, jsonb, jsonb),
  public.irt_delete_batch_draft(uuid), public.irt_confirm_batch(uuid), public.irt_create_sale(date, text, text, jsonb),
  public.irt_void_sale(uuid, text), public.irt_adjust(date, uuid, public.stock_direction, numeric, text), public.irt_report(date, date)
to authenticated;
-- irt_linked_product dipanggil di policy dengan hak pengguna; hanya mengembalikan boolean.
revoke execute on function public.irt_linked_product(uuid) from public, anon;
grant execute on function public.irt_linked_product(uuid) to authenticated;

notify pgrst, 'reload schema';
