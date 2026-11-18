-- =====================================================================
-- Sistem tanpa kas (keputusan pengguna 19 Nov 2026, PRD Q25): aplikasi murni untuk pencatatan produksi, stok,
-- penjualan (barang), dan kalkulasi HPP. Seluruh pencatatan uang masuk/keluar dihapus: akun & buku kas, pembayaran,
-- refund, pengeluaran, pemasukan lain, koreksi kas, transfer antar akun, bukti pembayaran, kuitansi, status bayar.
--
-- PENGAMAN: semua data kas lama DISALIN dulu ke skema `arsip_kas` (tidak diekspos ke API/aplikasi; hanya postgres)
-- sebelum tabelnya dihapus, sehingga tidak ada data yang hilang permanen.
-- =====================================================================

-- ---------- 1) arsip ----------
create schema if not exists arsip_kas;
revoke all on schema arsip_kas from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema arsip_kas from anon, authenticated';
  end if;
end $$;
comment on schema arsip_kas is 'Arsip data kas sebelum fitur kas dihapus (19 Nov 2026). Hanya-baca untuk admin teknis via SQL.';

create table arsip_kas.cash_accounts as table public.cash_accounts;
create table arsip_kas.cash_transactions as table public.cash_transactions;
create table arsip_kas.payments as table public.payments;
create table arsip_kas.refunds as table public.refunds;
create table arsip_kas.expense_categories as table public.expense_categories;
create table arsip_kas.income_categories as table public.income_categories;
create table arsip_kas.expenses as table public.expenses;
create table arsip_kas.other_incomes as table public.other_incomes;
create table arsip_kas.cash_corrections as table public.cash_corrections;
create table arsip_kas.cash_transfers as table public.cash_transfers;
create table arsip_kas.payment_attachments as select * from public.attachments where payment_id is not null;
create table arsip_kas.payment_print_logs as select * from public.print_logs where doc_type = 'payment';
create table arsip_kas.order_payment_status as select id as order_id, doc_number, payment_status::text as payment_status from public.orders;

-- Kolom bertipe enum kas diubah ke text supaya tipe enum-nya bisa dihapus tanpa kehilangan arsip.
do $$
declare c record;
begin
  for c in
    select a.attrelid::regclass as tbl, a.attname
      from pg_attribute a join pg_class t on t.oid = a.attrelid join pg_namespace n on n.oid = t.relnamespace
      join pg_type ty on ty.oid = a.atttypid
     where n.nspname = 'arsip_kas' and a.attnum > 0 and not a.attisdropped and ty.typtype = 'e'
  loop
    execute format('alter table %s alter column %I type text using %I::text', c.tbl, c.attname, c.attname);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema arsip_kas from public, anon, authenticated';
  else
    execute 'revoke all on all tables in schema arsip_kas from public';
  end if;
end $$;

-- ---------- 2) fungsi & view kas ----------
drop trigger if exists order_returns_payment_status on public.order_returns;
drop view public.v_cash_balance;
drop view public.v_order_balance;

drop function public.after_return_verified();
drop function public.set_opening_balance(uuid, bigint, date);
drop function public.record_payment(uuid, date, text, uuid, bigint, text, boolean);
drop function public.verify_payment(uuid);
drop function public.reject_payment(uuid, text);
drop function public.create_refund(uuid, uuid, bigint, text, date, uuid);
drop function public._post_refund(uuid, uuid, bigint, text, date, uuid);
drop function public.cancel_order(uuid, text, uuid);
drop function public.create_expense(date, text, uuid, bigint, text, text);
drop function public.create_other_income(date, text, uuid, bigint, text);
drop function public.request_cash_correction(uuid, text, bigint, text, date);
drop function public.decide_cash_correction(uuid, boolean, text);
drop function public.create_cash_transfer(date, uuid, uuid, bigint, text);
drop function public._verify_payment(uuid);
drop function public._refresh_payment_status(uuid);
drop function public._order_money(uuid);
drop function public._post_cash(uuid, public.cash_direction, bigint, text, uuid, text, date, text);
drop function public._active_account(uuid);
drop function public._check_cash_date(date);

-- ---------- 3) bukti pembayaran (lampiran) ----------
drop policy if exists proofs_payments_insert on storage.objects;
drop policy if exists proofs_payments_select on storage.objects;
drop policy if exists proofs_payments_delete on storage.objects;

alter table public.attachments disable trigger attachments_guard;
delete from public.attachments where payment_id is not null;
alter table public.attachments enable trigger attachments_guard;

