-- =====================================================================
-- HPP rumus baru — IRT Sekar Arum (keputusan pengguna 19 Nov 2026, PRD §4.9 & Q25). Tetap TANPA kas.
--   HPP batch / pcs = (nilai bahan + gas + upah + kemasan & desain + lain-lain) ÷ pcs hasil
--   * Resep per produk (mis. mie jagung: tepung jagung 100 g, terigu 100 g, tapioka 25 g, telur 1, garam 2 g → 2,77 pcs),
--     gas per resep; produksi cukup diisi "berapa resep" dan bahan terisi otomatis.
--   * Upah & kemasan per pcs diatur per produk; harga standar bahan untuk HPP standar & harga saran (markup target).
-- Batch IRT lama dihitung ulang dengan rumus ini (_irt_recalc), selisih dicatat di hpp_recalc_log.
-- =====================================================================

-- ---------- 1) kolom & tabel ----------
alter table public.irt_items
  add column std_price          bigint check (std_price between 0 and 100000000),            -- bahan: harga standar per satuan
  add column packaging_cost_pcs bigint not null default 0 check (packaging_cost_pcs between 0 and 10000000),
  add column labor_cost_pcs     bigint not null default 0 check (labor_cost_pcs between 0 and 10000000),
  add column target_markup_pct  numeric(6, 2) check (target_markup_pct between 0 and 1000);

create table public.irt_recipes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null unique references public.irt_items (id),
  yield_pcs   numeric(8, 2) not null check (yield_pcs > 0 and yield_pcs <= 100000),   -- hasil per 1 resep
  gas_rp      bigint not null default 0 check (gas_rp between 0 and 10000000),         -- energi per 1 resep
  note        text check (char_length(note) <= 300),
  updated_at  timestamptz not null default now()
);
create table public.irt_recipe_lines (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.irt_recipes (id) on delete cascade,
  item_id     uuid not null references public.irt_items (id),
  qty         numeric(14, 3) not null check (qty > 0 and qty <= 100000),
  sort_order  integer not null default 0,
  unique (recipe_id, item_id)
);
create trigger irt_recipes_touch before update on public.irt_recipes for each row execute function public.touch_updated_at();

alter table public.irt_batches
  add column recipe_id      uuid references public.irt_recipes (id),
  add column recipe_count   numeric(8, 2) check (recipe_count > 0 and recipe_count <= 10000),
  add column gas_rp         bigint not null default 0 check (gas_rp >= 0),
  add column labor_rp       bigint not null default 0 check (labor_rp >= 0),
  add column packaging_rp   bigint not null default 0 check (packaging_rp >= 0),
  add column other_rp       bigint not null default 0 check (other_rp >= 0),
  add column total_cost_rp  bigint check (total_cost_rp >= 0);

alter table public.irt_recipes enable row level security;
alter table public.irt_recipe_lines enable row level security;
revoke all on public.irt_recipes, public.irt_recipe_lines from anon, authenticated;
grant select on public.irt_recipes, public.irt_recipe_lines to authenticated;
create policy irt_recipes_select on public.irt_recipes for select to authenticated
  using (public.has_role('pengurus_irt') or public.has_role('ketua'));
create policy irt_recipe_lines_select on public.irt_recipe_lines for select to authenticated
  using (public.has_role('pengurus_irt') or public.has_role('ketua'));

-- view stok ikut kolom biaya
drop view public.v_irt_stock;
create view public.v_irt_stock with (security_invoker = true) as
select i.id as item_id, i.kind, i.name, i.unit, i.pack_size, i.price_pcs, i.price_pack, i.min_stock, i.kelompok_product_id, i.archived_at,
       i.std_price, i.packaging_cost_pcs, i.labor_cost_pcs, i.target_markup_pct,
       coalesce(b.on_hand, 0) as on_hand, coalesce(b.value_rp, 0) as value_rp,
       case when coalesce(b.on_hand, 0) > 0 then round(b.value_rp / b.on_hand)::bigint end as avg_cost,
       coalesce(b.on_hand, 0) < i.min_stock as below_min
  from public.irt_items i
  left join public.irt_stock_balances b on b.item_id = i.id;
revoke all on public.v_irt_stock from anon;
grant select on public.v_irt_stock to authenticated;

