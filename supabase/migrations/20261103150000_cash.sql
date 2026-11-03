-- =====================================================================
-- M7 — Pembayaran & kas (T7.1–T7.6) · FR-CSH-*
-- Kas hanya dari: saldo awal, pembayaran terverifikasi, pemasukan lain, pengeluaran, refund, koreksi kas disetujui —
-- tepat satu baris per sumber (UNIQUE (source_type, source_id)), append-only (CLAUDE.md aturan 6, PRD §4.7).
-- Saldo per akun dikunci (FOR UPDATE) di setiap posting; kas keluar tidak boleh membuat saldo negatif (FR-CSH-08).
-- Status bayar pesanan dihitung ulang dari tagihan & pembayaran bersih; terpisah dari status barang (FR-SAL-07).
-- Tagihan = total pesanan sah − nilai retur terverifikasi (asumsi PRD Q18); pesanan batal bertagihan 0.
-- =====================================================================

create type public.cash_direction as enum ('in', 'out');
create type public.cash_account_kind as enum ('tunai', 'bank');
create type public.payment_method as enum ('tunai', 'transfer');
create type public.payment_status as enum ('pending', 'verified', 'rejected');
create type public.correction_status as enum ('pending', 'approved', 'rejected');

-- ---------- akun & buku kas (T7.1, FR-CSH-01, FR-CSH-07) ----------
create table public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  kind            public.cash_account_kind not null,
  balance_rp      bigint not null default 0 check (balance_rp >= 0),     -- dipelihara _post_cash, bukan klien
  opening_set_at  timestamptz,                                             -- saldo awal hanya sekali
  sort_order      integer not null default 100,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger cash_accounts_touch before update on public.cash_accounts for each row execute function public.touch_updated_at();
insert into public.cash_accounts (code, name, kind, sort_order) values ('TUNAI', 'Kas tunai', 'tunai', 10), ('BANK', 'Rekening bank', 'bank', 20);

create table public.cash_transactions (
  id                bigint generated always as identity primary key,
  account_id        uuid not null references public.cash_accounts (id),
  direction         public.cash_direction not null,
  amount_rp         bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  balance_after_rp  bigint not null check (balance_after_rp >= 0),
  source_type       text not null check (source_type in ('opening_balance', 'payment', 'other_income', 'expense', 'refund', 'cash_correction')),
  source_id         uuid not null,
  doc_number        text,
  business_date     date not null,
  note              text check (char_length(note) <= 1000),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  unique (source_type, source_id)          -- satu sumber = tepat satu baris kas (FR-CSH-04, FR-CSH-10)
);
create index cash_transactions_account_idx on public.cash_transactions (account_id, id desc);
create index cash_transactions_date_idx on public.cash_transactions (business_date);
create trigger cash_transactions_append_only before update or delete on public.cash_transactions
  for each row execute function public.prevent_mutation();
create trigger cash_transactions_no_truncate before truncate on public.cash_transactions
  for each statement execute function public.prevent_mutation();

