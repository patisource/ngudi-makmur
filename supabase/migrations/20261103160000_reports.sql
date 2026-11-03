-- =====================================================================
-- M8 — Dashboard, nota & laporan (T8.1, T8.3, T8.4) · FR-DASH-*, FR-RPT-*
-- Rumus indikator PRD §5.9 dihitung di SQL (numeric/bigint, tanpa float) dan hanya dari transaksi sah.
-- Fungsi laporan SECURITY INVOKER: RLS tabel dasar tetap berlaku, jadi setiap peran hanya menjumlah data yang boleh
-- dilihatnya (mis. operator produksi tidak melihat penjualan/kas → angka itu 0 dan kartunya disembunyikan aplikasi).
-- Nota diambil dari transaksi tersimpan; mencetak hanya menambah print_logs (FR-RPT-03, 03a).
-- =====================================================================

-- ---------- riwayat cetak (FR-RPT-03) ----------
create table public.print_logs (
  id          bigint generated always as identity primary key,
  doc_type    text not null check (doc_type in ('order', 'payment')),
  doc_id      uuid not null,
  printed_by  uuid default auth.uid(),
  printed_at  timestamptz not null default now()
);
create index print_logs_doc_idx on public.print_logs (doc_type, doc_id);
create trigger print_logs_append_only before update or delete on public.print_logs for each row execute function public.prevent_mutation();

-- Catat satu cetakan; hasil = urutan cetak (1 = asli, ≥ 2 = cetak ulang ke-(n−1)). Tidak menyentuh stok/kas/status.
create function public.log_print(p_doc_type text, p_doc_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang mencetak nota' using errcode = '42501';
  end if;
  if p_doc_type = 'order' then
    if not exists (select 1 from public.orders where id = p_doc_id and status in ('confirmed', 'delivered', 'cancelled')) then
      raise exception 'Nota hanya untuk pesanan yang sudah dikonfirmasi' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
  elsif p_doc_type = 'payment' then
    if not exists (select 1 from public.payments where id = p_doc_id and status = 'verified') then
      raise exception 'Kuitansi hanya untuk pembayaran terverifikasi' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
  else
    raise exception 'Jenis dokumen cetak tidak dikenal' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_doc_type || p_doc_id::text));   -- urutan cetak tidak ganda
  insert into public.print_logs (doc_type, doc_id) values (p_doc_type, p_doc_id);
  select count(*) into v_n from public.print_logs where doc_type = p_doc_type and doc_id = p_doc_id;
  return v_n;
end;
$$;

-- ---------- detail penjualan sah (omzet, porsi jagung mentah, penjualan digital) ----------
-- Baris: item pesanan diserahkan (tanggal serah), ongkos kirim pesanan diserahkan, dan retur terverifikasi (negatif,
-- tanggal retur). Omzet = Σ value_rp (PRD §5.9: nilai pesanan diserahkan − retur sah).
create function public.rpt_sales(p_from date, p_to date)
returns table (
  kind text, order_id uuid, doc_number text, business_date date, customer_id uuid, customer_name text, channel text, channel_name text,
  is_digital boolean, product_id uuid, product_code text, product_name text, category public.product_category, qty_kg numeric, value_rp bigint
)
language sql stable security invoker set search_path = '' as $$
  select 'penjualan', o.id, o.doc_number, o.delivered_on, o.customer_id, o.customer_name, o.channel, sc.name, sc.is_digital,
         p.id, p.code, p.name, p.category, oi.qty_kg, oi.line_total_rp
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.products p on p.id = oi.product_id
    join public.sales_channels sc on sc.code = o.channel
   where o.status = 'delivered' and o.delivered_on between p_from and p_to
  union all
  select 'ongkir', o.id, o.doc_number, o.delivered_on, o.customer_id, o.customer_name, o.channel, sc.name, sc.is_digital,
         null, null, 'Ongkos kirim', null, 0, o.shipping_rp
    from public.orders o join public.sales_channels sc on sc.code = o.channel
   where o.status = 'delivered' and o.shipping_rp > 0 and o.delivered_on between p_from and p_to
  union all
  select 'retur', o.id, r.doc_number, r.business_date, o.customer_id, o.customer_name, o.channel, sc.name, sc.is_digital,
         p.id, p.code, p.name, p.category, -ri.qty_kg, -ri.sales_value_rp
    from public.order_return_items ri
    join public.order_returns r on r.id = ri.return_id
    join public.orders o on o.id = r.order_id
    join public.products p on p.id = ri.product_id
    join public.sales_channels sc on sc.code = o.channel
   where r.status = 'verified' and r.business_date between p_from and p_to;
