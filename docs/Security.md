# Security — Keamanan Data, Validasi & Kontrol Akses

Berlaku untuk seluruh kode di repositori ini. Rujukan peran dan hak akses: [PRD.md §3](PRD.md#3-pengguna--peran-rbac).

## 1. Model Ancaman (Ringkas)

| Aset | Ancaman utama | Kontrol utama |
|---|---|---|
| Data keuangan (kas, pembayaran) | Manipulasi saldo, pembayaran ganda, kas ganda (biaya batch + pengeluaran), penggelapan via edit data, operator mengubah kas | Posting atomik, idempotensi, verifikasi pembayaran, unik `kas(source_type, source_id)`, append-only ledger, audit log, pemisahan peran |
| Data stok | Stok fiktif, koreksi tanpa jejak, konfirmasi ganda, reservasi berebut | Ledger append-only, konfirmasi idempoten, kunci baris, koreksi dengan persetujuan ketua, opname |
| Data usaha (backup) | Kehilangan data karena server rusak/salah hapus | Backup harian, uji restore, transaksi terkonfirmasi tidak dihapus |
| Data pribadi anggota (NIK, HP, alamat) | Kebocoran, ekspor massal | RLS, hak akses ekspor, NIK dimasking, bucket privat |
| Akun pengguna | Pencurian kata sandi, sesi dibajak, akun mantan pengurus | Supabase Auth, cookie HttpOnly, nonaktifkan akun + cabut sesi |
| Bukti (foto/PDF) | Unggahan berbahaya, akses URL publik | Validasi tipe/ukuran, bucket privat, signed URL singkat |

Pelaku yang diasumsikan: orang luar tanpa akun, **pengguna sah yang melampaui perannya**, dan mantan pengurus.

## 2. Prinsip

1. **Server adalah satu-satunya penentu kebenaran.** Validasi di klien hanya untuk kenyamanan.
2. **Pertahanan berlapis:** cek peran di server Next.js **dan** RLS/fungsi di Postgres. Salah satu bocor, yang lain tetap menahan.
3. **Hak akses minimum:** setiap peran hanya mendapat yang tercantum di matriks PRD.
4. **Tidak ada penghapusan jejak:** dokumen terposting dan ledger tidak bisa di-UPDATE/DELETE.
5. **Gagal tertutup:** bila peran/sesi tidak jelas, tolak.

## 3. Autentikasi

- Supabase Auth email + kata sandi. Pendaftaran publik **dinonaktifkan** (`enable_signup = false`); akun dibuat `admin_teknis`. Pelanggan dan anggota tidak memiliki akun.
- Kebijakan kata sandi: minimal 10 karakter, cek terhadap daftar kata sandi bocor (fitur Supabase *leaked password protection*).
- Sesi via `@supabase/ssr`: cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Token tidak pernah disimpan di `localStorage`.
- Middleware me-refresh sesi; halaman di bawah `(app)` menolak pengguna tanpa sesi.
- Akun dinonaktifkan → `profiles.is_active = false` **dan** pemanggilan `auth.admin.signOut(userId, 'global')`. Fungsi `has_role()` juga mengembalikan `false` untuk profil nonaktif.
- Rate limit login: maks 5 percobaan gagal / 15 menit per email + IP (Supabase Auth rate limit + pengecekan di server action).
- Pesan error login generik: "Email atau kata sandi salah."
- MFA (TOTP) **disarankan** untuk `admin_teknis` dan `admin_kelompok` (P1).

## 4. Otorisasi (RBAC)

Empat peran (PRD §3): `admin_kelompok`, `operator_produksi`, `ketua`, `admin_teknis`, ditambah izin granular `production.confirm` (konfirmasi batch).

### 4.1 Di server Next.js

```ts
// Setiap Server Action / Route Handler yang menulis atau membaca data sensitif
const user = await requireRole(["admin_kelompok"]); // lempar 401/403 — mis. pembayaran & kas
await requirePermission("production.confirm");      // konfirmasi batch
```

- Konfigurasi hak akses ada di **satu file** (`lib/auth/permissions.ts`) dan dipakai bersama oleh sidebar, guard halaman, dan guard aksi.
- Menyembunyikan menu **bukan** kontrol keamanan; guard server wajib ada. Pembatasan `operator_produksi` (tidak boleh pembayaran/kas) diperiksa di API **dan** di fungsi database.

### 4.2 Di database

- Semua tabel: `alter table … enable row level security;`. Tanpa policy = tidak ada akses.
- Fungsi pembantu:

```sql
create function public.has_role(r app_role) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and p.is_active
  );
$$;
```

- Pola policy:
  - **SELECT**: berdasarkan peran sesuai matriks.
  - **INSERT/UPDATE** langsung hanya untuk master data dan dokumen berstatus `draft`.
  - **Tabel ledger & hasil posting** (`stock_movements`, `stock_reservations`, `cash_transactions`, `payments`, `refunds`, `other_incomes`, `cash_corrections`, `document_sequences`, `audit_logs`): **tidak ada** policy INSERT/UPDATE/DELETE untuk `authenticated`. Satu-satunya jalan menulis adalah fungsi posting.
- Fungsi posting: `security definer`, `set search_path = ''`, memeriksa `has_role()`/`has_permission()` di baris pertama, dan `revoke execute … from public, anon` lalu `grant execute … to authenticated`. Fungsi pembayaran, verifikasi, pengeluaran, pemasukan lain, refund, dan koreksi kas **hanya** menerima `admin_kelompok` (pengajuan) atau `ketua` (persetujuan koreksi); `operator_produksi` dan `admin_teknis` selalu ditolak.
- Trigger `prevent_mutation` pada tabel append-only menolak UPDATE/DELETE, termasuk dari `service_role` kecuali migrasi.

### 4.3 Pemisahan tugas (segregation of duties)

| Aturan | Penegakan |
|---|---|
| `operator_produksi` mencatat produksi tetapi **tidak boleh** membuat/mengubah pembayaran, verifikasi, pengeluaran, refund, atau kas (uji wajib SRS §11). | Guard server + cek peran di fungsi database + tanpa policy tulis pada tabel kas. |
| Koreksi stok & koreksi kas: pengaju (`admin_kelompok`/`operator_produksi`) ≠ penyetuju (`ketua`). | Database menolak bila `approved_by = requested_by`, termasuk bila satu orang merangkap peran. |
| `ketua` hanya membaca laporan/dashboard dan menyetujui koreksi; tidak menginput transaksi harian. | Tidak ada izin tulis selain aksi `approve`/`reject` koreksi dan pembatalan batch. |
| `admin_teknis` mengelola akun, izin, server, printer, backup; **bukan** pencatat transaksi usaha. | Tidak diberi akses fungsi posting usaha; perubahan peran/izin tercatat di audit log. |
| Konfirmasi batch hanya oleh pemegang izin `production.confirm`. | `has_permission('production.confirm')` di `confirm_production`. |
| Pembatalan batch terkonfirmasi butuh persetujuan `ketua`. | Status `pending_void` → `approve` oleh ketua. |
| Pembayaran baru sah setelah **diverifikasi** `admin_kelompok`; hanya pembayaran `verified` yang membuat kas. | Kas dibuat di dalam fungsi verifikasi, satu transaksi. |

## 5. Validasi Input

### 5.1 Lapisan

| Lapisan | Alat | Contoh |
|---|---|---|
| Klien | Zod (schema yang sama) + react-hook-form | Pesan cepat di form |
| Server | Zod `.parse` **wajib** sebelum menyentuh DB | Tipe, rentang, enum, panjang |
| Database | `CHECK`, `NOT NULL`, FK, `UNIQUE`, enum, logika di fungsi | `qty > 0`, stok tidak negatif, bayar ≤ tagihan |

Schema Zod disimpan di `lib/validation/<modul>.ts` dan diimpor oleh klien & server.

### 5.2 Aturan utama

- Uang: integer, `0 ≤ x ≤ 10_000_000_000`. Qty/berat (kg): `> 0`, maks 3 desimal, maks `1_000_000`.
- Konversi kemasan: `isi_kg > 0` (nol ditolak, `CHECK` di DB). Qty item dikonversi ke kg di server; nilai `qty_kg` dari klien diabaikan.
- Jagung masuk: berat `> 0`; produk harus kategori `mentah`; sumber `anggota` wajib `member_id`, sumber `luar` wajib nama pemasok.
- Batch: minimal satu input dan satu output; produk input/output harus sesuai `batch_type_rules`; output tidak boleh melebihi input.
- Pembayaran: jumlah `> 0` dan `≤` tagihan tersisa (dicek ulang di fungsi saat verifikasi, dengan baris pesanan terkunci).
- Tanggal transaksi: tidak lebih dari hari ini (WIB) dan tidak sebelum tanggal tutup buku (pengaturan, P1).
- String: `trim`, panjang maks (nama 120, catatan 1000), tolak karakter kontrol.
- NIK: 16 digit numerik. No. HP: format Indonesia (`^(\+62|0)8\d{7,12}$`).
- ID referensi (produk, anggota, pelanggan) diverifikasi ada, aktif, dan bisa diakses.
- **Field yang dihitung server diabaikan bila dikirim klien**: `total`, `hpp`, `status`, `doc_number`, `paid_amount`, `price_snapshot`, `qty_kg`, `created_by`, `verified_by`. Schema memakai `.strict()` untuk menolak field tak dikenal (mencegah *mass assignment*).

### 5.3 Kode error

Error dikembalikan sebagai kode stabil + pesan Indonesia, tanpa detail SQL/stack trace ke klien:

`VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE` (mis. konfirmasi dokumen yang sudah confirmed), `INSUFFICIENT_STOCK`, `OVERPAYMENT`, `IDEMPOTENCY_CONFLICT`, `CONFLICT`, `INTERNAL`.

## 6. Integritas Transaksi

- **Atomik:** setiap posting (stok, kas, nomor, status) dalam satu fungsi Postgres = satu transaksi. Gagal satu langkah → rollback semua.
- **Konkurensi:** fungsi posting mengunci baris dokumen (`select … for update`) dan baris saldo produk/akun yang terlibat, dengan urutan kunci yang konsisten (berdasarkan `product_id` naik) untuk mencegah deadlock.
- **Idempotensi** (sesuai SRS §8):
  - Header `Idempotency-Key` (UUID v4) wajib untuk semua `POST` aksi posting, pembayaran, serah, refund.
  - Tabel `idempotency_keys(key, user_id, endpoint, request_hash, response, created_at)`, unik `(user_id, key)`.
  - Kunci sama + payload sama → kembalikan `response` tersimpan. Kunci sama + payload berbeda → `409 IDEMPOTENCY_CONFLICT`.
  - Klien membuat kunci saat dialog dibuka dan memakainya ulang untuk retry; tombol dinonaktifkan selama request berjalan.
  - Kedaluwarsa 24 jam (dibersihkan oleh cron `pg_cron`).
- **Transisi status** hanya lewat fungsi; fungsi memeriksa status asal (mis. `confirm` hanya dari `draft`). Konfirmasi ulang dokumen yang sudah `confirmed` tidak membuat mutasi baru (mengembalikan hasil tersimpan atau `INVALID_STATE`).
- **Reservasi**: konfirmasi pesanan mengunci baris saldo produk sebelum mengecek `available`, sehingga dua pesanan bersamaan tidak bisa membuat tersedia negatif (stok 5 kg, dua pesanan @4 kg → hanya satu berhasil).
- **Kas tepat satu kali**: `cash_transactions` memiliki constraint `UNIQUE (source_type, source_id)`. Pembayaran `pending`/`rejected` tidak membuat kas; `batch_costs` dan biaya perolehan penerimaan tidak pernah membuat kas; cetak/cetak ulang nota tidak menulis ke tabel usaha selain `print_logs`.
- **Tanpa penghapusan**: transaksi terkonfirmasi tidak di-DELETE; pembatalan memakai pembalikan, koreksi, atau refund. Barang yang sudah diserahkan hanya kembali ke stok lewat retur yang diverifikasi fisik.
- **Nomor dokumen** tidak pernah dipakai ulang; celah nomor akibat rollback dianggap wajar dan didokumentasikan. Cetak ulang memakai nomor yang sama.

## 7. Data Pribadi & Penyimpanan

- NIK dan no. HP anggota hanya terlihat oleh `admin_kelompok` dan `ketua`. Peran lain melihat NIK termasking (`3201********0001`).
- Ekspor CSV yang memuat data pribadi hanya untuk `admin_kelompok`/`ketua` dan tercatat di audit log (siapa, kapan, filter).
- Kunci `service_role` **hanya** di server (variabel env tanpa prefiks `NEXT_PUBLIC_`), tidak pernah dipakai untuk melayani permintaan pengguna biasa; hanya untuk tugas admin teknis (membuat akun) setelah `requireRole(["admin_teknis"])`.
- Supabase: enkripsi at-rest bawaan; koneksi TLS.
- **Backup & pemulihan** (dikelola `admin_teknis`): backup harian otomatis (database + file bukti Storage), disimpan di lokasi terpisah dengan akses terbatas; minimal **satu uji restore ke lingkungan lain** sebelum serah terima dan dicatat hasilnya; file bukti harus tetap lengkap setelah restore.
- Data DEMO dan data nyata dipisah (lingkungan/basis data berbeda); seed DEMO tidak pernah dijalankan di produksi.
- Retensi: data transaksi disimpan permanen (kebutuhan pembukuan); audit log minimal 2 tahun.

## 8. Unggahan File (Bukti)

- Bucket `proofs` **privat**. Path: `{tabel}/{yyyy}/{mm}/{uuid}.{ext}`, tidak memakai nama file asli.
- Tipe diizinkan: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Cek MIME **dan** magic bytes di server. Maks 5 MB.
- Gambar dikompres/di-*re-encode* di server (menghapus EXIF/GPS).
- Akses via **signed URL** berumur 5 menit, dibuat setelah cek hak akses dokumen induk.
- Policy Storage: hanya peran yang boleh mengelola modul terkait yang boleh upload; tidak ada delete untuk file milik dokumen terposting.

## 9. Keamanan Aplikasi Web

- **CSRF:** Server Actions Next.js memeriksa `Origin`; Route Handler `POST` menolak `Origin` asing. Cookie `SameSite=Lax`.
- **XSS:** tidak memakai `dangerouslySetInnerHTML`. Catatan pengguna dirender sebagai teks.
- **CSV injection:** sel yang diawali `=`, `+`, `-`, `@`, tab, atau CR diberi awalan `'` saat ekspor.
- **Header keamanan** (`next.config` / middleware): `Content-Security-Policy` (default-src 'self'; connect-src ke domain Supabase), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, `Strict-Transport-Security`.
- **Rate limit** endpoint tulis: 60 permintaan/menit per pengguna; ekspor CSV: 10/menit.
- **Dependensi:** `pnpm audit` di CI, Renovate/Dependabot mingguan, lockfile wajib.
- **Rahasia:** `.env*` di `.gitignore`; `.env.example` tanpa nilai. Secret scanning aktif di repositori.
- **Logging:** jangan mencatat kata sandi, token, NIK lengkap, atau isi bukti. Error server dicatat dengan `request_id` yang juga ditampilkan ke pengguna.

## 10. Audit Log

- Tabel `audit_logs(id, at, user_id, action, entity, entity_id, before jsonb, after jsonb, ip, user_agent, request_id)`.
- Dicatat oleh fungsi posting dan trigger pada tabel master. Tidak bisa diubah/dihapus (append-only).
- Kolom minimum mengikuti SRS §9: pelaku, aksi, objek, sebelum/sesudah, **alasan** (wajib untuk koreksi, pembatalan, void), dan waktu.
- Aksi yang wajib dicatat: login gagal/berhasil, perubahan peran/izin, nonaktif akun, semua transisi status, koreksi stok/kas & opname, verifikasi/penolakan pembayaran, refund/pengeluaran/pemasukan lain, retur, cetak ulang, ekspor CSV, backup & restore.
- Hanya `ketua` dan `admin_teknis` yang bisa melihat.

## 11. Checklist Rilis

- [ ] RLS aktif di **semua** tabel (`supabase db lint` + query `pg_tables where rowsecurity = false` kosong).
- [ ] Tidak ada policy INSERT/UPDATE/DELETE pada tabel ledger untuk `authenticated`.
- [ ] Semua fungsi `security definer` memakai `set search_path = ''` dan cek peran.
- [ ] Test otorisasi per peran untuk setiap endpoint lolos (matriks PRD §3.1).
- [ ] Test idempotensi & konkurensi pembayaran/serah/posting lolos.
- [ ] **Uji wajib SRS §11** lolos dan buktinya disimpan:
  - [ ] Akses operator: `operator_produksi` tidak dapat mengubah pembayaran/kas (UI, API, dan RPC).
  - [ ] Konfirmasi penerimaan/batch dua kali → hanya satu perubahan stok.
  - [ ] Stok 5 kg, dua pesanan @4 kg → hanya satu pesanan bisa dikonfirmasi.
  - [ ] Bayar dua kali dengan kunci sama → satu pembayaran dan satu kas.
  - [ ] HPP dengan output nol → pesan "data belum cukup"; tidak terjadi pembagian nol.
  - [ ] Cetak ulang nota → nomor sama, kas tidak berubah; backup bisa dipulihkan.
- [ ] Constraint `UNIQUE (source_type, source_id)` pada `cash_transactions` aktif; biaya batch tidak membuat kas.
- [ ] Pengaju ≠ penyetuju untuk koreksi stok/kas ditegakkan di database.
- [ ] Pendaftaran publik nonaktif; kata sandi bocor ditolak.
- [ ] `service_role` tidak ada di bundel klien (cek `grep` hasil build).
- [ ] Header keamanan terpasang (cek securityheaders / Mozilla Observatory).
- [ ] Bucket Storage privat; signed URL kedaluwarsa.
- [ ] Ekspor CSV aman dari injection.
- [ ] Backup harian berjalan; satu uji restore ke lingkungan lain berhasil dan file bukti lengkap.
- [ ] Seed DEMO tidak ada di basis data nyata.
- [ ] `pnpm audit` tanpa temuan high/critical.

## 12. Pelaporan Kerentanan

Laporkan ke pengelola repositori secara privat (bukan issue publik). Sertakan langkah reproduksi. Target respons 3 hari kerja.