-- Posting kas internal: kunci akun, tolak saldo negatif, tulis satu baris.
create function public._post_cash(
  p_account uuid, p_direction public.cash_direction, p_amount bigint, p_source_type text, p_source_id uuid,
  p_doc text, p_date date, p_note text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.cash_accounts%rowtype;
  v_id bigint;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000000000 then
    raise exception 'Jumlah harus rupiah bulat lebih dari 0' using errcode = '22023';
  end if;
  select * into v_acc from public.cash_accounts where id = p_account for update;
  if not found then
    raise exception 'Akun kas tidak ditemukan' using errcode = 'P0002';
  end if;
  if p_direction = 'out' and v_acc.balance_rp < p_amount then
    raise exception 'Saldo % tidak cukup: Rp% tersedia, diminta Rp%', v_acc.name, v_acc.balance_rp, p_amount
      using errcode = 'P0001', hint = 'INSUFFICIENT_CASH';
  end if;
  update public.cash_accounts
     set balance_rp = balance_rp + case when p_direction = 'in' then p_amount else -p_amount end
   where id = p_account
   returning * into v_acc;
  insert into public.cash_transactions (account_id, direction, amount_rp, balance_after_rp, source_type, source_id, doc_number, business_date, note)
  values (p_account, p_direction, p_amount, v_acc.balance_rp, p_source_type, p_source_id, p_doc, p_date, p_note)
  returning id into v_id;
  return v_id;
end;
$$;

create function public._active_account(p_account uuid) returns public.cash_accounts
language plpgsql stable security definer set search_path = '' as $$
declare v public.cash_accounts%rowtype;
begin
  select * into v from public.cash_accounts where id = p_account;
  if not found or v.archived_at is not null then
    raise exception 'Pilih akun kas yang aktif' using errcode = '22023';
  end if;
  return v;
end;
$$;

create function public._check_cash_date(p_date date) returns date
language plpgsql stable set search_path = '' as $$
begin
  if p_date is null then
    return (now() at time zone 'Asia/Jakarta')::date;
  end if;
  if p_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  return p_date;
end;
$$;

-- Saldo awal (FR-CSH-01): sekali per akun oleh admin kelompok; perubahan sesudahnya lewat koreksi kas.
create function public.set_opening_balance(p_account uuid, p_amount bigint, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.cash_accounts%rowtype;
  v_date date := public._check_cash_date(p_date);
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mengisi saldo awal' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000000 then
    raise exception 'Saldo awal harus rupiah bulat ≥ 0' using errcode = '22023';
  end if;
  perform public._active_account(p_account);
  select * into v_acc from public.cash_accounts where id = p_account for update;
  if v_acc.opening_set_at is not null then
    raise exception 'Saldo awal % sudah diisi; perubahan lewat koreksi kas', v_acc.name using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  update public.cash_accounts set opening_set_at = now() where id = p_account;
  if p_amount > 0 then
    perform public._post_cash(p_account, 'in', p_amount, 'opening_balance', p_account, null, v_date, 'Saldo awal');
  end if;
  perform public.write_audit('cash.opening_set', 'cash_account', p_account::text, null, jsonb_build_object('amount_rp', p_amount, 'date', v_date));
  return jsonb_build_object('id', p_account, 'amount_rp', p_amount, 'already', false);
end;
$$;

-- ---------- pembayaran (T7.2, FR-CSH-02..04) ----------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  doc_number     text unique,                               -- PAY-YYYYMM-NNNN, terbit saat verifikasi
  order_id       uuid not null references public.orders (id),
  business_date  date not null,
  method         public.payment_method not null,
  account_id     uuid not null references public.cash_accounts (id),
  amount_rp      bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  status         public.payment_status not null default 'pending',
  note           text check (char_length(note) <= 500),
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  verified_at    timestamptz,
  verified_by    uuid,
  rejected_at    timestamptz,
  rejected_by    uuid,
  reject_reason  text check (char_length(reject_reason) <= 500),
  updated_at     timestamptz not null default now(),
  check ((status = 'verified') = (doc_number is not null and verified_at is not null)),
  check ((status = 'rejected') = (rejected_at is not null))
);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status, business_date desc);
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

create function public.guard_payment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Pembayaran tidak dapat dihapus; tolak atau refund' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if old.status <> 'pending'
     or (new.order_id, new.business_date, new.method, new.account_id, new.amount_rp, new.created_by)
        is distinct from (old.order_id, old.business_date, old.method, old.account_id, old.amount_rp, old.created_by) then
    raise exception 'Pembayaran sudah diproses dan terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return new;
end;
$$;
create trigger payments_guard before update or delete on public.payments for each row execute function public.guard_payment();

-- ---------- refund (T7.5, FR-CSH-06) ----------
create table public.refunds (
  id             uuid primary key default gen_random_uuid(),
  doc_number     text not null unique,                      -- RFD-YYYYMM-NNNN
  order_id       uuid not null references public.orders (id),
  return_id      uuid references public.order_returns (id),
  account_id     uuid not null references public.cash_accounts (id),
  amount_rp      bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  reason         text not null check (char_length(reason) between 5 and 500),
  business_date  date not null,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);
create trigger refunds_append_only before update or delete on public.refunds for each row execute function public.prevent_mutation();