-- ---------- 2) kunci: hanya nilai rupiah oleh mesin hitung ulang ----------
drop trigger irt_movements_append_only on public.irt_movements;
create trigger irt_movements_append_only before update or delete on public.irt_movements
  for each row execute function public.guard_ledger_value_only();
drop trigger irt_adjustments_append_only on public.irt_adjustments;
create trigger irt_adjustments_append_only before update or delete on public.irt_adjustments
  for each row execute function public.guard_ledger_value_only();

create or replace function public.irt_guard_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'confirmed' and public._hpp_recalc_on()
     and (to_jsonb(new) - array['input_value_rp', 'hpp_per_pcs', 'gas_rp', 'labor_rp', 'packaging_rp', 'other_rp', 'total_cost_rp', 'updated_at'])
       = (to_jsonb(old) - array['input_value_rp', 'hpp_per_pcs', 'gas_rp', 'labor_rp', 'packaging_rp', 'other_rp', 'total_cost_rp', 'updated_at']) then
    return new;
  end if;
  if tg_op = 'DELETE' and old.status = 'confirmed' then
    raise exception 'Batch % sudah dikonfirmasi dan tidak dapat dihapus', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    raise exception 'Batch % sudah dikonfirmasi dan tidak dapat diubah', old.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.irt_guard_batch_line() returns trigger
language plpgsql set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'UPDATE' and public._hpp_recalc_on() and (to_jsonb(new) - 'value_rp') = (to_jsonb(old) - 'value_rp') then
    return new;
  end if;
  select status into v_status from public.irt_batches where id = coalesce(new.batch_id, old.batch_id);
  if v_status = 'confirmed' then
    raise exception 'Baris batch terkonfirmasi tidak dapat diubah' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------- 3) master biaya & resep ----------
create function public.irt_save_item_costs(p_id uuid, p_std_price bigint, p_packaging_cost_pcs bigint, p_labor_cost_pcs bigint, p_target_markup_pct numeric)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.irt_items%rowtype;
  v_after public.irt_items%rowtype;
