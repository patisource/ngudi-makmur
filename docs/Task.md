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

- [~] **T0.1** Inisialisasi Next.js (App Router, TS strict), Tailwind, ESLint, Prettier, pnpm.
- [ ] **T0.2** Struktur folder sesuai [CLAUDE.md](../CLAUDE.md#struktur-folder).
- [~] **T0.3** Supabase lokal (`supabase init`, `supabase start`), file `.env.example`, generator tipe (`pnpm db:types`).
- [~] **T0.4** Design tokens (warna, tipografi, radius, spacing, motion) di `globals.css` + `tailwind` theme sesuai StyleGuide §2–§4.
- [~] **T0.5** Komponen dasar: Button, Input, Select, Combobox, DatePicker, Textarea, Badge, Card, Dialog, Sheet, Tabs, Toast, Skeleton, EmptyState, DataTable (TanStack Table), MoneyInput, QtyInput (dengan satuan).
- [~] **T0.6** App shell: sidebar (bisa diciutkan), topbar (pencarian, profil), breadcrumb, layout responsif.
- [ ] **T0.7** Primitif animasi (`motion/`): `FadeIn`, `Stagger`, `CountUp`, `PresenceSwap`, hook `useReducedMotion` (StyleGuide §6).
- [~] **T0.8** Utilitas: format rupiah/qty/tanggal WIB, `apiResponse`, error code, `requireRole`, `withIdempotency`.
- [ ] **T0.9** CI (GitHub Actions): lint, typecheck, test, `supabase db lint`.
- [~] **T0.10** Vitest + Playwright terpasang dengan satu test contoh.

**Keluaran:** halaman kosong ber-shell yang bisa dijalankan; Storybook-ringan halaman `/dev/ui` (hanya di development) menampilkan semua komponen.

## M1 — Autentikasi & RBAC (Sprint A) · FR-AUTH-*

- [x] **T1.1** Migrasi `profiles`, `user_roles`, `user_permissions`, enum `app_role` (`admin_kelompok`, `operator_produksi`, `ketua`, `admin_teknis`), fungsi `has_role()` dan `has_permission()` (izin `production.confirm`).
- [x] **T1.2** Halaman login (StyleGuide §8.1), logout, middleware sesi Supabase SSR.
- [x] **T1.3** `requireRole()` / `requirePermission()` untuk Server Actions & Route Handlers; halaman 403.
- [x] **T1.4** Sidebar dibangun dari satu konfigurasi navigasi + peran (menu sesuai peran).
- [x] **T1.5** Admin teknis: daftar pengguna, buat akun, ubah peran/izin, nonaktifkan (cabut sesi). Pelanggan & anggota tidak dibuatkan akun.
- [x] **T1.6** Tabel `audit_logs` (pelaku, aksi, objek, sebelum/sesudah, alasan, waktu) + helper pencatat.
- [x] **T1.7** Test: tiap peran hanya melihat menu & endpoint yang diizinkan (matriks PRD §3.1), termasuk **uji wajib SRS §11: `operator_produksi` tidak dapat mengubah pembayaran/kas** (UI 403 + API 403 + RPC ditolak), dan `admin_teknis` tidak dapat mencatat transaksi usaha. _Status: halaman & peran diuji (Vitest 47 uji + `supabase/tests/rbac_check.sql` 27 uji); sisi API/RPC pembayaran-kas diuji ulang saat tabelnya dibuat di M7._

## M2 — Master Data (Sprint A) · FR-MST-*

- [x] **T2.1** Migrasi `members`, `products`, `packagings`, `product_packagings` (`isi_kg > 0`), `customers`, `sales_channels`, `batch_type_rules` + RLS.
- [x] **T2.2** Anggota: daftar (cari, filter, paginasi server), form tambah/ubah, arsip/pulihkan.
- [x] **T2.3** Produk: daftar, form, kategori `mentah`/`olahan`, satuan dasar kg (terkunci), tab konversi kemasan (isi kg, harga default), stok minimum, harga default per kg. Test: konversi 0 ditolak; 2 kemasan @0,5 kg = 1 kg.
- [x] **T2.4** Jenis kemasan & saluran penjualan (`langsung`, `whatsapp`, `media_sosial`, `marketplace`, `lainnya`): CRUD sederhana.
- [x] **T2.5** Pelanggan: daftar & form (dipakai di M6), mis. IRT Sekar Arum sebagai pelanggan usaha.
- [x] **T2.6** Aturan: produk dengan stok > 0 tidak bisa diarsip; kode unik. _Status: kode unik & trigger arsip aktif; `product_on_hand()` masih 0 sampai buku stok M3._
- [~] **T2.7** Seed dasar (`supabase/seed.sql`): 3 produk sesuai PRD §4.0 (`TK`, `PP`, `TP`, semua kg) beserta kemasan penjualan (Tepung pak 0,5 kg & 1 kg, Pipilan karung 50 kg), aturan jenis batch (pemipilan TK→PP, penepungan PP→TP), saluran penjualan, akun kas awal, kategori pengeluaran & pemasukan lain. **Seed DEMO** terpisah sesuai PRD §9.1 (Petani A, 100 kg pipilan, batch 60→50 kg tepung, pesanan 5 kg @Rp10.000, bayar Rp30.000 + Rp20.000) — tidak pernah dimuat ke data nyata.

## M3 — Inti Stok & Penomoran (Sprint B) · FR-STK-01/02/05

> Milestone paling kritis. Modul transaksi lain bergantung padanya.

- [x] **T3.1** `document_sequences` + fungsi `next_doc_number(type, date)` dengan row lock.
- [x] **T3.2** `stock_movements` (FK `product_id`, `source_type`, `source_id`, `direction`, `qty_kg`; append-only: trigger menolak UPDATE/DELETE), `stock_reservations` (`order_id`, `product_id`, `qty_kg`, status).
- [x] **T3.3** View `v_stock_balance` (on_hand = masuk − keluar, reserved, available, avg_cost, nilai).
- [x] **T3.4** Fungsi internal `_post_movement()` yang menolak saldo negatif dan memperbarui `avg_cost`.
- [x] **T3.5** Tabel `idempotency_keys` + helper server `withIdempotency()`.
- [x] **T3.6** Halaman Stok: daftar (fisik, reservasi, tersedia) + kartu stok per produk.
- [~] **T3.7** Test DB (pgTAP atau test integrasi): konkurensi dua posting bersamaan tidak menghasilkan stok negatif atau nomor ganda. _Status: logika kunci & penolakan diuji berurutan (`supabase/tests/stock_check.sql` 28/28). Uji dua sesi bersamaan sungguhan perlu database DEMO/lokal (buku mutasi append-only, jadi tidak dijalankan di proyek data nyata)._

## M4 — Jagung Masuk (Sprint B) · FR-RCV-*

- [x] **T4.1** Migrasi `receipts` (`member_id` nullable, `source_type` anggota/luar, `product_id`, `weight_kg > 0`, `acquisition_cost`), `attachments`; bucket Storage privat `proofs`.
- [x] **T4.2** Form jagung masuk (terbaca di ponsel): sumber anggota/luar, jenis (TK/PP), berat kg, biaya perolehan, bukti (unggah + pratinjau); simpan draft.
- [x] **T4.3** Fungsi `confirm_receipt(id, idem_key)`: nomor RCV, mutasi `receipt_in` tepat satu kali, kunci dokumen. **Tidak** membuat kas (pembayaran ke pemasok lewat pengeluaran, FR-RCV-04).
- [~] **T4.4** Daftar & detail penerimaan; cetak bukti penerimaan (80 mm). _Status: diuji di Vercel sebagai admin kelompok (360/768/1280 px, terang & gelap): simpan draft + unggah bukti + pratinjau struk + hapus draft. Belum dicoba di printer thermal nyata (T4.4 tetap ~)._
- [x] **T4.5** `void_receipt` dengan alasan (P1).
- [x] **T4.6** Test (uji wajib SRS §11): konfirmasi penerimaan dua kali → hanya satu mutasi stok; draft tidak mengubah stok; berat ≤ 0 ditolak; edit setelah konfirmasi ditolak. _Status: `supabase/tests/receipt_check.sql` 39/39 lulus di proyek asli (transaksi dibatalkan); validasi & berkas bukti di `lib/receipt.test.ts`._

## M5 — Produksi (Sprint B) · FR-PRD-*

- [x] **T5.1** Migrasi `production_batches` (jenis, operator, sisa/susut kg, HPP), `production_lines` (`direction` input/output, `qty_kg`), `batch_costs` (kategori, nilai_alokasi, sumber_biaya).
- [~] **T5.2** Editor batch draft (pemipilan/penepungan): baris input & output sesuai `batch_type_rules`, sisa/susut kg, biaya batch; ringkasan langsung (total, susut %, perkiraan HPP).
- [x] **T5.3** Fungsi `confirm_production(id, idem_key)` dalam satu transaksi: cek izin `production.confirm`, minimal 1 input & 1 output, cek stok input, kode `PRD-…`, mutasi keluar/masuk, hitung & kunci HPP.
- [~] **T5.4** Halaman detail batch terkonfirmasi (read-only) + cetak.
- [x] **T5.5** Test HPP (rumus SRS §10): angka DEMO (60 kg PP → 50 kg TP, Rp240.000 + Rp60.000 → **Rp6.000/kg**); **output 0 → "data belum cukup", tanpa pembagian nol**; biaya batch tidak membuat baris kas.
- [x] **T5.6** Test (uji wajib SRS §11): bahan tidak cukup ditolak; konfirmasi batch dua kali → hanya satu perubahan stok; sisa/susut tersimpan dalam kg. _Status T5.1–T5.6: `supabase/tests/production_check.sql` 33/33 lulus di proyek asli (DEMO: HPP Rp6.000/kg, PP 40 kg, TP 50 kg); `lib/production.test.ts`. T5.2 & T5.4 menunggu uji tampilan sebagai operator produksi. T5.7 menunggu keputusan Q16 (dokumen berbeda soal persetujuan ketua)._
- [ ] **T5.7** Pembatalan batch dengan persetujuan ketua (P1).

## M6 — Penjualan / Pesanan (Sprint C) · FR-SAL-*

- [~] **T6.1** Migrasi `orders` (pelanggan, `channel`, total, status barang, status bayar), `order_items` (`packaging_id`, `qty_input`, `qty_kg`, `price_snapshot`), `order_returns`, `order_return_items`; view `v_order_balance`. _Status: `orders`, `order_items`, FK reservasi → pesanan, dan `v_order_balance` (dibayar/refund masih 0 sampai M7) ada di `20261103120000_orders.sql`. `order_returns`/`order_return_items` dibuat bersama T6.7._
- [~] **T6.2** Form pesanan (terbaca di ponsel): pelanggan (combobox + tambah cepat), sumber pasar/saluran, item dengan kemasan atau kg, diskon, ongkir; harga disalin dari katalog; total dihitung server (pratinjau di klien hanya tampilan). _Status: form + tambah cepat pelanggan (pemilih pelanggan masih `<select>` biasa sampai Combobox T0.5); harga disalin dari katalog setiap kali draft disimpan dan terkunci setelah konfirmasi. Belum diuji tampilan sebagai admin kelompok (360/768/1280 px, terang & gelap)._
- [~] **T6.3** `confirm_order` (nomor INV + reservasi), `cancel_order` (lepas reservasi; catat refund bila sudah ada pembayaran terverifikasi). _Status: konfirmasi & batal selesai dan diuji; pencatatan refund saat batal-sesudah-bayar ditambahkan di T7.5 (tabel pembayaran/refund belum ada)._
- [x] **T6.4** `POST /orders/{id}/fulfill` → `fulfill_order`: reservasi → `sale_out`, tidak bergantung status bayar. _Status: `app/api/v1/orders/[id]/fulfill/route.ts` (wajib `Idempotency-Key`, respons `{data, error}`, 401/403/409/422) + aksi UI memakai inti posting & kunci idempotensi yang sama._
- [~] **T6.5** Daftar pesanan dengan dua badge status (barang & bayar), filter (termasuk saluran), pencarian nomor. _Status: dibangun & lolos build; belum diuji tampilan sebagai pengguna._
- [ ] **T6.6** Peringatan harga di bawah HPP dan batas piutang (P1).
- [ ] **T6.7** Retur barang: `create_return` + `verify_return` (verifikasi fisik → `return_in`); retur sah mengurangi omzet. _Keputusan Q7 (3 Nov 2026): retur dicatat `admin_kelompok`, diverifikasi fisik oleh `ketua`._
- [x] **T6.8** Test (uji wajib SRS §11): **stok 5 kg, dua pesanan @4 kg dikonfirmasi bersamaan → hanya satu terkonfirmasi**; harga katalog baru tidak mengubah pesanan lama; batal melepas reservasi; barang diserahkan tidak kembali ke stok tanpa retur terverifikasi. _Status: `supabase/tests/order_check.sql` 55/55 lulus di proyek asli (transaksi dibatalkan, produk uji sementara); `lib/order.test.ts` 15 uji. Persaingan dua pesanan diuji berurutan dengan kunci saldo yang sama (seperti T3.7); uji dua sesi bersamaan sungguhan butuh database DEMO/lokal._

## M7 — Pembayaran & Kas (Sprint C) · FR-CSH-*

- [ ] **T7.1** Migrasi `cash_accounts`, `cash_transactions` (unik `(source_type, source_id)`), `payments` (status `pending`/`verified`/`rejected`), `expenses`, `expense_categories`, `other_incomes`, `income_categories`, `refunds`, `cash_corrections`.
- [ ] **T7.2** `POST /orders/{id}/payments` → `record_payment` sesuai sequence PRD §6.1 (kunci baris, cek tagihan, simpan pembayaran terverifikasi, satu kas masuk, status bayar, commit) dan `POST /payments/{id}/verify` untuk transfer yang diverifikasi belakangan.
- [ ] **T7.3** Dialog pembayaran di detail pesanan (tunai/transfer, bukti, cicilan, verifikasi) — hanya untuk `admin_kelompok`.
- [ ] **T7.4** Pengeluaran & pemasukan lain: daftar & form; kategori.
- [ ] **T7.5** Refund terkait pesanan (dari pembatalan sesudah bayar atau retur).
- [ ] **T7.6** Buku kas per akun + saldo awal; koreksi kas (ajukan admin → setujui ketua).
- [ ] **T7.7** Test (uji wajib SRS §11): kirim pembayaran yang sama 2× dengan kunci sama → 1 pembayaran, 1 kas masuk; dua pembayaran berbeda bersamaan tidak melebihi tagihan; jumlah ≤ 0 ditolak; pembayaran `pending` tidak membuat kas; lunas tidak mengubah status barang; biaya batch yang sudah dibayar lewat pengeluaran tidak tercatat sebagai kas kedua.

## M8 — Dashboard, Nota & Laporan (Sprint C–D) · FR-DASH-*, FR-RPT-*

- [ ] **T8.1** `GET /dashboard?from&to`: agregat sesuai peran (fungsi SQL / view), rumus PRD §5.9.
- [ ] **T8.2** Halaman dashboard: filter periode, kartu indikator, produksi tepung harian vs target ≥ 50 kg/hari, tren kg, stok di bawah minimum, aktivitas terbaru; data terbaru setelah transaksi (event/revalidasi).
- [ ] **T8.3** `GET /orders/{id}/receipt` + layout cetak **thermal 80 mm** (utama, `@media print`), tanda "CETAK ULANG ke-n"; A5 opsional (P2). Uji dengan printer thermal nyata.
- [ ] **T8.4** Laporan: jagung masuk, produksi & HPP, stok & mutasi, omzet per produk/jenis/saluran, piutang, kas, porsi jagung mentah, penjualan digital — tabel + filter.
- [ ] **T8.5** Ekspor CSV di server (stream, BOM, `;`), tunduk hak akses.
- [ ] **T8.6** Uji kecocokan: total rekap = jumlah detail untuk periode yang sama; seed DEMO menghasilkan HPP Rp6.000/kg, stok PP 40 kg & TP 45 kg, kas masuk Rp50.000, piutang Rp0.
- [ ] **T8.7** Test (uji wajib SRS §11): cetak ulang nota → nomor sama, kas tidak berubah; printer gagal tidak menghapus pembayaran.

## M9 — Opname, Koreksi & Penyelesaian (Sprint D) · FR-STK-03/04

- [ ] **T9.1** Stok opname: sesi, input fisik, selisih, posting.
- [ ] **T9.2** Koreksi stok: pengajuan (admin kelompok/operator) → persetujuan ketua → mutasi; riwayat tetap ada.
- [ ] **T9.3** Audit log viewer (ketua & admin teknis).
- [ ] **T9.4** E2E Playwright alur utama: jagung masuk → produksi → pesanan → bayar (cicilan) → serah → nota → laporan, plus skenario batal/refund, stok kurang, duplikasi, dan koreksi (bukti uji SRS §14).
- [ ] **T9.5** Audit aksesibilitas & kinerja (Lighthouse ≥ 90 untuk Performance/Accessibility di halaman utama); uji form di ponsel nyata.
- [ ] **T9.6** Review keamanan sesuai checklist [Security.md](Security.md#11-checklist-rilis).
- [ ] **T9.7** **Manual bergambar** (langkah per peran dengan screenshot) dan halaman bantuan singkat.
- [ ] **T9.8** **Backup harian** terjadwal (database + file bukti) dan **satu uji restore** ke lingkungan lain; catat hasilnya (uji wajib SRS §11).
- [ ] **T9.9** Server uji & konfigurasi printer thermal di lokasi mitra (admin teknis).
- [ ] **T9.10** **Pelatihan** admin kelompok & operator (data DEMO dulu, lalu transaksi nyata), UAT, dan serah terima: source, migrasi, konfigurasi contoh, manual, akun/server, hasil UAT, penanggung jawab lanjutan.

---

## Urutan & Ketergantungan

```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─┬─▶ M4 ─▶ M5 ─┐
                      └─▶ M6 ─▶ M7 ─┴─▶ M8 ─▶ M9
```

Estimasi: 20 hari kerja (Sprint A–D) untuk tim tiga mahasiswa STI, lalu pendampingan lapangan delapan minggu (SRS §13). Revisi dari pengguna masuk ke UAT minggu 4.

## Backlog v1.1 / v2

- Transfer antar akun kas (FR-CSH-09), peringatan saldo kas (FR-CSH-08).
- Ekspor PDF laporan (FR-RPT-07), nota A5 (FR-RPT-01a).
- Serah parsial, hutang ke anggota, portal anggota, notifikasi WhatsApp, konsinyasi/bagi hasil (setelah aturan usaha jelas).
