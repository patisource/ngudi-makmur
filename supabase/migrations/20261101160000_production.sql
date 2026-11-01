-- =====================================================================
-- M5 — Produksi (T5.1, T5.3) · FR-PRD-*
-- Batch pemipilan (TK → PP) / penepungan (PP → TP): draft → konfirmasi (nomor PRD, mutasi production_out &
-- production_in dalam satu transaksi, HPP dikunci). Biaya batch hanya alokasi HPP; TIDAK membuat kas (PRD §4.7).
-- Semua tulis lewat fungsi security definer; klien hanya membaca (RLS).
-- =====================================================================

create type public.production_status as enum ('draft', 'confirmed', 'pending_void', 'void');
create type public.line_direction as enum ('input', 'output');
create type public.batch_cost_category as enum ('tenaga_kerja', 'kemasan', 'listrik_bbm', 'lain');

-- Ambang peringatan susut % per jenis batch (FR-PRD-04). Kosong = tanpa peringatan; nilainya belum ditetapkan mitra.
alter table public.batch_type_rules add column max_loss_pct numeric(5, 2) check (max_loss_pct between 0 and 100);

create table public.production_batches (
  id              uuid primary key default gen_random_uuid(),
  doc_number      text unique,
  status          public.production_status not null default 'draft',
  batch_type      text not null references public.batch_type_rules (batch_type),
  business_date   date not null default (now() at time zone 'Asia/Jakarta')::date,
  operator_id     uuid not null references public.profiles (id),
  operator_name   text not null,                       -- salinan nama: peran lain tidak bisa membaca profiles
  note            text check (char_length(note) <= 1000),
  residue_kg      numeric(14, 3) not null default 0 check (residue_kg >= 0),   -- bagian sisa yang dirinci (mis. janggel)
  input_kg        numeric(14, 3) not null default 0 check (input_kg >= 0),
  output_kg       numeric(14, 3) not null default 0 check (output_kg >= 0),
  loss_kg         numeric(14, 3) not null default 0 check (loss_kg >= 0),      -- sisa/susut = input − output
  material_cost   bigint check (material_cost >= 0),                           -- diisi saat konfirmasi
  other_cost      bigint not null default 0 check (other_cost >= 0),
  total_cost      bigint check (total_cost >= 0),
  hpp_per_kg      bigint check (hpp_per_kg >= 0),
  confirmed_at    timestamptz,
  confirmed_by    uuid,
  void_reason     text check (char_length(void_reason) <= 500),
  void_requested_at timestamptz,
  void_requested_by uuid,
  voided_at       timestamptz,
  voided_by       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'draft') = (doc_number is null)),
  check (output_kg <= input_kg),
  check (residue_kg <= loss_kg)
);
create index production_batches_date_idx on public.production_batches (business_date desc, created_at desc);
create trigger production_batches_touch before update on public.production_batches for each row execute function public.touch_updated_at();

