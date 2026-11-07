-- =====================================================================
-- BERSIHKAN DATA UJI COBA — dijalankan SEKALI sebelum go-live (setelah masa uji coba dengan seed_uji.sql).
--
-- Yang DIKOSONGKAN (semua, bukan hanya baris buatan seed_uji.sql — karena data yang dicatat pengguna selama
-- uji coba juga data latihan):
--   jagung masuk, produksi, pesanan, retur, pembayaran, refund, pengeluaran, pemasukan lain, transfer, koreksi,
--   opname, mutasi stok & saldo stok, buku kas & saldo kas (saldo awal diisi ulang saat go-live), log cetak,
--   kunci idempotensi, penomoran dokumen (INV/PAY/… mulai lagi dari 0001), dan log audit selain masuk/keluar & akun.
-- Yang DIHAPUS dari master: anggota & pelanggan contoh dan 4 akun pelaku "uji" (tercatat di skema uji).
-- Yang DIPERTAHANKAN: akun pengguna nyata & perannya, produk/kemasan/jenis batch/saluran/kategori/akun kas,
--   anggota & pelanggan yang dibuat pengguna sendiri, harga katalog.
-- File bukti di Storage (bucket proofs) TIDAK terhapus oleh SQL: kosongkan lewat Dashboard → Storage → proofs.
--
-- Jalankan sebagai pemilik database (postgres). Satu transaksi: gagal di tengah = tidak ada yang berubah.
-- =====================================================================
begin;

do $$ begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'uji') then
    raise exception 'Skema uji tidak ada: data uji belum pernah dimuat atau sudah dibersihkan.';
  end if;
end $$;

-- Trigger penjaga (append-only, tolak hapus/truncate, audit master) dimatikan sementara di dalam transaksi ini saja.
do $$
declare t text;
begin
  foreach t in array array['audit_logs', 'stock_movements', 'cash_transactions', 'cash_transfers', 'receipts', 'attachments',
                           'production_batches', 'production_lines', 'batch_costs', 'orders', 'order_items', 'order_returns',
                           'order_return_items', 'stock_reservations', 'stock_opnames', 'stock_opname_lines', 'stock_adjustments',
                           'payments', 'refunds', 'expenses', 'other_incomes', 'cash_corrections', 'print_logs', 'members',
                           'member_contacts', 'customers', 'stock_balances', 'cash_accounts',
                           'irt_movements', 'irt_receipts', 'irt_receipt_lines', 'irt_batches', 'irt_batch_lines', 'irt_sales',
                           'irt_sale_lines', 'irt_adjustments', 'irt_stock_balances'] loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;
end $$;

truncate public.attachments, public.print_logs, public.order_return_items, public.order_returns, public.stock_reservations,
         public.refunds, public.payments, public.order_items, public.orders, public.batch_costs, public.production_lines,
         public.production_batches, public.receipts, public.stock_opname_lines, public.stock_opnames, public.stock_adjustments,
         public.expenses, public.other_incomes, public.cash_corrections, public.cash_transfers, public.cash_transactions,
         public.stock_movements, public.idempotency_keys, public.document_sequences,
         -- modul IRT (M10): transaksi IRT; master bahan/produk IRT tetap
         public.irt_adjustments, public.irt_sale_lines, public.irt_sales, public.irt_batch_lines, public.irt_batches,
         public.irt_receipt_lines, public.irt_receipts, public.irt_movements
  restart identity;

update public.stock_balances set on_hand_kg = 0, value_rp = 0, updated_at = now();
update public.cash_accounts set balance_rp = 0, opening_set_at = null, updated_at = now();
update public.irt_stock_balances set on_hand = 0, value_rp = 0, updated_at = now();

-- master & akun contoh
delete from public.members where id in (select id from uji.baris where jenis = 'member');
delete from public.customers where id in (select id from uji.baris where jenis = 'customer');
delete from public.user_permissions where user_id in (select id from uji.baris where jenis = 'user');
delete from public.user_roles where user_id in (select id from uji.baris where jenis = 'user');
delete from public.profiles where id in (select id from uji.baris where jenis = 'user');
delete from auth.identities where user_id in (select id from uji.baris where jenis = 'user');
delete from auth.users where id in (select id from uji.baris where jenis = 'user');

-- log audit: simpan jejak masuk/keluar & pengelolaan akun nyata; sisanya data latihan.
delete from public.audit_logs
 where not (action like 'auth.%' or action like 'user.%')
    or user_id in (select id from uji.baris where jenis = 'user');

do $$
declare t text;
begin
  foreach t in array array['audit_logs', 'stock_movements', 'cash_transactions', 'cash_transfers', 'receipts', 'attachments',
                           'production_batches', 'production_lines', 'batch_costs', 'orders', 'order_items', 'order_returns',
                           'order_return_items', 'stock_reservations', 'stock_opnames', 'stock_opname_lines', 'stock_adjustments',
                           'payments', 'refunds', 'expenses', 'other_incomes', 'cash_corrections', 'print_logs', 'members',
                           'member_contacts', 'customers', 'stock_balances', 'cash_accounts',
                           'irt_movements', 'irt_receipts', 'irt_receipt_lines', 'irt_batches', 'irt_batch_lines', 'irt_sales',
                           'irt_sale_lines', 'irt_adjustments', 'irt_stock_balances'] loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;
end $$;

drop schema uji cascade;

-- Ringkasan hasil (harus nol semua kecuali akun nyata).
select (select count(*) from public.receipts) as jagung_masuk, (select count(*) from public.orders) as pesanan,
       (select count(*) from public.stock_movements) as mutasi_stok, (select count(*) from public.cash_transactions) as mutasi_kas,
       (select coalesce(sum(balance_rp), 0) from public.cash_accounts) as saldo_kas, (select count(*) from auth.users) as akun;

commit;
