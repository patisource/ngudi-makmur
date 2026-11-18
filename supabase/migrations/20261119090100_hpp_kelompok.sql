-- =====================================================================
-- HPP rumus baru — kelompok (keputusan pengguna 19 Nov 2026, PRD §4.4 & Q25)
--   HPP batch / kg = (nilai bahan + BBM + tenaga + kemasan + lain-lain + alokasi biaya tetap bulanan) ÷ kg hasil
--   * BBM pemipilan  = (kg tongkol ÷ kg per karung ÷ karung per liter) × harga bensin   (1 L per 20 karung)
--   * BBM penepungan = kg pipilan × liter per 100 kg ÷ 100 × harga bensin                 (1,5 L per 100 kg)
--   * Tenaga         = pekerja × hari × upah harian, atau borongan kg × tarif
--   * Biaya tetap    = biaya tetap bulanan (oli & perawatan) dibagi ke semua batch aktif di bulan yang sama,
--                      sebanding kg hasil — berubah setiap ada batch baru/batal di bulan itu.
-- Karena alokasi bulanan & keputusan "hitung ulang seluruh HPP lama", nilai persediaan sekarang diturunkan oleh mesin
-- hitung ulang (_hpp_recalc) yang memutar ulang seluruh buku mutasi berurutan. Setiap perubahan nilai dicatat di
-- hpp_recalc_log (sebelum → sesudah). Kuantitas (kg) tidak pernah diubah; hanya nilai rupiah.
-- =====================================================================

-- ---------- 1) parameter (bisa diedit admin kelompok) ----------
create table public.hpp_settings (
  id                      smallint primary key default 1 check (id = 1),
  kg_per_karung           numeric(8, 3) not null default 33 check (kg_per_karung > 0 and kg_per_karung <= 1000),
  harga_tongkol_kg        bigint not null default 7650 check (harga_tongkol_kg between 0 and 1000000),
  rendemen_pipil_pct      numeric(5, 2) not null default 65 check (rendemen_pipil_pct > 0 and rendemen_pipil_pct <= 100),
  rendemen_tepung_pct     numeric(5, 2) not null default 88 check (rendemen_tepung_pct > 0 and rendemen_tepung_pct <= 100),
  harga_bensin_liter      bigint not null default 10000 check (harga_bensin_liter between 0 and 1000000),
  karung_per_liter_pipil  numeric(8, 3) not null default 20 check (karung_per_liter_pipil > 0 and karung_per_liter_pipil <= 10000),
  liter_per_100kg_giling  numeric(8, 3) not null default 1.5 check (liter_per_100kg_giling >= 0 and liter_per_100kg_giling <= 1000),
  upah_harian             bigint not null default 90000 check (upah_harian between 0 and 10000000),
  pekerja_pipil           integer not null default 3 check (pekerja_pipil between 0 and 100),
  pekerja_giling          integer not null default 2 check (pekerja_giling between 0 and 100),
  biaya_tetap_bulanan     bigint not null default 75000 check (biaya_tetap_bulanan between 0 and 1000000000),
  updated_at              timestamptz not null default now(),
  updated_by_name         text
);
insert into public.hpp_settings (id) values (1);

alter table public.hpp_settings enable row level security;
revoke all on public.hpp_settings from anon, authenticated;
grant select on public.hpp_settings to authenticated;
create policy hpp_settings_select on public.hpp_settings for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));