$$;

-- ---------- mutasi stok per produk dalam periode (FR-RPT-04: stok & mutasi) ----------
create function public.rpt_stock(p_from date, p_to date)
returns table (product_id uuid, code text, name text, category public.product_category, opening_kg numeric, in_kg numeric, out_kg numeric,
               closing_kg numeric, on_hand_kg numeric, reserved_kg numeric, available_kg numeric, value_rp bigint, min_stock_kg numeric, below_min boolean)
language sql stable security invoker set search_path = '' as $$
  select v.product_id, v.code, v.name, v.category,
         coalesce(sum(case when m.business_date < p_from then case when m.direction = 'in' then m.qty_kg else -m.qty_kg end end), 0),
         coalesce(sum(case when m.business_date between p_from and p_to and m.direction = 'in' then m.qty_kg end), 0),
         coalesce(sum(case when m.business_date between p_from and p_to and m.direction = 'out' then m.qty_kg end), 0),
         coalesce(sum(case when m.business_date <= p_to then case when m.direction = 'in' then m.qty_kg else -m.qty_kg end end), 0),
         v.on_hand_kg, v.reserved_kg, v.available_kg, v.value_rp, v.min_stock_kg, v.below_min
    from public.v_stock_balance v
    left join public.stock_movements m on m.product_id = v.product_id
   where v.archived_at is null or v.on_hand_kg > 0
   group by v.product_id, v.code, v.name, v.category, v.on_hand_kg, v.reserved_kg, v.available_kg, v.value_rp, v.min_stock_kg, v.below_min
   order by v.code;
$$;

-- ---------- seri harian dashboard: jagung masuk, produksi tepung (TP), terjual (kg) ----------
create function public.rpt_daily(p_from date, p_to date)
returns table (day date, receipts_kg numeric, flour_kg numeric, sales_kg numeric)
language sql stable security invoker set search_path = '' as $$
  select d::date,
         coalesce((select sum(r.weight_kg) from public.receipts r where r.status = 'confirmed' and r.business_date = d::date), 0),
         coalesce((select sum(l.qty_kg) from public.production_lines l join public.production_batches b on b.id = l.batch_id join public.products p on p.id = l.product_id
                    where b.status in ('confirmed', 'pending_void') and l.direction = 'output' and p.code = 'TP' and b.business_date = d::date), 0),
         coalesce((select sum(s.qty_kg) from public.rpt_sales(d::date, d::date) s where s.kind <> 'ongkir'), 0)
    from generate_series(p_from, least(p_to, p_from + 366), interval '1 day') d;
$$;

