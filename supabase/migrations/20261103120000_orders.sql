-- =====================================================================
-- M6 — Penjualan / pesanan (T6.1, T6.3, T6.4) · FR-SAL-02..07
-- Pesanan draft → konfirmasi (nomor INV + reservasi stok, satu transaksi berkunci) → serah barang (reservasi →
-- mutasi sale_out). Batal melepas reservasi. Status barang dan status bayar terpisah (FR-SAL-07); status bayar diisi
-- modul pembayaran M7 (refund saat batal-sesudah-bayar juga ditambahkan di M7, karena tabel payments/refunds belum ada).
-- Harga, qty kg, total, status, dan nomor dihitung di database; nilai klien diabaikan (CLAUDE.md aturan 5).
-- Semua tulis lewat fungsi security definer; klien hanya membaca (RLS).
-- =====================================================================

create type public.order_status as enum ('draft', 'confirmed', 'delivered', 'cancelled');
create type public.order_payment_status as enum ('unpaid', 'partial', 'paid', 'refunded');

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  doc_number       text unique,                                   -- INV-YYYYMM-NNNN, terbit saat konfirmasi
  status           public.order_status not null default 'draft',
  payment_status   public.order_payment_status not null default 'unpaid',
  business_date    date not null default (now() at time zone 'Asia/Jakarta')::date,
  customer_id      uuid not null references public.customers (id),
  customer_name    text not null,                                 -- salinan untuk nota (pelanggan bisa diganti nama/diarsip)
  channel          text not null references public.sales_channels (code),
  note             text check (char_length(note) <= 1000),
  subtotal_rp      bigint not null default 0 check (subtotal_rp >= 0),
  discount_rp      bigint not null default 0 check (discount_rp >= 0),   -- Σ diskon baris
  shipping_rp      bigint not null default 0 check (shipping_rp between 0 and 10000000000),
  total_rp         bigint not null default 0 check (total_rp >= 0),      -- tagihan
  confirmed_at     timestamptz,
  confirmed_by     uuid,
  delivered_on     date,
  delivered_at     timestamptz,
  delivered_by     uuid,
  recipient_name   text check (char_length(recipient_name) <= 120),
  cancelled_at     timestamptz,
  cancelled_by     uuid,
  cancel_reason    text check (char_length(cancel_reason) <= 500),
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'draft') = (doc_number is null)),
  check (total_rp = subtotal_rp - discount_rp + shipping_rp),
  check ((status = 'delivered') = (delivered_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index orders_date_idx on public.orders (business_date desc, created_at desc);
create index orders_customer_idx on public.orders (customer_id);
create index orders_status_idx on public.orders (status);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- Satu baris = satu produk dengan kemasan tertentu (atau kg curah bila product_packaging_id kosong).
-- price_snapshot = harga per satuan baris (per kemasan atau per kg) yang DISALIN dari katalog (FR-SAL-02a).
create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  product_id            uuid not null references public.products (id),
  product_packaging_id  uuid references public.product_packagings (id),
  unit_label            text not null check (char_length(unit_label) <= 80),   -- salinan, mis. "kg" / "Pak 0,5 kg"
  qty_input             numeric(14, 3) not null check (qty_input > 0 and qty_input <= 1000000),
  qty_kg                numeric(14, 3) not null check (qty_kg > 0),
  price_snapshot        bigint not null check (price_snapshot between 0 and 10000000000),
  gross_rp              bigint not null check (gross_rp >= 0),                 -- round(qty_input × price_snapshot)
  discount_rp           bigint not null default 0 check (discount_rp >= 0),
  line_total_rp         bigint not null check (line_total_rp >= 0),
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  check (discount_rp <= gross_rp),
  check (line_total_rp = gross_rp - discount_rp)
);
create index order_items_order_idx on public.order_items (order_id, sort_order);

-- Reservasi (dibuat di M3) kini merujuk pesanan.
alter table public.stock_reservations
  add constraint stock_reservations_order_fk foreign key (order_id) references public.orders (id);

-- ---------- kunci dokumen ----------
create function public.guard_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Pesanan % sudah dikonfirmasi; tidak dapat dihapus, gunakan batal', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- Isi pesanan terkunci. Yang boleh berubah: status barang (confirmed → delivered/cancelled) beserta data serah/batal,
    -- dan status bayar (diisi modul pembayaran M7).
    if (new.doc_number, new.business_date, new.customer_id, new.customer_name, new.channel, new.note, new.subtotal_rp,
        new.discount_rp, new.shipping_rp, new.total_rp, new.confirmed_at, new.confirmed_by, new.created_by)
       is distinct from
       (old.doc_number, old.business_date, old.customer_id, old.customer_name, old.channel, old.note, old.subtotal_rp,
        old.discount_rp, old.shipping_rp, old.total_rp, old.confirmed_at, old.confirmed_by, old.created_by)
       or (new.status <> old.status and (old.status, new.status) not in (('confirmed', 'delivered'), ('confirmed', 'cancelled')))
       or (old.status in ('delivered', 'cancelled')
           and (new.delivered_on, new.delivered_at, new.delivered_by, new.recipient_name, new.cancelled_at, new.cancelled_by, new.cancel_reason)
               is distinct from
               (old.delivered_on, old.delivered_at, old.delivered_by, old.recipient_name, old.cancelled_at, old.cancelled_by, old.cancel_reason)) then
      raise exception 'Pesanan % sudah dikonfirmasi dan terkunci', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    return new;
  end if;
  if new.business_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal pesanan tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger orders_guard before insert or update or delete on public.orders
  for each row execute function public.guard_order();

create function public.guard_order_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status;
begin
  select status into v_status from public.orders where id = coalesce(new.order_id, old.order_id);
  if found and v_status <> 'draft' then
    raise exception 'Pesanan sudah dikonfirmasi; item terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger order_items_guard before insert or update or delete on public.order_items
  for each row execute function public.guard_order_item();

-- ---------- simpan draft (FR-SAL-02, FR-SAL-02a, FR-SAL-03) ----------
-- p_items: [{"product_id": uuid, "product_packaging_id": uuid|null, "qty": "2", "discount_rp": 0}, …]
-- Harga diambil dari katalog saat draft disimpan (kemasan: product_packagings.default_price; curah: products.default_price_per_kg)
-- dan disalin ke item. Setelah konfirmasi, perubahan katalog tidak memengaruhi pesanan.
create function public.save_order_draft(
  p_id uuid, p_date date, p_customer uuid, p_channel text, p_note text, p_shipping_rp bigint, p_items jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_product public.products%rowtype;
  v_pack record;
  v_it jsonb;
  v_id uuid := p_id;
  v_qty numeric;
  v_qty_kg numeric;
  v_price bigint;
  v_gross bigint;
  v_disc bigint;
  v_unit text;
  v_sub bigint := 0;
  v_disc_total bigint := 0;
  v_i int := 0;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat pesanan' using errcode = '42501';
  end if;
  select * into v_customer from public.customers where id = p_customer;
  if not found or v_customer.archived_at is not null then
    raise exception 'Pilih pelanggan yang aktif' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sales_channels where code = p_channel and archived_at is null) then
    raise exception 'Pilih sumber pasar/saluran penjualan' using errcode = '22023';
  end if;
  if p_shipping_rp is null or p_shipping_rp < 0 or p_shipping_rp > 10000000000 then
    raise exception 'Ongkos kirim harus rupiah bulat ≥ 0' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 50 then
    raise exception 'Item pesanan tidak valid (maks. 50 baris)' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.orders (business_date, customer_id, customer_name, channel, note, shipping_rp, total_rp)
    values (coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date), p_customer, v_customer.name, p_channel,
            nullif(btrim(p_note), ''), p_shipping_rp, p_shipping_rp)
    returning * into v_order;
    v_id := v_order.id;
  else
    select * into v_order from public.orders where id = v_id for update;
    if not found then
      raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_order.status <> 'draft' then
      raise exception 'Pesanan % sudah dikonfirmasi dan terkunci', v_order.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    delete from public.order_items where order_id = v_id;
  end if;

  for v_it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_i := v_i + 1;
    if coalesce(v_it ->> 'product_id', '') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Item %: pilih produk', v_i using errcode = '22023';
    end if;
    select * into v_product from public.products where id = (v_it ->> 'product_id')::uuid;
    if not found or v_product.archived_at is not null then
      raise exception 'Item %: produk tidak ditemukan atau sudah diarsip', v_i using errcode = '22023';
    end if;
    if coalesce(v_it ->> 'qty', '') !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$' then
      raise exception 'Item %: jumlah harus angka lebih dari 0, maksimal 3 desimal', v_i using errcode = '22023';
    end if;
    v_qty := (v_it ->> 'qty')::numeric;
    if v_qty <= 0 or v_qty > 1000000 then
      raise exception 'Item %: jumlah harus lebih dari 0', v_i using errcode = '22023';
    end if;
    if coalesce(v_it ->> 'discount_rp', '0') !~ '^[0-9]{1,11}$' then
      raise exception 'Item %: diskon harus rupiah bulat ≥ 0', v_i using errcode = '22023';
    end if;
    v_disc := coalesce((v_it ->> 'discount_rp')::bigint, 0);

    if nullif(v_it ->> 'product_packaging_id', '') is null then
      v_qty_kg := v_qty;
      v_price := v_product.default_price_per_kg;
      v_unit := 'kg';
    else
      if (v_it ->> 'product_packaging_id') !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'Item %: kemasan tidak valid', v_i using errcode = '22023';
      end if;
      select pp.id, pp.product_id, pp.content_kg, pp.default_price, pp.archived_at, k.name as pack_name
        into v_pack
        from public.product_packagings pp join public.packagings k on k.id = pp.packaging_id
       where pp.id = (v_it ->> 'product_packaging_id')::uuid;
      if not found or v_pack.product_id <> v_product.id or v_pack.archived_at is not null then
        raise exception 'Item %: kemasan tidak berlaku untuk produk ini', v_i using errcode = '22023';
      end if;
      v_qty_kg := public.packaging_qty_kg(v_pack.id, v_qty);
      v_price := v_pack.default_price;
      v_unit := v_pack.pack_name || ' ' || replace(trim(trailing '.' from trim(trailing '0' from v_pack.content_kg::text)), '.', ',') || ' kg';
    end if;
    if v_qty_kg is null or v_qty_kg <= 0 then
      raise exception 'Item %: hasil konversi ke kg harus lebih dari 0', v_i using errcode = '22023';
    end if;
    if v_price is null then
      raise exception 'Item %: harga % (%) belum ditetapkan di katalog produk', v_i, v_product.name, v_unit using errcode = '22023';
    end if;
    v_gross := round(v_qty * v_price)::bigint;
    if v_disc > v_gross then
      raise exception 'Item %: diskon melebihi nilai baris', v_i using errcode = '22023';
    end if;

    insert into public.order_items (order_id, product_id, product_packaging_id, unit_label, qty_input, qty_kg, price_snapshot,
                                    gross_rp, discount_rp, line_total_rp, sort_order)
    values (v_id, v_product.id, nullif(v_it ->> 'product_packaging_id', '')::uuid, v_unit, v_qty, v_qty_kg, v_price,
            v_gross, v_disc, v_gross - v_disc, v_i);
    v_sub := v_sub + v_gross;
    v_disc_total := v_disc_total + v_disc;
  end loop;

  update public.orders
     set business_date = coalesce(p_date, business_date), customer_id = p_customer, customer_name = v_customer.name,
         channel = p_channel, note = nullif(btrim(p_note), ''), subtotal_rp = v_sub, discount_rp = v_disc_total,
         shipping_rp = p_shipping_rp, total_rp = v_sub - v_disc_total + p_shipping_rp
   where id = v_id;

  perform public.write_audit(case when p_id is null then 'order.draft_created' else 'order.draft_updated' end,
    'order', v_id::text, null,
    jsonb_build_object('customer_id', p_customer, 'channel', p_channel, 'items', v_i, 'subtotal_rp', v_sub,
                       'discount_rp', v_disc_total, 'shipping_rp', p_shipping_rp, 'total_rp', v_sub - v_disc_total + p_shipping_rp));
  return v_id;