begin
  perform public._irt_require();
  select * into v_before from public.irt_items where id = p_id for update;
  if not found then
    raise exception 'Bahan/produk IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  begin
    if v_before.kind = 'bahan' then
      update public.irt_items set std_price = p_std_price where id = p_id returning * into v_after;
    else
      update public.irt_items
         set packaging_cost_pcs = coalesce(p_packaging_cost_pcs, 0), labor_cost_pcs = coalesce(p_labor_cost_pcs, 0),
             target_markup_pct = p_target_markup_pct
       where id = p_id returning * into v_after;
    end if;
  exception when check_violation then
    raise exception 'Nilai biaya di luar batas yang diizinkan' using errcode = '22023';
  end;
  perform public.write_audit('irt.item.costs_updated', 'irt_item', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
end;
$$;

-- p_lines: [{item_id, qty}] dalam satuan bahan (kg, butir, ...). Satu resep per produk (simpan = ganti).
create function public.irt_save_recipe(p_product uuid, p_yield numeric, p_gas bigint, p_note text, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_line jsonb;
  v_item public.irt_items%rowtype;
  v_qty numeric;
  v_n int := 0;
begin
  perform public._irt_require();
  if not exists (select 1 from public.irt_items where id = p_product and kind = 'produk' and archived_at is null) then
    raise exception 'Produk IRT tidak ditemukan atau diarsip' using errcode = '22023';
  end if;
  if p_yield is null or p_yield <= 0 or p_yield > 100000 or p_yield <> round(p_yield, 2) then
    raise exception 'Hasil per resep harus lebih dari 0 pcs (maks. 2 desimal)' using errcode = '22023';
  end if;
  if p_gas is null or p_gas < 0 or p_gas > 10000000 then
    raise exception 'Biaya gas per resep tidak valid' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 30 then
    raise exception 'Isi 1–30 bahan resep' using errcode = '22023';
  end if;
  insert into public.irt_recipes (product_id, yield_pcs, gas_rp, note) values (p_product, p_yield, p_gas, nullif(btrim(p_note), ''))
  on conflict (product_id) do update set yield_pcs = excluded.yield_pcs, gas_rp = excluded.gas_rp, note = excluded.note
  returning id into v_id;
  delete from public.irt_recipe_lines where recipe_id = v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from public.irt_items where id = (v_line ->> 'item_id')::uuid;
    if not found or v_item.kind <> 'bahan' or v_item.archived_at is not null then
      raise exception 'Bahan resep tidak ditemukan, diarsip, atau bukan bahan' using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 or v_qty <> round(v_qty, 3) then
      raise exception 'Jumlah bahan resep % tidak valid', v_item.name using errcode = '22023';
    end if;
    insert into public.irt_recipe_lines (recipe_id, item_id, qty, sort_order) values (v_id, v_item.id, v_qty, v_n);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit('irt.recipe.saved', 'irt_recipe', v_id::text, null,
    jsonb_build_object('product_id', p_product, 'yield_pcs', p_yield, 'gas_rp', p_gas, 'lines', p_lines));
  return v_id;
exception
  when unique_violation then
    raise exception 'Bahan yang sama tercantum dua kali' using errcode = '22023';
end;
$$;

-- ---------- 4) produksi: biaya non-bahan ----------
-- p_costs: {recipe_id, recipe_count, gas_rp, labor_rp, packaging_rp, other_rp}; nilai kosong (null) = dihitung dari
-- parameter: gas = gas resep × jumlah resep, upah & kemasan = pcs hasil × tarif per pcs produk.
drop function public.irt_save_batch_draft(uuid, date, text, jsonb, jsonb);
create function public.irt_save_batch_draft(p_id uuid, p_date date, p_note text, p_inputs jsonb, p_outputs jsonb, p_costs jsonb default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_date date := public._irt_date(p_date);
  v_line jsonb;
  v_item public.irt_items%rowtype;
  v_qty numeric;
  v_status text;
  v_n int := 0;
  v_c jsonb := coalesce(p_costs, '{}'::jsonb);
  v_recipe public.irt_recipes%rowtype;
  v_count numeric;
  v_gas bigint;
  v_labor bigint := 0;
  v_pack bigint := 0;
  v_other bigint;
  k text;
begin
  perform public._irt_require();
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'array' or jsonb_array_length(p_inputs) = 0 then
    raise exception 'Isi minimal satu bahan' using errcode = '22023';
  end if;
  if p_outputs is null or jsonb_typeof(p_outputs) <> 'array' or jsonb_array_length(p_outputs) = 0 then
    raise exception 'Isi minimal satu hasil produk' using errcode = '22023';
  end if;
  if jsonb_typeof(v_c) <> 'object' then
    raise exception 'Biaya produksi tidak valid' using errcode = '22023';
  end if;
  foreach k in array array['gas_rp', 'labor_rp', 'packaging_rp', 'other_rp'] loop
    if v_c ? k and jsonb_typeof(v_c -> k) <> 'null' and coalesce(v_c ->> k, '') !~ '^[0-9]{1,10}$' then
      raise exception 'Biaya % harus rupiah bulat ≥ 0', k using errcode = '22023';
    end if;
  end loop;
  if (v_c ->> 'recipe_id') is not null then
    select * into v_recipe from public.irt_recipes where id = (v_c ->> 'recipe_id')::uuid;
    if not found then
      raise exception 'Resep tidak ditemukan' using errcode = '22023';
    end if;
    v_count := (v_c ->> 'recipe_count')::numeric;
    if v_count is null or v_count <= 0 or v_count > 10000 or v_count <> round(v_count, 2) then
      raise exception 'Jumlah resep harus lebih dari 0 (maks. 2 desimal)' using errcode = '22023';
    end if;
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
    v_labor := v_labor + (v_qty * v_item.labor_cost_pcs)::bigint;
    v_pack := v_pack + (v_qty * v_item.packaging_cost_pcs)::bigint;
    v_n := v_n + 1;
  end loop;

  v_gas := case when v_recipe.id is not null then round(v_recipe.gas_rp * v_count)::bigint else 0 end;
  update public.irt_batches set
    recipe_id = v_recipe.id, recipe_count = v_count,
    gas_rp = coalesce(nullif(v_c ->> 'gas_rp', '')::bigint, v_gas),
    labor_rp = coalesce(nullif(v_c ->> 'labor_rp', '')::bigint, v_labor),
    packaging_rp = coalesce(nullif(v_c ->> 'packaging_rp', '')::bigint, v_pack),
    other_rp = coalesce(nullif(v_c ->> 'other_rp', '')::bigint, 0)
  where id = v_id;

  perform public.write_audit(case when p_id is null then 'irt.batch.draft_created' else 'irt.batch.draft_updated' end, 'irt_batch', v_id::text);
  return v_id;
exception
  when unique_violation then
    raise exception 'Bahan atau produk yang sama tercantum dua kali' using errcode = '22023';
end;
$$;

-- Konfirmasi: bahan keluar (rata-rata bergerak) + gas + upah + kemasan + lain → nilai hasil, dibagi per pcs.
create or replace function public.irt_confirm_batch(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.irt_batches%rowtype;
  v_doc text;
  r record;
  v_input bigint := 0;
  v_total bigint;
  v_pcs bigint;
  v_left bigint;
  v_val bigint;
  v_n int;
  v_i int := 0;
  v_hpp bigint;
begin
  perform public._irt_require();
  select * into v_b from public.irt_batches where id = p_id for update;
  if not found then
    raise exception 'Batch IRT tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_b.status = 'confirmed' then
    return jsonb_build_object('id', v_b.id, 'doc_number', v_b.doc_number, 'hpp_per_pcs', v_b.hpp_per_pcs, 'already', true);
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
  v_total := v_input + v_b.gas_rp + v_b.labor_rp + v_b.packaging_rp + v_b.other_rp;
  v_left := v_total;
  for r in select * from public.irt_batch_lines where batch_id = p_id and role = 'hasil' order by sort_order loop
    v_i := v_i + 1;
    v_val := case when v_i = v_n then v_left else round(v_total::numeric * r.qty / v_pcs)::bigint end;
    v_left := v_left - v_val;
    perform public._irt_post(r.item_id, 'in', r.qty, 'produksi_hasil', 'irt_batch', p_id, v_doc, v_b.business_date, v_val, r.id::text);
    update public.irt_batch_lines set value_rp = v_val where id = r.id;
  end loop;
  v_hpp := round(v_total::numeric / v_pcs)::bigint;

  update public.irt_batches
     set status = 'confirmed', doc_number = v_doc, input_value_rp = v_input, output_pcs = v_pcs, total_cost_rp = v_total,
         hpp_per_pcs = v_hpp, confirmed_at = now(), confirmed_by = (select auth.uid())
   where id = p_id;
  perform public.write_audit('irt.batch.confirmed', 'irt_batch', p_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'input_value_rp', v_input, 'total_cost_rp', v_total, 'output_pcs', v_pcs, 'hpp_per_pcs', v_hpp));
  return jsonb_build_object('id', p_id, 'doc_number', v_doc, 'hpp_per_pcs', v_hpp, 'already', false);
end;
$$;

-- ---------- 5) mesin hitung ulang IRT ----------
create function public._irt_recalc(p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  l record;
  b record;
  v_qty numeric;
  v_value bigint;
  v_val bigint;
  v_explicit bigint;
  v_total bigint;
  v_left bigint;
  v_n int;
  v_k int;
  v_pcs numeric;
  v_run bigint;
  v_mv int;
  v_batches int;
  v_bad int;
begin
  perform pg_advisory_xact_lock(hashtext('public._irt_recalc'));
  perform 1 from public.irt_stock_balances order by item_id for update;
  perform set_config('app.hpp_recalc', 'on', true);

  create temp table if not exists _irt_state (item_id uuid primary key, qty numeric not null, value bigint not null) on commit drop;
  create temp table if not exists _irt_mv (id bigint primary key, value bigint not null) on commit drop;
  create temp table if not exists _irt_line (line_id uuid primary key, value bigint not null) on commit drop;
  create temp table if not exists _irt_batch (batch_id uuid primary key, input bigint not null default 0, done boolean not null default false) on commit drop;
  truncate pg_temp._irt_state, pg_temp._irt_mv, pg_temp._irt_line, pg_temp._irt_batch;
  insert into pg_temp._irt_batch (batch_id) select id from public.irt_batches where status = 'confirmed';

  for m in select id, item_id, movement_type, direction, qty, value_rp, source_type, source_id, source_line from public.irt_movements order by id loop
    select qty, value into v_qty, v_value from pg_temp._irt_state where item_id = m.item_id;
    if not found then
      v_qty := 0; v_value := 0;
      insert into pg_temp._irt_state values (m.item_id, 0, 0);
    end if;
    if m.direction = 'in' then
      if m.movement_type = 'produksi_hasil' then
        if not (select done from pg_temp._irt_batch where batch_id = m.source_id) then
          select * into b from public.irt_batches where id = m.source_id;
          v_total := (select input from pg_temp._irt_batch where batch_id = m.source_id) + b.gas_rp + b.labor_rp + b.packaging_rp + b.other_rp;
          select count(*), coalesce(sum(qty), 0) into v_n, v_pcs from public.irt_batch_lines where batch_id = m.source_id and role = 'hasil';
          v_left := v_total; v_k := 0;
          for l in select id, qty from public.irt_batch_lines where batch_id = m.source_id and role = 'hasil' order by sort_order loop
            v_k := v_k + 1;
            v_val := case when v_k = v_n then v_left else round(v_total::numeric * l.qty / v_pcs)::bigint end;
            v_left := v_left - v_val;
            insert into pg_temp._irt_line values (l.id, v_val) on conflict (line_id) do update set value = excluded.value;
          end loop;
          update pg_temp._irt_batch set done = true where batch_id = m.source_id;
        end if;
        select value into v_val from pg_temp._irt_line where line_id = m.source_line::uuid;
      elsif m.movement_type = 'penjualan_batal' then
        select x.value into v_val from public.irt_movements t join pg_temp._irt_mv x on x.id = t.id
         where t.source_type = 'irt_sale' and t.source_id = m.source_id and t.source_line = m.source_line and t.movement_type = 'penjualan';
      elsif m.movement_type = 'koreksi' then
        v_val := case when v_qty > 0 then round(m.qty * v_value / v_qty)::bigint else 0 end;
      else
        v_val := m.value_rp;                       -- bahan masuk: nilai beli tetap
      end if;
      v_val := coalesce(v_val, 0);
      v_qty := v_qty + m.qty;
      v_value := v_value + v_val;
    else
      v_explicit := case when m.movement_type = 'retur_kelompok' then m.value_rp end;
      if v_qty = m.qty then
        v_val := v_value;
      elsif v_explicit is not null then
        v_val := least(v_explicit, v_value);
      elsif v_qty > 0 then
        v_val := round(m.qty * v_value / v_qty)::bigint;
      else
        v_val := 0;
      end if;
      v_qty := v_qty - m.qty;
      v_value := v_value - v_val;
      if m.movement_type = 'produksi_bahan' then
        insert into pg_temp._irt_line values (m.source_line::uuid, v_val) on conflict (line_id) do update set value = excluded.value;
        update pg_temp._irt_batch set input = input + v_val where batch_id = m.source_id;
      end if;
    end if;
    update pg_temp._irt_state set qty = v_qty, value = v_value where item_id = m.item_id;
    insert into pg_temp._irt_mv values (m.id, v_val);
  end loop;

  select count(*) into v_bad from public.irt_stock_balances s left join pg_temp._irt_state st on st.item_id = s.item_id
   where coalesce(st.qty, 0) <> s.on_hand;
  if v_bad > 0 then
    raise exception 'Hitung ulang HPP IRT dibatalkan: saldo tidak cocok dengan buku mutasi (% item)', v_bad using errcode = 'P0001';
  end if;

  insert into public.hpp_recalc_runs (reason) values (coalesce(p_reason, 'hitung ulang IRT')) returning id into v_run;
  insert into public.hpp_recalc_log (run_id, entity, entity_id, doc_number, field, before_rp, after_rp)
  select v_run, 'irt_movement', t.id::text, t.doc_number, 'value_rp', t.value_rp, x.value
    from public.irt_movements t join pg_temp._irt_mv x on x.id = t.id where t.value_rp <> x.value;
  update public.irt_movements t set value_rp = x.value from pg_temp._irt_mv x where x.id = t.id and t.value_rp <> x.value;
  get diagnostics v_mv = row_count;
  update public.irt_batch_lines bl set value_rp = x.value from pg_temp._irt_line x where x.line_id = bl.id and bl.value_rp is distinct from x.value;

  with n as (
    select ib.id, ib.doc_number, ib.hpp_per_pcs as old_hpp, h.input,
           h.input + ib.gas_rp + ib.labor_rp + ib.packaging_rp + ib.other_rp as total,
           round((h.input + ib.gas_rp + ib.labor_rp + ib.packaging_rp + ib.other_rp)::numeric / nullif(ib.output_pcs, 0))::bigint as hpp
      from public.irt_batches ib join pg_temp._irt_batch h on h.batch_id = ib.id
  )
  insert into public.hpp_recalc_log (run_id, entity, entity_id, doc_number, field, before_rp, after_rp)
  select v_run, 'irt_batch', n.id::text, n.doc_number, 'hpp_per_pcs', n.old_hpp, n.hpp from n where n.old_hpp is distinct from n.hpp;
  update public.irt_batches ib
     set input_value_rp = h.input, total_cost_rp = h.input + ib.gas_rp + ib.labor_rp + ib.packaging_rp + ib.other_rp,
         hpp_per_pcs = round((h.input + ib.gas_rp + ib.labor_rp + ib.packaging_rp + ib.other_rp)::numeric / nullif(ib.output_pcs, 0))::bigint
    from pg_temp._irt_batch h
   where h.batch_id = ib.id;
  get diagnostics v_batches = row_count;

  update public.irt_adjustments a set value_rp = t.value_rp
    from public.irt_movements t
   where t.source_type = 'irt_adjustment' and t.source_id = a.id and a.value_rp <> t.value_rp;
  insert into public.hpp_recalc_log (run_id, entity, entity_id, field, before_rp, after_rp)
  select v_run, 'irt_stock_balance', s.item_id::text, 'value_rp', s.value_rp, st.value
    from public.irt_stock_balances s join pg_temp._irt_state st on st.item_id = s.item_id where s.value_rp <> st.value;
  update public.irt_stock_balances s set value_rp = st.value, updated_at = now()
    from pg_temp._irt_state st where st.item_id = s.item_id and s.value_rp <> st.value;

  perform set_config('app.hpp_recalc', 'off', true);
  return jsonb_build_object('run_id', v_run, 'movements_changed', v_mv, 'batches', v_batches);
end;
$$;

-- ---------- 6) ringkasan HPP IRT per produk (laporan; security invoker → RLS) ----------
-- Standar: resep × harga standar bahan (bila kosong: rata-rata stok) + gas per resep, dibagi hasil per resep,
-- + upah & kemasan per pcs. Aktual: batch terkonfirmasi di periode.
create function public.irt_hpp_summary(p_from date, p_to date)
returns table (
  product_id uuid, name text, price_pcs bigint, target_markup_pct numeric, labor_cost_pcs bigint, packaging_cost_pcs bigint,
  recipe_yield numeric, recipe_gas_rp bigint, std_material_per_pcs numeric, std_hpp_per_pcs numeric, std_missing_price boolean,
  batches bigint, pcs numeric, material_rp bigint, gas_rp bigint, labor_rp bigint, packaging_rp bigint, other_rp bigint, total_rp bigint
)
language sql stable security invoker set search_path = '' as $$
  with std as (
    select r.product_id, r.yield_pcs, r.gas_rp,
           sum(rl.qty * coalesce(i.std_price, s.avg_cost, 0)) as material,
           bool_or(i.std_price is null and s.avg_cost is null) as missing
      from public.irt_recipes r
      join public.irt_recipe_lines rl on rl.recipe_id = r.id
      join public.irt_items i on i.id = rl.item_id
      left join public.v_irt_stock s on s.item_id = i.id
     group by r.product_id, r.yield_pcs, r.gas_rp
  ),
  act as (
    select bl.item_id,
           count(distinct b.id) as batches,
           sum(bl.qty) as pcs,
           -- biaya batch dibagi ke produk sebanding pcs
           sum(round(coalesce(b.input_value_rp, 0)::numeric * bl.qty / b.output_pcs))::bigint as material_rp,
           sum(round(b.gas_rp::numeric * bl.qty / b.output_pcs))::bigint as gas_rp,
           sum(round(b.labor_rp::numeric * bl.qty / b.output_pcs))::bigint as labor_rp,
           sum(round(b.packaging_rp::numeric * bl.qty / b.output_pcs))::bigint as packaging_rp,
           sum(round(b.other_rp::numeric * bl.qty / b.output_pcs))::bigint as other_rp,
           sum(coalesce(bl.value_rp, 0))::bigint as total_rp
      from public.irt_batches b join public.irt_batch_lines bl on bl.batch_id = b.id and bl.role = 'hasil'
     where b.status = 'confirmed' and b.business_date between p_from and p_to
     group by bl.item_id
  )
  select i.id, i.name, i.price_pcs, i.target_markup_pct, i.labor_cost_pcs, i.packaging_cost_pcs,
         std.yield_pcs, std.gas_rp,
         case when std.product_id is not null then round(std.material / std.yield_pcs, 2) end,
         case when std.product_id is not null then round((std.material + std.gas_rp) / std.yield_pcs + i.labor_cost_pcs + i.packaging_cost_pcs, 2) end,
         coalesce(std.missing, false),
         coalesce(act.batches, 0), coalesce(act.pcs, 0), coalesce(act.material_rp, 0), coalesce(act.gas_rp, 0), coalesce(act.labor_rp, 0),
         coalesce(act.packaging_rp, 0), coalesce(act.other_rp, 0), coalesce(act.total_rp, 0)
    from public.irt_items i
    left join std on std.product_id = i.id
    left join act on act.item_id = i.id
   where i.kind = 'produk' and (i.archived_at is null or act.item_id is not null)
   order by i.name;
$$;

revoke execute on function public._irt_recalc(text) from public, anon, authenticated;
revoke execute on function public.irt_save_item_costs(uuid, bigint, bigint, bigint, numeric), public.irt_save_recipe(uuid, numeric, bigint, text, jsonb),
  public.irt_save_batch_draft(uuid, date, text, jsonb, jsonb, jsonb), public.irt_confirm_batch(uuid), public.irt_hpp_summary(date, date)
from public, anon;
grant execute on function public.irt_save_item_costs(uuid, bigint, bigint, bigint, numeric), public.irt_save_recipe(uuid, numeric, bigint, text, jsonb),
  public.irt_save_batch_draft(uuid, date, text, jsonb, jsonb, jsonb), public.irt_confirm_batch(uuid), public.irt_hpp_summary(date, date)
to authenticated;

-- ---------- 7) master data default (harga pasar Pati / Sukolilo, 19 Nov 2026) — tetap bisa diedit ----------
-- Bahan: buat bila belum ada (nama dicocokkan tanpa beda huruf besar/kecil), harga standar diisi.
insert into public.irt_items (kind, name, unit, kelompok_product_id)
select 'bahan', 'Tepung jagung', 'kg', p.id from public.products p
 where p.code = 'TP' and not exists (select 1 from public.irt_items where kelompok_product_id = p.id)
   and not exists (select 1 from public.irt_items where kind = 'bahan' and lower(btrim(name)) = 'tepung jagung' and archived_at is null);