-- ---------- 2) log hitung ulang ----------
create table public.hpp_recalc_runs (
  id          bigint generated always as identity primary key,
  reason      text not null,

  run_by      uuid default auth.uid(),
  run_at      timestamptz not null default now()
);
create table public.hpp_recalc_log (
  id          bigint generated always as identity primary key,
  run_id      bigint not null references public.hpp_recalc_runs (id),
  entity      text not null,             -- stock_movement, production_line, production_batch, irt_movement, irt_batch, ...
  entity_id   text not null,
  doc_number  text,
  field       text not null,
  before_rp   bigint,
  after_rp    bigint
);
create index hpp_recalc_log_run_idx on public.hpp_recalc_log (run_id);
create trigger hpp_recalc_runs_append_only before update or delete on public.hpp_recalc_runs for each row execute function public.prevent_mutation();
create trigger hpp_recalc_log_append_only before update or delete on public.hpp_recalc_log for each row execute function public.prevent_mutation();
alter table public.hpp_recalc_runs enable row level security;
alter table public.hpp_recalc_log enable row level security;
revoke all on public.hpp_recalc_runs, public.hpp_recalc_log from anon, authenticated;
grant select on public.hpp_recalc_runs, public.hpp_recalc_log to authenticated;
create policy hpp_recalc_runs_select on public.hpp_recalc_runs for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua') or public.has_role('admin_teknis'));
create policy hpp_recalc_log_select on public.hpp_recalc_log for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('ketua') or public.has_role('admin_teknis'));

-- ---------- 3) kolom baru ----------
-- Rincian biaya batch: jumlah × harga satuan (liter bensin, orang-hari, kg borongan). Nilai = dihitung server.
alter table public.batch_costs
  add column qty numeric(14, 3) check (qty > 0 and qty <= 1000000),
  add column unit_price bigint check (unit_price between 0 and 100000000),
  add column unit text check (unit in ('liter', 'orang_hari', 'kg', 'pcs')),
  add constraint batch_costs_detail_check check ((qty is null) = (unit_price is null) and (qty is null) = (unit is null));

alter table public.production_batches add column fixed_cost_rp bigint not null default 0 check (fixed_cost_rp >= 0);

-- Biaya kemasan + desain per satuan kemasan (komponen HPP per unit kemasan di laporan HPP).
alter table public.product_packagings add column cost_rp bigint not null default 0 check (cost_rp between 0 and 100000000);
grant insert (cost_rp), update (cost_rp) on public.product_packagings to authenticated;

-- Jagung masuk per karung (Tahap F): bila jumlah karung diisi, berat = karung × kg per karung (dihitung server).
alter table public.receipts add column sack_count numeric(10, 2) check (sack_count > 0 and sack_count <= 100000);
grant insert (sack_count), update (sack_count) on public.receipts to authenticated;

create function public.receipt_sacks_to_kg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'draft' and new.sack_count is not null then
    new.weight_kg := round(new.sack_count * (select kg_per_karung from public.hpp_settings where id = 1), 3);
  end if;
  return new;
end;
$$;
create trigger receipts_0_sacks before insert or update on public.receipts for each row execute function public.receipt_sacks_to_kg();

-- Kemasan default (harga kemasan + desain): karung pipilan 5 kg Rp1.500, kemasan tepung 1 kg Rp1.200.
insert into public.product_packagings (product_id, packaging_id, content_kg, cost_rp)
select p.id, k.id, 5.0, 1500
  from public.products p, public.packagings k
 where p.code = 'PP' and k.name = 'Karung'
   and not exists (select 1 from public.product_packagings x where x.product_id = p.id and x.packaging_id = k.id and x.content_kg = 5.0);
update public.product_packagings pp set cost_rp = 1500
  from public.products p, public.packagings k
 where pp.product_id = p.id and pp.packaging_id = k.id and p.code = 'PP' and k.name = 'Karung' and pp.content_kg = 5.0;
update public.product_packagings pp set cost_rp = 1200
  from public.products p, public.packagings k
 where pp.product_id = p.id and pp.packaging_id = k.id and p.code = 'TP' and k.name = 'Pak' and pp.content_kg = 1.0;

-- ---------- 4) kunci dokumen: izinkan HANYA perubahan nilai rupiah oleh mesin hitung ulang ----------
create function public._hpp_recalc_on() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.hpp_recalc', true), '') = 'on';
$$;

-- Buku mutasi tetap append-only; satu-satunya pengecualian: nilai rupiah diubah oleh _hpp_recalc.
create function public.guard_ledger_value_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and public._hpp_recalc_on()
     and (to_jsonb(new) - 'value_rp') = (to_jsonb(old) - 'value_rp') then
    return new;
  end if;
  raise exception 'Tabel % hanya boleh ditambah; ubah/hapus ditolak', tg_table_name using errcode = 'P0001';
