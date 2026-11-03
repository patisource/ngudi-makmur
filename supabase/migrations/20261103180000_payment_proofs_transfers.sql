-- =====================================================================
-- Desain Figma (layar 02 & 06):
--   1) Bukti transfer pada pembayaran (FR-CSH-02 "bukti transfer (opsional)"; Security.md §8).
--   2) Transfer antar akun kas tunai ↔ bank (FR-CSH-09). Satu dokumen TRF = dua baris kas (keluar & masuk),
--      jumlah kas total tidak berubah; TIDAK dihitung sebagai kas masuk/keluar di ringkasan (rpt_kpi).
-- =====================================================================

-- ---------- 1) lampiran bukti untuk pembayaran ----------
alter table public.attachments add column payment_id uuid references public.payments (id);
alter table public.attachments drop constraint attachments_receipt_id_check;
alter table public.attachments add constraint attachments_parent_check check (num_nonnulls(receipt_id, payment_id) = 1);
create index attachments_payment_idx on public.attachments (payment_id) where payment_id is not null;

-- Bukti pembayaran: boleh ditambah selama pembayaran menunggu verifikasi atau sudah terverifikasi (bukti yang
-- menyusul), tidak untuk yang ditolak; maks. 3 per pembayaran. Hapus hanya selama masih menunggu verifikasi.
create or replace function public.guard_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.receipt_status;
  v_pay public.payment_status;
begin
  if tg_op = 'INSERT' then
    if new.payment_id is not null then
      select status into v_pay from public.payments where id = new.payment_id for update;
      if v_pay is null or v_pay = 'rejected' then
        raise exception 'Bukti hanya untuk pembayaran yang menunggu verifikasi atau sudah terverifikasi' using errcode = 'P0001', hint = 'INVALID_STATE';
      end if;
      if (select count(*) from public.attachments where payment_id = new.payment_id) >= 3 then
        raise exception 'Maksimal 3 bukti per pembayaran' using errcode = '22023';
      end if;
      perform public.write_audit('attachment.added', 'payment', new.payment_id::text, null, to_jsonb(new));
      return new;
    end if;
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
  -- DELETE
  if old.payment_id is not null then
    select status into v_pay from public.payments where id = old.payment_id;
    if v_pay is distinct from 'pending' then
      raise exception 'Bukti pembayaran yang sudah diputuskan tidak dapat dihapus' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    perform public.write_audit('attachment.removed', 'payment', old.payment_id::text, to_jsonb(old), null);
    return old;
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

grant insert (payment_id) on public.attachments to authenticated;
drop policy attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using (
  (receipt_id is not null and (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua')))
  or (payment_id is not null and (public.has_role('admin_kelompok') or public.has_role('ketua')))
);
-- Tulis: admin_kelompok; folder file harus cocok dengan jenis dokumen induk.
drop policy attachments_insert on public.attachments;
drop policy attachments_delete on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated with check (
  public.has_role('admin_kelompok')
  and ((receipt_id is not null and storage_path like 'receipts/%') or (payment_id is not null and storage_path like 'payments/%'))
);
create policy attachments_delete on public.attachments for delete to authenticated
  using ((receipt_id is not null or payment_id is not null) and public.has_role('admin_kelompok'));

-- Storage: payments/{yyyy}/{mm}/{uuid}.{ext}
create policy proofs_payments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and name ~ '^payments/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$' and public.has_role('admin_kelompok'));
create policy proofs_payments_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and name like 'payments/%' and (public.has_role('admin_kelompok') or public.has_role('ketua')));
create policy proofs_payments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and name like 'payments/%' and public.has_role('admin_kelompok')
         and not exists (select 1 from public.attachments a where a.storage_path = storage.objects.name));

-- ---------- 2) transfer antar akun kas (FR-CSH-09) ----------
alter table public.cash_transactions drop constraint cash_transactions_source_type_check;
alter table public.cash_transactions add constraint cash_transactions_source_type_check
  check (source_type in ('opening_balance', 'payment', 'other_income', 'expense', 'refund', 'cash_correction', 'transfer_out', 'transfer_in'));

create table public.cash_transfers (
  id              uuid primary key default gen_random_uuid(),
  doc_number      text not null unique,                     -- TRF-YYYYMM-NNNN
  business_date   date not null,
  from_account_id uuid not null references public.cash_accounts (id),
  to_account_id   uuid not null references public.cash_accounts (id),
  amount_rp       bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  note            text not null check (char_length(btrim(note)) between 1 and 500),
  created_by      uuid not null default auth.uid(),
  created_at      timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);
create index cash_transfers_date_idx on public.cash_transfers (business_date desc);
create trigger cash_transfers_no_update before update or delete on public.cash_transfers for each row execute function public.prevent_mutation();

alter table public.cash_transfers enable row level security;
revoke all on public.cash_transfers from anon, authenticated;
grant select on public.cash_transfers to authenticated;
create policy cash_transfers_select on public.cash_transfers for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));

-- Nomor dokumen TRF.
create or replace function public.next_doc_number(p_type text, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_period text;
  v_width int;
  v_no int;
begin
  if p_type not in ('RCV', 'PRD', 'INV', 'PAY', 'EXP', 'INC', 'RFD', 'RTR', 'OPN', 'ADJ', 'KAS', 'TRF') then
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

-- Satu transaksi: kunci kedua akun (urutan id, cegah deadlock), cek saldo asal, dua baris kas, audit.
create function public.create_cash_transfer(p_date date, p_from uuid, p_to uuid, p_amount bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_doc text;
  v_date date := public._check_cash_date(p_date);
  v_from public.cash_accounts%rowtype;
  v_to public.cash_accounts%rowtype;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat transfer antar akun' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Pilih dua akun kas yang berbeda' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000000 then
    raise exception 'Jumlah harus rupiah bulat lebih dari 0' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 500 then
    raise exception 'Keterangan wajib (maks. 500 karakter)' using errcode = '22023';
  end if;
  perform 1 from public.cash_accounts where id in (p_from, p_to) order by id for update;
  v_from := public._active_account(p_from);
  v_to := public._active_account(p_to);
  v_doc := public.next_doc_number('TRF', v_date);
  insert into public.cash_transfers (id, doc_number, business_date, from_account_id, to_account_id, amount_rp, note)
  values (v_id, v_doc, v_date, p_from, p_to, p_amount, btrim(p_note));
  perform public._post_cash(p_from, 'out', p_amount, 'transfer_out', v_id, v_doc, v_date, v_from.name || ' → ' || v_to.name || ' · ' || btrim(p_note));
  perform public._post_cash(p_to, 'in', p_amount, 'transfer_in', v_id, v_doc, v_date, v_from.name || ' → ' || v_to.name || ' · ' || btrim(p_note));
  perform public.write_audit('cash_transfer.created', 'cash_transfer', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'from', v_from.name, 'to', v_to.name, 'amount_rp', p_amount), btrim(p_note));
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'status', 'posted', 'already', false);
end;
$$;
revoke execute on function public.create_cash_transfer(date, uuid, uuid, bigint, text) from public, anon;
grant execute on function public.create_cash_transfer(date, uuid, uuid, bigint, text) to authenticated;

-- Ringkasan: kas masuk/keluar periode tidak menghitung perpindahan antar akun sendiri.
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
  ),
  cash as (
    select coalesce(sum(amount_rp) filter (where direction = 'in'), 0) as in_rp, coalesce(sum(amount_rp) filter (where direction = 'out'), 0) as out_rp
      from public.cash_transactions where business_date between p_from and p_to and source_type not in ('transfer_out', 'transfer_in')
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