insert into public.irt_items (kind, name, unit)
select 'bahan', x.name, x.unit
  from (values ('Tepung terigu', 'kg'), ('Tepung tapioka', 'kg'), ('Telur ayam', 'butir'), ('Garam halus', 'kg')) as x (name, unit)
 where not exists (select 1 from public.irt_items i where i.kind = 'bahan' and lower(btrim(i.name)) = lower(x.name) and i.archived_at is null);
update public.irt_items i set std_price = x.price
  from (values ('tepung jagung', 11500), ('tepung terigu', 12000), ('tepung tapioka', 16000), ('telur ayam', 1500), ('garam halus', 8000)) as x (name, price)
 where i.kind = 'bahan' and lower(btrim(i.name)) = x.name and i.archived_at is null and i.std_price is null;
update public.irt_items set std_price = 11500 where kind = 'bahan' and kelompok_product_id is not null and std_price is null;

-- Produk tunggal mie jagung (keputusan: 1 SKU). Produk uji "mie jagung" yang sudah ada diganti namanya (riwayat tetap).
update public.irt_items set name = 'Mie Jagung Kering Mentah Kemas (90g)'
 where kind = 'produk' and archived_at is null and lower(btrim(name)) like 'mie jagung%'
   and (select count(*) from public.irt_items where kind = 'produk' and archived_at is null and lower(btrim(name)) like 'mie jagung%') = 1;
