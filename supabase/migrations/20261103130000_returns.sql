-- =====================================================================
-- M6 — Retur barang (T6.7) · FR-SAL-10, PRD Q7
-- Retur atas pesanan yang sudah diserahkan: dicatat admin_kelompok (draft, tanpa efek stok) → diverifikasi fisik oleh
-- ketua (nomor RTR + mutasi return_in, tepat satu kali). Pencatat ≠ pemverifikasi (Security.md §4.3), termasuk bila satu
-- akun merangkap kedua peran. Barang yang sudah diserahkan hanya kembali ke stok lewat jalur ini (CLAUDE.md aturan 1).
-- Nilai jual retur (sales_value_rp) disimpan untuk pengurang omzet di laporan (M8); refund uang dicatat di M7.
-- =====================================================================

create type public.return_status as enum ('draft', 'verified');

create table public.order_returns (
  id               uuid primary key default gen_random_uuid(),
  doc_number       text unique,                                     -- RTR-YYYYMM-NNNN, terbit saat verifikasi
  status           public.return_status not null default 'draft',
  order_id         uuid not null references public.orders (id),
  business_date    date not null default (now() at time zone 'Asia/Jakarta')::date,   -- tanggal barang kembali
  reason           text not null check (char_length(reason) between 5 and 500),
  total_kg         numeric(14, 3) not null default 0 check (total_kg >= 0),
  sales_value_rp   bigint not null default 0 check (sales_value_rp >= 0),           -- pengurang omzet
  stock_value_rp   bigint check (stock_value_rp >= 0),                              -- nilai persediaan masuk, saat verifikasi
  created_by       uuid not null default auth.uid(),
  created_by_name  text not null,                                    -- salinan nama: ketua tidak bisa membaca profiles lain
  verified_at      timestamptz,
  verified_by      uuid,
  verified_by_name text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'draft') = (doc_number is null)),
  check ((status = 'verified') = (verified_at is not null)),
  check (verified_by is null or verified_by <> created_by)
);
create index order_returns_order_idx on public.order_returns (order_id);
create index order_returns_status_idx on public.order_returns (status, business_date desc);
create trigger order_returns_touch before update on public.order_returns for each row execute function public.touch_updated_at();

create table public.order_return_items (
  id              uuid primary key default gen_random_uuid(),
  return_id       uuid not null references public.order_returns (id) on delete cascade,
  order_item_id   uuid not null references public.order_items (id),
  product_id      uuid not null references public.products (id),
  qty_kg          numeric(14, 3) not null check (qty_kg > 0),
  sales_value_rp  bigint not null check (sales_value_rp >= 0),      -- round(nilai baris × kg retur ÷ kg baris)
  stock_value_rp  bigint check (stock_value_rp >= 0),
  sort_order      integer not null default 0,
  unique (return_id, order_item_id)
);
create index order_return_items_item_idx on public.order_return_items (order_item_id);

-- ---------- kunci dokumen ----------
create function public.guard_order_return() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Retur % sudah diverifikasi dan tidak dapat dihapus', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    raise exception 'Retur % sudah diverifikasi dan terkunci', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if tg_op = 'UPDATE' and (new.order_id, new.created_by) is distinct from (old.order_id, old.created_by) then
    raise exception 'Pesanan dan pencatat retur tidak dapat diubah' using errcode = 'P0001';
  end if;
  if new.business_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal retur tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger order_returns_guard before insert or update or delete on public.order_returns
  for each row execute function public.guard_order_return();

create function public.guard_order_return_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.return_status;
begin
  select status into v_status from public.order_returns where id = coalesce(new.return_id, old.return_id);
  if found and v_status <> 'draft' then
    raise exception 'Retur sudah diverifikasi; rincian terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger order_return_items_guard before insert or update or delete on public.order_return_items
  for each row execute function public.guard_order_return_item();

-- kg yang sudah diretur (terverifikasi) per baris pesanan, selain retur p_except
create function public._returned_kg(p_order_item uuid, p_except uuid default null) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(ri.qty_kg), 0)
    from public.order_return_items ri join public.order_returns r on r.id = ri.return_id
   where ri.order_item_id = p_order_item and r.status = 'verified' and r.id is distinct from p_except;