-- ---------- tagihan & status bayar ----------
-- bill = tagihan sah (confirmed/delivered: total − retur terverifikasi; lainnya 0); paid = Σ verified; refunded = Σ refund.
create function public._order_money(p_order uuid, out bill bigint, out paid bigint, out refunded bigint)
language sql stable security definer set search_path = '' as $$
  select
    case when o.status in ('confirmed', 'delivered')
         then greatest(o.total_rp - coalesce((select sum(r.sales_value_rp) from public.order_returns r where r.order_id = o.id and r.status = 'verified'), 0), 0)
         else 0 end::bigint,
    coalesce((select sum(p.amount_rp) from public.payments p where p.order_id = o.id and p.status = 'verified'), 0)::bigint,
    coalesce((select sum(f.amount_rp) from public.refunds f where f.order_id = o.id), 0)::bigint
  from public.orders o where o.id = p_order;
$$;

create function public._refresh_payment_status(p_order uuid) returns public.order_payment_status
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_net bigint;
  v_status public.order_payment_status;
begin
  select * into m from public._order_money(p_order);
  v_net := m.paid - m.refunded;
  v_status := case
    when v_net <= 0 and m.refunded > 0 then 'refunded'
    when v_net <= 0 then 'unpaid'
    when v_net >= m.bill then 'paid'
    else 'partial' end;
  update public.orders set payment_status = v_status where id = p_order and payment_status is distinct from v_status;
  return v_status;
end;
$$;