end;
$$;
drop trigger stock_movements_append_only on public.stock_movements;
create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function public.guard_ledger_value_only();

create or replace function public.guard_production_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' and public._hpp_recalc_on()
     and (to_jsonb(new) - array['material_cost', 'other_cost', 'fixed_cost_rp', 'total_cost', 'hpp_per_kg', 'updated_at'])
       = (to_jsonb(old) - array['material_cost', 'other_cost', 'fixed_cost_rp', 'total_cost', 'hpp_per_kg', 'updated_at']) then
    return new;
  end if;
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
        new.material_cost, new.other_cost, new.fixed_cost_rp, new.total_cost, new.hpp_per_kg, new.doc_number, new.confirmed_at, new.confirmed_by)
       is distinct from
       (old.business_date, old.operator_id, old.operator_name, old.note, old.residue_kg, old.input_kg, old.output_kg, old.loss_kg,
        old.material_cost, old.other_cost, old.fixed_cost_rp, old.total_cost, old.hpp_per_kg, old.doc_number, old.confirmed_at, old.confirmed_by)
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

create or replace function public.guard_production_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.production_status;
begin
  if public._hpp_recalc_on() and tg_op <> 'DELETE' then
    return new;                                     -- nilai rupiah baris & biaya default dari hitung ulang
  end if;
  select status into v_status from public.production_batches where id = coalesce(new.batch_id, old.batch_id);
  if found and v_status <> 'draft' then
    raise exception 'Batch sudah dikonfirmasi; rincian terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.guard_order_return() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and public._hpp_recalc_on()
     and (to_jsonb(new) - array['stock_value_rp', 'updated_at']) = (to_jsonb(old) - array['stock_value_rp', 'updated_at']) then
    return new;
  end if;
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

create or replace function public.guard_order_return_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.return_status;
begin
  if tg_op = 'UPDATE' and public._hpp_recalc_on()
     and (to_jsonb(new) - 'stock_value_rp') = (to_jsonb(old) - 'stock_value_rp') then
    return new;
  end if;
  select status into v_status from public.order_returns where id = coalesce(new.return_id, old.return_id);
  if found and v_status <> 'draft' then
    raise exception 'Retur sudah diverifikasi; rincian terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.guard_opname_line() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.opname_status;
begin
  if tg_op = 'UPDATE' and public._hpp_recalc_on() and (to_jsonb(new) - 'value_rp') = (to_jsonb(old) - 'value_rp') then
    return new;
  end if;
  select status into v from public.stock_opnames where id = coalesce(new.opname_id, old.opname_id);
  if found and v <> 'draft' and current_setting('app.opname_posting', true) is distinct from 'on' then
    raise exception 'Opname sudah diposting; baris terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.guard_stock_adjustment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and public._hpp_recalc_on()
     and (to_jsonb(new) - array['value_rp', 'updated_at']) = (to_jsonb(old) - array['value_rp', 'updated_at']) then
    return new;
  end if;
  if tg_op = 'DELETE' or old.status <> 'pending'
     or (new.product_id, new.direction, new.qty_kg, new.reason, new.business_date, new.requested_by, new.doc_number)
        is distinct from (old.product_id, old.direction, old.qty_kg, old.reason, old.business_date, old.requested_by, old.doc_number) then
    raise exception 'Koreksi stok sudah diputuskan atau isinya terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return new;
end;
$$;

