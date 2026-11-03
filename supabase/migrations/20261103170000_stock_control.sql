-- =====================================================================
-- M9 — Stok opname, koreksi stok, pembatalan batch (T9.1, T9.2, T5.7) + batas piutang pelanggan (T6.6)
-- Stok tetap hanya berubah lewat buku mutasi (CLAUDE.md aturan 1): opname → opname_adjust, koreksi → correction,
-- pembatalan batch → reversal. Koreksi stok & pembatalan batch butuh persetujuan ketua (pengaju ≠ penyetuju,
-- Security.md §4.3, FR-PRD-08). Riwayat tidak pernah dihapus.
-- =====================================================================

create type public.opname_status as enum ('draft', 'posted');

-- ---------- batas piutang pelanggan (FR-SAL-01, FR-SAL-09 / T6.6) ----------
alter table public.customers add column credit_limit_rp bigint check (credit_limit_rp between 0 and 10000000000);

-- ---------- stok opname (T9.1, FR-STK-03) ----------
create table public.stock_opnames (
  id             uuid primary key default gen_random_uuid(),
  doc_number     text unique,                               -- OPN-YYYYMM-NN, terbit saat posting
  status         public.opname_status not null default 'draft',
  business_date  date not null default (now() at time zone 'Asia/Jakarta')::date,
  note           text check (char_length(note) <= 1000),
  created_by     uuid default auth.uid(),
  created_by_name text not null,
  posted_at      timestamptz,
  posted_by      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((status = 'draft') = (doc_number is null))
);
create trigger stock_opnames_touch before update on public.stock_opnames for each row execute function public.touch_updated_at();

create table public.stock_opname_lines (
  id           uuid primary key default gen_random_uuid(),
  opname_id    uuid not null references public.stock_opnames (id) on delete cascade,
  product_id   uuid not null references public.products (id),
  physical_kg  numeric(14, 3) not null check (physical_kg >= 0 and physical_kg <= 1000000),
  system_kg    numeric(14, 3),                              -- fisik tercatat saat posting
  diff_kg      numeric(14, 3),                              -- physical − system
  value_rp     bigint,                                      -- nilai mutasi penyesuaian
  unique (opname_id, product_id)
);

create function public.guard_opname() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Opname % sudah diposting dan tidak dapat dihapus', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    raise exception 'Opname % sudah diposting dan terkunci', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if new.business_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal opname tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger stock_opnames_guard before insert or update or delete on public.stock_opnames for each row execute function public.guard_opname();

create function public.guard_opname_line() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.opname_status;
begin
  select status into v from public.stock_opnames where id = coalesce(new.opname_id, old.opname_id);
  if found and v <> 'draft' and current_setting('app.opname_posting', true) is distinct from 'on' then
    raise exception 'Opname sudah diposting; baris terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger stock_opname_lines_guard before insert or update or delete on public.stock_opname_lines for each row execute function public.guard_opname_line();

create function public._can_count_stock() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('admin_kelompok') or public.has_role('operator_produksi');
$$;

