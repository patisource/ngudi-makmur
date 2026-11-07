# CLAUDE.md

Panduan kerja untuk AI (Claude Code) dan kontributor di repositori **Sistem Manajemen Kelompok Tani Ngudi Makmur** (Desa Baturejo, Kec. Sukolilo, Kab. Pati). Sumber kebutuhan: SRS v2.0 (13 Okt 2026), dituangkan ke PRD.

## Konteks Singkat

Aplikasi web responsif internal untuk pengurus kelompok tani: jagung masuk → pemipilan/penepungan → stok → pesanan → pembayaran & kas → nota thermal & laporan. Satu kelompok tani, empat peran: `admin_kelompok` (master, jagung masuk, pesanan, pembayaran, kas, nota), `operator_produksi` (batch produksi, lihat stok; **tidak boleh** menyentuh pembayaran/kas), `ketua` (baca laporan, setujui koreksi stok/kas), `admin_teknis` (akun, izin, server, backup; bukan pencatat transaksi). Pelanggan tidak punya akun. Sejak M10 ada peran kelima `pengurus_irt` untuk modul **IRT Sekar Arum** (PRD §4.9): bahan masuk → produksi → stok → penjualan IRT, **tanpa kas**, produk jadi dalam **pcs** (pack = isi pcs tetap); pengurus IRT hanya melihat data IRT + stok kelompok untuk produk yang dihubungkan; `ketua` membaca data IRT. Data IRT terpisah dari stok/kas kelompok (tabel `irt_*`); jembatan satu-satunya adalah trigger tepung masuk saat pesanan pelanggan IRT diserahkan.

Produk **kelompok** v1 hanya tiga, semua inventori kelompok dalam **kg** (produk IRT dikelola terpisah di `irt_items`, pcs/pack): **Tongkol (`TK`) → pemipilan → Pipilan (`PP`) → penepungan → Tepung (`TP`)** (PRD §4.0). Kemasan (mis. pak 0,5 kg, karung 50 kg) hanya untuk penjualan dengan konversi kg eksplisit. Nama produk masih sementara (merek belum final), jadi jangan pernah meng-*hardcode* nama produk di kode; rujuk lewat `products.code` (`TK`, `PP`, `TP`), kategori (`mentah`/`olahan`), atau `id`.

Sebelum mengerjakan apa pun, baca bagian yang relevan dari:

| Dokumen | Kapan dibaca |
|---|---|
| [PRD.md](docs/PRD.md) | Apa yang dibangun, peran (§3), aturan domain (§4), rumus laporan (§5.9), status (§6), API (§8.1), seed DEMO (§9.1) |
| [Task.md](docs/Task.md) | Task mana yang sedang dikerjakan & Definition of Done |
| [StyleGuide.md](docs/StyleGuide.md) | Setiap kali menyentuh UI, animasi, atau gaya kode |
| [Security.md](docs/Security.md) | Setiap kali menyentuh auth, RLS, validasi, file, atau fungsi posting |

Bila dokumen dan permintaan pengguna bertentangan, **tanyakan** dulu; jangan diam-diam memilih salah satu.

## Stack

- Next.js (App Router) + TypeScript strict + React Server Components
- Tailwind CSS + shadcn/ui (di-restyle) + Lucide
- Motion (`motion/react`) + komponen React Bits yang disalin & dijinakkan
- Supabase: PostgreSQL, Auth (`@supabase/ssr`), Storage
- Zod, react-hook-form, TanStack Table, Recharts
- Vitest, Playwright, pgTAP
- pnpm

## Perintah

```bash
pnpm dev              # jalankan aplikasi (http://localhost:3000)
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest (unit + integrasi)
pnpm test:e2e         # Playwright
supabase start        # Postgres + Auth + Storage lokal
supabase db reset     # terapkan ulang migrasi + seed
supabase migration new <nama>   # buat file migrasi baru
pnpm db:types         # regenerasi lib/supabase/types.ts
supabase test db      # pgTAP
```

Setelah mengubah skema: buat migrasi → `supabase db reset` → `pnpm db:types` → perbaiki tipe → test.

## Struktur Folder