-- ---------- 5) mesin hitung ulang (kelompok) ----------
-- Memutar ulang seluruh stock_movements berurutan (id) dengan aturan nilai yang sama seperti _post_movement, tetapi
-- nilai hasil batch = bahan (hasil putar ulang) + biaya batch + alokasi biaya tetap bulan itu. Menulis nilai baru
-- ke mutasi, baris & kepala batch, retur, opname, koreksi stok, dan saldo; setiap selisih dicatat di hpp_recalc_log.
create function public._hpp_recalc(p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.hpp_settings%rowtype;
  m record;
  l record;
  v_qty numeric;
  v_value bigint;
  v_val bigint;
  v_explicit bigint;
  v_order uuid;
  v_out_qty numeric;
  v_out_value bigint;
  v_back bigint;
  v_material bigint;
  v_fixed bigint;
  v_other bigint;
  v_total bigint;
  v_left bigint;
  v_n int;
  v_k int;
  v_out numeric;
  v_run bigint;
  v_mv int;
  v_batches int;
  v_bad int;
begin
  perform pg_advisory_xact_lock(hashtext('public._hpp_recalc'));
  perform 1 from public.stock_balances order by product_id for update;
  select * into s from public.hpp_settings where id = 1;
  perform set_config('app.hpp_recalc', 'on', true);

  create temp table if not exists _hpp_state (product_id uuid primary key, qty numeric not null, value bigint not null) on commit drop;
  create temp table if not exists _hpp_mv (id bigint primary key, value bigint not null) on commit drop;
  create temp table if not exists _hpp_line (line_id uuid primary key, value bigint not null) on commit drop;
  create temp table if not exists _hpp_batch (batch_id uuid primary key, fixed bigint not null default 0, material bigint not null default 0,
                                              other bigint not null default 0, done boolean not null default false) on commit drop;
  truncate pg_temp._hpp_state, pg_temp._hpp_mv, pg_temp._hpp_line, pg_temp._hpp_batch;

  -- alokasi biaya tetap per bulan: pembulatan kumulatif sehingga total per bulan tepat = biaya tetap bulanan
  insert into pg_temp._hpp_batch (batch_id, other)
  select b.id, coalesce((select sum(c.amount_rp) from public.batch_costs c where c.batch_id = b.id), 0)
    from public.production_batches b where b.status <> 'draft';
  update pg_temp._hpp_batch h set fixed = x.f
    from (
      select id, (round(s.biaya_tetap_bulanan * cum / tot) - round(s.biaya_tetap_bulanan * (cum - output_kg) / tot))::bigint as f
        from (
          select id, output_kg,
                 sum(output_kg) over (partition by date_trunc('month', business_date)) as tot,
                 sum(output_kg) over (partition by date_trunc('month', business_date) order by business_date, created_at, id) as cum
            from public.production_batches
           where status in ('confirmed', 'pending_void') and output_kg > 0
        ) a
       where tot > 0
    ) x
   where x.id = h.batch_id;

  for m in select id, product_id, movement_type, direction, qty_kg, value_rp, source_type, source_id, source_line
             from public.stock_movements order by id loop
    select qty, value into v_qty, v_value from pg_temp._hpp_state where product_id = m.product_id;
    if not found then
      v_qty := 0; v_value := 0;
      insert into pg_temp._hpp_state values (m.product_id, 0, 0);
    end if;

    if m.direction = 'in' then
      if m.movement_type = 'production_in' then
        if not (select done from pg_temp._hpp_batch where batch_id = m.source_id) then
          select material, fixed, other into v_material, v_fixed, v_other from pg_temp._hpp_batch where batch_id = m.source_id;
          v_total := v_material + v_fixed + v_other;
          select count(*), coalesce(sum(qty_kg), 0) into v_n, v_out from public.production_lines where batch_id = m.source_id and direction = 'output';
          v_left := v_total; v_k := 0;
          for l in select id, qty_kg from public.production_lines where batch_id = m.source_id and direction = 'output' order by sort_order, id loop
            v_k := v_k + 1;
            v_val := case when v_k = v_n then v_left else round(v_total * l.qty_kg / v_out)::bigint end;
            v_left := v_left - v_val;
            insert into pg_temp._hpp_line values (l.id, v_val) on conflict (line_id) do update set value = excluded.value;
          end loop;
          update pg_temp._hpp_batch set done = true where batch_id = m.source_id;
        end if;
        select value into v_val from pg_temp._hpp_line where line_id = m.source_line::uuid;
      elsif m.movement_type = 'reversal' and m.source_type = 'production_batch' then
        select value into v_val from pg_temp._hpp_line where line_id = m.source_line::uuid;   -- nilai baris input batch
        v_val := coalesce(v_val, m.value_rp);
      elsif m.movement_type = 'return_in' then
        select order_id into v_order from public.order_returns where id = m.source_id;
        select coalesce(sum(t.qty_kg), 0), coalesce(sum(x.value), 0) into v_out_qty, v_out_value
          from public.stock_movements t join pg_temp._hpp_mv x on x.id = t.id
         where t.source_type = 'order' and t.source_id = v_order and t.product_id = m.product_id and t.movement_type = 'sale_out';
        select coalesce(sum(x.value), 0) into v_back
          from public.stock_movements t join pg_temp._hpp_mv x on x.id = t.id join public.order_returns r on r.id = t.source_id
         where t.source_type = 'return' and r.order_id = v_order and t.product_id = m.product_id and t.movement_type = 'return_in';
        v_val := case when v_out_qty > 0 then least(round(v_out_value * m.qty_kg / v_out_qty)::bigint, greatest(v_out_value - v_back, 0)) else 0 end;
      elsif m.movement_type in ('opname_adjust', 'correction') then
        v_val := case when v_qty > 0 then round(m.qty_kg * v_value / v_qty)::bigint else 0 end;
      else
        v_val := m.value_rp;                                        -- receipt_in: biaya perolehan tetap
      end if;
      v_val := coalesce(v_val, 0);
      v_qty := v_qty + m.qty_kg;
      v_value := v_value + v_val;
    else
      v_explicit := null;
      if m.movement_type = 'reversal' and m.source_type = 'receipt' then
        select x.value into v_explicit from public.stock_movements t join pg_temp._hpp_mv x on x.id = t.id
         where t.source_type = 'receipt' and t.source_id = m.source_id and t.movement_type = 'receipt_in' and t.direction = 'in';
      elsif m.movement_type = 'reversal' and m.source_type = 'production_batch' then
        select value into v_explicit from pg_temp._hpp_line where line_id = m.source_line::uuid;   -- nilai baris output batch
      end if;
      if v_qty = m.qty_kg then
        v_val := v_value;
      elsif v_explicit is not null then
        v_val := least(v_explicit, v_value);
      elsif v_qty > 0 then
        v_val := round(m.qty_kg * v_value / v_qty)::bigint;
      else
        v_val := 0;
      end if;
      v_qty := v_qty - m.qty_kg;
      v_value := v_value - v_val;
      if m.movement_type = 'production_out' then
        insert into pg_temp._hpp_line values (m.source_line::uuid, v_val) on conflict (line_id) do update set value = excluded.value;
        update pg_temp._hpp_batch set material = material + v_val where batch_id = m.source_id;
      end if;
    end if;
    update pg_temp._hpp_state set qty = v_qty, value = v_value where product_id = m.product_id;
    insert into pg_temp._hpp_mv values (m.id, v_val);
  end loop;

  -- pengaman: kuantitas hasil putar ulang harus sama dengan saldo tercatat
  select count(*) into v_bad
    from public.stock_balances b left join pg_temp._hpp_state st on st.product_id = b.product_id
   where coalesce(st.qty, 0) <> b.on_hand_kg;
  if v_bad > 0 then
    raise exception 'Hitung ulang HPP dibatalkan: saldo kg tidak cocok dengan buku mutasi (% produk)', v_bad using errcode = 'P0001';
  end if;

  insert into public.hpp_recalc_runs (reason) values (coalesce(p_reason, 'hitung ulang')) returning id into v_run;

  -- mutasi
  insert into public.hpp_recalc_log (run_id, entity, entity_id, doc_number, field, before_rp, after_rp)
  select v_run, 'stock_movement', t.id::text, t.doc_number, 'value_rp', t.value_rp, x.value
    from public.stock_movements t join pg_temp._hpp_mv x on x.id = t.id where t.value_rp <> x.value;
  update public.stock_movements t set value_rp = x.value from pg_temp._hpp_mv x where x.id = t.id and t.value_rp <> x.value;
  get diagnostics v_mv = row_count;

  -- baris batch
  insert into public.hpp_recalc_log (run_id, entity, entity_id, doc_number, field, before_rp, after_rp)
  select v_run, 'production_line', pl.id::text, b.doc_number, 'value_rp', pl.value_rp, x.value
    from public.production_lines pl join pg_temp._hpp_line x on x.line_id = pl.id join public.production_batches b on b.id = pl.batch_id
   where pl.value_rp is distinct from x.value;
  update public.production_lines pl set value_rp = x.value from pg_temp._hpp_line x where x.line_id = pl.id and pl.value_rp is distinct from x.value;

  -- kepala batch
  with n as (
    select b.id, b.doc_number, b.hpp_per_kg as old_hpp, h.material, h.other, h.fixed, h.material + h.other + h.fixed as total,
           public.calc_hpp(h.material + h.other + h.fixed, b.output_kg) as hpp
      from public.production_batches b join pg_temp._hpp_batch h on h.batch_id = b.id
  )
  insert into public.hpp_recalc_log (run_id, entity, entity_id, doc_number, field, before_rp, after_rp)
  select v_run, 'production_batch', n.id::text, n.doc_number, 'hpp_per_kg', n.old_hpp, n.hpp from n where n.old_hpp is distinct from n.hpp;
  update public.production_batches b
     set material_cost = h.material, other_cost = h.other, fixed_cost_rp = h.fixed, total_cost = h.material + h.other + h.fixed,
         hpp_per_kg = public.calc_hpp(h.material + h.other + h.fixed, b.output_kg)
    from pg_temp._hpp_batch h
   where h.batch_id = b.id
     and (b.material_cost, b.other_cost, b.fixed_cost_rp, b.total_cost, b.hpp_per_kg) is distinct from
         (h.material, h.other, h.fixed, h.material + h.other + h.fixed, public.calc_hpp(h.material + h.other + h.fixed, b.output_kg));
  get diagnostics v_batches = row_count;

  -- retur, opname, koreksi stok: ikut nilai mutasinya
  update public.order_return_items i set stock_value_rp = t.value_rp
    from public.stock_movements t
   where t.source_type = 'return' and t.source_id = i.return_id and t.source_line = i.order_item_id::text and t.movement_type = 'return_in'
     and i.stock_value_rp is distinct from t.value_rp;
  update public.order_returns r set stock_value_rp = x.v
    from (select return_id, sum(stock_value_rp)::bigint as v from public.order_return_items group by return_id) x
   where x.return_id = r.id and r.status = 'verified' and r.stock_value_rp is distinct from x.v;
  update public.stock_opname_lines ol set value_rp = t.value_rp
    from public.stock_movements t
   where t.source_type = 'opname' and t.source_id = ol.opname_id and t.source_line = ol.id::text and ol.value_rp is distinct from t.value_rp;
  update public.stock_adjustments a set value_rp = t.value_rp
    from public.stock_movements t
   where t.source_type = 'adjustment' and t.source_id = a.id and a.status = 'approved' and a.value_rp is distinct from t.value_rp;

  -- saldo nilai persediaan
  insert into public.hpp_recalc_log (run_id, entity, entity_id, field, before_rp, after_rp)
  select v_run, 'stock_balance', b.product_id::text, 'value_rp', b.value_rp, st.value
    from public.stock_balances b join pg_temp._hpp_state st on st.product_id = b.product_id where b.value_rp <> st.value;
  update public.stock_balances b set value_rp = st.value, updated_at = now()
    from pg_temp._hpp_state st where st.product_id = b.product_id and b.value_rp <> st.value;

  perform set_config('app.hpp_recalc', 'off', true);
  return jsonb_build_object('run_id', v_run, 'movements_changed', v_mv, 'batches_changed', v_batches);
end;
$$;

-- Konfirmasi / batal batch mengubah alokasi biaya tetap bulan itu → hitung ulang otomatis (transaksi yang sama).
create function public._hpp_after_batch_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.status = 'draft' and new.status = 'confirmed') or (new.status = 'void' and old.status is distinct from 'void') then
    perform public._hpp_recalc(case when new.status = 'void' then 'batal batch ' else 'konfirmasi batch ' end || coalesce(new.doc_number, ''));
  end if;
  return null;