end;
$$;

create function public.delete_order_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat menghapus draft pesanan' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  delete from public.orders where id = p_id;   -- guard menolak bila bukan draft
  perform public.write_audit('order.draft_deleted', 'order', p_id::text, to_jsonb(v_order) - 'updated_at', null);
end;
$$;

-- ---------- konfirmasi (FR-SAL-04) ----------
-- Satu transaksi: kunci pesanan, kunci saldo setiap produk (urut product_id, cegah deadlock), cek tersedia per produk
-- (Σ kg semua baris produk tsb.), simpan reservasi, terbitkan INV. Dua pesanan yang bersaing atas stok sama: yang kedua
-- menunggu kunci saldo lalu melihat reservasi pertama, sehingga hanya yang stoknya cukup yang terkonfirmasi.
create function public.confirm_order(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.orders%rowtype;
  v_after public.orders%rowtype;
  v_line record;
  v_doc text;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mengonfirmasi pesanan' using errcode = '42501';
  end if;
  select * into v_before from public.orders where id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status in ('confirmed', 'delivered') then
    return jsonb_build_object('id', v_before.id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'total_rp', v_before.total_rp, 'already', true);
  end if;
  if v_before.status <> 'draft' then
    raise exception 'Pesanan yang sudah dibatalkan tidak dapat dikonfirmasi' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if not exists (select 1 from public.order_items where order_id = p_id) then
    raise exception 'Pesanan wajib punya minimal satu item' using errcode = '22023';
  end if;

  insert into public.stock_balances (product_id) select distinct product_id from public.order_items where order_id = p_id on conflict do nothing;
  perform 1 from public.stock_balances where product_id in (select product_id from public.order_items where order_id = p_id)
   order by product_id for update;
  for v_line in select product_id, sum(qty_kg) as qty_kg from public.order_items where order_id = p_id group by product_id order by product_id loop
    perform public._reserve_stock(p_id, v_line.product_id, v_line.qty_kg);
  end loop;

  v_doc := public.next_doc_number('INV', v_before.business_date);
  update public.orders
     set status = 'confirmed', doc_number = v_doc, confirmed_at = now(), confirmed_by = (select auth.uid())
   where id = p_id
   returning * into v_after;
  perform public.write_audit('order.confirmed', 'order', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
  return jsonb_build_object('id', p_id, 'doc_number', v_doc, 'status', v_after.status, 'total_rp', v_after.total_rp, 'already', false);
end;
$$;

-- ---------- batal (FR-SAL-06) ----------
-- confirmed → cancelled: reservasi dilepas. Draft cukup dihapus; delivered tidak bisa dibatalkan (gunakan retur).
-- M7 akan menambahkan: bila sudah ada pembayaran terverifikasi, catat refund (kas keluar) dalam transaksi yang sama.
create function public.cancel_order(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.orders%rowtype;
  v_after public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_released int;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat membatalkan pesanan' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan pembatalan wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  select * into v_before from public.orders where id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status = 'cancelled' then
    return jsonb_build_object('id', v_before.id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'already', true);
  end if;
  if v_before.status = 'draft' then
    raise exception 'Draft tidak perlu dibatalkan; hapus saja draftnya' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v_before.status = 'delivered' then
    raise exception 'Pesanan % sudah diserahkan; gunakan retur barang', v_before.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;

  v_released := public._close_reservations(p_id, 'released');
  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = v_reason
   where id = p_id
   returning * into v_after;
  perform public.write_audit('order.cancelled', 'order', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at', v_reason);
  return jsonb_build_object('id', p_id, 'doc_number', v_after.doc_number, 'status', v_after.status, 'released', v_released, 'already', false);
end;
$$;

-- ---------- serah barang (FR-SAL-05) ----------
-- Reservasi aktif → mutasi sale_out (nilai = rata-rata bergerak saat serah) → reservasi fulfilled. Tidak bergantung
-- status bayar. v1 hanya serah penuh.
create function public.fulfill_order(p_id uuid, p_recipient text, p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.orders%rowtype;
  v_after public.orders%rowtype;
  v_res record;
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_recipient text := nullif(btrim(coalesce(p_recipient, '')), '');
  v_n int := 0;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat serah barang' using errcode = '42501';
  end if;
  if char_length(v_recipient) > 120 then
    raise exception 'Nama penerima maksimal 120 karakter' using errcode = '22023';
  end if;
  select * into v_before from public.orders where id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status = 'delivered' then
    return jsonb_build_object('id', v_before.id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'already', true);
  end if;
  if v_before.status <> 'confirmed' then
    raise exception 'Hanya pesanan terkonfirmasi yang dapat diserahkan' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date or v_date < v_before.business_date then
    raise exception 'Tanggal serah harus antara tanggal pesanan dan hari ini' using errcode = '22023';
  end if;

  perform 1 from public.stock_balances where product_id in (select product_id from public.stock_reservations where order_id = p_id and status = 'active')
   order by product_id for update;
  for v_res in select product_id, qty_kg from public.stock_reservations where order_id = p_id and status = 'active' order by product_id loop
    perform public._post_movement(v_res.product_id, 'out', v_res.qty_kg, 'sale_out', 'order', p_id, v_before.doc_number, v_date,
                                  null, v_res.product_id::text, 'Serah ' || v_before.doc_number, true);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'Reservasi pesanan tidak ditemukan' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  perform public._close_reservations(p_id, 'fulfilled');

  update public.orders
     set status = 'delivered', delivered_on = v_date, delivered_at = now(), delivered_by = (select auth.uid()), recipient_name = v_recipient
   where id = p_id
   returning * into v_after;
  perform public.write_audit('order.delivered', 'order', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
  return jsonb_build_object('id', p_id, 'doc_number', v_after.doc_number, 'status', v_after.status, 'already', false);
end;
$$;

-- ---------- saldo tagihan (dilengkapi M7: dibayar terverifikasi & refund) ----------
create view public.v_order_balance with (security_invoker = true) as
select
  o.id as order_id,
  o.doc_number,
  o.customer_id,
  o.status,
  o.payment_status,
  o.total_rp,
  0::bigint as paid_rp,
  0::bigint as refunded_rp,
  case when o.status in ('confirmed', 'delivered') then o.total_rp else 0 end::bigint as outstanding_rp
from public.orders o;

-- ---------- RLS & hak ----------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.orders, public.order_items, public.v_order_balance from anon, authenticated;
grant select on public.orders, public.order_items, public.v_order_balance to authenticated;

-- Pesanan: kelola = admin_kelompok (lewat fungsi); lihat = admin_kelompok, ketua (PRD §3.1). Operator & admin teknis tidak.
create policy orders_select on public.orders for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy order_items_select on public.order_items for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua'));

revoke execute on function public.guard_order(), public.guard_order_item() from public, anon, authenticated;
revoke execute on function public.save_order_draft(uuid, date, uuid, text, text, bigint, jsonb), public.delete_order_draft(uuid),
  public.confirm_order(uuid), public.cancel_order(uuid, text), public.fulfill_order(uuid, text, date) from public, anon;
grant execute on function public.save_order_draft(uuid, date, uuid, text, text, bigint, jsonb), public.delete_order_draft(uuid),
  public.confirm_order(uuid), public.cancel_order(uuid, text), public.fulfill_order(uuid, text, date) to authenticated;