```
app/
  (auth)/login/                 # halaman login
  (app)/                        # semua halaman yang butuh sesi; layout = app shell
    dashboard/
    anggota/  produk/  pelanggan/
    jagung-masuk/  produksi/  stok/
    penjualan/  retur/  pembayaran/  kas/  pengeluaran/  pemasukan/
    laporan/  pengaturan/           # pengaturan: akun, izin, printer, backup (admin_teknis)
  api/v1/                       # Route Handlers (kontrak PRD §8.1)
    orders/[id]/payments/route.ts
    orders/[id]/fulfill/route.ts
    orders/[id]/receipt/route.ts
    dashboard/route.ts
    reports/[type]/route.ts
  print/                        # layout cetak nota (tanpa app shell)
components/
  ui/                           # primitif shadcn yang sudah di-restyle
  motion/                       # FadeIn, Stagger, CountUp, AnimatedList, dll.
  shared/                       # DataTable, MoneyInput, QtyInput, StatusBadge, PageHeader
features/<modul>/               # komponen, server actions, query per modul
  components/  actions.ts  queries.ts
lib/
  auth/                         # requireRole, permissions.ts
  supabase/                     # client server/browser, types.ts (generated)
  validation/                   # schema Zod per modul (dipakai klien & server)
  format.ts  money.ts  qty.ts  dates.ts  errors.ts  idempotency.ts
supabase/
  migrations/                   # SQL berurutan; JANGAN edit migrasi yang sudah di-merge
  tests/                        # pgTAP
  seed.sql                      # data dasar (produk TK/PP/TP, kemasan, jenis batch, kategori)
  seed_demo.sql                 # data DEMO PRD §9.1 — hanya lingkungan dev/DEMO
tests/e2e/
```

## Aturan Wajib

### Domain & data

1. **Stok tidak pernah di-UPDATE langsung.** Semua perubahan stok = baris baru di `stock_movements` (kg, `source_type`+`source_id`) lewat fungsi posting. Membatalkan = mutasi balik. Barang yang sudah diserahkan hanya kembali ke stok lewat retur terverifikasi.
2. **Semua posting** (konfirmasi jagung masuk, konfirmasi batch, konfirmasi/serah/batal pesanan, retur, verifikasi pembayaran, refund, pengeluaran, pemasukan lain, opname, koreksi stok/kas) diimplementasikan sebagai **fungsi PL/pgSQL** yang atomik, mengunci baris terkait, memeriksa peran/izin, dan menulis `audit_logs`. Server Next.js hanya memanggil `supabase.rpc(...)`. Konfirmasi dua kali tidak boleh menggandakan stok/kas.
3. **Endpoint posting wajib idempoten** (`Idempotency-Key`), lihat Security.md §6.
4. Uang = **integer rupiah** (`bigint` di SQL, `number` di TS). Berat/qty = kg `numeric(14,3)`; jangan menjumlah stok dengan float JS di logika bisnis. Konversi kemasan > 0.
5. Total, harga snapshot, `qty_kg`, HPP, status, dan nomor dokumen **dihitung di server**. Nilai dari klien untuk field-field ini diabaikan.
6. **Kas hanya dari**: pembayaran terverifikasi, pemasukan lain, pengeluaran, refund, koreksi kas disetujui — tepat satu baris per sumber (`UNIQUE (source_type, source_id)`). Biaya batch dan biaya perolehan **tidak pernah** membuat kas (PRD §4.7).
7. Status bayar dan status barang terpisah; lunas ≠ diserahkan.
8. Tanggal bisnis bertipe `date`, zona Asia/Jakarta.
9. Master data diarsip (`archived_at`), tidak dihapus. Dokumen terkonfirmasi terkunci, tidak diedit atau dihapus.

### Alur setiap mutasi

```
Form (client) ──▶ Server Action / Route Handler
                    1. const user = await requireRole([...])
                    2. const input = schema.strict().parse(raw)
                    3. withIdempotency(key, () => supabase.rpc("confirm_order", {...}))
                    4. mapDbError(e) → { code, message }
                    5. revalidatePath(...)
```

### Keamanan

- RLS aktif di setiap tabel baru, dalam migrasi yang sama dengan `create table`.
- Fungsi `security definer` selalu `set search_path = ''` dan cek `has_role()` di awal.
- Jangan pernah memakai `service_role` untuk permintaan pengguna biasa atau mengimpornya di file client.
- Jangan menampilkan pesan error SQL ke pengguna.

### UI & animasi

- Ikuti token di StyleGuide.md §2–§4; jangan memakai warna Tailwind mentah atau nilai arbitrer.
- Setiap halaman daftar/detail/form mengikuti pola StyleGuide §5.2.
- Animasi hanya dari `components/motion/` dengan token §6.2; periksa daftar larangan **§7 Anti "AI Slop"** sebelum menyelesaikan UI.
- Setiap halaman punya state loading (skeleton), kosong, dan error.
- Semua teks UI berbahasa Indonesia, *sentence case*.