end;
$$;
create trigger production_batches_hpp_recalc after update of status on public.production_batches
  for each row execute function public._hpp_after_batch_status();

-- ---------- 6) simpan draft batch: biaya dengan rincian jumlah × harga satuan ----------
create or replace function public.save_production_draft(
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
  v_qty numeric;
  v_price bigint;
  v_amount bigint;
  v_costs jsonb := '[]'::jsonb;
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
    v_qty := null; v_price := null;
    if v_c ? 'qty' and jsonb_typeof(v_c -> 'qty') = 'number' then
      v_qty := (v_c ->> 'qty')::numeric;
      if v_qty <= 0 or v_qty > 1000000 or v_qty <> round(v_qty, 3)
         or coalesce(v_c ->> 'unit', '') not in ('liter', 'orang_hari', 'kg', 'pcs')
         or (v_c ->> 'unit_price') !~ '^[0-9]{1,9}$' then
        raise exception 'Rincian biaya (jumlah, satuan, harga satuan) tidak valid' using errcode = '22023';
      end if;
      v_price := (v_c ->> 'unit_price')::bigint;
      v_amount := round(v_qty * v_price)::bigint;               -- nilai dihitung server
    else
      if (v_c ->> 'amount_rp') !~ '^[0-9]{1,11}$' then
        raise exception 'Nilai biaya batch harus rupiah bulat lebih dari 0' using errcode = '22023';
      end if;
      v_amount := (v_c ->> 'amount_rp')::bigint;
    end if;
    if v_amount <= 0 or v_amount > 10000000000 then
      raise exception 'Nilai biaya batch harus rupiah bulat lebih dari 0' using errcode = '22023';
    end if;
    v_other := v_other + v_amount;
    v_costs := v_costs || jsonb_build_array(v_c || jsonb_build_object('amount_rp', v_amount, '_qty', v_qty, '_price', v_price));
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
  for v_c in select * from jsonb_array_elements(v_costs) loop
    v_i := v_i + 1;
    insert into public.batch_costs (batch_id, category, amount_rp, source_ref, note, sort_order, qty, unit_price, unit)
    values (v_id, (v_c ->> 'category')::public.batch_cost_category, (v_c ->> 'amount_rp')::bigint,
            nullif(btrim(v_c ->> 'source_ref'), ''), nullif(btrim(v_c ->> 'note'), ''), v_i,
            (v_c ->> '_qty')::numeric, (v_c ->> '_price')::bigint, case when v_c ->> '_qty' is not null then v_c ->> 'unit' end);
  end loop;

  perform public.write_audit(case when p_id is null then 'production.draft_created' else 'production.draft_updated' end,
    'production_batch', v_id::text, null,
    jsonb_build_object('batch_type', p_batch_type, 'input_kg', v_in, 'output_kg', v_out, 'residue_kg', p_residue_kg, 'other_cost', v_other));
  return v_id;
end;
$$;

-- ---------- 7) simpan parameter ----------
create function public.save_hpp_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.hpp_settings%rowtype;
  v_after public.hpp_settings%rowtype;
  v_res jsonb := null;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mengubah parameter HPP' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Parameter tidak valid' using errcode = '22023';
  end if;
  select * into v_before from public.hpp_settings where id = 1 for update;
  begin
    update public.hpp_settings set
      kg_per_karung          = coalesce((p ->> 'kg_per_karung')::numeric, kg_per_karung),
      harga_tongkol_kg       = coalesce((p ->> 'harga_tongkol_kg')::bigint, harga_tongkol_kg),
      rendemen_pipil_pct     = coalesce((p ->> 'rendemen_pipil_pct')::numeric, rendemen_pipil_pct),
      rendemen_tepung_pct    = coalesce((p ->> 'rendemen_tepung_pct')::numeric, rendemen_tepung_pct),
      harga_bensin_liter     = coalesce((p ->> 'harga_bensin_liter')::bigint, harga_bensin_liter),
      karung_per_liter_pipil = coalesce((p ->> 'karung_per_liter_pipil')::numeric, karung_per_liter_pipil),
      liter_per_100kg_giling = coalesce((p ->> 'liter_per_100kg_giling')::numeric, liter_per_100kg_giling),
      upah_harian            = coalesce((p ->> 'upah_harian')::bigint, upah_harian),
      pekerja_pipil          = coalesce((p ->> 'pekerja_pipil')::integer, pekerja_pipil),
      pekerja_giling         = coalesce((p ->> 'pekerja_giling')::integer, pekerja_giling),
      biaya_tetap_bulanan    = coalesce((p ->> 'biaya_tetap_bulanan')::bigint, biaya_tetap_bulanan),
      updated_at = now(),
      updated_by_name = coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Admin')
    where id = 1
    returning * into v_after;
  exception
    when check_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Nilai parameter di luar batas yang diizinkan' using errcode = '22023';
  end;
  perform public.write_audit('hpp.settings_updated', 'hpp_settings', '1', to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
  if v_after.biaya_tetap_bulanan <> v_before.biaya_tetap_bulanan then
    v_res := public._hpp_recalc('ubah biaya tetap bulanan');
  end if;
  return jsonb_build_object('ok', true, 'recalc', v_res);
end;
$$;

revoke execute on function public._hpp_recalc(text), public._hpp_after_batch_status(), public.receipt_sacks_to_kg(),
  public.guard_ledger_value_only() from public, anon, authenticated;
revoke execute on function public.save_hpp_settings(jsonb) from public, anon;
grant execute on function public.save_hpp_settings(jsonb) to authenticated;

-- ---------- 8) MIGRASI DATA LAMA: biaya default + hitung ulang seluruh HPP ----------
-- Batch lama tanpa biaya BBM / tenaga mendapat baris biaya otomatis sesuai parameter (catatan "Otomatis: rumus HPP 19 Nov 2026").
select set_config('app.hpp_recalc', 'on', true);
insert into public.batch_costs (batch_id, category, amount_rp, note, sort_order, qty, unit_price, unit)
select b.id, 'listrik_bbm',
       round(x.liter * s.harga_bensin_liter)::bigint, 'Otomatis: rumus HPP 19 Nov 2026 (bensin)', 90, x.liter, s.harga_bensin_liter, 'liter'
  from public.production_batches b
  cross join public.hpp_settings s
  cross join lateral (select round(case when b.batch_type = 'pemipilan' then b.input_kg / s.kg_per_karung / s.karung_per_liter_pipil
                                        else b.input_kg * s.liter_per_100kg_giling / 100 end, 3) as liter) x
 where b.status <> 'draft' and x.liter > 0 and s.harga_bensin_liter > 0
   and not exists (select 1 from public.batch_costs c where c.batch_id = b.id and c.category = 'listrik_bbm');
insert into public.batch_costs (batch_id, category, amount_rp, note, sort_order, qty, unit_price, unit)
select b.id, 'tenaga_kerja', w.n * s.upah_harian, 'Otomatis: rumus HPP 19 Nov 2026 (' || w.n || ' pekerja × 1 hari)', 91, w.n, s.upah_harian, 'orang_hari'
  from public.production_batches b
  cross join public.hpp_settings s
  cross join lateral (select case when b.batch_type = 'pemipilan' then s.pekerja_pipil else s.pekerja_giling end as n) w
 where b.status <> 'draft' and w.n > 0 and s.upah_harian > 0
   and not exists (select 1 from public.batch_costs c where c.batch_id = b.id and c.category = 'tenaga_kerja');
select set_config('app.hpp_recalc', 'off', true);

do $$
declare v jsonb;
begin
  v := public._hpp_recalc('migrasi rumus HPP baru (19 Nov 2026): BBM, tenaga, biaya tetap bulanan');
  raise notice 'Hitung ulang HPP kelompok: %', v;
end $$;

notify pgrst, 'reload schema';
