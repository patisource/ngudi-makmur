-- =====================================================================
-- DATA UJI COBA (± 5 minggu transaksi) — untuk mencoba aplikasi sebelum dipakai sungguhan.
-- Boleh dijalankan di proyek Supabase asli SELAMA BELUM GO-LIVE; WAJIB dibersihkan dengan
-- supabase/bersihkan_data_uji.sql sebelum data nyata mulai dicatat (keputusan pengguna 3 Nov 2026).
--
-- Cara kerja:
--   * Semua transaksi dibuat lewat fungsi posting yang sama dengan aplikasi (stok, HPP, kas, nomor dokumen sah).
--   * Pelaku = 4 akun "uji" yang TIDAK BISA LOGIN (kata sandi acak + diblokir). Pengguna mencoba aplikasi
--     dengan akunnya sendiri; akun nyata tidak dipakai sebagai pelaku data rekaan.
--   * Semua baris master & akun buatan skrip dicatat di skema `uji` (tidak terbuka lewat API) agar bisa dihapus bersih.
--   * Rentang: tanggal 1 bulan lalu s.d. hari ini (WIB). Acak tetapi tetap sama setiap dijalankan (setseed).
--   * Menolak berjalan dua kali.
--
-- Jalankan sebagai pemilik database (postgres), mis. lewat SQL editor Supabase atau runner skrip.
-- =====================================================================
begin;

create schema if not exists uji;
revoke all on schema uji from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema uji from anon, authenticated';
  end if;
end $$;
create table if not exists uji.baris (jenis text not null, id uuid not null, primary key (jenis, id));
create table if not exists uji.info (kunci text primary key, nilai text not null);

do $$ begin
  if exists (select 1 from uji.info where kunci = 'dimuat_pada') then
    raise exception 'Data uji sudah pernah dimuat (%). Jalankan bersihkan_data_uji.sql dulu bila ingin mengulang.', (select nilai from uji.info where kunci = 'dimuat_pada');
  end if;
end $$;
insert into uji.info values ('dimuat_pada', now()::text);

-- ---------- akun pelaku (tidak bisa login) ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, banned_until, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '2999-01-01'::timestamptz,
       '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from (values
  ('0a000000-0000-4000-8000-0000000000a1'::uuid, 'uji.admin@contoh.invalid', 'Admin Uji'),
  ('0a000000-0000-4000-8000-0000000000a2'::uuid, 'uji.operator@contoh.invalid', 'Operator Uji'),
  ('0a000000-0000-4000-8000-0000000000a3'::uuid, 'uji.ketua@contoh.invalid', 'Ketua Uji'),
  ('0a000000-0000-4000-8000-0000000000a4'::uuid, 'uji.admin2@contoh.invalid', 'Admin Uji 2')
) as u (id, email, full_name);
insert into uji.baris select 'user', id from auth.users where email like 'uji.%@contoh.invalid';
insert into public.user_roles (user_id, role) values
  ('0a000000-0000-4000-8000-0000000000a1', 'admin_kelompok'),
  ('0a000000-0000-4000-8000-0000000000a2', 'operator_produksi'),
  ('0a000000-0000-4000-8000-0000000000a3', 'ketua'),
  ('0a000000-0000-4000-8000-0000000000a4', 'admin_kelompok');
insert into public.user_permissions (user_id, permission) values ('0a000000-0000-4000-8000-0000000000a2', 'production.confirm');

-- ---------- master contoh ----------
with m as (
  insert into public.members (name, hamlet, land_area_ha, joined_on)
  values ('Sutrisno', 'Baturejo', 0.75, '2021-03-01'), ('Suparmi', 'Baturejo', 0.5, '2021-03-01'), ('Kasmudi', 'Ngagel', 1.2, '2021-03-01'),
         ('Ngatini', 'Baturejo', 0.4, '2022-01-10'), ('Rusdi', 'Wates', 0.9, '2022-01-10'), ('Sumarno', 'Ngagel', 0.6, '2022-06-05'),
         ('Warsini', 'Baturejo', 0.35, '2023-02-01'), ('Darmaji', 'Wates', 1.0, '2023-02-01'), ('Juwariyah', 'Baturejo', 0.5, '2024-01-15'),
         ('Supriyadi', 'Ngagel', 0.8, '2024-01-15')
  returning id
) insert into uji.baris select 'member', id from m;
with c as (
  insert into public.customers (name, type, address)
  values ('IRT Sekar Arum', 'usaha', 'Desa Baturejo, Kec. Sukolilo'), ('UD Tani Makmur', 'usaha', 'Desa Kedumulyo, Kec. Sukolilo'),
         ('Toko Berkah Sukolilo', 'usaha', 'Pasar Sukolilo'), ('Katering Barokah', 'usaha', 'Kayen, Pati'),
         ('Bu Sri (warung)', 'perorangan', 'Desa Baturejo'), ('Pelanggan umum', 'perorangan', null)
  returning id
) insert into uji.baris select 'customer', id from c;
update public.customers set credit_limit_rp = 2500000 where name = 'UD Tani Makmur' and id in (select id from uji.baris where jenis = 'customer');

