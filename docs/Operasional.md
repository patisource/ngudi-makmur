# Operasional — SIM Kelompok Tani Ngudi Makmur

Panduan untuk **admin teknis** dan pengembang: backup & uji restore, lingkungan DEMO, cara menjalankan uji, dan printer thermal.
Rujukan: [Security.md](Security.md) §7 & §11, [Task.md](Task.md) T9.8–T9.10. Daftar periksa hari H: [GoLive.md](GoLive.md).

## 1. Backup harian (T9.8)

`scripts/backup.ps1` membuat folder `backups/YYYY-MM-DD/` berisi:

| Berkas | Isi |
|---|---|
| `schema.sql`, `roles.sql` | Struktur basis data & peran |
| `data.sql` | Seluruh data (termasuk `auth` & audit) dalam perintah `COPY` |
| `proofs/` | Berkas bukti dari bucket privat `proofs` |
| `SHA256SUMS.txt` | Checksum untuk memastikan berkas utuh saat restore |

Folder `backups/` ada di `.gitignore` dan **berisi data pribadi** (NIK, no. HP): simpan di disk terenkripsi (BitLocker) atau
penyimpanan yang hanya bisa dibuka admin teknis & ketua, plus satu salinan di luar lokasi (mis. drive eksternal terkunci).
Skrip menyimpan 30 backup terbaru.

**Jadwal harian (Windows Task Scheduler)** — jalankan sekali di PowerShell sebagai admin teknis:

```powershell
$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\path\ke\aplikasi\scripts\backup.ps1`"" -WorkingDirectory "C:\path\ke\aplikasi"
$trg = New-ScheduledTaskTrigger -Daily -At 21:00
Register-ScheduledTask -TaskName "Backup SIM Ngudi Makmur" -Action $act -Trigger $trg -Description "Backup harian DB + bukti"
```

Prasyarat di laptop server: Supabase CLI, Node.js, `pnpm install`, dan `.env.local` berisi `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Bila proyek Supabase memakai paket berbayar, backup otomatis Supabase (PITR)
boleh dipakai sebagai lapis kedua — tetap simpan salinan lokal ini.

## 2. Uji restore (wajib SRS §11, sekali sebelum serah terima)

Lakukan ke **proyek Supabase lain** (proyek DEMO/uji), bukan proyek nyata:

1. Buat proyek Supabase baru yang **kosong** (atau `supabase db start` lokal dengan Docker, tanpa migrasi & tanpa seed).
2. Cek checksum: `Get-Content SHA256SUMS.txt` lalu bandingkan dengan `Get-FileHash` tiap berkas.
3. Pulihkan **berurutan** dengan `psql` ke alamat proyek uji (urutan penting):
   1. `psql "<db-url-uji>" -f supabase/restore_prepare.sql` — **wajib**: mencabut hak bawaan Supabase untuk `anon`/`authenticated`
      atas objek baru. Tanpa langkah ini hasil restore jauh lebih longgar daripada aslinya (uji 5 Nov 2026: 1.996 vs 184 baris hak).
   2. `psql "<db-url-uji>" -f roles.sql` (galat `log_min_messages` boleh diabaikan)
   3. `psql "<db-url-uji>" -f schema.sql`
   4. `psql "<db-url-uji>" -c "set session_replication_role = replica;" -f data.sql` — galat pada tabel internal `auth.*`/`storage.*`
      yang tidak ada di versi tujuan (mis. `auth.scim_users`, `buckets.lifecycle_configuration`) wajar bila versi Supabase berbeda;
      tabel `public` dan `auth.users` harus masuk tanpa galat.
   5. `psql "<db-url-uji>" -f supabase/restore_extras.sql` — **wajib**: memasang ulang trigger profil di `auth.users`, bucket `proofs`,
      dan policy `storage.objects` (tidak ikut di `supabase db dump`). Hasil akhirnya harus `1 | 1 | 6`.
4. Unggah isi `proofs/` ke bucket `proofs` proyek uji (struktur folder sama).
5. Cocokkan angka dengan proyek asli: jumlah pesanan/jagung masuk/batch/mutasi/kas/audit/akun, stok per produk, saldo kas per
   akun, omzet bulan lalu; bandingkan juga daftar hak akses `anon`/`authenticated` (harus identik). Jalankan uji DB (§4).
6. Catat hasil (tanggal, folder backup, pelaksana, angka yang dicocokkan, kendala) di Task.md T9.8.

**Hasil uji restore 5 Nov 2026** (backup proyek asli → Supabase lokal kosong, CLI 2.117): checksum cocok; 83 pesanan,
17 jagung masuk, 40 batch, 182 mutasi stok, 97 baris kas, 637 audit, 11 akun; stok PP 252 kg / TK 0 / TP 121 kg; saldo
kas tunai & bank; omzet Oktober Rp19.066.000 — **semua identik** dengan proyek asli. Dua celah ditemukan dan sudah ditutup
dengan `restore_prepare.sql` & `restore_extras.sql` (hak akses terlalu longgar; trigger profil/bucket/policy storage hilang).
Bucket `proofs` di proyek asli belum berisi berkas, jadi langkah 4 belum teruji dengan file nyata.

## 3. Lingkungan DEMO (pelatihan & UAT awal)

