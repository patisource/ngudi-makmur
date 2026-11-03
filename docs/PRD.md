# PRD — Sistem Manajemen Kelompok Tani Ngudi Makmur (v1)

| | |
|---|---|
| **Status** | Draf 0.2 — diselaraskan dengan SRS v2.0 |
| **Tanggal** | 1 November 2026 |
| **Mitra** | Kelompok Tani Ngudi Makmur, Desa Baturejo, Kec. Sukolilo, Kab. Pati |
| **Rujukan kebutuhan** | SRS Sistem Manajemen Kelompok Tani v2.0 (13 Oktober 2026, tim STI Universitas Ivet). Bila PRD dan SRS berbeda, SRS yang berlaku sampai PRD diperbarui. |
| **Platform** | Web responsif (laptop & ponsel admin, operator, ketua); form wajib terbaca dan bisa diisi di ponsel |
| **Stack** | Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage) |
| **Dokumen terkait** | [Task.md](Task.md) · [StyleGuide.md](StyleGuide.md) · [Security.md](Security.md) · [CLAUDE.md](../CLAUDE.md) |

---

## 1. Latar Belakang

Kelompok Tani Ngudi Makmur (Desa Baturejo, Kec. Sukolilo, Kab. Pati) menerima jagung dari anggota maupun sumber luar (tongkol atau pipilan), memipil tongkol menjadi pipilan, menepungkan pipilan menjadi tepung, lalu menjual ketiganya (lihat §4.0). Pembeli dapat berupa perorangan maupun usaha, mis. IRT Sekar Arum yang dicatat sebagai pelanggan penerima tepung. Saat ini pencatatan dilakukan manual (buku/spreadsheet) sehingga:

- stok fisik sering tidak cocok dengan catatan;
- HPP (harga pokok produksi) tidak diketahui, sehingga harga jual ditebak;
- piutang pelanggan dan saldo kas sulit dilacak;
- nota dan laporan dibuat ulang setiap kali diminta.

## 2. Tujuan

| # | Tujuan | Ukuran keberhasilan (v1) |
|---|---|---|
| G1 | Satu sumber kebenaran untuk stok | Selisih stok opname vs sistem < 1% per bulan |
| G2 | HPP per batch produksi terhitung otomatis | 100% batch terkonfirmasi punya HPP |
| G3 | Status bayar & piutang selalu terkini | Laporan piutang bisa dibuat < 10 detik |
| G4 | Saldo kas bisa dipertanggungjawabkan | Setiap mutasi kas punya referensi transaksi |
| G5 | Mudah dipakai pengurus non-teknis | Petugas baru bisa mencatat jagung masuk tanpa pelatihan > 15 menit; form terbaca di ponsel |
| G6 | Produksi tepung terpantau terhadap target | Produksi tepung harian tampil berdampingan dengan target proposal ≥ 50 kg/hari (target hanya pembanding, bukan angka yang diisi otomatis) |
| G7 | Pengelola mandiri setelah serah terima | Admin & operator menjalankan alur tanpa bantuan langkah langsung; backup harian berjalan dan satu uji restore berhasil |

Target program diukur dari data nyata, bukan dianggap otomatis tercapai setelah aplikasi dibuat.

### Di luar cakupan v1 (Non-Goals)

- Marketplace / toko online untuk publik. (Marketplace hanya dicatat sebagai **sumber pasar/saluran** penjualan.)
- Payment gateway (QRIS, VA, kartu). Pembayaran hanya **dicatat** (tunai/transfer manual) lalu diverifikasi admin.
- Aplikasi native (Android/iOS). Web responsif sudah cukup.
- Akuntansi penuh (jurnal umum, neraca, laba-rugi formal). v1 hanya kas + rekap.
- Multi-kelompok / multi-tenant. v1 melayani **satu** kelompok tani.
- Modul usaha internal IRT (mis. IRT Sekar Arum). IRT hanya dicatat sebagai pelanggan.
- Konsinyasi atau bagi hasil, sampai aturan usahanya jelas (lihat §10).
- Akun pelanggan / portal pelanggan. Pelanggan dicatat oleh admin dan tidak login.
- Mode offline.

## 3. Pengguna & Peran (RBAC)

Pengguna sistem adalah **pengurus/petugas** (empat peran SRS). Petani anggota dan pelanggan adalah **data master**, bukan pengguna yang login pada v1.

| Kode peran | Nama | Tanggung jawab utama |
|---|---|---|
| `admin_kelompok` | Admin kelompok | Master anggota & produk; penerimaan jagung; pelanggan & pesanan; pembayaran (catat & verifikasi), pengeluaran, pemasukan lain, refund, kas; nota. |
| `operator_produksi` | Operator produksi | Input bahan, output, sisa/susut dan biaya batch; konfirmasi batch sesuai izin; lihat stok. **Tidak boleh** mengubah pembayaran/kas (ditegakkan di API dan database). |
| `ketua` | Ketua kelompok | Hak baca laporan & dashboard; memeriksa dan **menyetujui koreksi stok/kas**; mengevaluasi usaha. Tidak menginput transaksi harian. |
| `admin_teknis` | Admin teknis | Akun, hak akses, server, printer dan backup. **Bukan** pencatat transaksi usaha. |