-- Harga katalog contoh (master; boleh diubah pengurus kapan saja).
-- Hanya mengisi yang masih kosong/0; harga yang sudah diatur pengurus tidak ditimpa.
update public.products set default_price_per_kg = case code when 'TK' then 3800 when 'PP' then 6500 else 10000 end
  where code in ('TK', 'PP', 'TP') and coalesce(default_price_per_kg, 0) = 0;
update public.products set min_stock_kg = case code when 'TK' then 300 when 'PP' then 150 else 60 end
  where code in ('TK', 'PP', 'TP') and min_stock_kg = 0;
update public.product_packagings pp set default_price = case when pp.content_kg = 0.5 then 5500 when pp.content_kg = 1 then 10500 else 320000 end
  where coalesce(pp.default_price, 0) = 0;

-- ---------- transaksi harian lewat fungsi posting ----------
create function uji.act(p uuid) returns void language sql as $f$ select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true) $f$;
create function uji.avail(p_code text) returns numeric language sql as $f$ select coalesce((select available_kg from public.v_stock_balance where code = p_code), 0) $f$;
create function uji.saldo(p_code text) returns bigint language sql as $f$ select balance_rp from public.cash_accounts where code = p_code $f$;

do $$
declare
  c_admin uuid := '0a000000-0000-4000-8000-0000000000a1';
  c_op uuid := '0a000000-0000-4000-8000-0000000000a2';
  c_ketua uuid := '0a000000-0000-4000-8000-0000000000a3';
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_start date := (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '1 month')::date;
  d date;
  v_dow int;
  v_tk uuid := (select id from public.products where code = 'TK');
  v_pp uuid := (select id from public.products where code = 'PP');
  v_tp uuid := (select id from public.products where code = 'TP');
  v_pak05 uuid := (select pp.id from public.product_packagings pp where pp.product_id = (select id from public.products where code = 'TP') and pp.content_kg = 0.5);
  v_pak1 uuid := (select pp.id from public.product_packagings pp where pp.product_id = (select id from public.products where code = 'TP') and pp.content_kg = 1);
  v_karung uuid := (select pp.id from public.product_packagings pp where pp.product_id = (select id from public.products where code = 'PP') and pp.content_kg = 50);
  v_tunai uuid := (select id from public.cash_accounts where code = 'TUNAI');
  v_bank uuid := (select id from public.cash_accounts where code = 'BANK');
  v_members uuid[] := array(select id from uji.baris where jenis = 'member' order by id);
  v_id uuid;
  v_order uuid;
  v_kg numeric;
  v_out numeric;
  v_n int;
  v_k int;
  v_r float;
  v_cust record;
  v_items jsonb;
  v_ch text;
  v_total bigint;
  v_week_cost bigint := 0;
  v_purchase bigint := 0;
