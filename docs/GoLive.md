# Daftar periksa go-live — SIM Kelompok Tani Ngudi Makmur

Untuk **admin teknis** bersama ketua, dikerjakan berurutan pada hari aplikasi mulai dipakai untuk data nyata.
Kode aplikasi sudah siap (CI hijau, lihat [Task.md](Task.md)); langkah di bawah adalah konfigurasi, data, dan kegiatan lapangan
yang tidak bisa dikerjakan dari kode. Centang setiap baris dan catat tanggal & pelaksananya.

## 1. Sebelum hari H

- [ ] **UAT dengan data uji** (Task T9.10): admin kelompok, operator, dan ketua mencoba alur harian memakai akun masing-masing
      dan manual (`manual/Manual-Pengguna-SIM-Ngudi-Makmur.pdf`). Catat masalah yang ditemukan.
- [ ] **Printer thermal** di lokasi mitra (T9.9): cetak nota 80 mm/58 mm via driver dan cetak langsung (USB/Serial), cetak ulang
      → "CETAK ULANG ke-1". Panduan: [Operasional.md](Operasional.md) §5.
- [ ] **Data master final** (keputusan mitra, PRD §10): nama/merek produk (Q1), harga katalog & kemasan, kategori pemasukan &
      pengeluaran (Q15), ambang susut per jenis batch (Q17), jam gudang & foto panel login (Q23, `lib/org.ts`).
- [ ] **Akun nyata**: satu akun per pengurus dengan peran yang benar (Pengaturan → Akun & izin). Kata sandi awal diberikan
      langsung; minta setiap orang menggantinya di **Akun saya**. Nonaktifkan akun yang tidak dipakai.

## 2. Konfigurasi Supabase (Dashboard proyek asli)

- [ ] Authentication → Providers → Email → **Minimum password length = 8** (aplikasi sudah menolak < 8; ini lapis kedua).
- [ ] Authentication → **Allow new users to sign up = off** (akun hanya dibuat admin teknis).
- [ ] Authentication → URL Configuration → **Site URL** & Redirect URLs = domain produksi Vercel.
- [ ] Database → kata sandi DB kuat & hanya ada di `.env.local` laptop server; tidak pernah dikirim lewat chat/grup.

## 3. Pembersihan data uji coba (hari H, dijalankan sendiri oleh pengguna/admin teknis)

Proyek asli saat ini berisi data uji ±5 minggu (PRD Q22). **Wajib dibersihkan sebelum transaksi nyata pertama.**

- [ ] (Opsional) Ambil backup terakhir berisi data uji: `./scripts/backup.ps1 -OutDir D:\Backup-SIM`.
- [ ] Jalankan `supabase/bersihkan_data_uji.sql` sebagai `postgres` (SQL Editor Supabase). Hasil akhir menampilkan ringkasan;
      semua transaksi = 0, akun nyata/produk/kemasan/kategori/akun kas tetap.
- [ ] Storage → bucket `proofs` → hapus semua berkas (bukti foto data uji).
- [ ] Di aplikasi: **Pembayaran & kas** → isi **saldo awal** Kas tunai & Rekening bank per tanggal mulai (Q14: siapa yang
      memverifikasi angkanya). Stok awal nyata dicatat lewat **Jagung masuk** atau **Stok opname**.
- [ ] Jalankan semua uji DB terhadap proyek asli (`RUNNER=… sh scripts/db-test-all.sh`): setelah dibersihkan **semua 11 suite
      harus lulus** (selama data uji ada, 3 suite memang gagal karena menganggap stok kosong).

## 4. Backup (hari H)

- [ ] Daftarkan backup harian di laptop server (Task Scheduler, [Operasional.md](Operasional.md) §1) dengan `-OutDir` di disk
      terenkripsi **di luar** folder OneDrive/Google Drive.
- [ ] Jalankan sekali secara manual, periksa folder tanggal hari ini berisi `schema.sql`, `data.sql`, `roles.sql`, `SHA256SUMS.txt`.
- [ ] Simpan salinan prosedur restore (Operasional §2) — termasuk `restore_prepare.sql` & `restore_extras.sql` yang **wajib**.

## 5. Setelah go-live (minggu pertama)

- [ ] Ketua memeriksa **Log audit** dan kartu persetujuan setiap hari.
- [ ] Cocokkan saldo kas aplikasi dengan uang/rekening nyata di akhir minggu pertama; selisih → koreksi kas beralasan.
- [ ] Ukur ulang Lighthouse di domain produksi (Task T9.5) dan uji form di ponsel pengurus.
- [ ] Serah terima (T9.10): source code, migrasi, `.env.example`, manual, akun & server, hasil UAT, penanggung jawab lanjutan.