-- p_lines: [{"product_id": uuid, "physical_kg": "38.5"}, …]
create function public.save_opname_draft(p_id uuid, p_date date, p_note text, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_status public.opname_status;
  v_l jsonb;
  v_i int := 0;
begin
  if not public._can_count_stock() then
    raise exception 'Hanya admin kelompok atau operator produksi yang dapat mencatat stok opname' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 or jsonb_array_length(p_lines) > 100 then
    raise exception 'Opname wajib berisi minimal satu produk (maks. 100)' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.stock_opnames (business_date, note, created_by_name)
    values (coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date), nullif(btrim(p_note), ''),
            coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Petugas'))
    returning id into v_id;
  else
    select status into v_status from public.stock_opnames where id = v_id for update;
    if not found then
      raise exception 'Opname tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_status <> 'draft' then
      raise exception 'Opname sudah diposting dan terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    update public.stock_opnames set business_date = coalesce(p_date, business_date), note = nullif(btrim(p_note), '') where id = v_id;
    delete from public.stock_opname_lines where opname_id = v_id;
  end if;
  for v_l in select * from jsonb_array_elements(p_lines) loop
    v_i := v_i + 1;
    if coalesce(v_l ->> 'product_id', '') !~ '^[0-9a-fA-F-]{36}$' or not exists (select 1 from public.products where id = (v_l ->> 'product_id')::uuid) then
      raise exception 'Baris %: produk tidak valid', v_i using errcode = '22023';
    end if;
    if coalesce(v_l ->> 'physical_kg', '') !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$' then
      raise exception 'Baris %: berat fisik harus angka ≥ 0, maksimal 3 desimal', v_i using errcode = '22023';
    end if;
    insert into public.stock_opname_lines (opname_id, product_id, physical_kg) values (v_id, (v_l ->> 'product_id')::uuid, (v_l ->> 'physical_kg')::numeric);
  end loop;
  perform public.write_audit(case when p_id is null then 'opname.created' else 'opname.updated' end, 'stock_opname', v_id::text, null, jsonb_build_object('lines', v_i));
  return v_id;
end;
$$;

create function public.delete_opname_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._can_count_stock() then
    raise exception 'Tidak berhak menghapus opname' using errcode = '42501';
  end if;
  delete from public.stock_opnames where id = p_id;   -- guard menolak bila sudah diposting
  if not found then
    raise exception 'Opname tidak ditemukan' using errcode = 'P0002';
  end if;
  perform public.write_audit('opname.deleted', 'stock_opname', p_id::text);
end;
$$;

-- Posting: kunci saldo (urut product_id), selisih = fisik − tercatat; selisih ≠ 0 → satu mutasi opname_adjust.
-- Nilai: keluar = rata-rata bergerak; masuk = selisih × rata-rata saat ini (0 bila stok kosong).
create function public.post_opname(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.stock_opnames%rowtype;
  v_line record;
  v_bal public.stock_balances%rowtype;
  v_diff numeric;
  v_val bigint;
  v_mid bigint;
  v_doc text;
  v_n int := 0;
begin
  if not public._can_count_stock() then
    raise exception 'Hanya admin kelompok atau operator produksi yang dapat memposting opname' using errcode = '42501';
  end if;
  select * into v from public.stock_opnames where id = p_id for update;
  if not found then
    raise exception 'Opname tidak ditemukan' using errcode = 'P0002';
  end if;
  if v.status = 'posted' then
    return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', 'posted', 'already', true);
  end if;
  insert into public.stock_balances (product_id) select product_id from public.stock_opname_lines where opname_id = p_id on conflict do nothing;
  perform 1 from public.stock_balances where product_id in (select product_id from public.stock_opname_lines where opname_id = p_id) order by product_id for update;
  v_doc := public.next_doc_number('OPN', v.business_date);
  perform set_config('app.opname_posting', 'on', true);
  for v_line in select id, product_id, physical_kg from public.stock_opname_lines where opname_id = p_id order by product_id loop
    select * into v_bal from public.stock_balances where product_id = v_line.product_id;
    v_diff := v_line.physical_kg - v_bal.on_hand_kg;
    v_val := 0;
    if v_diff > 0 then
      v_val := case when v_bal.on_hand_kg > 0 then round(v_diff * v_bal.value_rp / v_bal.on_hand_kg)::bigint else 0 end;
      perform public._post_movement(v_line.product_id, 'in', v_diff, 'opname_adjust', 'opname', p_id, v_doc, v.business_date, v_val, v_line.id::text, 'Opname ' || v_doc);
      v_n := v_n + 1;
    elsif v_diff < 0 then
      v_mid := public._post_movement(v_line.product_id, 'out', -v_diff, 'opname_adjust', 'opname', p_id, v_doc, v.business_date, null, v_line.id::text, 'Opname ' || v_doc, true);
      select value_rp into v_val from public.stock_movements where id = v_mid;
      v_n := v_n + 1;
    end if;
    update public.stock_opname_lines set system_kg = v_bal.on_hand_kg, diff_kg = v_diff, value_rp = v_val where id = v_line.id;
  end loop;
  perform set_config('app.opname_posting', 'off', true);
  update public.stock_opnames set status = 'posted', doc_number = v_doc, posted_at = now(), posted_by = (select auth.uid()) where id = p_id;
  perform public.write_audit('opname.posted', 'stock_opname', p_id::text, null, jsonb_build_object('doc_number', v_doc, 'adjustments', v_n));
  return jsonb_build_object('id', p_id, 'doc_number', v_doc, 'status', 'posted', 'adjustments', v_n, 'already', false);
end;
$$;

-- ---------- koreksi stok (T9.2, FR-STK-04): ajukan admin/operator → setujui/tolak ketua ----------
create table public.stock_adjustments (
  id               uuid primary key default gen_random_uuid(),
  doc_number       text not null unique,                    -- ADJ-YYYYMM-NNNN, terbit saat diajukan
  product_id       uuid not null references public.products (id),
  direction        public.stock_direction not null,
  qty_kg           numeric(14, 3) not null check (qty_kg > 0 and qty_kg <= 1000000),
  reason           text not null check (char_length(reason) between 5 and 500),
  business_date    date not null,
  status           public.correction_status not null default 'pending',
  value_rp         bigint,
  requested_by     uuid not null default auth.uid(),
  requested_by_name text not null,
  decided_at       timestamptz,
  decided_by       uuid,
  decided_by_name  text,
  decision_note    text check (char_length(decision_note) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null)),
  check (decided_by is null or decided_by <> requested_by)
);
create index stock_adjustments_status_idx on public.stock_adjustments (status, created_at desc);
create trigger stock_adjustments_touch before update on public.stock_adjustments for each row execute function public.touch_updated_at();

create function public.guard_stock_adjustment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.status <> 'pending'
     or (new.product_id, new.direction, new.qty_kg, new.reason, new.business_date, new.requested_by, new.doc_number)
        is distinct from (old.product_id, old.direction, old.qty_kg, old.reason, old.business_date, old.requested_by, old.doc_number) then
    raise exception 'Koreksi stok sudah diputuskan atau isinya terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return new;
end;
$$;
create trigger stock_adjustments_guard before update or delete on public.stock_adjustments for each row execute function public.guard_stock_adjustment();

create function public.request_stock_adjustment(p_product uuid, p_direction text, p_qty numeric, p_reason text, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_doc text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
begin
  if not public._can_count_stock() then
    raise exception 'Hanya admin kelompok atau operator produksi yang dapat mengajukan koreksi stok' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'Pilih arah koreksi (tambah/kurang)' using errcode = '22023';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000000 or p_qty <> round(p_qty, 3) then
    raise exception 'Berat koreksi harus lebih dari 0 kg, maksimal 3 desimal' using errcode = '22023';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan koreksi wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  if not exists (select 1 from public.products where id = p_product) then
    raise exception 'Produk tidak ditemukan' using errcode = 'P0002';
  end if;
  v_doc := public.next_doc_number('ADJ', v_date);
  insert into public.stock_adjustments (id, doc_number, product_id, direction, qty_kg, reason, business_date, requested_by_name)
  values (v_id, v_doc, p_product, p_direction::public.stock_direction, p_qty, v_reason, v_date,
          coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Petugas'));
  perform public.write_audit('stock_adjustment.requested', 'stock_adjustment', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'direction', p_direction, 'qty_kg', p_qty), v_reason);
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'status', 'pending', 'already', false);
end;
$$;

create function public.decide_stock_adjustment(p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.stock_adjustments%rowtype;
  v_bal public.stock_balances%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_val bigint := null;
  v_mid bigint;
begin
  if not public.has_role('ketua') then
    raise exception 'Hanya ketua yang dapat memutuskan koreksi stok' using errcode = '42501';
  end if;
  select * into v from public.stock_adjustments where id = p_id for update;
  if not found then
    raise exception 'Koreksi stok tidak ditemukan' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    if (v.status = 'approved') = coalesce(p_approve, false) then
      return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', v.status, 'already', true);
    end if;
    raise exception 'Koreksi % sudah diputuskan', v.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v.requested_by = (select auth.uid()) then
    raise exception 'Pengaju koreksi tidak boleh menyetujui/menolak koreksinya sendiri' using errcode = '42501';
  end if;
  if not coalesce(p_approve, false) and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Alasan penolakan wajib diisi (min. 5 karakter)' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Catatan maksimal 500 karakter' using errcode = '22023';
  end if;
  if coalesce(p_approve, false) then
    insert into public.stock_balances (product_id) values (v.product_id) on conflict do nothing;
    select * into v_bal from public.stock_balances where product_id = v.product_id for update;
    if v.direction = 'in' then
      v_val := case when v_bal.on_hand_kg > 0 then round(v.qty_kg * v_bal.value_rp / v_bal.on_hand_kg)::bigint else 0 end;
      perform public._post_movement(v.product_id, 'in', v.qty_kg, 'correction', 'adjustment', p_id, v.doc_number, v.business_date, v_val, '', 'Koreksi: ' || v.reason);
    else
      v_mid := public._post_movement(v.product_id, 'out', v.qty_kg, 'correction', 'adjustment', p_id, v.doc_number, v.business_date, null, '', 'Koreksi: ' || v.reason);
      select value_rp into v_val from public.stock_movements where id = v_mid;
    end if;
  end if;
  update public.stock_adjustments
     set status = case when p_approve then 'approved'::public.correction_status else 'rejected'::public.correction_status end,
         value_rp = v_val, decided_at = now(), decided_by = (select auth.uid()), decision_note = v_note,
         decided_by_name = coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Ketua')
   where id = p_id;
  perform public.write_audit(case when p_approve then 'stock_adjustment.approved' else 'stock_adjustment.rejected' end,
    'stock_adjustment', p_id::text, to_jsonb(v) - 'updated_at', null, coalesce(v_note, v.reason));
  return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', case when p_approve then 'approved' else 'rejected' end, 'already', false);
end;
$$;

-- ---------- pembatalan batch (T5.7, FR-PRD-08): ajukan operator → setujui/tolak ketua ----------
create function public.request_production_void(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.production_batches%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_role('operator_produksi') then
    raise exception 'Hanya operator produksi yang dapat mengajukan pembatalan batch' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan pembatalan wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  select * into v from public.production_batches where id = p_id for update;
  if not found then
    raise exception 'Batch tidak ditemukan' using errcode = 'P0002';
  end if;
  if v.status = 'pending_void' then
    return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', v.status, 'already', true);
  end if;
  if v.status <> 'confirmed' then
    raise exception 'Hanya batch terkonfirmasi yang dapat diajukan pembatalannya' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  update public.production_batches
     set status = 'pending_void', void_reason = v_reason, void_requested_at = now(), void_requested_by = (select auth.uid())
   where id = p_id;
  perform public.write_audit('production.void_requested', 'production_batch', p_id::text, null, jsonb_build_object('doc_number', v.doc_number), v_reason);
  return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', 'pending_void', 'already', false);
end;
$$;

-- Setujui: output keluar & bahan masuk kembali dengan nilai semula (mutasi reversal); ditolak bila hasil batch sudah
-- terpakai/terjual sehingga stok tersedia tidak cukup. Tolak: kembali confirmed.
create function public.decide_production_void(p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.production_batches%rowtype;
  v_line record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_role('ketua') then
    raise exception 'Hanya ketua yang dapat memutuskan pembatalan batch' using errcode = '42501';
  end if;
  select * into v from public.production_batches where id = p_id for update;
  if not found then
    raise exception 'Batch tidak ditemukan' using errcode = 'P0002';
  end if;
  if v.status = 'void' and coalesce(p_approve, false) then
    return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', 'void', 'already', true);
  end if;
  if v.status <> 'pending_void' then
    raise exception 'Batch tidak sedang menunggu persetujuan pembatalan' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v.void_requested_by = (select auth.uid()) then
    raise exception 'Pengaju pembatalan tidak boleh memutuskannya sendiri' using errcode = '42501';
  end if;
  if not coalesce(p_approve, false) then
    if v_note is null or char_length(v_note) < 5 then
      raise exception 'Alasan penolakan wajib diisi (min. 5 karakter)' using errcode = '22023';
    end if;
    update public.production_batches set status = 'confirmed' where id = p_id;
    perform public.write_audit('production.void_rejected', 'production_batch', p_id::text, null, jsonb_build_object('doc_number', v.doc_number), v_note);
    return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', 'confirmed', 'already', false);
  end if;

  insert into public.stock_balances (product_id) select distinct product_id from public.production_lines where batch_id = p_id on conflict do nothing;
  perform 1 from public.stock_balances where product_id in (select product_id from public.production_lines where batch_id = p_id) order by product_id for update;
  for v_line in select id, product_id, qty_kg, value_rp from public.production_lines where batch_id = p_id and direction = 'output' order by sort_order loop
    perform public._post_movement(v_line.product_id, 'out', v_line.qty_kg, 'reversal', 'production_batch', p_id, v.doc_number,
                                  (now() at time zone 'Asia/Jakarta')::date, v_line.value_rp, v_line.id::text, 'Batal ' || v.doc_number || ': ' || v.void_reason);
  end loop;
  for v_line in select id, product_id, qty_kg, value_rp from public.production_lines where batch_id = p_id and direction = 'input' order by sort_order loop
    perform public._post_movement(v_line.product_id, 'in', v_line.qty_kg, 'reversal', 'production_batch', p_id, v.doc_number,
                                  (now() at time zone 'Asia/Jakarta')::date, coalesce(v_line.value_rp, 0), v_line.id::text, 'Batal ' || v.doc_number || ': ' || v.void_reason);
  end loop;
  update public.production_batches set status = 'void', voided_at = now(), voided_by = (select auth.uid()) where id = p_id;
  perform public.write_audit('production.void_approved', 'production_batch', p_id::text, null, jsonb_build_object('doc_number', v.doc_number), coalesce(v_note, v.void_reason));
  return jsonb_build_object('id', p_id, 'doc_number', v.doc_number, 'status', 'void', 'already', false);
end;
$$;

-- ---------- RLS & hak ----------
alter table public.stock_opnames enable row level security;
alter table public.stock_opname_lines enable row level security;
alter table public.stock_adjustments enable row level security;

revoke all on public.stock_opnames, public.stock_opname_lines, public.stock_adjustments from anon, authenticated;
grant select on public.stock_opnames, public.stock_opname_lines, public.stock_adjustments to authenticated;
-- Stok opname & koreksi stok: lihat admin_kelompok, operator_produksi, ketua (PRD §3.1).
create policy stock_opnames_select on public.stock_opnames for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy stock_opname_lines_select on public.stock_opname_lines for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy stock_adjustments_select on public.stock_adjustments for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
-- Batas piutang hanya diubah admin kelompok (kebijakan update pelanggan yang ada sudah membatasi ke admin_kelompok).
grant update (credit_limit_rp), insert (credit_limit_rp) on public.customers to authenticated;

revoke execute on function public.guard_opname(), public.guard_opname_line(), public._can_count_stock(), public.guard_stock_adjustment() from public, anon, authenticated;
revoke execute on function public.save_opname_draft(uuid, date, text, jsonb), public.delete_opname_draft(uuid), public.post_opname(uuid),
  public.request_stock_adjustment(uuid, text, numeric, text, date), public.decide_stock_adjustment(uuid, boolean, text),
  public.request_production_void(uuid, text), public.decide_production_void(uuid, boolean, text) from public, anon;
grant execute on function public.save_opname_draft(uuid, date, text, jsonb), public.delete_opname_draft(uuid), public.post_opname(uuid),
  public.request_stock_adjustment(uuid, text, numeric, text, date), public.decide_stock_adjustment(uuid, boolean, text),
  public.request_production_void(uuid, text), public.decide_production_void(uuid, boolean, text) to authenticated;