create table public.production_lines (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.production_batches (id) on delete cascade,
  direction   public.line_direction not null,
  product_id  uuid not null references public.products (id),
  qty_kg      numeric(14, 3) not null check (qty_kg > 0 and qty_kg <= 1000000),
  value_rp    bigint check (value_rp >= 0),           -- nilai persediaan keluar/masuk, diisi saat konfirmasi
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index production_lines_batch_idx on public.production_lines (batch_id, direction, sort_order);

create table public.batch_costs (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.production_batches (id) on delete cascade,
  category    public.batch_cost_category not null,
  amount_rp   bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  source_ref  text check (char_length(source_ref) <= 60),   -- mis. nomor pengeluaran EXP-… (tanpa kas kedua)
  note        text check (char_length(note) <= 200),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index batch_costs_batch_idx on public.batch_costs (batch_id, sort_order);

-- ---------- kunci dokumen ----------
create function public.guard_production_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Batch terkonfirmasi tidak dapat dihapus' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.batch_type <> old.batch_type then
    raise exception 'Jenis batch tidak dapat diubah; buat batch baru' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if (new.business_date, new.operator_id, new.operator_name, new.note, new.residue_kg, new.input_kg, new.output_kg, new.loss_kg,
        new.material_cost, new.other_cost, new.total_cost, new.hpp_per_kg, new.doc_number, new.confirmed_at, new.confirmed_by)
       is distinct from
       (old.business_date, old.operator_id, old.operator_name, old.note, old.residue_kg, old.input_kg, old.output_kg, old.loss_kg,
        old.material_cost, old.other_cost, old.total_cost, old.hpp_per_kg, old.doc_number, old.confirmed_at, old.confirmed_by)
       or (new.status <> old.status and (old.status, new.status) not in
           (('confirmed', 'pending_void'), ('pending_void', 'confirmed'), ('pending_void', 'void'))) then
      raise exception 'Batch % sudah dikonfirmasi dan terkunci', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    return new;
  end if;
  if new.business_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal batch tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger production_batches_guard before insert or update or delete on public.production_batches
  for each row execute function public.guard_production_batch();

-- Baris & biaya hanya berubah selama batch draft (konfirmasi mengisi value_rp sebelum status berubah).
create function public.guard_production_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.production_status;
begin
  select status into v_status from public.production_batches where id = coalesce(new.batch_id, old.batch_id);
  if found and v_status <> 'draft' then
    raise exception 'Batch sudah dikonfirmasi; rincian terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger production_lines_guard before insert or update or delete on public.production_lines
  for each row execute function public.guard_production_child();
create trigger batch_costs_guard before insert or update or delete on public.batch_costs
  for each row execute function public.guard_production_child();

-- ---------- HPP (SRS §10, PRD §4.4) ----------
-- Output 0 → null ("data belum cukup"), tanpa pembagian nol.
create function public.calc_hpp(p_total bigint, p_output_kg numeric) returns bigint
language sql immutable set search_path = '' as $$
  select case when p_total is null or p_output_kg is null or p_output_kg <= 0 then null else round(p_total / p_output_kg)::bigint end;
$$;

-- ---------- simpan draft (FR-PRD-01..05, FR-PRD-07) ----------
-- Menyimpan kepala batch + mengganti seluruh baris input/output & biaya secara atomik. Produk baris diambil dari
-- batch_type_rules (bukan dari klien), jadi pasangan input/output selalu sesuai jenis batch.
create function public.save_production_draft(
  p_id uuid, p_batch_type text, p_date date, p_note text, p_residue_kg numeric,
  p_inputs numeric[], p_outputs numeric[], p_costs jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_rule public.batch_type_rules%rowtype;
  v_batch public.production_batches%rowtype;
  v_in numeric := 0;
  v_out numeric := 0;
  v_other bigint := 0;
  v_q numeric;
  v_c jsonb;
  v_id uuid := p_id;
  v_i int := 0;
begin
  if not public.has_role('operator_produksi') then
    raise exception 'Hanya operator produksi yang dapat mencatat batch' using errcode = '42501';
  end if;
  select * into v_rule from public.batch_type_rules where batch_type = p_batch_type;
  if not found then
    raise exception 'Jenis batch tidak dikenal' using errcode = '22023';
  end if;
  if coalesce(array_length(p_inputs, 1), 0) > 50 or coalesce(array_length(p_outputs, 1), 0) > 50
     or coalesce(jsonb_array_length(p_costs), 0) > 20 then
    raise exception 'Terlalu banyak baris (maks. 50 input, 50 output, 20 biaya)' using errcode = '22023';
  end if;
  foreach v_q in array coalesce(p_inputs, '{}') || coalesce(p_outputs, '{}') loop
    if v_q is null or v_q <= 0 or v_q > 1000000 or v_q <> round(v_q, 3) then
      raise exception 'Berat setiap baris harus lebih dari 0 kg, maksimal 3 desimal' using errcode = '22023';
    end if;
  end loop;
  select coalesce(sum(x), 0) into v_in from unnest(p_inputs) x;
  select coalesce(sum(x), 0) into v_out from unnest(p_outputs) x;
  if v_out > v_in then
    raise exception 'Output (% kg) tidak boleh melebihi input (% kg)', v_out, v_in using errcode = '22023';
  end if;
  if p_residue_kg is null or p_residue_kg < 0 or p_residue_kg <> round(p_residue_kg, 3) or p_residue_kg > v_in - v_out then
    raise exception 'Rincian sisa harus 0 sampai % kg (input − output)', v_in - v_out using errcode = '22023';
  end if;
  for v_c in select * from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb)) loop
    if coalesce(v_c ->> 'category', '') not in ('tenaga_kerja', 'kemasan', 'listrik_bbm', 'lain') then
      raise exception 'Kategori biaya batch tidak dikenal' using errcode = '22023';
    end if;
    if char_length(coalesce(v_c ->> 'source_ref', '')) > 60 or char_length(coalesce(v_c ->> 'note', '')) > 200 then
      raise exception 'Sumber biaya maks. 60 karakter, keterangan maks. 200 karakter' using errcode = '22023';
    end if;
    if (v_c ->> 'amount_rp') !~ '^[0-9]{1,11}$' or (v_c ->> 'amount_rp')::bigint <= 0 or (v_c ->> 'amount_rp')::bigint > 10000000000 then
      raise exception 'Nilai biaya batch harus rupiah bulat lebih dari 0' using errcode = '22023';
    end if;
    v_other := v_other + (v_c ->> 'amount_rp')::bigint;
  end loop;

  if v_id is null then
    insert into public.production_batches (batch_type, business_date, operator_id, operator_name, note, residue_kg, input_kg, output_kg, loss_kg, other_cost)
    values (p_batch_type, coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date), (select auth.uid()),
            coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Operator'),
            nullif(btrim(p_note), ''), p_residue_kg, v_in, v_out, v_in - v_out, v_other)
    returning * into v_batch;
    v_id := v_batch.id;
  else
    select * into v_batch from public.production_batches where id = v_id for update;
    if not found then
      raise exception 'Batch tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_batch.status <> 'draft' then
      raise exception 'Batch % sudah dikonfirmasi dan terkunci', v_batch.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    update public.production_batches
       set batch_type = p_batch_type, business_date = coalesce(p_date, business_date), note = nullif(btrim(p_note), ''),
           residue_kg = p_residue_kg, input_kg = v_in, output_kg = v_out, loss_kg = v_in - v_out, other_cost = v_other
     where id = v_id;
    delete from public.production_lines where batch_id = v_id;
    delete from public.batch_costs where batch_id = v_id;
  end if;

  insert into public.production_lines (batch_id, direction, product_id, qty_kg, sort_order)
  select v_id, 'input', v_rule.input_product_id, q, o from unnest(p_inputs) with ordinality as t (q, o);
  insert into public.production_lines (batch_id, direction, product_id, qty_kg, sort_order)
  select v_id, 'output', v_rule.output_product_id, q, o from unnest(p_outputs) with ordinality as t (q, o);
  for v_c in select * from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb)) loop
    v_i := v_i + 1;
    insert into public.batch_costs (batch_id, category, amount_rp, source_ref, note, sort_order)
    values (v_id, (v_c ->> 'category')::public.batch_cost_category, (v_c ->> 'amount_rp')::bigint,
            nullif(btrim(v_c ->> 'source_ref'), ''), nullif(btrim(v_c ->> 'note'), ''), v_i);
  end loop;

  perform public.write_audit(case when p_id is null then 'production.draft_created' else 'production.draft_updated' end,
    'production_batch', v_id::text, null,
    jsonb_build_object('batch_type', p_batch_type, 'input_kg', v_in, 'output_kg', v_out, 'residue_kg', p_residue_kg, 'other_cost', v_other));
  return v_id;