begin
  perform setseed(0.4242);
  perform uji.act(c_admin);
  -- saldo awal hanya bila belum pernah diisi
  if (select opening_set_at from public.cash_accounts where id = v_tunai) is null then perform public.set_opening_balance(v_tunai, 3000000, v_start); end if;
  if (select opening_set_at from public.cash_accounts where id = v_bank) is null then perform public.set_opening_balance(v_bank, 12000000, v_start); end if;

  -- stok awal: pipilan dari pemasok luar & tongkol dari anggota
  insert into public.receipts (business_date, source_type, supplier_name, product_id, weight_kg, moisture_pct, acquisition_cost, note)
  values (v_start, 'luar', 'UD Sumber Tani', v_pp, 400, 15, 400 * 5200, 'Stok awal pipilan') returning id into v_id;
  perform public.confirm_receipt(v_id);
  insert into public.receipts (business_date, source_type, member_id, product_id, weight_kg, moisture_pct, acquisition_cost)
  values (v_start, 'anggota', v_members[1], v_tk, 500, 18, 500 * 3800) returning id into v_id;
  perform public.confirm_receipt(v_id);

  d := v_start;
  while d <= v_today loop
    v_dow := extract(isodow from d);   -- 1 Senin … 7 Minggu
    if v_dow = 7 then d := d + 1; continue; end if;

    -- 1) Jagung masuk (Senin/Rabu/Jumat): tongkol dari anggota; Rabu kadang pipilan dari luar.
    perform uji.act(c_admin);
    if v_dow in (1, 3, 5) then
      v_n := 1 + (random() < 0.2)::int;
      for v_k in 1..v_n loop
        v_kg := 120 + round((random() * 130)::numeric / 10) * 10;
        insert into public.receipts (business_date, source_type, member_id, product_id, weight_kg, moisture_pct, acquisition_cost)
        values (d, 'anggota', v_members[1 + floor(random() * array_length(v_members, 1))::int], v_tk, v_kg, round((15 + random() * 5)::numeric, 1), (v_kg * 3800)::bigint)
        returning id into v_id;
        perform public.confirm_receipt(v_id);
        v_purchase := v_purchase + (v_kg * 3800)::bigint;
      end loop;
      if v_dow = 3 and random() < 0.15 then
        v_kg := 100 + round((random() * 100)::numeric / 10) * 10;
        insert into public.receipts (business_date, source_type, supplier_name, product_id, weight_kg, moisture_pct, acquisition_cost)
        values (d, 'luar', 'UD Sumber Tani', v_pp, v_kg, 15, (v_kg * 5200)::bigint) returning id into v_id;
        perform public.confirm_receipt(v_id);
        v_purchase := v_purchase + (v_kg * 5200)::bigint;
      end if;
    end if;

    -- 2) Produksi (operator): pemipilan Selasa/Kamis/Sabtu, penepungan setiap hari kerja.
    perform uji.act(c_op);
    if v_dow in (2, 4, 6) and uji.avail('TK') >= 150 then
      v_kg := least(floor(uji.avail('TK') / 10) * 10, 600);
      v_out := round(v_kg * (0.70 + random() * 0.04)::numeric);
      v_id := public.save_production_draft(null, 'pemipilan', d, null, round((v_kg - v_out) * 0.9), array[v_kg], array[v_out],
        jsonb_build_array(jsonb_build_object('category', 'tenaga_kerja', 'amount_rp', 120000, 'note', '2 orang × 1 hari'),
                          jsonb_build_object('category', 'listrik_bbm', 'amount_rp', 45000, 'note', 'Solar mesin pemipil')));
      perform public.confirm_production(v_id);
      v_week_cost := v_week_cost + 165000;
    end if;
    if uji.avail('PP') >= 80 then
      v_kg := 58 + round((random() * 14)::numeric);
      v_out := round(v_kg * (0.86 + random() * 0.05)::numeric, 1);
      v_id := public.save_production_draft(null, 'penepungan', d, null, round((v_kg - v_out) * 0.6, 1), array[v_kg], array[v_out],
        jsonb_build_array(jsonb_build_object('category', 'tenaga_kerja', 'amount_rp', 50000, 'note', '1 orang'),
                          jsonb_build_object('category', 'listrik_bbm', 'amount_rp', 22000, 'note', 'Listrik mesin penepung'),
                          jsonb_build_object('category', 'kemasan', 'amount_rp', (round(v_out) * 150)::bigint, 'note', 'Plastik pak')));
      perform public.confirm_production(v_id);
      v_week_cost := v_week_cost + 72000 + (round(v_out) * 150)::bigint;
    end if;

    -- 3) Pesanan (admin): 1–3 per hari; bayar tunai/transfer/cicil/belum; serah barang.
    perform uji.act(c_admin);
    v_n := 2 + (random() < 0.5)::int + (random() < 0.3)::int;
    for v_k in 1..v_n loop
      select c.id, c.name into v_cust from public.customers c join uji.baris b on b.id = c.id and b.jenis = 'customer' order by random() limit 1;
      v_r := random();
      v_ch := case when v_r < 0.40 then 'langsung' when v_r < 0.75 then 'whatsapp' when v_r < 0.85 then 'media_sosial' when v_r < 0.95 then 'marketplace' else 'lainnya' end;
      v_items := '[]'::jsonb;
      if v_cust.name in ('IRT Sekar Arum', 'Katering Barokah') then
        v_kg := 20 + floor(random() * 21);
        if uji.avail('TP') >= v_kg then v_items := v_items || jsonb_build_object('product_id', v_tp, 'qty', v_kg::text); end if;
      elsif v_cust.name = 'UD Tani Makmur' then
        v_kg := 1 + floor(random() * 3);
        if uji.avail('PP') >= v_kg * 50 + 80 then v_items := v_items || jsonb_build_object('product_id', v_pp, 'product_packaging_id', v_karung, 'qty', v_kg::text); end if;
        if uji.avail('TP') >= 10 then v_items := v_items || jsonb_build_object('product_id', v_tp, 'product_packaging_id', v_pak1, 'qty', '10'); end if;
      else
        v_kg := 8 + floor(random() * 13);
        if uji.avail('TP') >= v_kg then v_items := v_items || jsonb_build_object('product_id', v_tp, 'product_packaging_id', v_pak1, 'qty', v_kg::text); end if;
        if random() < 0.4 and uji.avail('TP') >= v_kg + 5 then v_items := v_items || jsonb_build_object('product_id', v_tp, 'product_packaging_id', v_pak05, 'qty', (2 * floor(2 + random() * 4))::text); end if;
      end if;
      continue when jsonb_array_length(v_items) = 0;
      v_order := public.save_order_draft(null, d, v_cust.id, v_ch, null, case when v_ch = 'marketplace' then 15000 else 0 end, v_items);
      perform public.confirm_order(v_order);
      select total_rp into v_total from public.orders where id = v_order;
      v_r := random();
      if v_r < 0.62 then
        perform public.record_payment(v_order, d, 'tunai', v_tunai, v_total, null, true);
      elsif v_r < 0.84 then
        perform public.record_payment(v_order, d, 'transfer', v_bank, v_total, null, d < v_today - 2);
      elsif v_r < 0.93 then
        perform public.record_payment(v_order, d, 'tunai', v_tunai, (v_total / 2 / 1000) * 1000, 'Cicilan pertama', true);
      end if;   -- sisanya: belum bayar (piutang)
      if d < v_today - 1 or random() < 0.5 then
        perform public.fulfill_order(v_order, v_cust.name, d);
      end if;
    end loop;

    -- 4) Kas (admin): bayar petani setiap Jumat, upah & biaya produksi setiap Sabtu, iuran anggota tgl 5.
    if v_dow = 5 and v_purchase > 0 then
      if uji.saldo('BANK') >= v_purchase then
        perform public.create_expense(d, 'bahan_baku', v_bank, v_purchase, 'Pembayaran jagung anggota minggu ini', null);
        v_purchase := 0;
      elsif uji.saldo('TUNAI') >= v_purchase then
        perform public.create_expense(d, 'bahan_baku', v_tunai, v_purchase, 'Pembayaran jagung anggota minggu ini', null);
        v_purchase := 0;
      end if;
    end if;
    if v_dow = 6 and v_week_cost > 0 and uji.saldo('TUNAI') >= v_week_cost then
      perform public.create_expense(d, 'upah', v_tunai, (v_week_cost * 6 / 10 / 1000) * 1000, 'Upah pemipilan & penepungan minggu ini', null);
      perform public.create_expense(d, 'listrik_bbm', v_tunai, (v_week_cost * 3 / 10 / 1000) * 1000, 'Solar & listrik mesin', null);
      v_week_cost := 0;
    end if;
    if extract(day from d) = 5 then
      perform public.create_other_income(d, 'iuran_anggota', v_tunai, 200000, 'Iuran anggota ' || to_char(d, 'MM/YYYY'));
    end if;
    if extract(day from d) = 20 and uji.saldo('TUNAI') >= 350000 then
      perform public.create_expense(d, 'perawatan', v_tunai, 350000, 'Ganti saringan & van belt mesin penepung', null);
    end if;

    d := d + 1;
  end loop;

  -- ---------- hal yang menunggu keputusan (agar alur ketua bisa dicoba) ----------
  perform uji.act(c_op);
  perform public.request_stock_adjustment(v_tp, 'out', 2, 'Kemasan lembab, tepung menggumpal', v_today);
  perform uji.act(c_admin);
  perform public.request_cash_correction(v_tunai, 'out', 2000, 'Selisih hitung kas sore', v_today);
  select o.id into v_order from public.orders o where o.status = 'delivered' and o.delivered_on between v_today - 6 and v_today
    and exists (select 1 from public.order_items i where i.order_id = o.id and i.product_id = v_tp and i.qty_kg >= 3) order by o.delivered_on desc limit 1;
  if v_order is not null then
    perform public.create_return(v_order, v_today, 'Kemasan sobek saat pengiriman',
      (select jsonb_build_array(jsonb_build_object('order_item_id', i.id, 'qty_kg', '2')) from public.order_items i where i.order_id = v_order and i.product_id = v_tp limit 1));
  end if;
  -- satu draft pesanan
  select c.id into v_id from public.customers c join uji.baris b on b.id = c.id where c.name = 'Toko Berkah Sukolilo';
  perform public.save_order_draft(null, v_today, v_id, 'whatsapp', 'Menunggu konfirmasi jumlah', 0, jsonb_build_array(jsonb_build_object('product_id', v_tp, 'product_packaging_id', v_pak1, 'qty', '20')));
end $$;

drop function uji.act(uuid);
drop function uji.avail(text);
drop function uji.saldo(text);
select set_config('request.jwt.claims', '', true);

commit;
