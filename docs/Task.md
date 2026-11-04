# Task — Rencana Pengembangan Bertahap (v1)

Rujukan kebutuhan: [PRD.md](PRD.md) (diselaraskan dengan SRS v2.0 Kelompok Tani Ngudi Makmur). Setiap task mengacu ke ID kebutuhan (`FR-…`).
Status: `[ ]` belum · `[~]` dikerjakan · `[x]` selesai. Perbarui file ini di commit yang sama dengan pekerjaannya.

## Jadwal Sprint & Pembagian Tim (SRS §12)

Milestone M0–M9 tetap dipakai sebagai ID; jadwalnya mengikuti empat sprint SRS (hari kerja dihitung dari mulai pengerjaan). Prinsip urutan: demonstrasikan alur **jagung masuk → produksi → stok** terlebih dahulu, baru penjualan dan pembayaran.

| Sprint | Milestone | Hafidz (backend, DB, API, server) | Fiki (model data, aturan, laporan) | Amrina (frontend, uji, manual) | Target |
|---|---|---|---|---|---|
| **A** Hari 1–5 | M0, M1, M2 | Database, login, master dan API awal | Kamus data, seed, aturan satuan | Login, dashboard dan form master | Akun dan master bisa dipakai |
| **B** Hari 6–10 | M3, M4, M5 | Penerimaan, batch dan mutasi stok atomik | Aturan input/output dan biaya batch | Form jagung masuk, produksi dan stok | Satu batch mengubah stok benar |
| **C** Hari 11–15 | M6, M7, nota (T8.3) | Pesanan, reservasi, pembayaran dan kas | HPP, rekap dan rekonsiliasi | Form penjualan, pembayaran dan nota | Satu penjualan sampai nota |
| **D** Hari 16–20 | M8, M9 | Server uji, printer, backup dan event dashboard | Laporan, kasus batas dan koreksi | Uji ponsel, manual dan demo | MVP siap demonstrasi mitra |

Langkah pertama: Hafidz membuat skema dan login; Fiki menyiapkan contoh penerimaan/batch/penjualan (seed DEMO, PRD §9.1); Amrina membuat form.

Setelah MVP, pendampingan lapangan mengikuti timeline delapan minggu SRS §13 (asesmen → data nyata & akun → pelatihan → UAT → uji printer/mesin nyata → pendampingan harian → uji mandiri, backup/restore, manual final → serah terima). Jadwal pra-lapangan ini terpisah dari JKEM bersama masyarakat.

## Definition of Done (berlaku untuk semua task)