insert into public.irt_items (kind, name, unit, price_pcs)
select 'produk', 'Mie Jagung Kering Mentah Kemas (90g)', 'pcs', 6000
 where not exists (select 1 from public.irt_items where kind = 'produk' and lower(btrim(name)) like 'mie jagung%' and archived_at is null);
update public.irt_items
   set packaging_cost_pcs = 800, labor_cost_pcs = 1625, target_markup_pct = 50, price_pcs = 6000
 where kind = 'produk' and name = 'Mie Jagung Kering Mentah Kemas (90g)';

insert into public.irt_items (kind, name, unit, price_pcs, packaging_cost_pcs)
select 'produk', 'Tepung Jagung Kemas 1 kg', 'pcs', 20000, 1200
 where not exists (select 1 from public.irt_items where kind = 'produk' and lower(btrim(name)) like 'tepung jagung kemas%' and archived_at is null);

-- Resep (dibuat bila produk belum punya resep).
insert into public.irt_recipes (product_id, yield_pcs, gas_rp, note)
select id, 2.77, 1000, 'Tepung jagung 100 g, terigu 100 g, tapioka 25 g, telur 1, air hangat 5 sdm, garam 1 jumput → adonan 325 g'
  from public.irt_items where kind = 'produk' and name = 'Mie Jagung Kering Mentah Kemas (90g)'
