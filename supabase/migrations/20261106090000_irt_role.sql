-- M10 (IRT Sekar Arum, keputusan pengguna 5–6 Nov 2026): peran kelima `pengurus_irt`.
-- Dipisah dari migrasi modul IRT karena nilai enum baru tidak boleh dipakai di transaksi yang sama dengan ALTER TYPE.
alter type public.app_role add value if not exists 'pengurus_irt';