-- Verifikasi internal: kunci pesanan → pembayaran, cek tagihan tersisa, nomor PAY, satu kas masuk, status bayar.
create function public._verify_payment(p_payment uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype;
  v_order public.orders%rowtype;
  m record;
  v_left bigint;
  v_doc text;
  v_status public.order_payment_status;
begin
  select * into v_pay from public.payments where id = p_payment;
  select * into v_order from public.orders where id = v_pay.order_id for update;
  select * into v_pay from public.payments where id = p_payment for update;
  if v_pay.status = 'verified' then
    return jsonb_build_object('id', v_pay.id, 'doc_number', v_pay.doc_number, 'status', v_pay.status, 'payment_status', v_order.payment_status, 'already', true);
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'Pembayaran yang ditolak tidak dapat diverifikasi' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v_order.status not in ('confirmed', 'delivered') then
    raise exception 'Pesanan % tidak sedang menunggu pembayaran', coalesce(v_order.doc_number, 'draft') using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  select * into m from public._order_money(v_order.id);
  v_left := m.bill - (m.paid - m.refunded);
  if v_pay.amount_rp > v_left then
    raise exception 'Jumlah bayar Rp% melebihi tagihan tersisa Rp%', v_pay.amount_rp, greatest(v_left, 0)
      using errcode = 'P0001', hint = 'OVERPAYMENT';
  end if;
  perform public._active_account(v_pay.account_id);

  v_doc := public.next_doc_number('PAY', v_pay.business_date);
  perform public._post_cash(v_pay.account_id, 'in', v_pay.amount_rp, 'payment', v_pay.id, v_doc, v_pay.business_date,
                            'Pembayaran ' || v_order.doc_number);
  update public.payments set status = 'verified', doc_number = v_doc, verified_at = now(), verified_by = (select auth.uid()) where id = p_payment;
  v_status := public._refresh_payment_status(v_order.id);
  perform public.write_audit('payment.verified', 'payment', p_payment::text, to_jsonb(v_pay) - 'updated_at',
    jsonb_build_object('doc_number', v_doc, 'order', v_order.doc_number, 'amount_rp', v_pay.amount_rp, 'payment_status', v_status));
  return jsonb_build_object('id', p_payment, 'doc_number', v_doc, 'status', 'verified', 'payment_status', v_status,
                            'outstanding_rp', greatest(v_left - v_pay.amount_rp, 0), 'already', false);
end;
$$;

-- Catat pembayaran (FR-CSH-02): p_verified = true untuk tunai yang diterima langsung (catat + verifikasi sekaligus).
create function public.record_payment(
  p_order uuid, p_date date, p_method text, p_account uuid, p_amount bigint, p_note text, p_verified boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  m record;
  v_left bigint;
  v_id uuid;
  v_date date := public._check_cash_date(p_date);
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat pembayaran' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('tunai', 'transfer') then
    raise exception 'Pilih metode pembayaran (tunai/transfer)' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000000 then
    raise exception 'Jumlah bayar harus lebih dari 0' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Catatan maksimal 500 karakter' using errcode = '22023';
  end if;
  perform public._active_account(p_account);
  select * into v_order from public.orders where id = p_order for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_order.status not in ('confirmed', 'delivered') then
    raise exception 'Pembayaran hanya untuk pesanan terkonfirmasi atau diserahkan' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v_date < v_order.business_date then
    raise exception 'Tanggal bayar tidak boleh sebelum tanggal pesanan' using errcode = '22023';
  end if;
  select * into m from public._order_money(p_order);
  v_left := m.bill - (m.paid - m.refunded);
  if p_amount > v_left then
    raise exception 'Jumlah bayar Rp% melebihi tagihan tersisa Rp%', p_amount, greatest(v_left, 0) using errcode = 'P0001', hint = 'OVERPAYMENT';
  end if;

  insert into public.payments (order_id, business_date, method, account_id, amount_rp, note)
  values (p_order, v_date, p_method::public.payment_method, p_account, p_amount, nullif(btrim(p_note), ''))
  returning id into v_id;
  perform public.write_audit('payment.recorded', 'payment', v_id::text, null,
    jsonb_build_object('order', v_order.doc_number, 'amount_rp', p_amount, 'method', p_method, 'verified', coalesce(p_verified, false)));
  if coalesce(p_verified, false) then
    return public._verify_payment(v_id);
  end if;
  return jsonb_build_object('id', v_id, 'doc_number', null, 'status', 'pending', 'payment_status', v_order.payment_status,
                            'outstanding_rp', v_left, 'already', false);
end;
$$;

create function public.verify_payment(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat memverifikasi pembayaran' using errcode = '42501';
  end if;
  if not exists (select 1 from public.payments where id = p_id) then
    raise exception 'Pembayaran tidak ditemukan' using errcode = 'P0002';
  end if;
  return public._verify_payment(p_id);
end;
$$;

create function public.reject_payment(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat menolak pembayaran' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan penolakan wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  select * into v_pay from public.payments where id = p_id for update;
  if not found then
    raise exception 'Pembayaran tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_pay.status = 'rejected' then
    return jsonb_build_object('id', p_id, 'status', 'rejected', 'already', true);
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'Pembayaran terverifikasi tidak dapat ditolak; gunakan refund' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  update public.payments set status = 'rejected', rejected_at = now(), rejected_by = (select auth.uid()), reject_reason = v_reason where id = p_id;
  perform public.write_audit('payment.rejected', 'payment', p_id::text, to_jsonb(v_pay) - 'updated_at', null, v_reason);
  return jsonb_build_object('id', p_id, 'status', 'rejected', 'already', false);
end;
$$;

-- Refund (FR-CSH-06): ≤ pembayaran terverifikasi − refund sebelumnya; kas keluar tepat satu kali.
create function public._post_refund(p_order uuid, p_account uuid, p_amount bigint, p_reason text, p_date date, p_return uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  m record;
  v_id uuid := gen_random_uuid();
  v_doc text;
  v_status public.order_payment_status;
begin
  select * into v_order from public.orders where id = p_order;
  select * into m from public._order_money(p_order);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Jumlah refund harus lebih dari 0' using errcode = '22023';
  end if;
  if p_amount > m.paid - m.refunded then
    raise exception 'Refund Rp% melebihi pembayaran bersih Rp%', p_amount, greatest(m.paid - m.refunded, 0) using errcode = 'P0001', hint = 'OVERREFUND';
  end if;
  if p_return is not null and not exists (select 1 from public.order_returns where id = p_return and order_id = p_order and status = 'verified') then
    raise exception 'Retur rujukan harus retur terverifikasi dari pesanan ini' using errcode = '22023';
  end if;
  perform public._active_account(p_account);
  v_doc := public.next_doc_number('RFD', p_date);
  insert into public.refunds (id, doc_number, order_id, return_id, account_id, amount_rp, reason, business_date)
  values (v_id, v_doc, p_order, p_return, p_account, p_amount, p_reason, p_date);
  perform public._post_cash(p_account, 'out', p_amount, 'refund', v_id, v_doc, p_date, 'Refund ' || v_order.doc_number || ': ' || p_reason);
  v_status := public._refresh_payment_status(p_order);
  perform public.write_audit('refund.created', 'refund', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'order', v_order.doc_number, 'amount_rp', p_amount, 'return_id', p_return), p_reason);
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'status', 'posted', 'payment_status', v_status, 'already', false);
end;
$$;

create function public.create_refund(p_order uuid, p_account uuid, p_amount bigint, p_reason text, p_date date, p_return uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_date date := public._check_cash_date(p_date);
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat refund' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan refund wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  perform 1 from public.orders where id = p_order for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  return public._post_refund(p_order, p_account, p_amount, v_reason, v_date, p_return);
end;
$$;

-- ---------- batal pesanan (menggantikan versi M6): sudah dibayar → refund dalam transaksi yang sama ----------
drop function public.cancel_order(uuid, text);
create function public.cancel_order(p_id uuid, p_reason text, p_refund_account uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.orders%rowtype;
  v_after public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_released int;
  m record;
  v_refund jsonb;
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
  select * into m from public._order_money(p_id);
  if m.paid - m.refunded > 0 and p_refund_account is null then
    raise exception 'Pesanan sudah dibayar Rp%; pilih akun kas untuk refund', m.paid - m.refunded using errcode = '22023', hint = 'REFUND_ACCOUNT_REQUIRED';
  end if;

  v_released := public._close_reservations(p_id, 'released');
  -- pembayaran yang belum diverifikasi tidak bisa lagi diverifikasi → tolak otomatis
  update public.payments set status = 'rejected', rejected_at = now(), rejected_by = (select auth.uid()), reject_reason = 'Pesanan dibatalkan'
   where order_id = p_id and status = 'pending';
  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = v_reason
   where id = p_id
   returning * into v_after;
  if m.paid - m.refunded > 0 then
    v_refund := public._post_refund(p_id, p_refund_account, m.paid - m.refunded, 'Batal pesanan: ' || v_reason,
                                    (now() at time zone 'Asia/Jakarta')::date, null);
  else
    perform public._refresh_payment_status(p_id);
  end if;
  select * into v_after from public.orders where id = p_id;
  perform public.write_audit('order.cancelled', 'order', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at', v_reason);
  return jsonb_build_object('id', p_id, 'doc_number', v_after.doc_number, 'status', v_after.status, 'released', v_released,
                            'refund_doc', v_refund ->> 'doc_number', 'already', false);
end;
$$;

-- Retur terverifikasi mengurangi tagihan → status bayar dihitung ulang.
create function public.after_return_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'verified' and old.status <> 'verified' then
    perform public._refresh_payment_status(new.order_id);
  end if;
  return new;
end;
$$;
create trigger order_returns_payment_status after update on public.order_returns for each row execute function public.after_return_verified();

-- ---------- pengeluaran & pemasukan lain (T7.4, FR-CSH-05, FR-CSH-05a) ----------
create table public.expense_categories (
  code         text primary key check (code ~ '^[a-z_]{3,40}$'),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order   integer not null default 100,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create table public.income_categories (
  code         text primary key check (code ~ '^[a-z_]{3,40}$'),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order   integer not null default 100,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
-- Daftar awal (PRD FR-CSH-05, Q15); daftar resmi kelompok menunggu konfirmasi mitra.
insert into public.expense_categories (code, name, sort_order) values
  ('bahan_baku', 'Pembelian bahan baku', 10), ('upah', 'Upah tenaga kerja', 20), ('kemasan', 'Kemasan', 30),
  ('listrik_bbm', 'Listrik/BBM', 40), ('transportasi', 'Transportasi', 50), ('perawatan', 'Perawatan mesin', 60), ('lainnya', 'Lainnya', 90);
insert into public.income_categories (code, name, sort_order) values
  ('iuran_anggota', 'Iuran anggota', 10), ('bantuan_hibah', 'Bantuan/hibah', 20), ('lainnya', 'Lainnya', 90);

create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  doc_number     text not null unique,                     -- EXP-YYYYMM-NNNN
  business_date  date not null,
  category       text not null references public.expense_categories (code),
  account_id     uuid not null references public.cash_accounts (id),
  amount_rp      bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  description    text not null check (char_length(btrim(description)) between 1 and 500),
  reference      text check (char_length(reference) <= 60),   -- mis. nomor RCV/PRD (tanpa kas kedua)
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (business_date desc);
create trigger expenses_append_only before update or delete on public.expenses for each row execute function public.prevent_mutation();

create table public.other_incomes (
  id             uuid primary key default gen_random_uuid(),
  doc_number     text not null unique,                     -- INC-YYYYMM-NNNN
  business_date  date not null,
  category       text not null references public.income_categories (code),
  account_id     uuid not null references public.cash_accounts (id),
  amount_rp      bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  description    text not null check (char_length(btrim(description)) between 1 and 500),
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index other_incomes_date_idx on public.other_incomes (business_date desc);
create trigger other_incomes_append_only before update or delete on public.other_incomes for each row execute function public.prevent_mutation();

create function public.create_expense(p_date date, p_category text, p_account uuid, p_amount bigint, p_description text, p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_doc text;
  v_date date := public._check_cash_date(p_date);
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat pengeluaran' using errcode = '42501';
  end if;
  if not exists (select 1 from public.expense_categories where code = p_category and archived_at is null) then
    raise exception 'Pilih kategori pengeluaran' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 1 and 500 or char_length(coalesce(p_reference, '')) > 60 then
    raise exception 'Keterangan wajib (maks. 500 karakter); referensi maks. 60 karakter' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000000 then
    raise exception 'Jumlah harus rupiah bulat lebih dari 0' using errcode = '22023';
  end if;
  perform public._active_account(p_account);
  v_doc := public.next_doc_number('EXP', v_date);
  insert into public.expenses (id, doc_number, business_date, category, account_id, amount_rp, description, reference)
  values (v_id, v_doc, v_date, p_category, p_account, p_amount, btrim(p_description), nullif(btrim(p_reference), ''));
  perform public._post_cash(p_account, 'out', p_amount, 'expense', v_id, v_doc, v_date, btrim(p_description));
  perform public.write_audit('expense.created', 'expense', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'category', p_category, 'amount_rp', p_amount, 'reference', p_reference));
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'status', 'posted', 'already', false);
end;
$$;

create function public.create_other_income(p_date date, p_category text, p_account uuid, p_amount bigint, p_description text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_doc text;
  v_date date := public._check_cash_date(p_date);
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mencatat pemasukan lain' using errcode = '42501';
  end if;
  if not exists (select 1 from public.income_categories where code = p_category and archived_at is null) then
    raise exception 'Pilih kategori pemasukan' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Keterangan wajib (maks. 500 karakter)' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000000 then
    raise exception 'Jumlah harus rupiah bulat lebih dari 0' using errcode = '22023';
  end if;
  perform public._active_account(p_account);
  v_doc := public.next_doc_number('INC', v_date);
  insert into public.other_incomes (id, doc_number, business_date, category, account_id, amount_rp, description)
  values (v_id, v_doc, v_date, p_category, p_account, p_amount, btrim(p_description));
  perform public._post_cash(p_account, 'in', p_amount, 'other_income', v_id, v_doc, v_date, btrim(p_description));
  perform public.write_audit('other_income.created', 'other_income', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'category', p_category, 'amount_rp', p_amount));
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'status', 'posted', 'already', false);
end;
$$;

-- ---------- koreksi kas (T7.6, FR-CSH-11): ajukan admin → setujui/tolak ketua, pengaju ≠ penyetuju ----------
create table public.cash_corrections (
  id             uuid primary key default gen_random_uuid(),
  doc_number     text not null unique,                     -- KAS-YYYYMM-NNNN, terbit saat diajukan
  account_id     uuid not null references public.cash_accounts (id),
  direction      public.cash_direction not null,
  amount_rp      bigint not null check (amount_rp > 0 and amount_rp <= 10000000000),
  reason         text not null check (char_length(reason) between 5 and 500),
  business_date  date not null,
  status         public.correction_status not null default 'pending',
  requested_by   uuid not null default auth.uid(),
  requested_by_name text not null,
  decided_at     timestamptz,
  decided_by     uuid,
  decided_by_name text,
  decision_note  text check (char_length(decision_note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null)),
  check (decided_by is null or decided_by <> requested_by)
);
create index cash_corrections_status_idx on public.cash_corrections (status, created_at desc);
create trigger cash_corrections_touch before update on public.cash_corrections for each row execute function public.touch_updated_at();

create function public.guard_cash_correction() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.status <> 'pending'
     or (new.account_id, new.direction, new.amount_rp, new.reason, new.business_date, new.requested_by, new.doc_number)
        is distinct from (old.account_id, old.direction, old.amount_rp, old.reason, old.business_date, old.requested_by, old.doc_number) then
    raise exception 'Koreksi kas sudah diputuskan atau isinya terkunci' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return new;
end;
$$;
create trigger cash_corrections_guard before update or delete on public.cash_corrections for each row execute function public.guard_cash_correction();

create function public.request_cash_correction(p_account uuid, p_direction text, p_amount bigint, p_reason text, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_doc text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_date date := public._check_cash_date(p_date);
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mengajukan koreksi kas' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'Pilih arah koreksi (tambah/kurang)' using errcode = '22023';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan koreksi wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000000 then
    raise exception 'Jumlah harus rupiah bulat lebih dari 0' using errcode = '22023';
  end if;
  perform public._active_account(p_account);
  v_doc := public.next_doc_number('KAS', v_date);
  insert into public.cash_corrections (id, doc_number, account_id, direction, amount_rp, reason, business_date, requested_by_name)
  values (v_id, v_doc, p_account, p_direction::public.cash_direction, p_amount, v_reason, v_date,
          coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Admin'));
  perform public.write_audit('cash_correction.requested', 'cash_correction', v_id::text, null,
    jsonb_build_object('doc_number', v_doc, 'direction', p_direction, 'amount_rp', p_amount), v_reason);
  return jsonb_build_object('id', v_id, 'doc_number', v_doc, 'status', 'pending', 'already', false);
end;
$$;

create function public.decide_cash_correction(p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.cash_corrections%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_role('ketua') then
    raise exception 'Hanya ketua yang dapat memutuskan koreksi kas' using errcode = '42501';
  end if;
  select * into v_before from public.cash_corrections where id = p_id for update;
  if not found then
    raise exception 'Koreksi kas tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status <> 'pending' then
    if (v_before.status = 'approved') = coalesce(p_approve, false) then
      return jsonb_build_object('id', p_id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'already', true);
    end if;
    raise exception 'Koreksi % sudah diputuskan', v_before.doc_number using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if v_before.requested_by = (select auth.uid()) then
    raise exception 'Pengaju koreksi tidak boleh menyetujui/menolak koreksinya sendiri' using errcode = '42501';
  end if;
  if not coalesce(p_approve, false) and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Alasan penolakan wajib diisi (min. 5 karakter)' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Catatan maksimal 500 karakter' using errcode = '22023';
  end if;
  if coalesce(p_approve, false) then
    perform public._post_cash(v_before.account_id, v_before.direction, v_before.amount_rp, 'cash_correction', p_id, v_before.doc_number,
                              v_before.business_date, 'Koreksi: ' || v_before.reason);
  end if;
  update public.cash_corrections
     set status = case when p_approve then 'approved'::public.correction_status else 'rejected'::public.correction_status end,
         decided_at = now(), decided_by = (select auth.uid()), decision_note = v_note,
         decided_by_name = coalesce((select full_name from public.profiles where id = (select auth.uid())), 'Ketua')
   where id = p_id;
  perform public.write_audit(case when p_approve then 'cash_correction.approved' else 'cash_correction.rejected' end,
    'cash_correction', p_id::text, to_jsonb(v_before) - 'updated_at', null, coalesce(v_note, v_before.reason));
  return jsonb_build_object('id', p_id, 'doc_number', v_before.doc_number, 'status', case when p_approve then 'approved' else 'rejected' end, 'already', false);
end;
$$;

-- ---------- view ----------
create or replace view public.v_order_balance with (security_invoker = true) as
select
  o.id as order_id,
  o.doc_number,
  o.customer_id,
  o.status,
  o.payment_status,
  o.total_rp,
  coalesce(p.paid, 0)::bigint as paid_rp,
  coalesce(f.refunded, 0)::bigint as refunded_rp,
  greatest(b.bill - (coalesce(p.paid, 0) - coalesce(f.refunded, 0)), 0)::bigint as outstanding_rp,
  coalesce(r.returned, 0)::bigint as returned_rp,
  b.bill::bigint as bill_rp,
  greatest((coalesce(p.paid, 0) - coalesce(f.refunded, 0)) - b.bill, 0)::bigint as credit_rp,   -- kelebihan bayar (perlu refund)
  coalesce(q.pending, 0)::bigint as pending_rp
from public.orders o
left join (select order_id, sum(amount_rp) as paid from public.payments where status = 'verified' group by order_id) p on p.order_id = o.id
left join (select order_id, sum(amount_rp) as pending from public.payments where status = 'pending' group by order_id) q on q.order_id = o.id
left join (select order_id, sum(amount_rp) as refunded from public.refunds group by order_id) f on f.order_id = o.id
left join (select order_id, sum(sales_value_rp) as returned from public.order_returns where status = 'verified' group by order_id) r on r.order_id = o.id
cross join lateral (select case when o.status in ('confirmed', 'delivered') then greatest(o.total_rp - coalesce(r.returned, 0), 0) else 0 end as bill) b;

create view public.v_cash_balance with (security_invoker = true) as
select a.id as account_id, a.code, a.name, a.kind, a.balance_rp, a.opening_set_at, a.archived_at, a.sort_order
from public.cash_accounts a;

-- ---------- RLS & hak ----------
alter table public.cash_accounts enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.expense_categories enable row level security;
alter table public.income_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.other_incomes enable row level security;
alter table public.cash_corrections enable row level security;

revoke all on public.cash_accounts, public.cash_transactions, public.payments, public.refunds, public.expense_categories,
  public.income_categories, public.expenses, public.other_incomes, public.cash_corrections, public.v_cash_balance from anon, authenticated;
grant select on public.cash_accounts, public.cash_transactions, public.payments, public.refunds, public.expense_categories,
  public.income_categories, public.expenses, public.other_incomes, public.cash_corrections, public.v_cash_balance to authenticated;
-- Kategori dapat dikelola admin kelompok (FR-CSH-05); kolom saldo/akun kas tidak pernah ditulis klien.
grant insert (code, name, sort_order), update (name, sort_order, archived_at) on public.expense_categories, public.income_categories to authenticated;

-- Pembayaran & kas: lihat = admin_kelompok, ketua (PRD §3.1). Operator produksi & admin teknis: tanpa akses (uji wajib SRS §11).
create policy cash_accounts_select on public.cash_accounts for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy cash_transactions_select on public.cash_transactions for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy payments_select on public.payments for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy refunds_select on public.refunds for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy expenses_select on public.expenses for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy other_incomes_select on public.other_incomes for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy cash_corrections_select on public.cash_corrections for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy expense_categories_select on public.expense_categories for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy income_categories_select on public.income_categories for select to authenticated using (public.has_role('admin_kelompok') or public.has_role('ketua'));
create policy expense_categories_write on public.expense_categories for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy expense_categories_update on public.expense_categories for update to authenticated using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));
create policy income_categories_write on public.income_categories for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy income_categories_update on public.income_categories for update to authenticated using (public.has_role('admin_kelompok')) with check (public.has_role('admin_kelompok'));

revoke execute on function public._post_cash(uuid, public.cash_direction, bigint, text, uuid, text, date, text), public._active_account(uuid),
  public._check_cash_date(date), public._order_money(uuid), public._refresh_payment_status(uuid), public._verify_payment(uuid),
  public._post_refund(uuid, uuid, bigint, text, date, uuid), public.after_return_verified(), public.guard_payment(), public.guard_cash_correction()
from public, anon, authenticated;
revoke execute on function public.set_opening_balance(uuid, bigint, date), public.record_payment(uuid, date, text, uuid, bigint, text, boolean),
  public.verify_payment(uuid), public.reject_payment(uuid, text), public.create_refund(uuid, uuid, bigint, text, date, uuid),
  public.cancel_order(uuid, text, uuid), public.create_expense(date, text, uuid, bigint, text, text),
  public.create_other_income(date, text, uuid, bigint, text), public.request_cash_correction(uuid, text, bigint, text, date),
  public.decide_cash_correction(uuid, boolean, text)
from public, anon;
grant execute on function public.set_opening_balance(uuid, bigint, date), public.record_payment(uuid, date, text, uuid, bigint, text, boolean),
  public.verify_payment(uuid), public.reject_payment(uuid, text), public.create_refund(uuid, uuid, bigint, text, date, uuid),
  public.cancel_order(uuid, text, uuid), public.create_expense(date, text, uuid, bigint, text, text),
  public.create_other_income(date, text, uuid, bigint, text), public.request_cash_correction(uuid, text, bigint, text, date),
  public.decide_cash_correction(uuid, boolean, text)
to authenticated;
