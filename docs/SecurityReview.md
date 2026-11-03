# Review Keamanan v1 (T9.6)

Tanggal: 3 November 2026 · Pemeriksa: Claude Code (otomatis + baca kode) · Rujukan: [Security.md](Security.md) §11.
Pemeriksaan basis data dijalankan ke proyek Supabase nyata (hanya baca katalog; tidak mengubah data).

| Butir checklist §11 | Hasil | Bukti |
|---|---|---|
| RLS aktif di semua tabel `public` | ✅ | Query `pg_tables where not rowsecurity` → kosong |
| Tidak ada policy/grant tulis untuk `authenticated` pada tabel ledger | ✅ | `pg_policies` & `role_table_grants` untuk tabel ledger/dokumen terkunci → kosong; semua tulis lewat fungsi |
| Fungsi `security definer` memakai `set search_path = ''` + cek peran | ✅ | Query `pg_proc` (prosecdef tanpa `search_path=""`) → kosong; fungsi internal `_…` tidak bisa dipanggil `authenticated`; tidak ada fungsi yang bisa dipanggil `anon` |
| Test otorisasi per peran | ✅ | `lib/auth/permissions.test.ts` (matriks halaman & aksi), `rbac_check.sql`, uji peran di setiap `*_check.sql`, guard API 401/403 (`tests/e2e/smoke.spec.ts`) |
| Idempotensi & konkurensi posting | ✅ sebagian | Kunci `Idempotency-Key` di semua posting (UI & API, `lib/posting.ts`); konfirmasi/verifikasi/posting ulang aman di DB. Uji dua sesi **benar-benar bersamaan** belum dijalankan (butuh DB DEMO; kunci baris `FOR UPDATE` sudah dipakai) |
| Uji wajib SRS §11: operator tidak bisa ubah pembayaran/kas (UI, API, RPC) | ✅ | `cash_check.sql` (8/8 fungsi ditolak + RLS), `permissions.test.ts`, guard API `kas.kelola` |
| Konfirmasi ganda → satu perubahan stok | ✅ | `receipt_check.sql`, `production_check.sql`, `order_check.sql` |
| Stok 5 kg, dua pesanan @4 kg → satu terkonfirmasi | ✅ | `order_check.sql` (berurutan dengan kunci saldo yang sama) |
| Bayar dua kali kunci sama → satu pembayaran & satu kas | ✅ | `cash_check.sql` + `lib/idempotency.test.ts` |
| HPP output nol → "data belum cukup" | ✅ | `production_check.sql`, `lib/production.test.ts` |
| Cetak ulang nota → nomor sama, kas tetap | ✅ | `report_check.sql` |
| Backup bisa dipulihkan | ⏳ | Skrip `scripts/backup.ps1` siap; **uji restore belum dilakukan** (Operasional.md §2) |
| `UNIQUE (source_type, source_id)` kas; biaya batch tanpa kas | ✅ | Constraint aktif (1); `cash_check.sql` |
| Pengaju ≠ penyetuju koreksi stok/kas (juga akun rangkap) | ✅ | CHECK + fungsi; `cash_check.sql`, `stock_control_check.sql`, `return_check.sql` |
| Pendaftaran publik nonaktif; kata sandi bocor ditolak | ⏳ perlu cek dashboard | `config.toml` lokal `enable_signup=false`, minimal 8 karakter. Proyek nyata: pastikan di Dashboard → Authentication (signup off, minimum 8, *leaked password protection* on) |
| `service_role`/kunci rahasia tidak ada di bundel klien | ✅ | `grep` `.next/static`: nilai kunci tidak ditemukan; satu temuan teks `"sb_secret_"` hanya literal pemeriksa awalan di pustaka supabase-js |
| Header keamanan | ✅ | `next.config.ts`: CSP (`frame-ancestors 'none'` dll.), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS; `X-Powered-By` dimatikan. CSP `script-src` belum ketat (skrip inline Next.js) |
| Bucket Storage privat; signed URL kedaluwarsa | ✅ | `proofs` `public=false`; signed URL dibuat server berlaku 5 menit (`features/receipts/queries.ts`, bukti transfer di `features/cash/queries.ts`). Folder `payments/` (3 Nov 2026): unggah hanya `admin_kelompok`, baca admin & ketua, isi diperiksa ulang server (magic bytes, ukuran, EXIF), maks. 3 per pembayaran, tidak bisa dihapus setelah diverifikasi (uji `transfer_proof_check`) |
| Ekspor CSV aman dari injection | ✅ | `lib/csv.ts` (awalan `'` untuk `= + - @`), `lib/report-utils.test.ts` |
| Backup harian berjalan | ⏳ | Belum dijadwalkan di mesin server mitra (Operasional.md §1) |
| Seed DEMO tidak ada di basis data nyata | ✅ | Akun `@contoh.test` = 0, transaksi `DEMO%` = 0 |
| `pnpm audit` tanpa high/critical | ✅ | 1 temuan *moderate* (minimatch, hanya dependensi dev ESLint) |

## Catatan & tindak lanjut

1. Jalankan uji restore & jadwalkan backup harian di server mitra (T9.8).
2. Cek pengaturan Auth di dashboard proyek nyata (signup off, minimal 8 karakter, kata sandi bocor).
3. Pertimbangkan MFA untuk `admin_teknis` & `admin_kelompok` (P1, Security.md §3).
4. Uji konkurensi dua sesi di DB DEMO (T3.7/T6.8/T7.7) sebelum UAT.