$$;

-- ---------- catat retur (draft) ----------
-- p_items: [{"order_item_id": uuid, "qty_kg": "2"}, …]. Setiap baris ≤ kg diserahkan − retur terverifikasi sebelumnya.
-- Draft belum mengubah stok; batas diperiksa ulang saat verifikasi (dua draft bisa bersaing atas sisa yang sama).
create function public.create_return(p_order uuid, p_date date, p_reason text, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_id uuid;
  v_it jsonb;
  v_qty numeric;
  v_left numeric;
  v_value bigint;
  v_total_kg numeric := 0;
  v_total_value bigint := 0;
  v_i int := 0;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat retur' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan retur wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_order.status <> 'delivered' then
    raise exception 'Retur hanya untuk pesanan yang sudah diserahkan' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v_date < v_order.delivered_on or v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal retur harus antara tanggal serah dan hari ini' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Retur wajib punya minimal satu baris (maks. 50)' using errcode = '22023';
  end if;

  insert into public.order_returns (order_id, business_date, reason, created_by_name)
  values (p_order, v_date, v_reason, coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Admin'))
  returning id into v_id;

  for v_it in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    if coalesce(v_it ->> 'order_item_id', '') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Baris %: item pesanan tidak valid', v_i using errcode = '22023';
    end if;
    select * into v_item from public.order_items where id = (v_it ->> 'order_item_id')::uuid and order_id = p_order;
    if not found then
      raise exception 'Baris %: item bukan bagian dari pesanan ini', v_i using errcode = '22023';
    end if;
    if coalesce(v_it ->> 'qty_kg', '') !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$' or (v_it ->> 'qty_kg')::numeric <= 0 then
      raise exception 'Baris %: berat retur harus lebih dari 0 kg, maksimal 3 desimal', v_i using errcode = '22023';
    end if;
    v_qty := (v_it ->> 'qty_kg')::numeric;
    v_left := v_item.qty_kg - public._returned_kg(v_item.id);
    if v_qty > v_left then
      raise exception 'Baris %: retur % kg melebihi sisa yang bisa diretur (% kg)', v_i, v_qty, v_left using errcode = '22023';
    end if;
    v_value := round(v_item.line_total_rp * v_qty / v_item.qty_kg)::bigint;
    insert into public.order_return_items (return_id, order_item_id, product_id, qty_kg, sales_value_rp, sort_order)
    values (v_id, v_item.id, v_item.product_id, v_qty, v_value, v_i);   -- unique: baris pesanan sama dua kali ditolak
    v_total_kg := v_total_kg + v_qty;
    v_total_value := v_total_value + v_value;
  end loop;

  update public.order_returns set total_kg = v_total_kg, sales_value_rp = v_total_value where id = v_id;
  perform public.write_audit('return.draft_created', 'order_return', v_id::text, null,
    jsonb_build_object('order_id', p_order, 'order_doc', v_order.doc_number, 'total_kg', v_total_kg, 'sales_value_rp', v_total_value), v_reason);
  return v_id;
end;
$$;

create function public.delete_return_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ret public.order_returns%rowtype;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat menghapus draft retur' using errcode = '42501';
  end if;
  select * into v_ret from public.order_returns where id = p_id for update;
  if not found then
    raise exception 'Retur tidak ditemukan' using errcode = 'P0002';
  end if;
  delete from public.order_returns where id = p_id;   -- guard menolak bila sudah diverifikasi
  perform public.write_audit('return.draft_deleted', 'order_return', p_id::text, to_jsonb(v_ret) - 'updated_at', null);
end;
$$;

-- ---------- verifikasi fisik (ketua) ----------
-- Satu transaksi: kunci retur & pesanan, cek ulang sisa per baris, nomor RTR, mutasi return_in per baris dengan nilai
-- persediaan = nilai saat barang keluar (rata-rata sale_out pesanan tsb.), tidak melebihi nilai yang keluar.
create function public.verify_return(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.order_returns%rowtype;
  v_after public.order_returns%rowtype;
  v_order public.orders%rowtype;
  v_line record;
  v_doc text;
  v_out_qty numeric;
  v_out_value bigint;
  v_back_value bigint;
  v_val bigint;
  v_total bigint := 0;
begin
  if not public.has_role('ketua') then
    raise exception 'Hanya ketua yang dapat memverifikasi retur fisik' using errcode = '42501';
  end if;
  select * into v_before from public.order_returns where id = p_id for update;
  if not found then
    raise exception 'Retur tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status = 'verified' then
    return jsonb_build_object('id', v_before.id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'already', true);
  end if;
  if v_before.created_by = (select auth.uid()) then
    raise exception 'Pencatat retur tidak boleh memverifikasi retur yang dicatatnya sendiri' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = v_before.order_id for update;

  for v_line in select ri.order_item_id, ri.qty_kg, oi.qty_kg as sold_kg
                  from public.order_return_items ri join public.order_items oi on oi.id = ri.order_item_id
                 where ri.return_id = p_id loop
    if v_line.qty_kg > v_line.sold_kg - public._returned_kg(v_line.order_item_id, p_id) then
      raise exception 'Retur melebihi sisa yang bisa diretur (sudah ada retur lain yang diverifikasi)' using errcode = 'P0001', hint = 'RETURN_EXCEEDS_DELIVERED';
    end if;
  end loop;

  v_doc := public.next_doc_number('RTR', v_before.business_date);
  insert into public.stock_balances (product_id) select distinct product_id from public.order_return_items where return_id = p_id on conflict do nothing;
  perform 1 from public.stock_balances where product_id in (select product_id from public.order_return_items where return_id = p_id)
   order by product_id for update;

  for v_line in select id, order_item_id, product_id, qty_kg from public.order_return_items where return_id = p_id order by product_id, sort_order loop
    select coalesce(sum(qty_kg), 0), coalesce(sum(value_rp), 0) into v_out_qty, v_out_value
      from public.stock_movements where source_type = 'order' and source_id = v_before.order_id and product_id = v_line.product_id and movement_type = 'sale_out';
    select coalesce(sum(m.value_rp), 0) into v_back_value
      from public.stock_movements m join public.order_returns r on r.id = m.source_id
     where m.source_type = 'return' and r.order_id = v_before.order_id and m.product_id = v_line.product_id and m.movement_type = 'return_in';
    v_val := case when v_out_qty > 0 then least(round(v_out_value * v_line.qty_kg / v_out_qty)::bigint, greatest(v_out_value - v_back_value, 0)) else 0 end;
    perform public._post_movement(v_line.product_id, 'in', v_line.qty_kg, 'return_in', 'return', p_id, v_doc, v_before.business_date,
                                  v_val, v_line.order_item_id::text, 'Retur ' || v_doc || ' atas ' || v_order.doc_number);
    update public.order_return_items set stock_value_rp = v_val where id = v_line.id;
    v_total := v_total + v_val;
  end loop;

  update public.order_returns
     set status = 'verified', doc_number = v_doc, stock_value_rp = v_total, verified_at = now(), verified_by = (select auth.uid()),
         verified_by_name = coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Ketua')
   where id = p_id
   returning * into v_after;
  perform public.write_audit('return.verified', 'order_return', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
  return jsonb_build_object('id', p_id, 'doc_number', v_doc, 'status', v_after.status, 'total_kg', v_after.total_kg, 'already', false);
end;
$$;

-- ---------- RLS & hak ----------
alter table public.order_returns enable row level security;
alter table public.order_return_items enable row level security;

revoke all on public.order_returns, public.order_return_items from anon, authenticated;
grant select on public.order_returns, public.order_return_items to authenticated;

-- Retur: catat = admin_kelompok, verifikasi = ketua (lewat fungsi); lihat = keduanya (PRD §3.1, Q7).
create policy order_returns_select on public.order_returns for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy order_return_items_select on public.order_return_items for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua'));

revoke execute on function public.guard_order_return(), public.guard_order_return_item(), public._returned_kg(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.create_return(uuid, date, text, jsonb), public.delete_return_draft(uuid), public.verify_return(uuid) from public, anon;
grant execute on function public.create_return(uuid, date, text, jsonb), public.delete_return_draft(uuid), public.verify_return(uuid) to authenticated;