Satu pengguna dapat memiliki lebih dari satu peran bila pengurus terbatas (mis. ketua merangkap admin kelompok). Hak akses adalah **gabungan** dari semua perannya, tetapi aturan pemisahan tugas tetap berlaku (pengaju ≠ penyetuju; lihat [Security.md §4.3](Security.md#43-pemisahan-tugas-segregation-of-duties)).

### 3.1 Matriks Hak Akses

Legenda: **K** = kelola (buat/ubah/arsip/konfirmasi), **L** = lihat, **S** = setujui, **A** = ajukan, **—** = tidak ada akses.

| Modul / Aksi | admin_kelompok | operator_produksi | ketua | admin_teknis |
|---|:-:|:-:|:-:|:-:|
| Dashboard | L | L (produksi & stok) | L | — |
| Pengguna, peran & izin | — | — | L | K |
| Anggota | K | L | L | — |
| Produk, kemasan & harga | K | L | L | — |
| Jagung masuk (draft & konfirmasi) | K | L | L | — |
| Produksi — batch, input/output, sisa, biaya batch | L | K | L | — |
| Produksi — konfirmasi batch | — | K (bila diberi izin `production.confirm`) | L | — |
| Stok — lihat & mutasi | L | L | L | — |
| Stok opname | K | K | L | — |
| Koreksi stok | A | A | S | — |
| Pelanggan | K | — | L | — |
| Pesanan (buat, konfirmasi, batal, serah barang) | K | — | L | — |
| Retur barang — catat | K | — | L | — |
| Retur barang — verifikasi fisik (Q7) | L | — | S | — |
| Pembayaran (catat & verifikasi) | K | — | L | — |
| Pengeluaran, pemasukan lain & refund | K | — | L | — |
| Kas (saldo & mutasi) | L | — | L | — |
| Koreksi kas | A | — | S | — |
| Nota (cetak/cetak ulang) | K | — | L | — |
| Laporan & ekspor CSV | L | L (produksi & stok) | L | — |
| Log audit | — | — | L | L |
| Pengaturan teknis, printer & backup | — | — | — | K |

Menu yang tidak diizinkan **tidak ditampilkan**, dan endpoint terkait **tetap menolak** (lihat [Security.md](Security.md)). Konfirmasi batch adalah izin terpisah (`production.confirm`) yang secara default diberikan ke `operator_produksi` dan dapat dicabut per akun oleh `admin_teknis` (lihat Q11 di §10).

## 4. Konsep Domain Inti

Konsep di bawah ini berlaku lintas modul. Implementasi harus konsisten dengan definisi ini.

### 4.0 Produk v1

Hanya tiga produk, sesuai SRS. Nama di bawah adalah **nama sementara**; merek belum ditetapkan, jadi nama tampilan harus bisa diubah dari master produk tanpa mengubah kode (kode tidak boleh bergantung pada nama produk, hanya pada `id`/`code`).

| Kode | Nama sementara | Kategori | Satuan inventori | Kemasan penjualan (contoh, konversi kg) | Peran |
|---|---|---|---|---|---|
| `TK` | Jagung tongkol | `mentah` | kg | — (dijual curah per kg) | Diterima di Jagung masuk; bahan pemipilan; bisa dijual mentah |
| `PP` | Jagung pipilan | `mentah` | kg | Karung 50 kg = 50 kg | Diterima di Jagung masuk atau hasil pemipilan; bahan penepungan; bisa dijual mentah |
| `TP` | Tepung jagung | `olahan` | kg | Pak 0,5 kg = 0,5 kg · Pak 1 kg = 1 kg | Hasil penepungan; dijual (mis. ke IRT Sekar Arum) |

Jenis batch produksi v1:

| Jenis batch | Input | Output |
|---|---|---|
| `pemipilan` | `TK` | `PP` |
| `penepungan` | `PP` | `TP` |

Alur: **Jagung masuk (TK/PP) → pemipilan (TK → PP) → penepungan (PP → TP) → stok → penjualan**. Produksi dimulai dari jagung yang sudah menjadi persediaan kelompok. Pasangan input/output per jenis batch disimpan sebagai data (di-*seed*), bukan di-*hardcode*. Plastik kemasan dan bahan pembantu lain **bukan** produk stok di v1; nilainya dicatat sebagai biaya batch (kategori *kemasan*). Karena seluruh inventori dalam kg, indikator lintas produk di dashboard dan laporan boleh dijumlah dalam kg (dengan catatan §5.9 tentang porsi jagung mentah).

### 4.1 Satuan & Konversi

- **Seluruh inventori** (tongkol, pipilan, tepung) disimpan dalam **kg**. Jagung masuk, input/output batch, stok opname, dan koreksi diinput langsung dalam kg.
- Kemasan hanya dipakai pada **penjualan**, dengan konversi kg yang eksplisit per produk (mis. Tepung pak 0,5 kg, pak 1 kg; Pipilan karung 50 kg). Konversi `0` atau negatif **ditolak** (constraint `isi_kg > 0`).
- Item pesanan menyimpan `qty_input`, `packaging_id` (boleh kosong = kg curah) dan `qty_kg` (hasil konversi) sekaligus. Contoh: 2 kemasan @0,5 kg mengurangi stok **1 kg**.

### 4.2 Buku Mutasi Stok (Stock Ledger)

- Stok **tidak pernah** diubah langsung. Setiap perubahan stok adalah **baris mutasi** yang tidak dapat diubah (append-only) dengan `product_id` (foreign key wajib), arah `masuk`/`keluar`, `qty_kg`, serta `source_type` + `source_id` dokumen sumber.
- Sumber mutasi (SRS §9): penerimaan, produksi, penyerahan pesanan, retur, atau koreksi. Jenis mutasi: `receipt_in` (jagung masuk), `production_out` (bahan dipakai), `production_in` (hasil produksi), `sale_out` (serah barang), `return_in` (retur fisik terverifikasi), `opname_adjust`, `correction`, `reversal`.
- Pembatalan dokumen yang sudah dikonfirmasi dilakukan dengan **mutasi balik** (`reversal`), bukan menghapus.

### 4.3 Tiga Angka Stok

| Istilah | Definisi |
|---|---|
| **Fisik tercatat** (`on_hand`) | Jumlah mutasi masuk − jumlah mutasi keluar per produk (kg). |
| **Reservasi** (`reserved`) | Jumlah kg pada `stock_reservations` berstatus `active`, yaitu pesanan `confirmed` yang belum diserahkan. |
| **Tersedia** (`available`) | `on_hand − reserved`. Pesanan baru hanya boleh dikonfirmasi jika `available` cukup; dua pesanan bersamaan tidak boleh membuat `available` negatif. |

### 4.4 Penilaian Persediaan & HPP

- Metode nilai bahan: **rata-rata bergerak (moving average)** per produk (lihat Q3).
- Biaya per kg jagung masuk = `biaya perolehan / berat kg`.
- **HPP batch** (SRS §10) = `(biaya bahan terpakai + tenaga kerja + kemasan + alokasi biaya lain) ÷ output layak jual (kg)`. Biaya bahan terpakai = Σ (kg input × rata-rata biaya produk input saat konfirmasi). Komponen selain bahan berasal dari `batch_costs`.
- Bila output layak jual = 0, HPP **tidak dihitung** (tidak ada pembagian nol); sistem menampilkan "Data belum cukup untuk menghitung HPP".
- Biaya batch **hanya alokasi HPP** dan tidak pernah membuat kas (lihat §4.7).
- Nilai persediaan dan HPP disimpan dalam rupiah integer.

### 4.5 Penomoran Dokumen

Nomor dibuat oleh backend, berurutan per jenis per bulan, tidak boleh dipakai ulang walau dokumen dibatalkan.

| Dokumen | Format | Contoh |
|---|---|---|
| Penerimaan jagung | `RCV-YYYYMM-NNNN` | `RCV-202611-0007` |
| Batch produksi | `PRD-YYYYMMDD-NN` | `PRD-20261103-02` |
| Pesanan / nota | `INV-YYYYMM-NNNN` | `INV-202611-0031` |
| Pembayaran | `PAY-YYYYMM-NNNN` | `PAY-202611-0045` |
| Pengeluaran | `EXP-YYYYMM-NNNN` | `EXP-202611-0012` |
| Pemasukan lain | `INC-YYYYMM-NNNN` | `INC-202611-0002` |
| Refund | `RFD-YYYYMM-NNNN` | `RFD-202611-0001` |
| Retur barang | `RTR-YYYYMM-NNNN` | `RTR-202611-0001` |
| Stok opname | `OPN-YYYYMM-NN` | `OPN-202611-01` |
| Koreksi stok | `ADJ-YYYYMM-NNNN` | `ADJ-202611-0003` |
| Koreksi kas | `KAS-YYYYMM-NNNN` | `KAS-202611-0001` |

Nomor nota = nomor pesanan (`INV-…`), unik, dan **tetap sama** saat dicetak ulang.

### 4.6 Aturan Umum Data

- Uang disimpan sebagai **integer rupiah** (tanpa desimal). Berat/qty disimpan sebagai decimal `numeric(14,3)` dalam kg.
- Zona waktu bisnis: **Asia/Jakarta (WIB)**. Tanggal transaksi adalah tanggal bisnis, terpisah dari `created_at`.
- Master data (anggota, produk, pelanggan) **diarsipkan**, tidak dihapus. Data arsip tidak muncul di pilihan input, tetapi tetap tampil di riwayat.
- Dokumen transaksi yang sudah dikonfirmasi **tidak dihapus dan tidak diedit** (terkunci); koreksi lewat pembalikan (`reversal`) + dokumen baru, atau dokumen koreksi.
- Setiap transaksi menyimpan **pelaku, waktu, nomor sumber**, dan (untuk koreksi/pembatalan) **alasan**. Setiap aksi tulis tercatat di **log audit** (pelaku, aksi, objek, nilai sebelum/sesudah, alasan, waktu).
- Konfirmasi yang dikirim dua kali (klik ganda, retry jaringan) hanya menghasilkan **satu** perubahan stok/kas.

### 4.7 Kas & Sumber Uang

Aturan ini mencegah kas tercatat ganda (SRS §5, §9).

| Kejadian | Efek kas |
|---|---|
| Pembayaran pesanan **terverifikasi** (tunai/transfer) | Tepat **satu** kas masuk (`source_type = 'payment'`) |
| Pembayaran belum diverifikasi / ditolak | Tidak ada kas |
| Pemasukan lain (mis. iuran, bantuan) | Satu kas masuk (`source_type = 'other_income'`) |
| Pengeluaran (termasuk pembelian bahan, upah, kemasan) | Satu kas keluar (`source_type = 'expense'`) |
| Refund (pembatalan sesudah bayar / retur) | Satu kas keluar (`source_type = 'refund'`) |
| Koreksi kas disetujui ketua | Satu kas masuk/keluar (`source_type = 'cash_correction'`) |
| Biaya batch (`batch_costs`), biaya perolehan jagung masuk | **Tidak ada kas** — hanya nilai persediaan/HPP |
| Penyerahan barang, cetak/cetak ulang nota | **Tidak ada kas** |

Pasangan `cash_transactions(source_type, source_id)` bersifat **unik** di database. Bila biaya produksi dibayar tunai, uangnya dicatat **sekali** sebagai pengeluaran; baris biaya batch boleh merujuk pengeluaran tersebut (`sumber_biaya`) tanpa membuat kas kedua.

### 4.8 Sumber Pasar / Saluran Penjualan

Setiap pesanan wajib memiliki `channel`: `langsung`, `whatsapp`, `media_sosial`, `marketplace`, atau `lainnya` (dapat dikelola sebagai data master). Saluran **digital** = `whatsapp`, `media_sosial`, `marketplace`; dipakai indikator penjualan digital (§5.9).

## 5. Kebutuhan Fungsional

Format ID: `FR-<modul>-<nomor>`. Prioritas: **P0** wajib v1, **P1** sebaiknya v1, **P2** bila waktu memungkinkan.

### 5.1 Login & Sesi (`AUTH`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-AUTH-01 | Login dengan email + kata sandi (Supabase Auth). | P0 |
| FR-AUTH-02 | Logout dari menu profil; sesi berakhir di server. | P0 |
| FR-AUTH-03 | Menu sidebar dan tombol aksi disaring berdasarkan peran; pembatasan yang sama diperiksa ulang di API. | P0 |
| FR-AUTH-04 | Akun dibuat oleh `admin_teknis` (tidak ada pendaftaran mandiri). Pelanggan dan anggota tidak memiliki akun. | P0 |
| FR-AUTH-05 | `admin_teknis` dapat mengubah peran/izin dan menonaktifkan akun; akun nonaktif tidak bisa login dan sesi aktifnya dicabut. | P0 |
| FR-AUTH-06 | Lupa kata sandi via email reset (atau reset oleh `admin_teknis` bila pengurus tidak memakai email, lihat Q13). | P1 |
| FR-AUTH-07 | Setiap pengguna (semua peran) dapat mengganti kata sandinya sendiri di **Akun saya**: wajib kata sandi saat ini, minimal 8 karakter, konfirmasi; sesi di perangkat lain dicabut dan kejadiannya tercatat di audit (ditambahkan atas permintaan pengguna, 3 Nov 2026). | P1 |

**Kriteria penerimaan (uji wajib SRS §11):** pengguna `operator_produksi` yang membuka URL `/pembayaran` atau `/kas` melihat halaman 403, dan `POST /orders/{id}/payments` (atau aksi pengeluaran/refund/koreksi kas) dari akun tersebut mengembalikan `403` tanpa mengubah data.

### 5.2 Dashboard (`DASH`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-DASH-01 | Filter rentang tanggal: Hari ini, 7 hari, Bulan ini, Bulan lalu, Kustom. Default: Bulan ini. | P0 |
| FR-DASH-02 | Indikator **Jagung masuk**: total kg (per jenis TK/PP) & total biaya perolehan pada periode, hanya penerimaan terkonfirmasi. | P0 |
| FR-DASH-03 | Indikator **Produksi**: jumlah batch terkonfirmasi per jenis, total output kg, rata-rata sisa/susut %, dan **produksi tepung harian** dibandingkan target ≥ 50 kg/hari (garis target, bukan angka yang diisi otomatis). | P0 |
| FR-DASH-04 | Indikator **Stok** per produk (kg): fisik tercatat, reservasi, tersedia; nilai persediaan; daftar produk di bawah batas minimum. | P0 |
| FR-DASH-05 | Indikator **Penjualan**: omzet (diserahkan − retur sah), jumlah pesanan, total piutang. Omzet ditampilkan terpisah dari uang yang diterima. | P0 |
| FR-DASH-06 | Indikator **Kas**: saldo per akun kas, total masuk & keluar periode (rumus §5.9). | P0 |
| FR-DASH-07 | Perbandingan dengan periode sebelumnya yang setara (mis. bulan ini vs bulan lalu). | P1 |
| FR-DASH-08 | Grafik tren mingguan jagung masuk vs penjualan diserahkan (kg). | P1 |
| FR-DASH-09 | Setiap indikator dapat diklik menuju daftar transaksi terfilter. | P1 |
| FR-DASH-10 | Indikator **porsi jagung mentah** dan **penjualan digital** (rumus §5.9). | P1 |
| FR-DASH-11 | Dashboard menampilkan data terbaru setelah transaksi tersimpan (muat ulang/revalidasi setelah posting), tanpa perlu menunggu rekap manual. | P1 |

Indikator yang tampil mengikuti peran (lihat matriks 3.1). Angka dashboard dihitung di backend dari transaksi sah, bukan di browser.

### 5.3 Anggota & Produk (`MST`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-MST-01 | CRUD anggota (petani/sumber jagung): kode anggota (otomatis), nama, kontak (no. HP), NIK (opsional), alamat/dusun, luas lahan (ha), tanggal bergabung, status aktif/arsip. | P0 |
| FR-MST-02 | CRUD produk: kode (`TK`/`PP`/`TP`), nama tampilan, kategori (`mentah` / `olahan`), satuan dasar (selalu kg), harga jual default per kg, stok minimum, status. | P0 |
| FR-MST-03 | Master jenis kemasan penjualan (pak, karung, dll.). Satuan inventori tidak dapat diubah dari kg. | P0 |
| FR-MST-04 | Konversi kemasan per produk: kemasan, isi kg (> 0; nol ditolak), harga jual default per kemasan. | P0 |
| FR-MST-05 | Arsip & pulihkan arsip. Produk dengan stok > 0 tidak boleh diarsipkan. | P0 |
| FR-MST-06 | Pencarian & filter (nama, kode, status) dengan paginasi di server. | P0 |
| FR-MST-07 | Riwayat transaksi per anggota (jagung masuk) dan per produk (mutasi). | P1 |

### 5.4 Jagung Masuk (`RCV`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-RCV-01 | Input: tanggal, sumber (`anggota` + pilih anggota, atau `luar` + nama pemasok), jenis jagung (produk kategori `mentah`: `TK` atau `PP`), berat kg (> 0), kadar air % (opsional), biaya perolehan (Rp), catatan, bukti (foto/PDF, maks. 5 MB). | P0 |
| FR-RCV-02 | Simpan sebagai `draft`. Draft **belum mengubah stok** dan masih dapat diedit/dihapus. | P0 |
| FR-RCV-03 | **Konfirmasi**: terbit nomor `RCV-…`, mutasi `receipt_in` dibuat **tepat satu kali**, rata-rata biaya produk diperbarui, dokumen **terkunci**. Konfirmasi kedua/retry tidak membuat mutasi baru. | P0 |
| FR-RCV-04 | Biaya perolehan hanya dipakai untuk nilai persediaan & HPP; **tidak membuat kas**. Bila jagung dibeli tunai, uangnya dicatat sebagai pengeluaran (FR-CSH-05, kategori *Pembelian bahan baku*) dengan referensi nomor penerimaan. Cara penerimaan hasil panen anggota dan pembayarannya disepakati saat asesmen (Q2). | P0 |
| FR-RCV-05 | Batalkan (`void`) penerimaan terkonfirmasi dengan alasan wajib → mutasi balik. Ditolak jika stok tersedia tidak cukup untuk dibalik. | P1 |
| FR-RCV-06 | Daftar penerimaan dengan filter tanggal, sumber, anggota, jenis, status. | P0 |

**Kriteria penerimaan:** mengonfirmasi 1.000 kg dengan biaya perolehan Rp4.500.000 menambah `on_hand` 1.000 kg dan rata-rata biaya produk ter-update; mengirim konfirmasi dua kali tetap menghasilkan satu mutasi; berat 0 atau negatif ditolak; draft tidak mengubah stok; nomor tidak berubah setelah dicetak ulang.

### 5.5 Produksi (`PRD`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-PRD-01 | Buat batch: jenis (`pemipilan` / `penepungan`), tanggal, operator pelaksana (default pengguna yang login), catatan, status `draft`. | P0 |
| FR-PRD-02 | Baris **input** (minimal satu): produk bahan sesuai jenis batch + berat kg. | P0 |
| FR-PRD-03 | Baris **output** (minimal satu): produk hasil sesuai jenis batch + berat kg layak jual. | P0 |
| FR-PRD-04 | **Sisa/susut** dicatat dalam kg = total input kg − total output kg; operator dapat merinci bagian sisa (mis. janggel/kulit, tidak masuk stok v1) dan susut. Output > input ditolak. Peringatan bila susut % melebihi ambang per jenis batch. | P0 |
| FR-PRD-05 | **Biaya batch** (`batch_costs`): kategori (tenaga kerja, kemasan, listrik/BBM, alokasi lain), nilai alokasi Rp, sumber biaya (mis. nomor pengeluaran). Hanya alokasi HPP; **tidak membuat kas** (§4.7). | P0 |
| FR-PRD-06 | **Konfirmasi** (oleh pemegang izin `production.confirm`) dalam **satu transaksi database**: cek stok tersedia setiap input (kurang → ditolak `INSUFFICIENT_STOCK`), terbit kode batch `PRD-…`, mutasi `production_out` & `production_in`, HPP dihitung dan dikunci. Konfirmasi ganda/retry tidak menggandakan mutasi. | P0 |
| FR-PRD-07 | Draft dapat diedit/dihapus; batch terkonfirmasi terkunci dan tidak dapat diedit. | P0 |
| FR-PRD-08 | Pembalikan batch terkonfirmasi (mutasi balik: output ditarik, input kembali dengan nilai tercatat) oleh `operator_produksi` yang punya izin konfirmasi batch, dengan alasan wajib; ditolak bila hasil produksi sudah terpakai/terjual sehingga stok tersedia tidak cukup. Tercatat di log audit untuk diperiksa `ketua`. *Asumsi prototipe (Q16): mitra boleh mensyaratkan persetujuan ketua sebelum pembalikan berlaku.* | P1 |
| FR-PRD-09 | Ringkasan batch menampilkan: total input, total output, sisa/susut kg & %, total biaya (bahan + biaya batch), HPP/kg, dan operator. | P0 |

**Aturan HPP (SRS §10):** HPP/kg = (biaya bahan terpakai + tenaga kerja + kemasan + alokasi biaya lain) ÷ output layak jual kg (lihat §4.4). Output 0 → status "data belum cukup", HPP kosong, tanpa pembagian. Seluruh output batch dianggap layak jual; sisa/susut tidak menanggung HPP.

### 5.6 Stok (`STK`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-STK-01 | Daftar stok per produk: fisik tercatat, reservasi, tersedia, nilai persediaan, indikator di bawah minimum. | P0 |
| FR-STK-02 | Kartu stok (mutasi) per produk: tanggal, jenis, nomor dokumen, masuk, keluar, saldo berjalan. Filter tanggal & jenis. | P0 |
| FR-STK-03 | **Stok opname**: buat sesi opname, isi qty fisik per produk; sistem menampilkan selisih; posting menghasilkan mutasi `opname_adjust`. | P0 |
| FR-STK-04 | **Koreksi stok**: produk, qty kg (+/−), alasan wajib (pilihan: rusak, hilang, salah catat, lainnya + keterangan). Diajukan `admin_kelompok`/`operator_produksi`, disetujui `ketua` (pengaju ≠ penyetuju) sebelum menjadi mutasi. Riwayat koreksi (pengaju, penyetuju, alasan, waktu) tetap tersimpan. | P0 |
| FR-STK-05 | Stok fisik maupun tersedia tidak boleh menjadi negatif akibat transaksi apa pun, termasuk dua pesanan yang dikonfirmasi bersamaan. | P0 |

### 5.7 Penjualan / Pesanan (`SAL`)

Di API dan database, pesanan = `orders` (lihat §8.1).

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-SAL-01 | CRUD pelanggan: nama, tipe (perorangan/usaha, mis. IRT Sekar Arum), no. HP, alamat, batas piutang (opsional), status. Pelanggan dicatat oleh `admin_kelompok` dan tidak memiliki akun. | P0 |
| FR-SAL-02 | Buat pesanan `draft`: tanggal, pelanggan, **sumber pasar/saluran** (§4.8, wajib), item (produk, kemasan atau kg curah, qty), diskon per baris, ongkos kirim, catatan. Konversi kemasan → kg dihitung server (§4.1). | P0 |
| FR-SAL-02a | **Harga snapshot**: harga satuan diambil dari katalog lalu **disalin** ke item (`price_snapshot`) saat pesanan dibuat. Perubahan harga katalog sesudahnya tidak mengubah pesanan lama. | P0 |
| FR-SAL-03 | Total dihitung di backend: subtotal, diskon, ongkir, **total** (= tagihan). Nilai total dari klien diabaikan. | P0 |
| FR-SAL-04 | **Konfirmasi**: dalam satu transaksi dengan kunci baris saldo produk, cek stok tersedia (kg) → terbit nomor `INV-…`, stok di-**reservasi** (`stock_reservations` status `active`). Bila dua pesanan bersaing atas stok yang sama, hanya yang cukup stoknya yang terkonfirmasi. | P0 |
| FR-SAL-05 | **Serah barang** (`POST /orders/{id}/fulfill`): mengubah reservasi menjadi mutasi `sale_out` (reservasi → `fulfilled`); mencatat tanggal serah & penerima. Tidak bergantung pada status bayar. v1 hanya serah penuh (tidak parsial). | P0 |
| FR-SAL-06 | **Batal** (alasan wajib): draft → dihapus; confirmed → reservasi dilepas (`released`); bila sudah ada pembayaran terverifikasi, pembatalan **mencatat refund** (kas keluar, FR-CSH-06) dalam alur yang sama. delivered → tidak bisa dibatalkan; gunakan retur (FR-SAL-10). | P0 |
| FR-SAL-07 | Status barang: `draft`, `confirmed`, `delivered`, `cancelled`. Status bayar **terpisah**: `unpaid`, `partial`, `paid`, `refunded`. Lunas **tidak** otomatis berarti barang diserahkan, dan sebaliknya. | P0 |
| FR-SAL-08 | Peringatan bila harga jual di bawah HPP rata-rata produk. | P1 |
| FR-SAL-09 | Peringatan bila piutang pelanggan melebihi batas. | P1 |
| FR-SAL-10 | **Retur barang** atas pesanan `delivered`: item + kg (≤ kg diserahkan − retur sebelumnya), alasan wajib, status `draft` → `verified`. Barang **baru kembali ke stok** (mutasi `return_in`) sesudah retur fisik **diverifikasi oleh `ketua`** (dicatat `admin_kelompok`; pelaku & waktu verifikasi dicatat; Q7). Retur sah mengurangi omzet; pengembalian uang dicatat sebagai refund. | P0 |

### 5.8 Pembayaran & Kas (`CSH`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-CSH-01 | Akun kas: minimal `Kas Tunai` dan satu `Rekening Bank`. Saldo awal diinput sekali oleh `admin_kelompok`; perubahan sesudahnya hanya lewat koreksi kas (FR-CSH-11). | P0 |
| FR-CSH-02 | Pembayaran pesanan: tanggal, metode (tunai/transfer), akun kas, jumlah (> 0), bukti transfer (opsional). Boleh **cicilan**. Status pembayaran: `pending` (dicatat, belum diverifikasi) → `verified` atau `rejected`. | P0 |
| FR-CSH-02a | **Verifikasi** oleh `admin_kelompok`: tunai yang diterima langsung boleh dicatat dan diverifikasi sekaligus; transfer diverifikasi setelah dicek di mutasi rekening. Pembayaran belum terverifikasi **tidak** mengurangi tagihan dan **tidak** membuat kas. | P0 |
| FR-CSH-03 | Jumlah bayar harus > 0 dan tidak boleh melebihi **tagihan tersisa** (dicek di dalam transaksi database saat verifikasi, bukan di browser). | P0 |
| FR-CSH-04 | Verifikasi menyimpan pembayaran, membuat **tepat satu** catatan kas masuk (`source_type`+`source_id` unik), dan memperbarui status bayar + tagihan tersisa dalam **satu transaksi database** (lihat §6.1). | P0 |
| FR-CSH-04a | Setiap permintaan pembayaran membawa **kunci unik** (`Idempotency-Key`). Pengiriman ulang dengan kunci yang sama mengembalikan hasil transaksi pertama, tidak membuat pembayaran/kas ganda. | P0 |
| FR-CSH-05 | Pengeluaran → kas keluar: tanggal, kategori (mis. pembelian bahan baku, upah, kemasan, listrik/BBM), akun kas, jumlah, keterangan, bukti, referensi dokumen opsional (nomor penerimaan/batch). Kategori dapat dikelola. | P0 |
| FR-CSH-05a | **Pemasukan lain** → kas masuk: tanggal, kategori, akun kas, jumlah, keterangan, bukti (pemasukan di luar pembayaran pesanan). | P0 |
| FR-CSH-06 | Refund → kas keluar: terkait pesanan & pembayaran terverifikasi, jumlah ≤ total terverifikasi dikurangi refund sebelumnya, alasan wajib. Wajib dicatat bila pesanan dibatalkan sesudah dibayar. | P0 |
| FR-CSH-07 | Buku kas per akun: saldo awal, masuk, keluar, saldo akhir, dengan referensi dokumen sumber. | P0 |
| FR-CSH-08 | Pengeluaran tidak boleh membuat saldo akun kas negatif. | P1 |
| FR-CSH-09 | Transfer antar akun kas (tunai ↔ bank). | P1 |
| FR-CSH-10 | Biaya batch dan biaya perolehan jagung masuk **tidak pernah** membuat kas; uang yang benar-benar keluar dicatat sekali sebagai pengeluaran (§4.7). Database menolak kas kedua untuk sumber yang sama. | P0 |
| FR-CSH-11 | **Koreksi kas**: akun, jumlah (+/−), alasan wajib; diajukan `admin_kelompok`, disetujui `ketua` (pengaju ≠ penyetuju) sebelum menjadi mutasi kas. | P0 |

### 5.9 Nota & Laporan (`RPT`)

| ID | Kebutuhan | Prio |
|---|---|---|
| FR-RPT-01 | **Nota thermal 80 mm** (format utama) berisi identitas kelompok (Kelompok Tani Ngudi Makmur, Desa Baturejo), nomor nota unik, tanggal, pelanggan, item (kemasan & kg), total, pembayaran terverifikasi, dan sisa tagihan. | P0 |
| FR-RPT-01a | Layout nota A5 sebagai alternatif cetak. | P2 |
| FR-RPT-02 | Bukti penerimaan jagung & kuitansi pembayaran siap cetak (80 mm). | P0 |
| FR-RPT-03 | Cetak ulang memakai **nomor nota yang sama**, mencantumkan tanda **"CETAK ULANG ke-n"**, tercatat di `print_logs`, dan **tidak menambah kas**. | P0 |
| FR-RPT-03a | Nota diambil dari transaksi yang **sudah tersimpan** (`GET /orders/{id}/receipt`); mengambil/mencetak nota **tidak pernah** membuat atau mengubah transaksi usaha. | P0 |
| FR-RPT-03b | Pencetakan memakai dialog cetak browser (driver printer thermal). Kegagalan cetak tidak menghapus pembayaran dan tidak memengaruhi data; pengguna cukup cetak ulang. | P0 |
| FR-RPT-04 | Laporan rekap: jagung masuk (per sumber & jenis), produksi (per batch, jenis & HPP, produksi tepung harian vs target), stok & mutasi, penjualan/omzet (per pelanggan, produk, jenis dan saluran), piutang, kas, porsi jagung mentah, penjualan digital. Rumus mengikuti tabel di bawah. | P0 |
| FR-RPT-05 | Semua laporan punya filter tanggal + filter relevan, dan **ekspor CSV** (UTF-8 dengan BOM, pemisah `;` agar terbaca Excel lokal). | P0 |
| FR-RPT-06 | Ekspor dibuat di server dan tunduk pada hak akses laporan. | P0 |
| FR-RPT-07 | Ekspor PDF laporan. | P2 |
| FR-RPT-08 | Rekap harus **cocok dengan detail**: total setiap laporan = jumlah baris transaksi sah pada periode & filter yang sama (stok, kas, omzet, HPP dapat ditelusuri ke dokumen sumber). | P0 |

**Rumus indikator (SRS §10)** — dipakai sama oleh dashboard dan laporan; hanya transaksi sah (terkonfirmasi/terverifikasi, bukan `draft`/`void`/`rejected`):

| Indikator | Cara hitung |
|---|---|
| Produksi tepung harian | Σ output `TP` dari batch `penepungan` terkonfirmasi per tanggal. Target proposal **≥ 50 kg/hari** ditampilkan sebagai garis/angka target, bukan angka yang diisi otomatis. |
| HPP batch | (Biaya bahan terpakai + tenaga kerja + kemasan + alokasi biaya lain) ÷ output layak jual (kg). Output 0 → "Data belum cukup", tanpa pembagian. |
| Omzet | Σ nilai pesanan yang sudah **diserahkan** (`delivered`) − Σ nilai retur sah (`verified`). Berbeda dengan uang pembayaran yang diterima. |
| Kas | Saldo awal + pembayaran terverifikasi + pemasukan lain − pengeluaran − refund (± koreksi kas disetujui). |
| Piutang | Σ tagihan pesanan sah (`confirmed`/`delivered`) − Σ pembayaran bersih terverifikasi (pembayaran − refund). |
| Porsi jagung mentah | Kg produk kategori `mentah` (`TK`, `PP`) yang terjual ÷ total kg produk terjual × 100%, periode yang sama. Ini ukuran operasional awal; laporan dampak program memakai faktor konversi setara bahan baku dari hasil batch (Q9). |
| Penjualan digital | Nilai pesanan selesai dengan saluran `whatsapp`/`media_sosial`/`marketplace` ÷ total nilai pesanan selesai × 100%. |

## 6. Alur Status (Ringkasan)

```
Jagung masuk : draft ──konfirmasi──▶ confirmed (stok +, terkunci) ──void(alasan)──▶ void
Produksi     : draft ──konfirmasi──▶ confirmed (input −, output +, HPP) ──void(alasan, operator berizin)──▶ void
Pesanan      : draft ──konfirmasi──▶ confirmed (reservasi) ──serah──▶ delivered (sale_out)
                  │                     │                              │
                  └──hapus              └──batal──▶ cancelled           └──retur──▶ (retur verified: return_in)
                                           (reservasi dilepas; refund bila sudah bayar)
Pembayaran   : pending ──verifikasi──▶ verified (kas masuk ×1) | rejected (tanpa kas)
Status bayar : unpaid ──▶ partial ──▶ paid ──refund──▶ refunded / partial   (terpisah dari status barang)
Retur        : draft ──verifikasi fisik──▶ verified (stok +)
Koreksi stok : pending ──setujui ketua──▶ approved (mutasi dibuat) | rejected
Koreksi kas  : pending ──setujui ketua──▶ approved (kas dibuat) | rejected
Stok opname  : draft ──posting──▶ posted
```

Diagram activity penjualan (SRS §7): admin mengisi pesanan → sistem hitung total & cek stok → (tidak valid/stok kurang: tampilkan kesalahan, perbaiki) → konfirmasi & reservasi → catat pembayaran & kas atomik → serahkan barang & catat stok keluar → perbarui status penyerahan & nomor nota → cetak nota & perbarui laporan. Urutan bayar dan serah boleh berbeda (cicilan, pengiriman tertunda).

### 6.1 Sequence Pembayaran & Nota (dari SRS §8)

```mermaid
sequenceDiagram
    actor A as Admin kelompok
    participant API as Aplikasi / API
    participant DB as Basis data
    participant P as Printer thermal 80 mm
    A->>API: 1. POST /orders/{id}/payments + Idempotency-Key (verifikasi)
    API->>DB: 2. BEGIN; kunci baris order; cek tagihan tersisa
    Note over DB: 3. simpan pembayaran (verified)<br/>4. buat satu kas masuk<br/>5. update status bayar
    API->>DB: 6. COMMIT
    DB-->>API: 7. berhasil + ID transaksi
    API-->>A: 8. status bayar & saldo terbaru
    A->>API: 9. GET /orders/{id}/receipt
    API-->>A: 10. nota dari transaksi tersimpan
    A->>P: 11. cetak lewat driver perangkat (window.print)
    P-->>A: 12. hasil cetak (gagal → cetak ulang)
```

Aturan: bila kunci unik sudah pernah dipakai, langkah 2–6 dilewati dan API mengembalikan hasil transaksi yang tersimpan. Bila salah satu langkah 3–5 gagal, seluruh transaksi di-*rollback*. Nota baru diambil setelah commit berhasil. Transfer yang belum bisa dicek disimpan sebagai `pending` tanpa kas; verifikasi kemudian (`POST /payments/{id}/verify`) menjalankan langkah 2–7 yang sama.

## 7. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
|---|---|
| Kinerja | Halaman daftar < 1,5 s (p95) untuk 10.000 baris data via paginasi server. Dashboard < 2 s. |
| Konsistensi | Semua posting (stok, kas, nomor dokumen) dijalankan dalam **satu transaksi database**. |
| Ketersediaan & pemulihan | Mengikuti SLA Supabase + Vercel; **backup harian** otomatis (Supabase PITR bila tersedia) + dump harian terjadwal beserta file bukti Storage; minimal **satu uji restore ke lingkungan lain** sebelum serah terima, file bukti tetap lengkap. |
| Usability | Bahasa Indonesia; format `Rp 1.250.000`, `1.250,5 kg`, tanggal `3 Nov 2026`. Bisa dipakai di laptop 1280 px, tablet 768 px, dan **ponsel 360 px** (semua form terbaca & bisa diisi di ponsel). |
| Perangkat cetak | Printer thermal 80 mm melalui driver perangkat (dialog cetak browser); model printer dipastikan saat asesmen. |
| Serah terima | Source code, migrasi, konfigurasi contoh, **manual bergambar**, akun/server, hasil UAT, dan **pelatihan** pengelola (admin & operator). |
| Aksesibilitas | Kontras WCAG AA, navigasi keyboard penuh, menghormati `prefers-reduced-motion`. |
| Keamanan | Lihat [Security.md](Security.md). |
| Auditabilitas | Log audit untuk seluruh aksi tulis, disimpan minimal 2 tahun. |
| Browser | Chrome, Edge, Firefox, Safari versi 2 tahun terakhir. |

## 8. Arsitektur Ringkas

```
Browser (Next.js RSC + Client Components)
   │  Server Actions / Route Handlers (/api/v1/*)
   ▼
Lapisan aplikasi (Next.js server)
   - autentikasi sesi (Supabase SSR)
   - otorisasi peran (requireRole)
   - validasi input (Zod)
   ▼
PostgreSQL (Supabase)
   - fungsi posting (PL/pgSQL, SECURITY DEFINER, transaksi atomik)
   - Row Level Security sebagai lapisan pertahanan kedua
   - view agregat untuk stok, kas, dashboard
Supabase Storage (bukti/lampiran, bucket privat)
```

**Prinsip:** aturan bisnis (validasi stok, penomoran, HPP, status) ada di backend — server Next.js dan fungsi database. Frontend hanya menampilkan dan mengirim input.

### 8.1 Kontrak API Minimum

Dari SRS: endpoint minimum. Semua di bawah prefix `/api/v1`. Di API dan kode, **"order" = pesanan** (tabel `orders`, `order_items`); di UI disebut "Penjualan"/"Pesanan".

| Endpoint | Fungsi |
|---|---|
| `POST /orders/{id}/payments` | Verifikasi pembayaran; cek tagihan; simpan pembayaran dan kas secara atomik. Wajib header `Idempotency-Key`. |
| `POST /orders/{id}/fulfill` | Serahkan barang; ubah reservasi menjadi mutasi keluar. Wajib `Idempotency-Key`. |
| `GET /orders/{id}/receipt` | Ambil nota tanpa membuat transaksi baru (hanya menambah `print_logs`). |
| `GET /reports/*` dan `GET /dashboard` | Baca rekap berdasarkan transaksi sah (status `confirmed`/`delivered`/`verified`/`approved`/`posted`, bukan `draft`/`void`/`rejected`/`pending`). |

Endpoint tambahan per modul (CRUD master, receipts, production, stock, orders, returns, payments, expenses, other-incomes, refunds, cash-corrections) mengikuti pola yang sama: `POST /<resource>` membuat draft, `POST /<resource>/{id}/<aksi>` menjalankan transisi status (`confirm`, `verify`, `cancel`, `void`, `approve`, `reject`, `post`). Contoh: `POST /receipts/{id}/confirm`, `POST /production/{id}/confirm`, `POST /orders/{id}/confirm`, `POST /orders/{id}/cancel`, `POST /payments/{id}/verify`, `POST /returns/{id}/verify`. Semua aksi transisi bersifat idempoten dan peran diperiksa di API (mis. `operator_produksi` ditolak di semua endpoint pembayaran/kas).

Bentuk respons standar:

```json
{ "data": { ... }, "error": null }
{ "data": null, "error": { "code": "INSUFFICIENT_STOCK", "message": "Stok tersedia 120 kg, diminta 150 kg", "fields": { "items.0.qty": "..." } } }
```

## 9. Model Data (Garis Besar)

Mengikuti class diagram SRS §9 (nama class SRS dalam kurung). Semua relasi produk memakai foreign key.

| Tabel | Isi utama |
|---|---|
| `profiles`, `user_roles`, `user_permissions` | Pengguna (`users`: nama, login, aktif; kata sandi di Supabase Auth), peran (4 peran §3), izin tambahan (`production.confirm`) |
| `members` | Anggota petani/sumber jagung (`Anggota`: nama, kontak) |
| `products`, `packagings`, `product_packagings` | Produk (`Produk`: kode, nama, kategori, satuan dasar kg), jenis kemasan, konversi kemasan (`isi_kg > 0`, harga default) |
| `customers`, `sales_channels` | Pelanggan (tanpa akun), sumber pasar/saluran |
| `receipts` | Jagung masuk (`PenerimaanJagung`: `member_id` boleh kosong untuk sumber luar, `source_type`, `product_id`, `weight_kg`, `acquisition_cost`, bukti, status) |
| `batch_type_rules` | Pasangan input/output per jenis batch (pemipilan TK→PP, penepungan PP→TP) |
| `production_batches`, `production_lines`, `batch_costs` | Produksi (`BatchProduksi`: jenis, tanggal, status, operator, sisa/susut kg, HPP; `DetailBatch`: `direction` input/output, `product_id`, `qty_kg`, ≥ 1 input & ≥ 1 output; `biaya_batch`: kategori, nilai_alokasi, sumber_biaya — tidak membuat kas) |
| `stock_movements` | Buku mutasi stok (`MutasiStok`: `product_id`, `source_type`, `source_id`, `direction` masuk/keluar, `qty_kg`; append-only) |
| `stock_reservations` | Reservasi (`reservasi_stok`: `order_id`, `product_id`, `qty_kg`, status `active`/`released`/`fulfilled`) |
| `stock_opnames`, `stock_opname_lines` | Stok opname |
| `stock_adjustments` | Pengajuan & persetujuan koreksi stok |
| `orders`, `order_items` | Pesanan (`Pesanan`: pelanggan, saluran, total, status barang, status bayar; `ItemPesanan`: `product_id`, `packaging_id`, `qty_input`, `qty_kg`, `price_snapshot`) |
| `order_returns`, `order_return_items` | Retur barang + verifikasi fisik |
| `cash_accounts`, `cash_transactions` | Akun & mutasi kas (`kas`: jenis masuk/keluar, jumlah, `source_type`, `source_id`, waktu; **unik** `(source_type, source_id)`) |
| `payments` | Pembayaran (`Pembayaran`: `order_id`, jumlah, metode, status `pending`/`verified`/`rejected`, `idempotency_key` unik, diverifikasi oleh/kapan) |
| `refunds`, `expenses`, `expense_categories`, `other_incomes`, `income_categories`, `cash_corrections` | Refund, pengeluaran, pemasukan lain, koreksi kas |
| `document_sequences` | Penomoran dokumen |
| `idempotency_keys` | Kunci unik permintaan + hasil respons tersimpan (kedaluwarsa 24 jam) |
| `print_logs`, `audit_logs` | Riwayat cetak & audit (`audit_log`: pelaku, aksi, objek, sebelum/sesudah, alasan, waktu) |
| `attachments` | Metadata file bukti di Storage |

View turunan: `v_stock_balance` (on_hand, reserved, available, nilai), `v_order_balance` (total, dibayar terverifikasi, refund, tersisa), `v_cash_balance`, serta view laporan untuk rumus §5.9 (`v_daily_flour_output`, `v_batch_hpp`, `v_revenue`, `v_receivables`, `v_raw_share`, `v_digital_share`).

### 9.1 Seed DEMO (SRS §10)

Data uji untuk pengembangan, UAT awal, dan demonstrasi mitra. **Bukan capaian nyata**; disimpan terpisah dari data nyata (lingkungan/basis data DEMO tersendiri).

| Langkah | Data | Hasil yang harus dihasilkan sistem |
|---|---|---|
| Master | Anggota **Petani A**; produk `TK`, `PP`, `TP` (kg); kemasan contoh §4.0 | — |
| Jagung masuk | 100 kg `PP` dari Petani A, biaya perolehan Rp400.000 (Rp4.000/kg)¹ | Stok `PP` 100 kg |
| Batch penepungan | Input 60 kg `PP` → output 50 kg `TP`, sisa/susut 10 kg; biaya bahan terpakai Rp240.000 + biaya proses Rp60.000 | HPP **Rp6.000/kg**; stok `PP` 40 kg, `TP` 50 kg |
| Pesanan | 5 kg `TP` @Rp10.000 | Tagihan **Rp50.000**; reservasi 5 kg; tersedia `TP` 45 kg |
| Pembayaran | Rp30.000 lalu Rp20.000 (keduanya terverifikasi) | Status `partial` → `paid`; kas masuk total **Rp50.000** (dua baris kas) |
| Serah barang | Pesanan diserahkan | Stok `TP` fisik **45 kg**; omzet Rp50.000; piutang Rp0 |

¹ SRS hanya menyebut biaya bahan terpakai Rp240.000 untuk 60 kg; biaya perolehan Rp400.000 untuk 100 kg diturunkan agar rata-rata Rp4.000/kg konsisten.

## 10. Asumsi & Pertanyaan Terbuka

| # | Asumsi saat ini | Perlu dikonfirmasi |
|---|---|---|
| Q1 | ✅ Terjawab (SRS §2, §5): 3 produk `TK` tongkol, `PP` pipilan, `TP` tepung; semua inventori kg; kemasan hanya untuk penjualan dengan konversi kg. Nama tampilan masih sementara. | Merek final dan ukuran kemasan resmi (pak/karung) beserta harga. |
| Q2 | Biaya perolehan dicatat di penerimaan; uang yang dibayarkan dicatat sebagai pengeluaran (§4.7). | Cara penerimaan hasil panen anggota (beli putus/setor), pembelian bahan dari luar, dan cara menetapkan biaya perolehannya — **disepakati saat asesmen minggu 1** (SRS §5, §13). Perlu modul hutang ke anggota? |
| Q3 | Nilai bahan terpakai memakai rata-rata bergerak; rumus HPP mengikuti SRS §10. | Apakah ada preferensi FIFO? |
| Q4 | Tidak ada PPN. | Apakah kelompok tani PKP? |
| Q5 | Serah barang selalu penuh. | Apakah ada pengiriman bertahap? |
| Q6 | ✅ Terjawab (SRS §2): satu kelompok tani (Ngudi Makmur); data usaha internal IRT bukan modul tersendiri. | — |
| Q7 | ✅ Terjawab (SRS §5, §10): retur ada di v1; barang yang sudah diserahkan hanya kembali ke stok sesudah retur fisik terverifikasi; retur sah mengurangi omzet. | ✅ Diputuskan pengguna (3 Nov 2026): retur fisik **dicatat** oleh `admin_kelompok` dan **diverifikasi** oleh `ketua` sebelum barang kembali ke stok (pemisahan tugas; matriks §3.1 sudah disesuaikan). |
| Q8 | ✅ Terjawab (SRS §1, §6): empat peran (`admin_kelompok`, `operator_produksi`, `ketua`, `admin_teknis`); pelanggan tanpa akun. | — |
| Q9 | Porsi jagung mentah awal dihitung dari kg produk terjual (SRS §10). | Faktor konversi setara bahan baku (tongkol → pipilan → tepung) untuk laporan dampak program: diambil dari hasil batch nyata dan disepakati bersama mitra. |
| Q10 | Konsinyasi dan bagi hasil **tidak** dimasukkan di v1 (SRS §5). | Aturan usaha konsinyasi/bagi hasil bila kelak diperlukan. |
| Q11 | `operator_produksi` memegang izin `production.confirm` secara default. | Apakah batch perlu dikonfirmasi orang lain (mis. admin) sesuai izin yang disepakati mitra? |
| Q12 | Persetujuan koreksi stok/kas oleh ketua lewat tombol setujui/tolak di aplikasi. | Bentuk "alur sederhana yang disepakati mitra" (SRS §6), mis. ketua menyetujui di ponsel atau secara berkala. |
| Q13 | Login memakai email + kata sandi (Supabase Auth). | Apakah semua pengurus punya email? Bila tidak, pakai nama pengguna dengan email internal semu dan reset sandi oleh `admin_teknis`. |
| Q14 | Data nyata dan DEMO dipisah per lingkungan (SRS §13 minggu 2). | Saldo awal kas & stok awal nyata: tanggal cut-off dan siapa yang memverifikasi. |
| Q15 | Kategori pemasukan lain: iuran anggota, bantuan/hibah, lainnya. | Daftar kategori pemasukan & pengeluaran resmi kelompok. |
| Q16 | *Asumsi prototipe, perlu dikonfirmasi mitra:* pembatalan (`void`, pembalikan) penerimaan jagung terkonfirmasi dilakukan oleh `admin_kelompok` (FR-RCV-05); pembatalan batch terkonfirmasi dilakukan oleh operator pemegang izin batch (`production.confirm`) **tanpa** persetujuan `ketua`. Keduanya wajib alasan dan hanya bisa bila stok yang diterima/dihasilkan masih tersedia. | Apakah pembatalan batch tetap memerlukan persetujuan `ketua` seperti FR-PRD-08, dan siapa yang berhak membatalkan penerimaan? |
| Q17 | Ambang peringatan susut % per jenis batch (FR-PRD-04) disimpan di `batch_type_rules.max_loss_pct`; **kosong** sehingga belum ada peringatan. | Berapa ambang susut wajar untuk pemipilan dan penepungan? |
| Q18 | *Asumsi M7:* tagihan pesanan yang diserahkan = total − nilai jual retur terverifikasi; piutang & status bayar memakai tagihan ini, kelebihan bayar ditampilkan untuk di-refund. Kas keluar (pengeluaran, refund, koreksi) tidak boleh membuat saldo akun negatif. | Apakah retur selalu diikuti refund/pengurangan tagihan, atau boleh menjadi saldo kredit pelanggan? |

## 11. Rilis

| Rilis | Isi |
|---|---|
| **v1.0 (MVP)** | Semua kebutuhan P0. Kriteria selesai (SRS §14): admin mencatat jagung masuk, operator mengonfirmasi produksi, admin menjual & menerima pembayaran, lalu nota dan laporan cocok dengan stok serta kas; semua fitur terhubung ke database. Diuji dengan data DEMO (§9.1) lalu transaksi nyata. |
| v1.1 | Kebutuhan P1. |
| v2 (kandidat) | Hutang anggota, serah parsial, PDF laporan, portal anggota, notifikasi WhatsApp, konsinyasi/bagi hasil (bila aturan jelas). |