- Lokal: `supabase start` lalu `supabase db reset` → migrasi + `seed.sql` + `seed_demo.sql` (config.toml `[db.seed]`).
- Akun DEMO (kata sandi `demo-ngudi-makmur`): `admin.demo@contoh.test`, `operator.demo@contoh.test`, `ketua.demo@contoh.test`,
  `teknis.demo@contoh.test`.
- Hasil seed sudah diperiksa: HPP Rp6.000/kg, stok PP 40 kg & TP 45 kg, kas masuk Rp50.000, piutang Rp0.
- **Jangan** menjalankan `seed_demo.sql` di proyek nyata (akun dengan kata sandi umum). `supabase db push` tidak menjalankan seed.

## 4. Menjalankan uji

| Perintah | Isi |
|---|---|
| `pnpm lint && pnpm typecheck && pnpm test` | Lint, tipe, uji unit (juga dijalankan CI GitHub Actions) |
| `RUNNER=<path run.mjs> sh scripts/db-test-all.sh` | Semua `supabase/tests/*_check.sql`; setiap berkas dibungkus transaksi yang **dibatalkan** |
| `pnpm build && pnpm test:e2e` | Playwright: smoke tanpa akun (laptop 1280 px & ponsel 360 px) + alur DEMO & lintas peran bila `E2E_ADMIN_EMAIL`, `E2E_KETUA_EMAIL`, `E2E_OPERATOR_EMAIL`, `E2E_TEKNIS_EMAIL`, `E2E_PASSWORD` diisi |
| `DB_URL=… bash scripts/db-test-ci.sh` | Semua `*_check.sql` lewat `psql` ke database **lokal/CI** (dipakai GitHub Actions job `db`) |
| `DB_URL=… bash supabase/tests/concurrency.sh` | Uji konkurensi dua sesi (T3.7). Meng-COMMIT data → hanya database sekali pakai; menolak host selain localhost |

GitHub Actions (`.github/workflows/ci.yml`) menjalankan tiga job di setiap push: `check` (lint, tipe, Vitest), `db` (migrasi +
seed dasar di Supabase lokal runner → semua uji SQL + konkurensi), `e2e` (Supabase lokal + seed DEMO → build → Playwright).
Proyek Supabase asli tidak pernah disentuh CI.

Runner SQL: skrip Node kecil dengan paket `pg` yang menyambung ke pooler sesi Supabase memakai `.env.local`
(`supabase db query` hanya menjalankan satu perintah, sedangkan berkas uji berisi banyak perintah).

## 5. Printer thermal (T8.3, T9.9)

- Nota & kuitansi dicetak lewat dialog cetak browser (jalur A StyleGuide §8.4): pasang driver printer thermal 80 mm,
  atur ukuran kertas 80 mm × panjang otomatis, margin 0, skala 100%, matikan header/footer browser.
- Uji di lokasi mitra: cetak nota, cetak ulang (harus tertulis "CETAK ULANG ke-1"), cabut kabel printer saat mencetak →
  pembayaran tetap ada, cukup cetak ulang. Catat merek/model printer & pengaturan di Task.md T9.9.

## 6. Data uji coba di proyek asli (sebelum go-live)

Keputusan pengguna 3 Nov 2026 (PRD Q22): agar aplikasi bisa dicoba dari perangkat mana pun, proyek Supabase asli diisi
data rekaan ± 5 minggu (tanggal 1 bulan lalu s.d. hari ini): 10 anggota, 6 pelanggan, jagung masuk, pemipilan &
penepungan, ± 80 pesanan dengan pembayaran tunai/transfer/cicilan/belum bayar, pengeluaran, iuran, satu koreksi stok,
satu koreksi kas, satu retur, dan satu draft pesanan yang menunggu tindakan.

- Pelaku transaksi = 4 akun `uji.*@contoh.invalid` yang **tidak bisa login** (kata sandi acak + diblokir). Pengurus
  mencoba aplikasi dengan akunnya sendiri.
- Memuat: jalankan `supabase/seed_uji.sql` sebagai `postgres` (SQL editor Supabase atau runner). Menolak berjalan dua kali.
  Saldo awal kas (Rp3 jt tunai, Rp12 jt bank) hanya diisi bila belum pernah diisi; harga katalog hanya bila masih kosong.
- **Membersihkan (wajib sebelum data nyata dicatat):** jalankan `supabase/bersihkan_data_uji.sql`. Semua transaksi,
  mutasi stok & kas, nomor dokumen, dan log audit selain masuk/keluar & akun dikosongkan; anggota/pelanggan contoh dan
  akun uji dihapus; akun nyata, produk, kemasan, kategori, akun kas, dan harga katalog tetap. Saldo awal kas diisi ulang
  di aplikasi setelahnya. File bukti di Storage tidak ikut terhapus: kosongkan bucket `proofs` lewat Dashboard → Storage.
- Setelah dibersihkan, jalankan ulang semua uji DB (§4): uji yang menghitung rata-rata stok produk asli hanya lulus bila stok
  kosong.

Lingkungan uji lokal (tanpa menyentuh proyek asli): Docker Desktop + `supabase start` (lihat §3); bila port 543xx dipakai
proyek lain, salin folder `supabase/` ke folder lain, ganti `project_id` & port di `config.toml`, lalu `supabase start --workdir <folder>`.
Login email lokal butuh `[auth.email] enable_signup = true` (di CLI kunci ini menyalakan login email; pendaftaran publik
tetap tertutup oleh `[auth] enable_signup = false`).