on conflict (product_id) do nothing;
insert into public.irt_recipe_lines (recipe_id, item_id, qty, sort_order)
select r.id, i.id, x.qty, x.ord
  from public.irt_recipes r
  join public.irt_items p on p.id = r.product_id and p.name = 'Mie Jagung Kering Mentah Kemas (90g)'
  cross join (values ('tepung jagung', 0.1, 0), ('tepung terigu', 0.1, 1), ('tepung tapioka', 0.025, 2), ('telur ayam', 1, 3), ('garam halus', 0.002, 4)) as x (name, qty, ord)
  join lateral (select id from public.irt_items i where i.kind = 'bahan' and i.archived_at is null
                  and (lower(btrim(i.name)) = x.name or (x.name = 'tepung jagung' and i.kelompok_product_id is not null))
                order by (i.kelompok_product_id is not null) desc limit 1) i on true
 where not exists (select 1 from public.irt_recipe_lines where recipe_id = r.id)
on conflict do nothing;
insert into public.irt_recipes (product_id, yield_pcs, gas_rp, note)
select id, 1, 0, 'Tepung jagung 1 kg dikemas & didesain'
  from public.irt_items where kind = 'produk' and name = 'Tepung Jagung Kemas 1 kg'
on conflict (product_id) do nothing;
insert into public.irt_recipe_lines (recipe_id, item_id, qty, sort_order)
select r.id, i.id, 1, 0
  from public.irt_recipes r
  join public.irt_items p on p.id = r.product_id and p.name = 'Tepung Jagung Kemas 1 kg'
  join lateral (select id from public.irt_items i where i.kind = 'bahan' and i.archived_at is null
                  and (i.kelompok_product_id is not null or lower(btrim(i.name)) = 'tepung jagung')
                order by (i.kelompok_product_id is not null) desc limit 1) i on true
 where not exists (select 1 from public.irt_recipe_lines where recipe_id = r.id)