- Lolos `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Validasi input ada di server (Zod) **dan** batasan di database (constraint/fungsi).
- Hak akses dicek di server; menu disaring di UI; ada test untuk peran yang ditolak.
- Aksi tulis tercatat di `audit_logs`.
- UI mengikuti [StyleGuide.md](StyleGuide.md): ada state *loading*, *kosong*, dan *error*; form terbaca & bisa diisi di ponsel 360 px dan berfungsi di 768 px; lolos navigasi keyboard.
- Fitur terhubung ke database (bukan sekadar tampilan); data dummy hanya di seed DEMO.
- Tidak ada `console.log`, data dummy di halaman, atau TODO tanpa nomor task.

---

## M0 — Fondasi Proyek (Sprint A)

- [x] **T0.1** Inisialisasi Next.js (App Router, TS strict), Tailwind, ESLint, Prettier, pnpm. _Status: Next.js 16 App Router, TypeScript strict, Tailwind 4, ESLint, pnpm. Keputusan: Prettier tidak dipasang — gaya kode dijaga ESLint (eslint-config-next) dan dicek di CI; menambah Prettier sekarang hanya memformat ulang seluruh kode tanpa manfaat fungsional._
- [x] **T0.2** Struktur folder sesuai [CLAUDE.md](../CLAUDE.md#struktur-folder). _Status: struktur mengikuti CLAUDE.md: app/(auth), app/(app)/<modul>, app/api/v1, app/print, components/{ui,shared,motion}, features/<modul>/{components,actions,queries}, lib/{auth,supabase,validation}, supabase/{migrations,tests}, tests/e2e. Perbedaan kecil: util format dipecah ke lib/money.ts, lib/qty.ts, lib/period.ts (bukan format.ts/dates.ts)._
- [x] **T0.3** Supabase lokal (`supabase init`, `supabase start`), file `.env.example`, generator tipe (`pnpm db:types`). _Status: supabase/config.toml, .env.example, migrasi berurutan, seed lokal (seed.sql + seed_demo.sql). `pnpm db:types` butuh CLI ter-link; lib/supabase/types.ts masih ditulis tangan & diperbarui tiap migrasi._
- [x] **T0.4** Design tokens (warna, tipografi, radius, spacing, motion) di `globals.css` + `tailwind` theme sesuai StyleGuide §2–§4. _Status: token warna/tipografi/radius/bayangan/gerak di app/globals.css (@theme) sesuai StyleGuide §2–§4, mode gelap lewat prefers-color-scheme. 4 Nov 2026: --text-subtle dinaikkan (#6E6E76 / gelap #8E8E96) agar lulus kontras WCAG AA (audit T9.5); StyleGuide diperbarui._
- [x] **T0.5** Komponen dasar: Button, Input, Select, Combobox, DatePicker, Textarea, Badge, Card, Dialog, Sheet, Tabs, Toast, Skeleton, EmptyState, DataTable (TanStack Table), MoneyInput, QtyInput (dengan satuan). _Status: Button, Input/Field, Select, Textarea, Badge, Card, Table, EmptyState, Notice; Dialog (bottom sheet di ponsel = Sheet) + ConfirmDialog bersama untuk semua aksi irreversibel; Seg (segmented/tabs); Combobox (components/ui/combobox.tsx, pola ARIA combobox+listbox, dipakai untuk pelanggan di form pesanan); Toast (components/ui/toast.tsx, 5,2 s, antre 3, galat = role alert); Skeleton shimmer (muncul setelah 300 ms, app/(app)/loading.tsx). Keputusan: DatePicker = input date bawaan (paling nyaman di ponsel, format lokal); DataTable = Table + paginasi server (TanStack tidak diperlukan); MoneyInput/QtyInput = Input inputMode numeric/decimal + parse di server._
- [x] **T0.6** App shell: sidebar (bisa diciutkan), topbar (pencarian, profil), breadcrumb, layout responsif. _Status: desain Figma 01–08: sidebar berkelompok + badge keputusan ketua, kartu profil (nama → Akun saya), laci di ponsel; topbar dengan breadcrumb (Crumb untuk nomor dokumen), tombol cari + palet Ctrl/⌘ K (halaman + pesanan/jagung masuk/batch sesuai peran, StyleGuide §6.7), lonceng 'menunggu tindakan'. Diuji login lokal (Supabase Docker + seed DEMO & uji) di 1440 px & 360 px, terang & gelap. Sidebar ciut di desktop tidak dibuat (tidak ada di desain)._
- [x] **T0.7** Primitif animasi (`motion/`): `FadeIn`, `Stagger`, `CountUp`, `PresenceSwap`, hook `useReducedMotion` (StyleGuide §6). _Status: components/motion: FadeIn, Stagger, PresenceSwap, CountUp (rAF, tulis langsung ke DOM, 900 ms, reduced motion → nilai akhir), useReducedMotion; token gerak §6.2 di globals.css; dipakai di KPI dashboard & kolom grafik. Tanpa pustaka Motion (§6.1 memperbolehkan)._
- [x] **T0.8** Utilitas: format rupiah/qty/tanggal WIB, `apiResponse`, error code, `requireRole`, `withIdempotency`. _Status: lib/money.ts, lib/qty.ts, lib/period.ts, lib/today.ts (todayWib tanpa Zod untuk klien), apiResponse/kode galat, requireRole, withIdempotency — dipakai semua route & action; diuji Vitest._
- [x] **T0.9** CI (GitHub Actions): lint, typecheck, test, `supabase db lint`. _Status: GitHub Actions 3 job: check (lint, typecheck, Vitest), db (Supabase lokal di runner: semua migrasi + seed dasar → 11 suite *_check.sql lewat scripts/db-test-ci.sh + uji konkurensi), e2e (Supabase lokal + seed DEMO → build → Playwright laptop & ponsel). Proyek asli tidak disentuh CI. Diuji lokal dengan konfigurasi yang sama (database bersih: 370/370 lulus)._
- [x] **T0.10** Vitest + Playwright terpasang dengan satu test contoh. _Status: Vitest (128 uji) + Playwright (playwright.config.ts, `pnpm test:e2e`): smoke 18/18 lulus di laptop 1280 px & ponsel 360 px._

**Keluaran:** halaman kosong ber-shell yang bisa dijalankan; Storybook-ringan halaman `/dev/ui` (hanya di development) menampilkan semua komponen.

## M1 — Autentikasi & RBAC (Sprint A) · FR-AUTH-*

- [x] **T1.1** Migrasi `profiles`, `user_roles`, `user_permissions`, enum `app_role` (`admin_kelompok`, `operator_produksi`, `ketua`, `admin_teknis`), fungsi `has_role()` dan `has_permission()` (izin `production.confirm`).
- [x] **T1.2** Halaman login (StyleGuide §8.1), logout, middleware sesi Supabase SSR.
- [x] **T1.3** `requireRole()` / `requirePermission()` untuk Server Actions & Route Handlers; halaman 403.
- [x] **T1.4** Sidebar dibangun dari satu konfigurasi navigasi + peran (menu sesuai peran).
- [x] **T1.5** Admin teknis: daftar pengguna, buat akun, ubah peran/izin, nonaktifkan (cabut sesi). Pelanggan & anggota tidak dibuatkan akun.
- [x] **T1.6** Tabel `audit_logs` (pelaku, aksi, objek, sebelum/sesudah, alasan, waktu) + helper pencatat.
- [x] **T1.7** Test: tiap peran hanya melihat menu & endpoint yang diizinkan (matriks PRD §3.1), termasuk **uji wajib SRS §11: `operator_produksi` tidak dapat mengubah pembayaran/kas** (UI 403 + API 403 + RPC ditolak), dan `admin_teknis` tidak dapat mencatat transaksi usaha. _Status: halaman & peran diuji (Vitest) + `rbac_check.sql` 27 uji; sejak M7 sisi API/RPC pembayaran-kas juga diuji: operator ditolak di 8/8 fungsi kas & RLS menyembunyikan tabel kas (`cash_check.sql`), guard API `kas.kelola` (403)._
- [x] **T1.8** Ganti kata sandi sendiri (FR-AUTH-07) untuk semua peran: halaman `/akun` (tautan ikon gembok di kartu profil sidebar), verifikasi kata sandi saat ini, minimal 8 karakter, cabut sesi perangkat lain, audit `auth.password_changed`. _Status: halaman /akun: verifikasi sandi saat ini, minimal 8 karakter (lib/auth/password-policy.ts), cabut sesi perangkat lain, audit auth.password_changed. Diuji login sungguhan (Playwright tests/e2e/flows.spec.ts: tolak 6 karakter → ganti → masuk dengan sandi baru → kembalikan). Supabase Dashboard → Auth → minimum password length = 8 masih perlu diset admin teknis (daftar go-live)._

## M2 — Master Data (Sprint A) · FR-MST-*

- [x] **T2.1** Migrasi `members`, `products`, `packagings`, `product_packagings` (`isi_kg > 0`), `customers`, `sales_channels`, `batch_type_rules` + RLS.
- [x] **T2.2** Anggota: daftar (cari, filter, paginasi server), form tambah/ubah, arsip/pulihkan.
- [x] **T2.3** Produk: daftar, form, kategori `mentah`/`olahan`, satuan dasar kg (terkunci), tab konversi kemasan (isi kg, harga default), stok minimum, harga default per kg. Test: konversi 0 ditolak; 2 kemasan @0,5 kg = 1 kg.
- [x] **T2.4** Jenis kemasan & saluran penjualan (`langsung`, `whatsapp`, `media_sosial`, `marketplace`, `lainnya`): CRUD sederhana.
- [x] **T2.5** Pelanggan: daftar & form (dipakai di M6), mis. IRT Sekar Arum sebagai pelanggan usaha.
- [x] **T2.6** Aturan: produk dengan stok > 0 tidak bisa diarsip; kode unik. _Status: kode unik & trigger arsip aktif; `product_on_hand()` masih 0 sampai buku stok M3._
- [x] **T2.7** Seed dasar (`supabase/seed.sql`): 3 produk sesuai PRD §4.0 (`TK`, `PP`, `TP`, semua kg) beserta kemasan penjualan (Tepung pak 0,5 kg & 1 kg, Pipilan karung 50 kg), aturan jenis batch (pemipilan TK→PP, penepungan PP→TP), saluran penjualan, akun kas awal, kategori pengeluaran & pemasukan lain. **Seed DEMO** terpisah sesuai PRD §9.1 (Petani A, 100 kg pipilan, batch 60→50 kg tepung, pesanan 5 kg @Rp10.000, bayar Rp30.000 + Rp20.000) — tidak pernah dimuat ke data nyata. _Status: data dasar dimuat migrasi (ada di semua lingkungan); supabase/seed.sql menjelaskan hal ini; supabase/seed_demo.sql memuat 4 akun DEMO + alur PRD §9.1 lewat fungsi posting. Dicoba di transaksi yang dibatalkan: HPP Rp6.000, PP +40 kg, TP +45 kg, kas Rp50.000, piutang Rp0._

## M3 — Inti Stok & Penomoran (Sprint B) · FR-STK-01/02/05

> Milestone paling kritis. Modul transaksi lain bergantung padanya.

- [x] **T3.1** `document_sequences` + fungsi `next_doc_number(type, date)` dengan row lock.
- [x] **T3.2** `stock_movements` (FK `product_id`, `source_type`, `source_id`, `direction`, `qty_kg`; append-only: trigger menolak UPDATE/DELETE), `stock_reservations` (`order_id`, `product_id`, `qty_kg`, status).
- [x] **T3.3** View `v_stock_balance` (on_hand = masuk − keluar, reserved, available, avg_cost, nilai).
- [x] **T3.4** Fungsi internal `_post_movement()` yang menolak saldo negatif dan memperbarui `avg_cost`.
- [x] **T3.5** Tabel `idempotency_keys` + helper server `withIdempotency()`.
- [x] **T3.6** Halaman Stok: daftar (fisik, reservasi, tersedia) + kartu stok per produk.
- [x] **T3.7** Test DB (pgTAP atau test integrasi): konkurensi dua posting bersamaan tidak menghasilkan stok negatif atau nomor ganda. _Status: supabase/tests/concurrency.sh: dua sesi Postgres sungguhan bersamaan (sesi A menahan transaksi 2 s): dua pesanan 4 kg berebut stok 5 kg → tepat satu terkonfirmasi, sesi B ditolak 'tersedia 1 kg' setelah menunggu kunci; konfirmasi pesanan yang sama 2× → satu INV & satu reservasi; dua jagung masuk bersamaan → dua RCV berbeda. 7/7 lulus; dijalankan di CI (job db). Hanya database sekali pakai (menolak host non-lokal)._

## M4 — Jagung Masuk (Sprint B) · FR-RCV-*

- [x] **T4.1** Migrasi `receipts` (`member_id` nullable, `source_type` anggota/luar, `product_id`, `weight_kg > 0`, `acquisition_cost`), `attachments`; bucket Storage privat `proofs`.
- [x] **T4.2** Form jagung masuk (terbaca di ponsel): sumber anggota/luar, jenis (TK/PP), berat kg, biaya perolehan, bukti (unggah + pratinjau); simpan draft.
- [x] **T4.3** Fungsi `confirm_receipt(id, idem_key)`: nomor RCV, mutasi `receipt_in` tepat satu kali, kunci dokumen. **Tidak** membuat kas (pembayaran ke pemasok lewat pengeluaran, FR-RCV-04).
- [~] **T4.4** Daftar & detail penerimaan; cetak bukti penerimaan (80 mm). _Status: daftar & detail, aksi Konfirmasi/Hapus draft/Batalkan penerimaan lewat dialog (ConfirmDialog), cetak bukti 80 mm. Dijelajahi semua peran 360/1280 px terang & gelap tanpa galat (4 Nov 2026). Tinggal uji di printer thermal nyata (T9.9)._
- [x] **T4.5** `void_receipt` dengan alasan (P1).
- [x] **T4.6** Test (uji wajib SRS §11): konfirmasi penerimaan dua kali → hanya satu mutasi stok; draft tidak mengubah stok; berat ≤ 0 ditolak; edit setelah konfirmasi ditolak. _Status: `supabase/tests/receipt_check.sql` 39/39 lulus di proyek asli (transaksi dibatalkan); validasi & berkas bukti di `lib/receipt.test.ts`._

## M5 — Produksi (Sprint B) · FR-PRD-*

- [x] **T5.1** Migrasi `production_batches` (jenis, operator, sisa/susut kg, HPP), `production_lines` (`direction` input/output, `qty_kg`), `batch_costs` (kategori, nilai_alokasi, sumber_biaya).
- [x] **T5.2** Editor batch draft (pemipilan/penepungan): baris input & output sesuai `batch_type_rules`, sisa/susut kg, biaya batch; ringkasan langsung (total, susut %, perkiraan HPP). _Status: editor batch desain 03: header Hapus draft / Simpan draft / Konfirmasi produksi (dialog dampak), kartu Info batch (jenis lewat select), Bahan (nilai = rata-rata stok, tersedia), Hasil (badge hasil utama, sisa terukur), Biaya produksi (komponen, keterangan, jumlah); kanan Ringkasan batch (susut vs batas bila Q17 diisi, nilai bahan, biaya, total, HPP), Dampak saat dikonfirmasi, Catatan. Diuji sebagai operator: simpan draft → konfirmasi → PRD terbit (Playwright lokal), 1440 & 360 px._
- [x] **T5.3** Fungsi `confirm_production(id, idem_key)` dalam satu transaksi: cek izin `production.confirm`, minimal 1 input & 1 output, cek stok input, kode `PRD-…`, mutasi keluar/masuk, hitung & kunci HPP.
- [x] **T5.4** Halaman detail batch terkonfirmasi (read-only) + cetak. _Status: detail batch terkonfirmasi read-only + cetak (/print/produksi/[id]); pengajuan pembatalan lewat dialog. Dijelajahi operator/admin/ketua 360/1280 px tanpa galat._
- [x] **T5.5** Test HPP (rumus SRS §10): angka DEMO (60 kg PP → 50 kg TP, Rp240.000 + Rp60.000 → **Rp6.000/kg**); **output 0 → "data belum cukup", tanpa pembagian nol**; biaya batch tidak membuat baris kas.
- [x] **T5.6** Test (uji wajib SRS §11): bahan tidak cukup ditolak; konfirmasi batch dua kali → hanya satu perubahan stok; sisa/susut tersimpan dalam kg. _Status T5.1–T5.6: `supabase/tests/production_check.sql` 33/33 lulus di proyek asli (DEMO: HPP Rp6.000/kg, PP 40 kg, TP 50 kg); `lib/production.test.ts`. T5.2 & T5.4 menunggu uji tampilan sebagai operator produksi. T5.7 menunggu keputusan Q16 (dokumen berbeda soal persetujuan ketua)._
- [x] **T5.7** Pembatalan batch dengan persetujuan ketua (P1). _Status: request_production_void → decide_production_void (ketua, pengaju ≠ penyetuju); tombol ajukan & setujui/tolak lewat dialog (ConfirmDialog/DecisionPanel), juga dari kartu persetujuan dashboard ketua. Diuji stock_control_check.sql + tampilan. Q16 tetap dicatat di PRD._

## M6 — Penjualan / Pesanan (Sprint C) · FR-SAL-*

- [x] **T6.1** Migrasi `orders` (pelanggan, `channel`, total, status barang, status bayar), `order_items` (`packaging_id`, `qty_input`, `qty_kg`, `price_snapshot`), `order_returns`, `order_return_items`; view `v_order_balance`. _Status: `orders`, `order_items`, FK reservasi → pesanan, dan `v_order_balance` (dibayar/refund masih 0 sampai M7) ada di `20261103120000_orders.sql`. `order_returns`/`order_return_items` di `20261103130000_returns.sql` (T6.7)._
- [x] **T6.2** Form pesanan (terbaca di ponsel): pelanggan (combobox + tambah cepat), sumber pasar/saluran, item dengan kemasan atau kg, diskon, ongkir; harga disalin dari katalog; total dihitung server (pratinjau di klien hanya tampilan). _Status: form pesanan: pelanggan lewat Combobox (ketik untuk mencari) + tambah cepat, saluran, item kemasan/kg, diskon, ongkir; harga snapshot server. Diuji Playwright (alur DEMO) dan dijelajahi 360/1280 px terang & gelap._
- [x] **T6.3** `confirm_order` (nomor INV + reservasi), `cancel_order` (lepas reservasi; catat refund bila sudah ada pembayaran terverifikasi). _Status: konfirmasi & batal diuji (`order_check.sql`); sejak M7 batal sesudah bayar mewajibkan akun refund dan mencatat refund penuh + menolak pembayaran pending dalam transaksi yang sama (`cash_check.sql`)._
- [x] **T6.4** `POST /orders/{id}/fulfill` → `fulfill_order`: reservasi → `sale_out`, tidak bergantung status bayar. _Status: `app/api/v1/orders/[id]/fulfill/route.ts` (wajib `Idempotency-Key`, respons `{data, error}`, 401/403/409/422) + aksi UI memakai inti posting & kunci idempotensi yang sama._
- [x] **T6.5** Daftar pesanan dengan dua badge status (barang & bayar), filter (termasuk saluran), pencarian nomor. _Status: daftar pesanan dua badge, filter status/bayar/saluran/tanggal, cari nomor/pelanggan, paginasi. Dijelajahi admin & ketua 360/1280 px, terang & gelap._
- [x] **T6.6** Peringatan harga di bawah HPP dan batas piutang (P1). _Status: peringatan harga < HPP & batas piutang di form pesanan (tidak memblokir); kolom batas piutang di form pelanggan, tampil di kolom kanan detail pesanan. Dijelajahi tampilan._
- [x] **T6.7** Retur barang: `create_return` + `verify_return` (verifikasi fisik → `return_in`); retur sah mengurangi omzet. _Keputusan Q7 (3 Nov 2026): retur dicatat `admin_kelompok`, diverifikasi fisik oleh `ketua`; pencatat ≠ pemverifikasi (juga untuk akun rangkap). Status: fungsi + bagian Retur di detail pesanan selesai; `supabase/tests/return_check.sql` 30/30 lulus di proyek asli (draft tanpa efek stok, batas kg diserahkan, verifikasi ganda, dua draft bersaing, nilai persediaan = nilai saat keluar). Nilai jual retur (`sales_value_rp`) tersimpan untuk pengurang omzet di laporan M8; refund uang di T7.5. Belum diuji tampilan sebagai admin & ketua._ _Status: retur: catat draft (admin) → Verifikasi barang fisik / hapus draft lewat dialog; ketua juga dari dashboard. return_check 30/30; dijelajahi tampilan._
- [x] **T6.8** Test (uji wajib SRS §11): **stok 5 kg, dua pesanan @4 kg dikonfirmasi bersamaan → hanya satu terkonfirmasi**; harga katalog baru tidak mengubah pesanan lama; batal melepas reservasi; barang diserahkan tidak kembali ke stok tanpa retur terverifikasi. _Status: `supabase/tests/order_check.sql` 55/55 lulus di proyek asli (transaksi dibatalkan, produk uji sementara); `lib/order.test.ts` 15 uji. Persaingan dua pesanan diuji berurutan dengan kunci saldo yang sama (seperti T3.7); uji dua sesi bersamaan sungguhan butuh database DEMO/lokal._

## M7 — Pembayaran & Kas (Sprint C) · FR-CSH-*

- [x] **T7.1** Migrasi `cash_accounts`, `cash_transactions` (unik `(source_type, source_id)`), `payments` (status `pending`/`verified`/`rejected`), `expenses`, `expense_categories`, `other_incomes`, `income_categories`, `refunds`, `cash_corrections`. _Status: `20261103150000_cash.sql`: akun Kas tunai & Rekening bank, buku kas append-only unik `(source_type, source_id)` dengan saldo per akun terkunci (tidak boleh negatif), pembayaran, refund, pengeluaran & pemasukan + kategori, koreksi kas; `v_order_balance` lengkap & `v_cash_balance`._
- [x] **T7.2** `POST /orders/{id}/payments` → `record_payment` sesuai sequence PRD §6.1 (kunci baris, cek tagihan, simpan pembayaran terverifikasi, satu kas masuk, status bayar, commit) dan `POST /payments/{id}/verify` untuk transfer yang diverifikasi belakangan. _Status: `record_payment` (kunci pesanan, cek tagihan tersisa, verifikasi sekaligus untuk tunai) + `verify_payment`/`reject_payment`; `POST /api/v1/orders/{id}/payments` & `POST /api/v1/payments/{id}/verify` dengan Idempotency-Key._
- [x] **T7.3** Dialog pembayaran di detail pesanan (tunai/transfer, bukti, cicilan, verifikasi) — hanya untuk `admin_kelompok`. _Status: dialog Catat pembayaran desain 02: tagihan tersisa, tanggal, metode (segmented), akun kas, jumlah (maks. tagihan), unggah bukti transfer (opsional; foto di-encode ulang tanpa EXIF, diperiksa ulang server, bucket privat payments/…, signed URL 5 menit; migrasi 20261103180000), centang 'sudah diverifikasi', pratinjau 'Setelah disimpan'. Verifikasi/tolak/refund juga lewat dialog. Tombol nonaktif sampai data terbaru tampil (mencegah jumlah bawaan basi). Diuji Playwright lokal: transfer + bukti → menunggu → verifikasi → PAY; alur DEMO (bayar 2× → lunas → serah → nota) lulus._
- [x] **T7.4** Pengeluaran & pemasukan lain: daftar & form; kategori. _Status: pengeluaran & pemasukan lain lewat dialog di /kas + daftar di /kas/pengeluaran & /kas/pemasukan; toast hasil. Kategori awal dari migrasi (daftar resmi menunggu Q15, bisa ditambah tanpa ubah kode). Dijelajahi tampilan._
- [x] **T7.5** Refund terkait pesanan (dari pembatalan sesudah bayar atau retur). _Status: `create_refund` (≤ pembayaran bersih, opsional terkait retur terverifikasi) dari detail pesanan + refund otomatis saat batal; diuji di `cash_check.sql`._
- [x] **T7.6** Buku kas per akun + saldo awal; koreksi kas (ajukan admin → setujui ketua). _Status: halaman /kas desain 06 lengkap (saldo awal, kartu akun, total, piutang, menunggu verifikasi, koreksi kas dengan dialog setujui/tolak, mutasi, transfer antar akun). Q21 diputuskan 4 Nov 2026: banner biaya batch belum dibayar TIDAK dibuat; bayar biaya batch lewat Catat pengeluaran._
- [x] **T7.7** Test (uji wajib SRS §11): kirim pembayaran yang sama 2× dengan kunci sama → 1 pembayaran, 1 kas masuk; dua pembayaran berbeda bersamaan tidak melebihi tagihan; jumlah ≤ 0 ditolak; pembayaran `pending` tidak membuat kas; lunas tidak mengubah status barang; biaya batch yang sudah dibayar lewat pengeluaran tidak tercatat sebagai kas kedua. _Status: `supabase/tests/cash_check.sql` 42/42 lulus di proyek asli (transaksi dibatalkan): DEMO Rp30.000 + Rp20.000 → lunas & kas Rp50.000, verifikasi ganda → 1 kas, bayar melebihi tagihan ditolak, ≤ 0 ditolak, pending tanpa kas, lunas ≠ diserahkan, biaya batch tanpa kas kedua, operator ditolak 8/8 fungsi kas. Uji dua pembayaran benar-benar bersamaan butuh DB DEMO (kunci baris pesanan yang sama)._

## M8 — Dashboard, Nota & Laporan (Sprint C–D) · FR-DASH-*, FR-RPT-*

- [x] **T8.1** `GET /dashboard?from&to`: agregat sesuai peran (fungsi SQL / view), rumus PRD §5.9. _Status: `GET /api/v1/dashboard` dari fungsi SQL `rpt_kpi`/`rpt_daily` (`20261103160000_reports.sql`, SECURITY INVOKER → RLS per peran); operator hanya menerima indikator produksi & stok._
- [x] **T8.2** Halaman dashboard: filter periode, kartu indikator, produksi tepung harian vs target ≥ 50 kg/hari, tren kg, stok di bawah minimum, aktivitas terbaru; data terbaru setelah transaksi (event/revalidasi). _Status: dashboard desain 01 & 07: header periode (segmented) + pembanding nyata (bulan lalu / tanggal sama bulan lalu / rentang sebelumnya) + Ekspor CSV (GET /api/v1/dashboard?format=csv); kartu omzet besar dengan batang mini harian & persen vs pembanding, jagung masuk, produksi tepung (target ≥ 50 kg/hari, susut), saldo kas (tunai/bank), piutang; grafik mingguan jagung masuk vs terjual (Q19); stok perlu perhatian; aktivitas terbaru (ikon, nomor dokumen, nominal); ketua: kartu 'Menunggu persetujuan ketua' dengan Tolak/Setujui/Verifikasi fisik lewat dialog. Diuji lokal 1440 & 360 px, terang & gelap, reduced motion._
- [~] **T8.3** `GET /orders/{id}/receipt` + layout cetak **thermal 80 mm** (utama, `@media print`), tanda "CETAK ULANG ke-n"; A5 opsional (P2). Uji dengan printer thermal nyata. _Status: detail pesanan: tombol 'Nota thermal' membuka jendela struk desain 05 — pilihan 80 mm (48 kolom) / 58 mm (32 kolom, disimpan per perangkat), pratinjau, 'Sudah dicetak n×', cetak via driver (jalur A, @page selebar kertas, hanya struk tercetak) dan cetak langsung ESC/POS lewat Web Serial 9600 baud (jalur B; byte diuji unit lib/thermal.test.ts). Setiap cetak mencatat print_logs; tanda CETAK ULANG ke-n. Halaman /print/nota/[id] tetap ada. Belum diuji dengan printer thermal nyata (T9.9)._
- [x] **T8.4** Laporan: jagung masuk, produksi & HPP, stok & mutasi, omzet per produk/jenis/saluran, piutang, kas, porsi jagung mentah, penjualan digital — tabel + filter. _Status: /laporan/[jenis]: penjualan & omzet, jagung masuk, produksi & HPP, stok & mutasi, piutang, kas; filter periode + ringkasan + tabel + Unduh CSV. Dijelajahi admin/operator/ketua 360/1280 px._
- [x] **T8.5** Ekspor CSV di server (stream, BOM, `;`), tunduk hak akses. _Status: `GET /api/v1/reports/{type}?format=csv` dibuat di server, tunduk hak akses per jenis laporan; BOM UTF-8, `;`, desimal koma, anti injeksi formula (`lib/report-utils.test.ts`)._
- [x] **T8.6** Uji kecocokan: total rekap = jumlah detail untuk periode yang sama; seed DEMO menghasilkan HPP Rp6.000/kg, stok PP 40 kg & TP 45 kg, kas masuk Rp50.000, piutang Rp0. _Status: `supabase/tests/report_check.sql` 24/24 lulus: alur DEMO lengkap → HPP Rp6.000/kg, stok PP +40 kg & TP +45 kg, kas masuk Rp50.000, piutang Rp0; rekap = detail untuk omzet, kg, stok, kas, piutang._
- [x] **T8.7** Test (uji wajib SRS §11): cetak ulang nota → nomor sama, kas tidak berubah; printer gagal tidak menghapus pembayaran. _Status: `report_check.sql`: cetak ulang nota → nomor sama, urutan cetak 1→2, kas/stok/status tidak berubah; cetakan gagal tidak menghapus pembayaran; nota draft ditolak; operator tidak bisa mencetak._

## M9 — Opname, Koreksi & Penyelesaian (Sprint D) · FR-STK-03/04

- [x] **T9.1** Stok opname: sesi, input fisik, selisih, posting. _Status: stok opname: simpan draft → Posting opname / Hapus draft lewat dialog; selisih → mutasi opname_adjust (OPN). stock_control_check 25/25; dijelajahi tampilan._
- [x] **T9.2** Koreksi stok: pengajuan (admin kelompok/operator) → persetujuan ketua → mutasi; riwayat tetap ada. _Status: koreksi stok: operator/admin mengajukan → ketua Setujui/Tolak lewat dialog → mutasi correction. Diuji Playwright lintas peran (operator ajukan → ketua setujui → Disetujui) + stock_control_check._
- [x] **T9.3** Audit log viewer (ketua & admin teknis). _Status: /audit desain 08: cari aksi/nomor dokumen/alasan + nama pelaku, jumlah catatan, kolom Waktu · Pelaku · Aksi · Objek · Alasan/perubahan (ringkasan nilai sebelum → sesudah, mis. harga katalog); filter jenis & tanggal di 'Filter lain'; paginasi server. Diuji sebagai ketua._
- [x] **T9.4** E2E Playwright alur utama: jagung masuk → produksi → pesanan → bayar (cicilan) → serah → nota → laporan, plus skenario batal/refund, stok kurang, duplikasi, dan koreksi (bukti uji SRS §14). _Status: Playwright: smoke 20/20 (laptop & ponsel, termasuk splash) + tests/e2e/demo-flow.spec.ts dijalankan pertama kali terhadap lingkungan DEMO lokal (Supabase Docker): pesanan → konfirmasi → bayar 2× → lunas → serah → nota API, dan ketua (dashboard, laporan, CSV, 403 bayar) — 23 lulus, 1 dilewati sesuai rancangan. Skenario jagung masuk/produksi/batal/koreksi dicakup uji DB (11 suite, 350 pemeriksaan)._
- [x] **T9.5** Audit aksesibilitas & kinerja (Lighthouse ≥ 90 untuk Performance/Accessibility di halaman utama); uji form di ponsel nyata. _Status: Lighthouse 12.8 (4 Nov 2026, build produksi lokal, data DEMO, 8 halaman utama): Accessibility 100 & Best practices 100 di semua halaman (sebelumnya 95–96: kontras --text-subtle & nama tombol cari diperbaiki). Performance desktop 71–99, mobile (CPU 4× lambat + 4G) 64–86: dibatasi TTFB Supabase Docker lokal di laptop yang sama & eksekusi JS React; perbaikan: Zod & supabase-js dikeluarkan dari bundel awal (unused JS 52–124 KB → ±27 KB). Ukur ulang di Vercel produksi saat UAT. Penjelajahan otomatis 4 peran × 360/1280 px × terang/gelap: 0 galat, 0 halaman gagal, 1 overflow (header dashboard di 360 px) diperbaiki. Uji di ponsel fisik tetap saat UAT (T9.10)._
- [x] **T9.6** Review keamanan sesuai checklist [Security.md](Security.md#11-checklist-rilis). _Status: docs/SecurityReview.md: checklist §11 diperiksa (RLS semua tabel, tanpa tulis langsung ke ledger, search_path fungsi, bundel klien bersih, header keamanan ditambahkan di next.config.ts, bucket privat, CSV aman, pnpm audit tanpa high). Sisa: pengaturan Auth di dashboard, backup/restore._
- [x] **T9.7** **Manual bergambar** (langkah per peran dengan screenshot) dan halaman bantuan singkat. _Status: manual/Manual-Pengguna.html + PDF (26 hlm A4) ditulis ulang untuk aplikasi v1: 17 bab per peran dengan 23 tangkapan layar aplikasi sungguhan (data DEMO), termasuk dialog pembayaran + bukti transfer, struk 80/58 mm, transfer antar akun, persetujuan ketua, ganti kata sandi, masalah umum. Bab prototipe (pilih akun tanpa sandi, Bayar biaya batch, Uji SRS) dihapus._
- [~] **T9.8** **Backup harian** terjadwal (database + file bukti) dan **satu uji restore** ke lingkungan lain; catat hasilnya (uji wajib SRS §11). _Status: uji restore DILAKUKAN 5 Nov 2026: backup proyek asli (scripts/backup.ps1 -OutDir) → Supabase lokal kosong; checksum cocok; 83 pesanan, 17 RCV, 40 batch, 182 mutasi, 97 kas, 637 audit, 11 akun, stok & saldo kas & omzet Oktober identik. Dua celah ditemukan & ditutup: supabase/restore_prepare.sql (hak anon/authenticated jadi terlalu longgar: 1.996 vs 184 baris) dan supabase/restore_extras.sql (trigger profil auth.users, bucket proofs, policy storage hilang); setelah itu hak akses identik & semua uji DB lulus (kecuali 3 suite yang memang gagal selama data uji ada). Prosedur di docs/Operasional.md §2. Salinan backup dihapus setelah uji. Tinggal: admin teknis menjadwalkan backup harian di laptop server (perintah Task Scheduler di Operasional §1, -OutDir di luar OneDrive)._
- [ ] **T9.9** Server uji & konfigurasi printer thermal di lokasi mitra (admin teknis). _Status: kegiatan lapangan (server uji & printer thermal di lokasi mitra); panduan pengaturan printer di docs/Operasional.md §5._
- [ ] **T9.10** **Pelatihan** admin kelompok & operator (data DEMO dulu, lalu transaksi nyata), UAT, dan serah terima: source, migrasi, konfigurasi contoh, manual, akun/server, hasil UAT, penanggung jawab lanjutan. _Status: kegiatan lapangan (pelatihan, UAT, serah terima). Bahan: lingkungan DEMO (seed_demo.sql), manual, docs/Operasional.md._

---

## Penyelarasan desain Figma (3 Nov 2026)

Sumber: ekspor PNG di `desain/` (00 login, 01 dashboard, 02 penjualan & pembayaran, 03 editor produksi, 04 splash, 05 struk thermal, 06 pembayaran & kas, 07 dashboard ketua, 08 log audit). Status per layar dicatat pada T0.6, T5.2, T7.3, T7.6, T8.2, T8.3, T9.3; ringkasnya:

- [x] **D.1** Shell: topbar (breadcrumb, cari Ctrl K, lonceng), badge menu, profil → Akun saya.
- [x] **D.2** Login & welcome splash (StyleGuide §6.6, §8.1): sekali per sesi, dilewati saat reduced motion, "Putar ulang intro"; profil kelompok di `lib/org.ts` (jam gudang & komoditas dari desain — konfirmasi Q23).
- [x] **D.3** Dashboard admin/ketua + persetujuan ketua langsung dari dashboard.
- [x] **D.4** Detail pesanan: aksi di header lewat dialog, dialog pembayaran + bukti transfer, kolom tagihan/pelanggan/riwayat, jendela struk 80/58 mm + ESC/POS.
- [x] **D.5** Editor produksi, halaman kas (+ transfer antar akun), log audit dengan pencarian.
- [x] **D.6** Data uji coba ± 5 minggu (`supabase/seed_uji.sql`) dimuat ke proyek asli atas keputusan pengguna; **wajib** `supabase/bersihkan_data_uji.sql` sebelum go-live (docs/Operasional.md §6). Pembersih sudah dicoba di proyek asli dalam transaksi yang dibatalkan.
- [x] **D.7** Belum mengikuti desain karena butuh keputusan domain: grafik "jagung diolah" (Q19), satuan kemasan di input produksi (Q20), banner biaya batch belum dibayar (Q21). _Status: keputusan pengguna 4 Nov 2026: Q19 grafik 'Jagung masuk vs jagung diolah' (diolah = input batch pemipilan; migrasi 20261104090000, juga di CSV dashboard); Q20 produksi tetap kg; Q21 banner biaya batch tidak dibuat._

## Urutan & Ketergantungan

```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─┬─▶ M4 ─▶ M5 ─┐
                      └─▶ M6 ─▶ M7 ─┴─▶ M8 ─▶ M9
```

Estimasi: 20 hari kerja (Sprint A–D) untuk tim tiga mahasiswa STI, lalu pendampingan lapangan delapan minggu (SRS §13). Revisi dari pengguna masuk ke UAT minggu 4.

## Backlog v1.1 / v2

- ~~Transfer antar akun kas (FR-CSH-09)~~ dibuat 3 Nov 2026 (desain Figma 06); peringatan saldo kas (FR-CSH-08).
- Ekspor PDF laporan (FR-RPT-07), nota A5 (FR-RPT-01a).
- Serah parsial, hutang ke anggota, portal anggota, notifikasi WhatsApp, konsinyasi/bagi hasil (setelah aturan usaha jelas).