-- ---------- indikator ringkas (FR-DASH, PRD §5.9) ----------
-- Periode [p_from, p_to] untuk arus; saldo kas, piutang & stok = posisi saat ini.
create function public.rpt_kpi(p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with s as (select * from public.rpt_sales(p_from, p_to)),
  sales as (
    select coalesce(sum(value_rp) filter (where kind = 'penjualan'), 0) as goods_rp,
           coalesce(sum(value_rp) filter (where kind = 'ongkir'), 0) as shipping_rp,
           coalesce(-sum(value_rp) filter (where kind = 'retur'), 0) as returns_rp,
           coalesce(sum(value_rp), 0) as omzet_rp,
           coalesce(sum(value_rp) filter (where is_digital), 0) as digital_rp,
           coalesce(sum(qty_kg) filter (where kind <> 'ongkir'), 0) as sold_kg,
           coalesce(sum(qty_kg) filter (where kind <> 'ongkir' and category = 'mentah'), 0) as raw_kg,
           count(distinct order_id) filter (where kind = 'penjualan') as orders_delivered
      from s
  ),
  rcv as (
    select coalesce(sum(weight_kg), 0) as kg, coalesce(sum(acquisition_cost), 0) as rp, count(*) as n
      from public.receipts where status = 'confirmed' and business_date between p_from and p_to
  ),
  prd as (
    select coalesce(sum(l.qty_kg) filter (where p.code = 'TP'), 0) as flour_kg,
           count(distinct b.id) as batches
      from public.production_batches b
      join public.production_lines l on l.batch_id = b.id and l.direction = 'output'
      join public.products p on p.id = l.product_id
     where b.status in ('confirmed', 'pending_void') and b.business_date between p_from and p_to
  ),
  prd2 as (
    select coalesce(sum(input_kg), 0) as input_kg, coalesce(sum(loss_kg), 0) as loss_kg
      from public.production_batches where status in ('confirmed', 'pending_void') and business_date between p_from and p_to
  ),
  cash as (
    select coalesce(sum(amount_rp) filter (where direction = 'in'), 0) as in_rp, coalesce(sum(amount_rp) filter (where direction = 'out'), 0) as out_rp
      from public.cash_transactions where business_date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'days', (p_to - p_from) + 1,
    'omzet_rp', sales.omzet_rp, 'goods_rp', sales.goods_rp, 'shipping_rp', sales.shipping_rp, 'returns_rp', sales.returns_rp,
    'orders_delivered', sales.orders_delivered, 'sold_kg', sales.sold_kg, 'raw_kg', sales.raw_kg,
    'raw_share_pct', case when sales.sold_kg > 0 then round(sales.raw_kg * 100 / sales.sold_kg, 1) end,
    'digital_rp', sales.digital_rp,
    'digital_share_pct', case when sales.omzet_rp > 0 then round(sales.digital_rp::numeric * 100 / sales.omzet_rp, 1) end,
    'receipts_kg', rcv.kg, 'receipts_rp', rcv.rp, 'receipts_count', rcv.n,
    'flour_kg', prd.flour_kg, 'batches', prd.batches,
    'loss_pct', case when prd2.input_kg > 0 then round(prd2.loss_kg * 100 / prd2.input_kg, 1) end,
    'cash_in_rp', cash.in_rp, 'cash_out_rp', cash.out_rp,
    'cash_balance_rp', (select coalesce(sum(balance_rp), 0) from public.cash_accounts where archived_at is null),
    'receivable_rp', (select coalesce(sum(outstanding_rp), 0) from public.v_order_balance where status in ('confirmed', 'delivered')),
    'receivable_orders', (select count(*) from public.v_order_balance where status in ('confirmed', 'delivered') and outstanding_rp > 0),
    'credit_rp', (select coalesce(sum(credit_rp), 0) from public.v_order_balance),
    'pending_payments', (select count(*) from public.payments where status = 'pending'),
    'pending_corrections', (select count(*) from public.cash_corrections where status = 'pending'),
    'pending_returns', (select count(*) from public.order_returns where status = 'draft'),
    'pending_batch_voids', (select count(*) from public.production_batches where status = 'pending_void'),
    'orders_to_deliver', (select count(*) from public.orders where status = 'confirmed'),
    'stock_below_min', (select count(*) from public.v_stock_balance where archived_at is null and below_min)
  )
  from sales, rcv, prd, prd2, cash;
$$;

-- ---------- RLS & hak ----------
alter table public.print_logs enable row level security;
revoke all on public.print_logs from anon, authenticated;
grant select on public.print_logs to authenticated;
create policy print_logs_select on public.print_logs for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));

revoke execute on function public.log_print(text, uuid), public.rpt_sales(date, date), public.rpt_stock(date, date),
  public.rpt_daily(date, date), public.rpt_kpi(date, date) from public, anon;
grant execute on function public.log_print(text, uuid), public.rpt_sales(date, date), public.rpt_stock(date, date),
  public.rpt_daily(date, date), public.rpt_kpi(date, date) to authenticated;