### Kode

- Server Component default; `"use client"` seperlunya.
- Tanpa `any`, tanpa `console.log` yang tertinggal, tanpa data dummy di halaman produksi.
- Ikuti gaya kode di sekitarnya; jangan menambah library baru tanpa alasan tertulis di PR.
- Jangan mengedit migrasi yang sudah di-merge; buat migrasi baru.

## Cara Bekerja

1. Ambil task dari [Task.md](docs/Task.md) (urut milestone). Tandai `[~]` saat mulai.
2. Untuk task berisiko (skema, fungsi posting, RLS): tulis rencana singkat dulu (tabel/fungsi yang disentuh, test yang akan ditulis) dan minta persetujuan.
3. Tulis test lebih dulu untuk fungsi posting dan perhitungan (HPP, total, saldo).
4. Implementasi kecil dan bertahap; jalankan `pnpm lint && pnpm typecheck && pnpm test` sebelum menyatakan selesai.
5. Untuk perubahan UI, jalankan aplikasi dan periksa halaman di 1280 px, 768 px, dan **ponsel 360 px** (form wajib terbaca & bisa diisi), mode terang & gelap, serta dengan *reduced motion*.
6. Tandai `[x]` di Task.md pada commit yang sama. Pesan commit: `feat(penjualan): konfirmasi & reservasi stok (T6.3)`. Format Conventional Commits.
7. Uji alur dengan seed DEMO (PRD §9.1) dan pastikan angka hasilnya cocok (HPP Rp6.000/kg, stok akhir PP 40 kg & TP 45 kg, kas masuk Rp50.000).
8. Laporkan dengan jujur: apa yang selesai, apa yang belum diuji, dan keputusan yang perlu dikonfirmasi pengguna (tambahkan ke PRD §10 bila menyangkut domain).

## Hal yang Harus Ditanyakan, Bukan Diputuskan Sendiri

- Perubahan aturan domain (metode HPP, rumus laporan, alur status, aturan pembatalan/retur).
- Menambah peran atau mengubah matriks hak akses (empat peran SRS + `pengurus_irt` bersifat tetap).
- Menambah produk, jenis batch, atau satuan inventori selain kg.
- Cara penerimaan hasil panen anggota/biaya perolehan, konsinyasi, bagi hasil (belum diputuskan; PRD §10).
- Menambah dependensi besar atau layanan pihak ketiga.
- Apa pun yang termasuk Non-Goals PRD §2 (marketplace, payment gateway, aplikasi native). Modul IRT sudah dikeluarkan dari Non-Goals (Q24), tetapi **kas IRT, IRT kedua, atau menghubungkan IRT ke kas kelompok** tetap harus ditanyakan.

## Glosarium

| Istilah | Arti |
|---|---|
| Jagung masuk / penerimaan | Pencatatan jagung tongkol/pipilan diterima dari anggota atau sumber luar (`receipts`); draft → konfirmasi |
| Batch produksi | Satu proses olah `pemipilan` (TK → PP) atau `penepungan` (PP → TP): input → output (`production_batches`, `production_lines`) |
| Biaya batch | Alokasi biaya ke HPP (`batch_costs`); tidak membuat kas |
| HPP | Harga pokok produksi per kg output layak jual |
| Sisa / susut | Selisih berat input dan output (kg) |
| Fisik tercatat / reservasi / tersedia | `on_hand` / `reserved` / `available` |
| Kemasan | Satuan jual dengan isi kg tetap (mis. pak 0,5 kg); inventori tetap kg |
| Saluran / sumber pasar | `channel` pesanan: langsung, WhatsApp, media sosial, marketplace, lainnya |
| Serah barang | Penyerahan barang pesanan (`fulfill`) |
| Retur | Pengembalian barang yang sudah diserahkan; masuk stok setelah verifikasi fisik |
| Verifikasi pembayaran | Pengecekan admin atas tunai/transfer; baru membuat kas setelah `verified` |
| Pemasukan lain | Kas masuk di luar pembayaran pesanan (`other_incomes`) |
| Omzet | Nilai pesanan diserahkan − retur sah (≠ uang diterima) |
| Nota | Bukti penjualan thermal 80 mm (`receipt` di API) |
| Stok opname | Penghitungan fisik stok untuk dicocokkan |
| Order | Sebutan API/kode untuk pesanan (`orders`) |
