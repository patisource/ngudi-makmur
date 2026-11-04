#!/usr/bin/env bash
# Uji konkurensi sungguhan (T3.7): dua sesi Postgres memposting BERSAMAAN. Berbeda dengan *_check.sql (satu sesi,
# dibatalkan), uji ini harus COMMIT agar sesi kedua melihat kunci & data sesi pertama — buku mutasi append-only tidak
# bisa dibersihkan, jadi HANYA untuk database sekali pakai (CI / Supabase lokal). Menolak host selain localhost.
#
# Pemakaian: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash supabase/tests/concurrency.sh
# Skenario (masing-masing: sesi A memanggil fungsi lalu menahan transaksi 2 s; sesi B mulai 0,5 s kemudian):
#   1. dua pesanan 4 kg berebut stok 5 kg  → tepat satu terkonfirmasi, reservasi 4 kg, tersedia tidak negatif
#   2. pesanan yang sama dikonfirmasi dua kali → satu nomor INV, satu reservasi
#   3. dua jagung masuk dikonfirmasi bersamaan → dua nomor RCV berbeda, dua mutasi stok
set -u
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:* | *@localhost:*) ;;
  *) echo "Menolak: uji konkurensi meng-COMMIT data dan hanya boleh ke database lokal/CI." >&2; exit 2 ;;
esac
PSQL=(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -At)
RUN=$(date +%s)
TAG=$(printf "%s" "${RUN: -5}" | tr 0-9 A-J)   # kode produk hanya huruf (2–6)

"${PSQL[@]}" <<SQL >/dev/null 2>&1 || { echo "persiapan gagal" >&2; exit 1; }
create schema if not exists uji_konk;
create table if not exists uji_konk.ctx (run text primary key, admin uuid, o1 uuid, o2 uuid, o3 uuid, r1 uuid, r2 uuid, pk uuid, pl uuid);
do \$\$
declare
  v_admin uuid := gen_random_uuid();
  v_pk uuid; v_pl uuid; v_tk uuid; v_cust uuid; v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_o1 uuid; v_o2 uuid; v_o3 uuid; v_r1 uuid; v_r2 uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'konk.$RUN@contoh.test', '{"full_name":"Uji Konkurensi"}', now(), now());
  insert into public.user_roles (user_id, role) values (v_admin, 'admin_kelompok');
  insert into public.products (code, name, category, default_price_per_kg) values ('K$TAG', 'Uji konkurensi K', 'olahan', 10000) returning id into v_pk;
  insert into public.products (code, name, category, default_price_per_kg) values ('L$TAG', 'Uji konkurensi L', 'olahan', 10000) returning id into v_pl;
  perform public._post_movement(v_pk, 'in', 5, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-KONK', v_today, 30000);
  perform public._post_movement(v_pl, 'in', 10, 'receipt_in', 'receipt', gen_random_uuid(), 'RCV-KONK', v_today, 60000);
  insert into public.customers (name, type) values ('Uji konkurensi $RUN', 'usaha') returning id into v_cust;
  select id into v_tk from public.products where code = 'TK';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_o1 := public.save_order_draft(null, v_today, v_cust, 'whatsapp', 'konk', 0, jsonb_build_array(jsonb_build_object('product_id', v_pk, 'product_packaging_id', null, 'qty', '4', 'discount_rp', 0)));
  v_o2 := public.save_order_draft(null, v_today, v_cust, 'whatsapp', 'konk', 0, jsonb_build_array(jsonb_build_object('product_id', v_pk, 'product_packaging_id', null, 'qty', '4', 'discount_rp', 0)));
  v_o3 := public.save_order_draft(null, v_today, v_cust, 'whatsapp', 'konk', 0, jsonb_build_array(jsonb_build_object('product_id', v_pl, 'product_packaging_id', null, 'qty', '3', 'discount_rp', 0)));
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg, note) values ('luar', 'Pemasok konk', v_tk, 10, 'konk') returning id into v_r1;
  insert into public.receipts (source_type, supplier_name, product_id, weight_kg, note) values ('luar', 'Pemasok konk', v_tk, 12, 'konk') returning id into v_r2;
  reset role;
  insert into uji_konk.ctx values ('$RUN', v_admin, v_o1, v_o2, v_o3, v_r1, v_r2, v_pk, v_pl);