drop policy attachments_select on public.attachments;
drop policy attachments_insert on public.attachments;
drop policy attachments_delete on public.attachments;
alter table public.attachments drop constraint attachments_parent_check;
alter table public.attachments drop column payment_id;
alter table public.attachments alter column receipt_id set not null;

create or replace function public.guard_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.receipt_status;
begin
  if tg_op = 'INSERT' then
    select status into v_status from public.receipts where id = new.receipt_id for update;
    if v_status is distinct from 'draft' then
      raise exception 'Bukti hanya bisa ditambah selama penerimaan masih draft' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    if (select count(*) from public.attachments where receipt_id = new.receipt_id) >= 5 then
      raise exception 'Maksimal 5 bukti per penerimaan' using errcode = '22023';
    end if;
    perform public.write_audit('attachment.added', 'receipt', new.receipt_id::text, null, to_jsonb(new));
    return new;
  end if;
  select status into v_status from public.receipts where id = old.receipt_id;
  if found and v_status <> 'draft' then
    raise exception 'Bukti penerimaan terkonfirmasi tidak dapat dihapus' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if found then
    perform public.write_audit('attachment.removed', 'receipt', old.receipt_id::text, to_jsonb(old), null);
  end if;
  return old;
end;
$$;

create policy attachments_select on public.attachments for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.has_role('admin_kelompok') and storage_path like 'receipts/%');
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.has_role('admin_kelompok'));

-- ---------- 4) cetak: hanya nota pesanan (kuitansi pembayaran dihapus) ----------
alter table public.print_logs disable trigger print_logs_append_only;
delete from public.print_logs where doc_type = 'payment';
alter table public.print_logs enable trigger print_logs_append_only;
alter table public.print_logs drop constraint print_logs_doc_type_check;
alter table public.print_logs add constraint print_logs_doc_type_check check (doc_type = 'order');

create or replace function public.log_print(p_doc_type text, p_doc_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang mencetak nota' using errcode = '42501';
  end if;
  if p_doc_type is distinct from 'order' then
    raise exception 'Jenis dokumen cetak tidak dikenal' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders where id = p_doc_id and status in ('confirmed', 'delivered', 'cancelled')) then
    raise exception 'Nota hanya untuk pesanan yang sudah dikonfirmasi' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_doc_type || p_doc_id::text));
  insert into public.print_logs (doc_type, doc_id) values (p_doc_type, p_doc_id);
  select count(*) into v_n from public.print_logs where doc_type = p_doc_type and doc_id = p_doc_id;
  return v_n;
end;
$$;

-- ---------- 5) tabel kas ----------
drop table public.cash_transfers;
drop table public.cash_corrections;
drop table public.expenses;
drop table public.other_incomes;
drop table public.expense_categories;
drop table public.income_categories;
drop table public.refunds;
drop table public.payments;
drop table public.cash_transactions;
drop table public.cash_accounts;
drop function public.guard_payment();
drop function public.guard_cash_correction();

-- ---------- 6) status bayar pesanan ----------
alter table public.orders drop column payment_status;
drop type public.order_payment_status;
drop type public.payment_status;
drop type public.payment_method;
drop type public.cash_account_kind;
drop type public.cash_direction;

-- Batal pesanan kembali ke versi tanpa refund (M6): hanya melepas reservasi.
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
revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- Nilai penjualan per pesanan (tanpa pembayaran): tagihan = total − retur terverifikasi.
create view public.v_order_balance with (security_invoker = true) as
select
  o.id as order_id, o.doc_number, o.customer_id, o.status, o.total_rp,
  coalesce(r.returned, 0)::bigint as returned_rp,
  case when o.status in ('confirmed', 'delivered') then greatest(o.total_rp - coalesce(r.returned, 0), 0) else 0 end::bigint as bill_rp
from public.orders o
left join (select order_id, sum(sales_value_rp) as returned from public.order_returns where status = 'verified' group by order_id) r on r.order_id = o.id;
revoke all on public.v_order_balance from anon;
grant select on public.v_order_balance to authenticated;

-- ---------- 7) ringkasan tanpa kas ----------
create or replace function public.rpt_kpi(p_from date, p_to date) returns jsonb
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
    'pending_returns', (select count(*) from public.order_returns where status = 'draft'),
    'pending_batch_voids', (select count(*) from public.production_batches where status = 'pending_void'),
    'orders_to_deliver', (select count(*) from public.orders where status = 'confirmed'),
    'stock_below_min', (select count(*) from public.v_stock_balance where archived_at is null and below_min)
  )
  from sales, rcv, prd, prd2;
$$;
