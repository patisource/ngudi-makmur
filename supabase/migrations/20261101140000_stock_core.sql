-- =====================================================================
-- M3 — Inti stok & penomoran (T3.1–T3.5)
-- Penomoran dokumen (PRD §4.5), buku mutasi stok append-only (§4.2), saldo per produk yang dikunci saat posting,
-- reservasi (§4.3), nilai persediaan rata-rata bergerak (§4.4), kunci idempotensi (Security.md §6).
-- Fungsi bertanda _ (garis bawah) internal: hanya dipanggil fungsi posting modul M4+ di dalam transaksinya.
-- =====================================================================

create type public.stock_direction as enum ('in', 'out');
create type public.movement_type as enum ('receipt_in', 'production_out', 'production_in', 'sale_out', 'return_in', 'opname_adjust', 'correction', 'reversal');
create type public.reservation_status as enum ('active', 'released', 'fulfilled');

-- ---------- penomoran dokumen (T3.1) ----------
create table public.document_sequences (
  doc_type  text not null,
  period    text not null,           -- YYYYMM, atau YYYYMMDD untuk batch produksi
  last_no   integer not null check (last_no > 0),
  primary key (doc_type, period)
);

-- Nomor berikutnya per jenis per periode. INSERT … ON CONFLICT DO UPDATE mengunci baris urutan, jadi dua transaksi
-- bersamaan mendapat nomor berbeda. Nomor yang batal karena rollback tidak dipakai ulang (celah wajar, Security.md §6).
create function public.next_doc_number(p_type text, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_period text;
  v_width int;
  v_no int;
begin
  if p_type not in ('RCV', 'PRD', 'INV', 'PAY', 'EXP', 'INC', 'RFD', 'RTR', 'OPN', 'ADJ', 'KAS') then
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

-- ---------- saldo & buku mutasi (T3.2) ----------
-- Satu baris per produk; dikunci (FOR UPDATE) oleh setiap posting/reservasi sehingga stok tidak bisa negatif
-- walau dua transaksi berjalan bersamaan. Nilai persediaan rupiah integer; rata-rata = value_rp / on_hand_kg.
create table public.stock_balances (
  product_id  uuid primary key references public.products (id),
  on_hand_kg  numeric(14, 3) not null default 0 check (on_hand_kg >= 0),
  value_rp    bigint not null default 0 check (value_rp >= 0),
  updated_at  timestamptz not null default now()
);

create table public.stock_movements (
  id                bigint generated always as identity primary key,
  product_id        uuid not null references public.products (id),
  movement_type     public.movement_type not null,
  direction         public.stock_direction not null,
  qty_kg            numeric(14, 3) not null check (qty_kg > 0),
  value_rp          bigint not null check (value_rp >= 0),          -- nilai persediaan yang masuk/keluar
  balance_after_kg  numeric(14, 3) not null check (balance_after_kg >= 0),
  source_type       text not null,                                   -- receipt, production_batch, order, return, opname, adjustment
  source_id         uuid not null,
  source_line       text not null default '',                         -- baris dokumen (mis. id baris batch)
  doc_number        text,
  business_date     date not null,
  note              text check (char_length(note) <= 1000),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  -- Satu dokumen hanya bisa memposting satu kali per baris & jenis (konfirmasi ganda tidak menggandakan stok).
  unique (source_type, source_id, source_line, movement_type, direction)
);
create index stock_movements_product_idx on public.stock_movements (product_id, id desc);
create index stock_movements_source_idx on public.stock_movements (source_type, source_id);
create index stock_movements_date_idx on public.stock_movements (business_date);

create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function public.prevent_mutation();
create trigger stock_movements_no_truncate before truncate on public.stock_movements
  for each statement execute function public.prevent_mutation();

-- Reservasi (PRD §4.3): pesanan terkonfirmasi menahan kg; FK ke orders ditambahkan di M6.
create table public.stock_reservations (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null,
  product_id  uuid not null references public.products (id),
  qty_kg      numeric(14, 3) not null check (qty_kg > 0),
  status      public.reservation_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (order_id, product_id)
);
create index stock_reservations_active_idx on public.stock_reservations (product_id) where status = 'active';
create trigger stock_reservations_touch before update on public.stock_reservations for each row execute function public.touch_updated_at();

-- Saldo awal 0 untuk produk yang sudah ada & setiap produk baru.
insert into public.stock_balances (product_id) select id from public.products on conflict do nothing;

create function public.ensure_stock_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock_balances (product_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger products_stock_balance after insert on public.products for each row execute function public.ensure_stock_balance();

-- ---------- fungsi saldo ----------
create function public.reserved_kg(p_product uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(qty_kg), 0) from public.stock_reservations where product_id = p_product and status = 'active';
$$;

-- Menggantikan versi sementara di M2: stok fisik tercatat sebenarnya (dipakai aturan arsip produk).
create or replace function public.product_on_hand(p_product uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select on_hand_kg from public.stock_balances where product_id = p_product), 0);
$$;

-- Posting satu mutasi (T3.4). Mengunci saldo produk, menolak saldo negatif, menghitung nilai rata-rata bergerak.
--   masuk : nilai = p_value_rp (wajib; mis. biaya perolehan, HPP batch, nilai pembalikan)
--   keluar: nilai = p_value_rp bila diberikan (pembalikan masuk), selain itu qty × rata-rata saat ini
--   p_allow_reserved: keluar boleh memakai kg yang sedang direservasi (hanya serah barang yang mengonsumsi reservasinya)
create function public._post_movement(
  p_product uuid, p_direction public.stock_direction, p_qty numeric, p_type public.movement_type,
  p_source_type text, p_source_id uuid, p_doc_number text, p_date date,
  p_value_rp bigint default null, p_source_line text default '', p_note text default null, p_allow_reserved boolean default false
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_bal public.stock_balances%rowtype;
  v_name text;
  v_value bigint;
  v_reserved numeric;
  v_id bigint;
begin
  if p_qty is null or p_qty <= 0 or p_qty <> round(p_qty, 3) then
    raise exception 'Jumlah kg harus lebih dari 0 dengan maksimal 3 desimal' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Tanggal mutasi wajib' using errcode = '22023';
  end if;

  insert into public.stock_balances (product_id) values (p_product) on conflict do nothing;
  select * into v_bal from public.stock_balances where product_id = p_product for update;
  select name into v_name from public.products where id = p_product;
  if v_name is null then
    raise exception 'Produk tidak ditemukan' using errcode = 'P0002';
  end if;

  if p_direction = 'in' then
    if p_value_rp is null or p_value_rp < 0 then
      raise exception 'Nilai mutasi masuk wajib (rupiah ≥ 0)' using errcode = '22023';
    end if;
    v_value := p_value_rp;
    update public.stock_balances
       set on_hand_kg = on_hand_kg + p_qty, value_rp = value_rp + v_value, updated_at = now()
     where product_id = p_product
     returning * into v_bal;
  else
    v_reserved := case when p_allow_reserved then 0 else public.reserved_kg(p_product) end;
    if v_bal.on_hand_kg - p_qty < v_reserved then
      raise exception 'Stok % tidak cukup: tersedia % kg, diminta % kg', v_name, v_bal.on_hand_kg - v_reserved, p_qty
        using errcode = 'P0001', hint = 'INSUFFICIENT_STOCK';
    end if;
    if v_bal.on_hand_kg = p_qty then
      v_value := v_bal.value_rp;                                  -- habis: bawa seluruh nilai, tanpa sisa pembulatan
    elsif p_value_rp is not null then
      v_value := least(p_value_rp, v_bal.value_rp);
    else
      v_value := round(p_qty * v_bal.value_rp / v_bal.on_hand_kg)::bigint;
    end if;
    update public.stock_balances
       set on_hand_kg = on_hand_kg - p_qty, value_rp = value_rp - v_value, updated_at = now()
     where product_id = p_product
     returning * into v_bal;
  end if;

  insert into public.stock_movements (product_id, movement_type, direction, qty_kg, value_rp, balance_after_kg, source_type, source_id, source_line, doc_number, business_date, note)
  values (p_product, p_type, p_direction, p_qty, v_value, v_bal.on_hand_kg, p_source_type, p_source_id, coalesce(p_source_line, ''), p_doc_number, p_date, p_note)
  returning id into v_id;
  return v_id;
end;
$$;

-- Reservasi (dipakai konfirmasi pesanan di M6): kunci saldo produk, cek tersedia, simpan reservasi.
create function public._reserve_stock(p_order uuid, p_product uuid, p_qty numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_on_hand numeric;
  v_name text;
  v_id uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Jumlah reservasi harus lebih dari 0' using errcode = '22023';
  end if;
  insert into public.stock_balances (product_id) values (p_product) on conflict do nothing;
  select on_hand_kg into v_on_hand from public.stock_balances where product_id = p_product for update;
  select name into v_name from public.products where id = p_product;
  if v_on_hand - public.reserved_kg(p_product) < p_qty then
    raise exception 'Stok % tidak cukup: tersedia % kg, diminta % kg', v_name, v_on_hand - public.reserved_kg(p_product), p_qty
      using errcode = 'P0001', hint = 'INSUFFICIENT_STOCK';
  end if;
  insert into public.stock_reservations (order_id, product_id, qty_kg) values (p_order, p_product, p_qty) returning id into v_id;
  return v_id;
end;
$$;

-- Lepaskan (batal pesanan) atau tandai terpakai (serah barang) semua reservasi aktif satu pesanan.
create function public._close_reservations(p_order uuid, p_status public.reservation_status) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if p_status = 'active' then
    raise exception 'Status penutup reservasi harus released atau fulfilled' using errcode = '22023';
  end if;
  update public.stock_reservations set status = p_status where order_id = p_order and status = 'active';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------- view saldo (T3.3) ----------
-- security_invoker: RLS tabel dasar berlaku untuk pembaca view.
create view public.v_stock_balance with (security_invoker = true) as
select
  p.id as product_id,
  p.code,
  p.name,
  p.category,
  p.min_stock_kg,
  p.archived_at,
  coalesce(b.on_hand_kg, 0) as on_hand_kg,
  coalesce(r.reserved_kg, 0) as reserved_kg,
  coalesce(b.on_hand_kg, 0) - coalesce(r.reserved_kg, 0) as available_kg,
  coalesce(b.value_rp, 0) as value_rp,
  case when coalesce(b.on_hand_kg, 0) > 0 then round(b.value_rp / b.on_hand_kg)::bigint end as avg_cost_per_kg,
  coalesce(b.on_hand_kg, 0) - coalesce(r.reserved_kg, 0) < p.min_stock_kg as below_min
from public.products p
left join public.stock_balances b on b.product_id = p.id
left join (select product_id, sum(qty_kg) as reserved_kg from public.stock_reservations where status = 'active' group by product_id) r on r.product_id = p.id;

-- ---------- idempotensi (T3.5, Security.md §6) ----------
create table public.idempotency_keys (
  user_id       uuid not null,
  key           uuid not null,
  endpoint      text not null,
  request_hash  text not null,
  response      jsonb,                  -- null = sedang diproses
  created_at    timestamptz not null default now(),
  primary key (user_id, key)
);

-- Mulai permintaan berkunci. Hasil: {state:'new'} → jalankan aksi; {state:'done', response} → kembalikan hasil tersimpan;
-- {state:'conflict'} → kunci sama, isi berbeda (409); {state:'busy'} → permintaan yang sama masih berjalan.
create function public.idem_begin(p_key uuid, p_endpoint text, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_row public.idempotency_keys%rowtype;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi' using errcode = '42501';
  end if;
  delete from public.idempotency_keys where user_id = v_user and created_at < now() - interval '24 hours';
  insert into public.idempotency_keys (user_id, key, endpoint, request_hash) values (v_user, p_key, p_endpoint, p_hash)
  on conflict (user_id, key) do nothing;
  if found then
    return jsonb_build_object('state', 'new');
  end if;
  select * into v_row from public.idempotency_keys where user_id = v_user and key = p_key for update;
  if v_row.endpoint <> p_endpoint or v_row.request_hash <> p_hash then
    return jsonb_build_object('state', 'conflict');
  end if;
  if v_row.response is null then
    return jsonb_build_object('state', 'busy');
  end if;
  return jsonb_build_object('state', 'done', 'response', v_row.response);
end;
$$;

create function public.idem_finish(p_key uuid, p_response jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.idempotency_keys set response = coalesce(p_response, '{}'::jsonb) where user_id = (select auth.uid()) and key = p_key;
$$;

-- Aksi gagal: lepas kunci agar pengguna bisa mencoba lagi dengan kunci yang sama.
create function public.idem_abort(p_key uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.idempotency_keys where user_id = (select auth.uid()) and key = p_key and response is null;
$$;

-- ---------- RLS & hak ----------
alter table public.document_sequences enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.idempotency_keys enable row level security;

-- Tabel ledger & hasil posting: tanpa hak tulis untuk klien (Security.md §4.2). Satu-satunya jalan tulis = fungsi.
revoke all on public.document_sequences, public.stock_balances, public.stock_movements, public.stock_reservations,
  public.idempotency_keys, public.v_stock_balance from anon, authenticated;
grant select on public.stock_balances, public.stock_movements, public.stock_reservations, public.v_stock_balance to authenticated;

-- Stok — lihat & mutasi: L untuk admin_kelompok, operator_produksi, ketua (PRD §3.1).
create policy stock_balances_select on public.stock_balances for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy stock_reservations_select on public.stock_reservations for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));

revoke execute on function public.next_doc_number(text, date), public._post_movement(uuid, public.stock_direction, numeric, public.movement_type, text, uuid, text, date, bigint, text, text, boolean),
  public._reserve_stock(uuid, uuid, numeric), public._close_reservations(uuid, public.reservation_status), public.reserved_kg(uuid),
  public.ensure_stock_balance(), public.idem_begin(uuid, text, text), public.idem_finish(uuid, jsonb), public.idem_abort(uuid)
from public, anon, authenticated;
-- reserved_kg tetap internal (security definer melewati RLS); pembaca memakai v_stock_balance yang tunduk RLS.
grant execute on function public.idem_begin(uuid, text, text), public.idem_finish(uuid, jsonb), public.idem_abort(uuid) to authenticated;