end;
$$;

create function public.delete_production_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_batch public.production_batches%rowtype;
begin
  if not public.has_role('operator_produksi') then
    raise exception 'Hanya operator produksi yang dapat menghapus draft batch' using errcode = '42501';
  end if;
  select * into v_batch from public.production_batches where id = p_id for update;
  if not found then
    raise exception 'Batch tidak ditemukan' using errcode = 'P0002';
  end if;
  delete from public.production_batches where id = p_id;   -- guard menolak bila bukan draft
  perform public.write_audit('production.draft_deleted', 'production_batch', p_id::text, to_jsonb(v_batch) - 'updated_at', null);
end;
$$;

-- ---------- konfirmasi (FR-PRD-06, T5.3) ----------
-- Satu transaksi: kunci batch & saldo (urut product_id), cek stok setiap input, nomor PRD, mutasi keluar lalu masuk,
-- HPP = (bahan terpakai rata-rata bergerak + biaya batch) ÷ output kg. Nilai output = total biaya (dibagi per baris
-- sebanding kg, sisa pembulatan ke baris terakhir) sehingga Σ nilai masuk = total biaya persis.
create function public.confirm_production(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.production_batches%rowtype;
  v_after public.production_batches%rowtype;
  v_rule public.batch_type_rules%rowtype;
  v_line record;
  v_doc text;
  v_in numeric;
  v_out numeric;
  v_n_in int;
  v_n_out int;
  v_mid bigint;
  v_val bigint;
  v_material bigint := 0;
  v_other bigint;
  v_total bigint;
  v_left bigint;
  v_k int := 0;
begin
  if not public.has_permission('production.confirm') then
    raise exception 'Anda tidak memegang izin konfirmasi batch (production.confirm)' using errcode = '42501';
  end if;
  select * into v_before from public.production_batches where id = p_id for update;
  if not found then
    raise exception 'Batch tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status in ('confirmed', 'pending_void') then
    return jsonb_build_object('id', v_before.id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'hpp_per_kg', v_before.hpp_per_kg, 'already', true);
  end if;
  if v_before.status <> 'draft' then
    raise exception 'Batch yang sudah dibatalkan tidak dapat dikonfirmasi' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;

  select * into v_rule from public.batch_type_rules where batch_type = v_before.batch_type;
  select count(*) filter (where direction = 'input'), count(*) filter (where direction = 'output'),
         coalesce(sum(qty_kg) filter (where direction = 'input'), 0), coalesce(sum(qty_kg) filter (where direction = 'output'), 0)
    into v_n_in, v_n_out, v_in, v_out
    from public.production_lines where batch_id = p_id;
  if v_n_in = 0 or v_n_out = 0 then
    raise exception 'Batch wajib punya minimal satu baris input dan satu baris output' using errcode = '22023';
  end if;
  if v_out > v_in then
    raise exception 'Output (% kg) tidak boleh melebihi input (% kg)', v_out, v_in using errcode = '22023';
  end if;
  if exists (select 1 from public.production_lines where batch_id = p_id
              and product_id <> case direction when 'input' then v_rule.input_product_id else v_rule.output_product_id end) then
    raise exception 'Produk baris tidak sesuai jenis batch' using errcode = '22023';
  end if;

  v_doc := public.next_doc_number('PRD', v_before.business_date);
  -- kunci saldo kedua produk dengan urutan tetap (cegah deadlock, Security.md §6)
  insert into public.stock_balances (product_id) values (v_rule.input_product_id), (v_rule.output_product_id) on conflict do nothing;
  perform 1 from public.stock_balances where product_id in (v_rule.input_product_id, v_rule.output_product_id) order by product_id for update;

  for v_line in select id, qty_kg from public.production_lines where batch_id = p_id and direction = 'input' order by sort_order, id loop
    v_mid := public._post_movement(v_rule.input_product_id, 'out', v_line.qty_kg, 'production_out', 'production_batch', p_id, v_doc,
                                   v_before.business_date, null, v_line.id::text);
    select value_rp into v_val from public.stock_movements where id = v_mid;
    update public.production_lines set value_rp = v_val where id = v_line.id;
    v_material := v_material + v_val;
  end loop;

  select coalesce(sum(amount_rp), 0) into v_other from public.batch_costs where batch_id = p_id;
  v_total := v_material + v_other;
  v_left := v_total;
  for v_line in select id, qty_kg from public.production_lines where batch_id = p_id and direction = 'output' order by sort_order, id loop
    v_k := v_k + 1;
    v_val := case when v_k = v_n_out then v_left else round(v_total * v_line.qty_kg / v_out)::bigint end;
    v_left := v_left - v_val;
    perform public._post_movement(v_rule.output_product_id, 'in', v_line.qty_kg, 'production_in', 'production_batch', p_id, v_doc,
                                  v_before.business_date, v_val, v_line.id::text);
    update public.production_lines set value_rp = v_val where id = v_line.id;
  end loop;

  update public.production_batches
     set status = 'confirmed', doc_number = v_doc, input_kg = v_in, output_kg = v_out, loss_kg = v_in - v_out,
         material_cost = v_material, other_cost = v_other, total_cost = v_total, hpp_per_kg = public.calc_hpp(v_total, v_out),
         confirmed_at = now(), confirmed_by = (select auth.uid())
   where id = p_id
   returning * into v_after;
  perform public.write_audit('production.confirmed', 'production_batch', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
  return jsonb_build_object('id', p_id, 'doc_number', v_doc, 'status', v_after.status, 'hpp_per_kg', v_after.hpp_per_kg, 'already', false);
end;
$$;

-- ---------- RLS & hak ----------
alter table public.production_batches enable row level security;
alter table public.production_lines enable row level security;
alter table public.batch_costs enable row level security;

revoke all on public.production_batches, public.production_lines, public.batch_costs from anon, authenticated;
grant select on public.production_batches, public.production_lines, public.batch_costs to authenticated;

-- Produksi: lihat = admin_kelompok, operator_produksi, ketua (PRD §3.1). Tulis hanya lewat fungsi.
create policy production_batches_select on public.production_batches for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy production_lines_select on public.production_lines for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy batch_costs_select on public.batch_costs for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));

revoke execute on function public.guard_production_batch(), public.guard_production_child() from public, anon, authenticated;
revoke execute on function public.calc_hpp(bigint, numeric),
  public.save_production_draft(uuid, text, date, text, numeric, numeric[], numeric[], jsonb),
  public.delete_production_draft(uuid), public.confirm_production(uuid) from public, anon;
grant execute on function public.calc_hpp(bigint, numeric),
  public.save_production_draft(uuid, text, date, text, numeric, numeric[], numeric[], jsonb),
  public.delete_production_draft(uuid), public.confirm_production(uuid) to authenticated;