on conflict do nothing;

-- ---------- 8) MIGRASI DATA LAMA IRT: biaya non-bahan default + hitung ulang ----------
select set_config('app.hpp_recalc', 'on', true);
update public.irt_batches b
   set labor_rp = x.labor, packaging_rp = x.pack,
       gas_rp = x.gas
  from (
    select bl.batch_id,
           sum(bl.qty * i.labor_cost_pcs)::bigint as labor,
           sum(bl.qty * i.packaging_cost_pcs)::bigint as pack,
           sum(case when r.id is not null then round(r.gas_rp * bl.qty / r.yield_pcs) else 0 end)::bigint as gas
      from public.irt_batch_lines bl
      join public.irt_items i on i.id = bl.item_id
      left join public.irt_recipes r on r.product_id = i.id
     where bl.role = 'hasil'
     group by bl.batch_id
  ) x
 where x.batch_id = b.id and b.status = 'confirmed' and b.gas_rp = 0 and b.labor_rp = 0 and b.packaging_rp = 0 and b.other_rp = 0;
select set_config('app.hpp_recalc', 'off', true);

do $$
declare v jsonb;
begin
  v := public._irt_recalc('migrasi rumus HPP IRT (19 Nov 2026): gas, upah, kemasan per pcs');
  raise notice 'Hitung ulang HPP IRT: %', v;
end $$;

notify pgrst, 'reload schema';