end \$\$;
SQL

ctx() { "${PSQL[@]}" -c "select $1 from uji_konk.ctx where run = '$RUN'"; }
ADMIN=$(ctx admin)

# Satu sesi: panggil fungsi sebagai admin kelompok, tahan transaksi $2 detik, lalu commit. Galat (mis. stok kurang) wajar.
session() {
  psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL 2>&1
begin;
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true);
set local role authenticated;
select 'OK ' || ($1)::text;
select pg_sleep($2);
commit;
SQL
}
race() { # $1 = panggilan sesi A, $2 = panggilan sesi B
  session "$1" 2 >"/tmp/konk_a_$RUN" &
  local a=$!
  sleep 0.5
  session "$2" 0 >"/tmp/konk_b_$RUN" &
  wait $a $!
  # bukti tumpang-tindih: sesi B selesai SETELAH A commit (menunggu kunci), lalu hasilnya ditampilkan
  echo "  sesi A: $(head -c 160 "/tmp/konk_a_$RUN" | tr "
" " ")"
  echo "  sesi B: $(head -c 160 "/tmp/konk_b_$RUN" | tr "
" " ")"
}

echo "1. dua pesanan berebut stok"
race "public.confirm_order('$(ctx o1)')" "public.confirm_order('$(ctx o2)')"
echo "2. pesanan sama dua kali"
race "public.confirm_order('$(ctx o3)')" "public.confirm_order('$(ctx o3)')"
echo "3. dua jagung masuk"
race "public.confirm_receipt('$(ctx r1)')" "public.confirm_receipt('$(ctx r2)')"
rm -f "/tmp/konk_a_$RUN" "/tmp/konk_b_$RUN"

RESULT=$("${PSQL[@]}" <<SQL
with c as (select * from uji_konk.ctx where run = '$RUN'),
t(no, uji, lulus) as (values
  (1, 'dua pesanan 4 kg berebut stok 5 kg → tepat satu terkonfirmasi',
      (select count(*) from public.orders where id in ((select o1 from c), (select o2 from c)) and status = 'confirmed') = 1),
  (2, 'stok tidak pernah negatif & reservasi 4 kg',
      (select reserved_kg = 4 and available_kg = 1 and available_kg >= 0 from public.v_stock_balance where product_id = (select pk from c))),
  (3, 'pesanan sama dikonfirmasi bersamaan → satu nomor INV',
      (select status = 'confirmed' and doc_number like 'INV-%' from public.orders where id = (select o3 from c))),
  (4, 'pesanan sama dikonfirmasi bersamaan → reservasi 3 kg sekali saja',
      (select reserved_kg = 3 from public.v_stock_balance where product_id = (select pl from c))),
  (5, 'dua jagung masuk bersamaan → dua nomor RCV berbeda',
      (select count(distinct doc_number) = 2 and bool_and(status = 'confirmed') from public.receipts where id in ((select r1 from c), (select r2 from c)))),
  (6, 'dua jagung masuk bersamaan → tepat dua mutasi stok',
      (select count(*) = 2 from public.stock_movements where source_id in ((select r1 from c), (select r2 from c)))),
  (7, 'tidak ada nomor dokumen ganda di seluruh database',
      not exists (select doc_number from (select doc_number from public.orders union all select doc_number from public.receipts) d where doc_number is not null group by doc_number having count(*) > 1))
)
select case when coalesce(lulus, false) then 'lulus  ' else 'GAGAL  ' end || uji from t order by no;
SQL
)
echo "$RESULT"
FAIL=$(printf '%s\n' "$RESULT" | grep -c '^GAGAL')
echo "HASIL UJI KONKURENSI: $(printf '%s\n' "$RESULT" | grep -c '^lulus') lulus, $FAIL gagal"
[ "$FAIL" -eq 0 ]
