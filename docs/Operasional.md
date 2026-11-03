# Operasional — SIM Kelompok Tani Ngudi Makmur

Panduan untuk **admin teknis** dan pengembang: backup & uji restore, lingkungan DEMO, cara menjalankan uji, dan printer thermal.
Rujukan: [Security.md](Security.md) §7 & §11, [Task.md](Task.md) T9.8–T9.10.

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

1. Buat proyek Supabase baru (atau `supabase start` lokal dengan Docker).
2. Cek checksum: `Get-Content SHA256SUMS.txt` lalu bandingkan dengan `Get-FileHash` tiap berkas.
3. Pulihkan berurutan dengan `psql` ke alamat proyek uji:
   `psql "<db-url-uji>" -f roles.sql` → `psql "<db-url-uji>" -f schema.sql` → `psql "<db-url-uji>" -c "set session_replication_role = replica;" -f data.sql`.
4. Unggah isi `proofs/` ke bucket `proofs` proyek uji (struktur folder sama).
5. Jalankan uji DB (bagian 4) terhadap proyek uji dan cocokkan beberapa angka dengan aplikasi nyata: saldo kas per akun,
   stok per produk, jumlah pesanan bulan ini, satu bukti penerimaan bisa dibuka.
6. Catat hasil (tanggal, folder backup, pelaksana, angka yang dicocokkan, kendala) di Task.md T9.8.

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
| `pnpm build && pnpm test:e2e` | Playwright: smoke tanpa akun (laptop 1280 px & ponsel 360 px) + alur DEMO bila `E2E_ADMIN_EMAIL`, `E2E_KETUA_EMAIL`, `E2E_PASSWORD` diisi |

Runner SQL: skrip Node kecil dengan paket `pg` yang menyambung ke pooler sesi Supabase memakai `.env.local`
(`supabase db query` hanya menjalankan satu perintah, sedangkan berkas uji berisi banyak perintah).

## 5. Printer thermal (T8.3, T9.9)

- Nota & kuitansi dicetak lewat dialog cetak browser (jalur A StyleGuide §8.4): pasang driver printer thermal 80 mm,
  atur ukuran kertas 80 mm × panjang otomatis, margin 0, skala 100%, matikan header/footer browser.
- Uji di lokasi mitra: cetak nota, cetak ulang (harus tertulis "CETAK ULANG ke-1"), cabut kabel printer saat mencetak →
  pembayaran tetap ada, cukup cetak ulang. Catat merek/model printer & pengaturan di Task.md T9.9.
