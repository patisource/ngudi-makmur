# Style Guide — UI/UX, Komponen, Animasi & Koding

Referensi visual: **Core 2.0 – Dashboard Builder** (UI8). Gaya minimal: kanvas abu muda, kartu putih, tipografi tegas, angka besar, satu warna aksen.
Referensi animasi: **prototipe interaktif** (`prototipe/index.html`) adalah rujukan nilai gerak yang berlaku (token, durasi, kurva). **React Bits** (reactbits.dev) tinggal sebagai referensi *konsep* untuk beberapa pola (mis. CountUp), lalu dijinakkan sesuai aturan §6.

> Kalimat kunci: **tenang, padat informasi, dan bergerak hanya bila ada alasannya.** Pengguna kita adalah pengurus Kelompok Tani Ngudi Makmur (admin kelompok, operator produksi, ketua) yang menginput data setiap hari dari laptop **maupun ponsel**, bukan pengunjung landing page.

---

## 1. Prinsip Desain

1. **Data dulu, dekorasi belakangan.** Setiap elemen harus menjawab "angka/aksi apa yang dibutuhkan petugas di layar ini?".
2. **Satu aksen.** Hijau dipakai untuk aksi utama yang positif, status sehat, dan sorotan grafik. Sisanya netral.
3. **Hierarki lewat ukuran & berat huruf**, bukan lewat warna atau bayangan.
4. **Status selalu eksplisit.** Draft, terkonfirmasi, batal, lunas, dan sebagian harus terbaca tanpa menebak, dengan teks dan bukan hanya warna.
5. **Gerak menjelaskan perubahan.** Animasi menunjukkan dari mana sesuatu datang atau apa yang baru berubah. Tidak ada animasi pajangan.
6. **Konsisten > kreatif.** Pola yang sama untuk semua modul: daftar → detail → aksi status.

## 2. Warna

Didefinisikan sebagai CSS variable di `app/globals.css`, dipetakan ke Tailwind lewat `@theme`. **Jangan memakai warna Tailwind mentah** (`bg-green-500`) di komponen.

### 2.1 Token (mode terang)

| Token | Nilai | Pemakaian |
|---|---|---|
| `--bg` | `#F4F4F5` | Kanvas aplikasi |
| `--surface` | `#FFFFFF` | Kartu, tabel, panel |
| `--surface-muted` | `#F7F7F8` | Header tabel, input nonaktif, area sekunder |
| `--border` | `#E8E8EA` | Garis kartu & pemisah |
| `--border-strong` | `#D4D4D8` | Garis input |
| `--text` | `#111113` | Teks utama, angka besar |
| `--text-muted` | `#6B6B73` | Label, keterangan |
| `--text-subtle` | `#9A9AA2` | Placeholder, metadata |
| `--primary` | `#111113` | Tombol utama (hitam, gaya Core) |
| `--primary-fg` | `#FFFFFF` | Teks di atas primary |
| `--accent` | `#2FA84F` | Aksen hijau: highlight grafik, indikator naik, fokus sukses |
| `--accent-soft` | `#E8F6EC` | Latar badge hijau |
| `--danger` | `#E5484D` | Error, indikator turun, aksi destruktif |
| `--danger-soft` | `#FDECEC` | Latar badge merah |
| `--warning` | `#E59A1A` | Stok di bawah minimum, sebagian bayar |
| `--warning-soft` | `#FDF3E1` | Latar badge kuning |
| `--info` | `#3E7BFA` | Informasi netral, tautan (hemat pemakaian) |
| `--focus` | `#2FA84F` | Ring fokus 2px + offset 2px |

### 2.2 Mode gelap

| Token | Nilai |
|---|---|
| `--bg` | `#0E0E10` |
| `--surface` | `#18181B` |
| `--surface-muted` | `#1F1F23` |
| `--border` | `#27272A` |
| `--border-strong` | `#3F3F46` |
| `--text` | `#F4F4F5` |
| `--text-muted` | `#A1A1AA` |
| `--primary` | `#F4F4F5` (teks `#111113`) |
| `--accent` | `#3DBE60` |

Mode gelap aktif lewat `prefers-color-scheme`, dengan tombol tema di topbar (`data-theme`, disimpan di `localStorage`, transisi "tinta tema" §6.5). Kontras minimal **4.5:1** untuk teks normal.

### 2.3 Warna Status (dipakai di seluruh modul)

| Status | Badge |
|---|---|
| `draft` | netral (`surface-muted` + `text-muted`) |
| `posted`, `confirmed` | info |
| `delivered`, `paid`, `approved`, `verified` | accent |
| `partial`, `pending` (mis. pembayaran menunggu verifikasi), stok di bawah minimum | warning |
| `cancelled`, `void`, `rejected`, `unpaid` jatuh tempo | danger |
| `refunded` | netral bergaris |

Badge selalu berisi **teks** (mis. "Lunas", "Sebagian"), dengan titik warna kecil di depan. Tidak pernah hanya warna.

### 2.4 Grafik

- Seri utama: `--accent`. Seri pembanding: `--text` 15% opacity (batang abu seperti Core). Negatif: `--danger`.
- Maksimal **3 warna** per grafik. Tidak memakai gradien isi area kecuali opacity 8–12% dari warna seri.
- Gridline horizontal saja, `--border`, putus-putus. Tanpa border kotak grafik.

## 3. Tipografi

- Font: **Inter** (Google Fonts, via `next/font`), fallback `system-ui`. Angka memakai `font-variant-numeric: tabular-nums` di tabel, KPI, dan input uang.
- Skala (px / line-height / weight):

| Token | Ukuran | Pemakaian |
|---|---|---|
| `display` | 40 / 44 / 600, tracking −0.02em | Angka KPI utama |
| `h1` | 28 / 34 / 600, tracking −0.01em | Judul halaman |
| `h2` | 20 / 28 / 600 | Judul kartu/seksi |
| `h3` | 16 / 24 / 600 | Sub-judul, judul dialog |
| `body` | 14 / 20 / 400 | Teks default aplikasi |
| `body-strong` | 14 / 20 / 500 | Isi sel penting, label tombol |
| `caption` | 12 / 16 / 500 | Label kecil, header tabel (bukan huruf kapital semua) |

- Bahasa Indonesia, *sentence case* ("Tambah anggota", bukan "TAMBAH ANGGOTA" / "Tambah Anggota").
- Format: `Rp 1.250.000` · `1.250,5 kg` · `3 Nov 2026` · `3 Nov 2026, 14.05`. Angka negatif: `−Rp 50.000` (tanda minus asli, bukan tanda kurung).

## 4. Ruang, Radius, Bayangan

- **Grid 4 px.** Spasi umum: 4, 8, 12, 16, 20, 24, 32, 40.
- Padding kartu: 24 (desktop), 16 (≤ 768 px). Jarak antar kartu: 16–24.
- Radius: `sm 8` (badge, chip), `md 12` (input, tombol), `lg 16` (dropdown, dialog kecil), `xl 20` (kartu, dialog). Tombol ikon bulat penuh.
- Bayangan: kartu **tanpa bayangan** (hanya border 1 px), sama seperti Core. Bayangan hanya untuk lapisan melayang:
  - `shadow-pop`: `0 8px 24px -8px rgb(17 17 19 / 0.12), 0 2px 4px rgb(17 17 19 / 0.04)` untuk dropdown, popover, dan toast.
  - `shadow-dialog`: `0 24px 48px -12px rgb(17 17 19 / 0.18)`.

## 5. Layout

### 5.1 App Shell

```
┌────────────┬──────────────────────────────────────────────┐
│ Logo       │ Topbar: judul halaman · cari (⌘K) · profil   │
│            ├──────────────────────────────────────────────┤
│ Sidebar    │ Header halaman: judul · filter · aksi utama  │
│ 248 px     │                                              │
│ (72 px     │ Konten (max-width 1440, padding 32/24/16)    │
│ diciutkan) │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- Sidebar dikelompokkan: **Ringkasan** (Dashboard) · **Operasional** (Jagung masuk, Produksi, Stok) · **Penjualan** (Penjualan, Pelanggan, Retur) · **Keuangan** (Pembayaran, Kas, Pengeluaran, Pemasukan lain) · **Data** (Anggota, Produk) · **Laporan** · **Pengaturan** (akun, izin, printer, backup — `admin_teknis`). Item yang tidak diizinkan untuk peran pengguna tidak ditampilkan (mis. operator produksi tidak melihat grup Keuangan).
- Item aktif: latar `--surface-muted`, teks `--text`, ikon terisi. Tanpa garis warna tebal di tepi.
- ≤ 1024 px: sidebar menjadi drawer (Sheet).

### 5.2 Pola Halaman (wajib sama di semua modul)

| Pola | Isi |
|---|---|
| **Daftar** | Header (judul + tombol utama di kanan) → bar filter (cari, tanggal, status, tombol reset) → DataTable (paginasi server, kolom angka rata kanan) |
| **Detail dokumen** | Header (nomor dokumen + badge status + aksi status di kanan) → grid 2 kolom: kiri isi dokumen (8/12), kanan ringkasan & riwayat (4/12) |
| **Form** | Satu kolom ≤ 720 px untuk master data; editor baris (produksi/penjualan) memakai lebar penuh dengan panel ringkasan *sticky* di kanan |
| **Dashboard** | Baris KPI (5 kartu, bukan 4 kotak kembar, lihat §8.2) → grafik tren (8/12) + stok kritis (4/12) → aktivitas terbaru |

### 5.3 Responsif

`sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1536`. Target utama laptop 1280–1440 **dan ponsel 360–414 px untuk semua form** (SRS: form harus terbaca di ponsel). Tabel data di < 640 px (`sm`) menjadi **daftar kartu**: satu kartu per baris, setiap sel tampil sebagai pasangan label–nilai dengan label diambil dari sel header (`<th>`) kolom tersebut, sehingga tidak ada teks label yang ditulis dua kali; kolom angka tetap rata kanan. Bukan scroll horizontal tanpa batas.

Aturan form di ponsel (< 768 px):

- Satu kolom penuh; label di atas field; tidak ada field berdampingan kecuali pasangan pendek (qty + kemasan).
- Ukuran teks input minimal 16 px (mencegah zoom otomatis), target sentuh minimal 44 × 44 px.
- `inputmode="decimal"` untuk berat kg, `inputmode="numeric"` untuk rupiah; unggah bukti boleh langsung dari kamera (`capture`).
- Editor baris (produksi/penjualan) menjadi daftar kartu per baris; panel ringkasan *sticky* berubah menjadi bilah bawah berisi total + tombol aksi utama.
- Dialog konfirmasi tampil sebagai *bottom sheet* dengan ringkasan dampak tetap terbaca tanpa scroll horizontal.

## 6. Animasi — Gerak yang Dijinakkan

### 6.1 Teknologi

- Rujukan nilai: **`prototipe/index.html`** (blok CSS "gerak" dan komponen `CountUp`, `Seg`, `Modal`, `ThemeToggle`, `Splash`). Aplikasi Next.js wajib meniru nilai di bawah, bukan nilai bawaan pustaka.
- Urutan pilihan: **CSS** (`@keyframes`/`transition` + token CSS variable) → **Web Animations API** (`element.animate`) untuk gerak imperatif sekali jalan (mis. tinta tema) → `requestAnimationFrame` hanya untuk angka (count-up). **Motion** (`motion/react`) tidak wajib; boleh dipakai bila sebuah pola sulit dibuat dengan CSS, asalkan memakai token yang sama. **Tidak memakai GSAP** di v1.
- Komponen React Bits **tidak diimpor apa adanya**. Yang masih relevan diambil konsepnya lalu ditulis ulang di `components/motion/` dengan token di bawah (lihat §6.3).

### 6.2 Token Gerak

Kurva pegas berupa `linear()` hasil generator (sama dengan proyek Lumira); durasinya disimpan sebagai token pasangan `-d`:

```css
--spring-snappy-d: 289ms;
--spring-snappy: linear(0, 0.004 1.3%, 0.032 3.8%, 0.109 7.5%, 0.511 21.3%, 0.699 28.7%, 0.816 35%, 0.912 42.5%, 0.945 46.3%, 0.976 51.2%, 1.007 61.3%, 1.015 75%, 1.005 98.8%, 1);
--spring-smooth-d: 282ms;
--spring-smooth: linear(0, 0.007 2.5%, 0.026 5%, 0.09 10%, 0.574 36.3%, 0.686 43.8%, 0.789 52.5%, 0.874 62.5%, 0.93 72.5%, 0.969 83.8%, 1);
--spring-gentle-d: 565ms;
--spring-gentle: linear(0, 0.015 2.5%, 0.079 6.3%, 0.434 20%, 0.603 27.5%, 0.73 35%, 0.821 42.5%, 0.866 47.5%, 0.9 52.5%, 0.949 63.7%, 0.978 77.5%, 0.995 98.8%, 1);
--expo: cubic-bezier(.16, 1, .3, 1);
--in-out: cubic-bezier(.76, 0, .24, 1);
```

| Token | Nilai | Pemakaian |
|---|---|---|
| `spring-snappy` | 289 ms, `linear()` di atas (lewat ±1,5% lalu kembali, tidak terbaca sebagai pantulan) | Umpan balik tekan tombol (skala 0.97, tombol ikon 0.92), ikon tombol, munculnya elemen kecil (`pop`) |
| `spring-smooth` | 282 ms, tanpa *overshoot* | Indikator menu aktif, *thumb* segmented control, drawer sidebar ponsel |
| `spring-gentle` | 565 ms, tanpa *overshoot* | Toast masuk, ikon tema berganti, pratinjau struk keluar dari printer |
| `expo` | `cubic-bezier(.16,1,.3,1)` | Elemen masuk: halaman, dialog, grafik, teks splash |
| `in-out` | `cubic-bezier(.76,0,.24,1)` | Perpindahan/penutupan besar: garis progres & tirai splash, guratan logo |
| Hover/warna | 120–150 ms `ease` | Latar, warna teks, border |
| Keluar | 160 ms `ease-in` | Dialog/elemen keluar (selalu lebih cepat dari masuk) |

Jarak geser masuk: **10 px** (blok halaman), 12 px (dialog), 14 px (toast); keluar **≤ 6 px**. Skala minimum lapisan: **0.97**. Rotasi hanya pada dua tempat yang disebut eksplisit: ikon tema berganti dan logo splash (−6°).

### 6.3 Peta Pola Gerak → Rujukan

| Pola | Rujukan (prototipe) | Aturan wajib |
|---|---|---|
| **Masuk halaman** (menggantikan AnimatedContent/FadeContent) | CSS `.content > *` | **Satu koreografi per halaman**: tiap blok anak langsung konten fade + `translateY 10px→0`, 0,55 s `expo`, jeda **40 ms**, maksimal **4 langkah** (blok ke-4 dst. memakai jeda yang sama 120 ms). Hanya saat pindah halaman, tidak saat ganti tab/filter |
| **Indikator menu aktif & segmented control** (menggantikan `layoutId`) | `.nav .ind`, komponen `Seg` | Satu lapisan latar yang meluncur; posisi & ukuran **diukur dari tombol aktif** (`offsetTop/Left/Width/Height` → CSS variable) setiap render dan saat *resize*; transisi `spring-smooth`. Transisi baru dinyalakan sesudah frame pertama (`data-ready`) agar tidak meluncur dari 0 saat mount |
| **Dialog** | `Modal` | Masuk: scrim fade 220 ms, panel `translateY 12px` + skala 0.97→1, **0,38 s `expo`**. Keluar: **0,16 s** `ease-in` (fade + turun 6 px, skala 0.98) lalu dilepas dari DOM. Di ponsel tetap *bottom sheet* (§5.3) |
| **Getar (shake)** | `.modal.shake`, event `domain-error` | Hanya bila **server/domain menolak** input (mis. `INSUFFICIENT_STOCK`, bayar melebihi tagihan): dialog teratas bergeser ±6 px, 0,34 s, bersama toast galat. Tidak dipakai untuk validasi biasa saat mengetik |
| **Toast** | `.toast` | Masuk dari bawah kanan (`translateY 14px`, skala 0.97) dengan `spring-gentle`; garis progres 2 px di dasar **menyusut** (`scaleX 1→0`) selama 5,2 s sesuai umur toast; antre maks 3 |
| **Count-up KPI** (konsep **CountUp** React Bits) | `CountUp` | 900 ms, *ease-out quart*; mulai dari nilai sebelumnya (bukan 0); teks **ditulis langsung ke DOM** (`el.textContent`) tiap frame lewat `requestAnimationFrame`, **tanpa** `setState` per frame. Alasannya kehalusan: render ulang React 60× per detik membuat frame terlewat di laptop/ponsel lemah. Format rupiah/kg Indonesia, `tabular-nums` agar lebar tidak goyang |
| **Grafik** | `.chart .bar`, `.bar-track` | Batang tumbuh dari dasar (`scaleY 0→1`, `transform-origin` bawah), 0,8 s `expo`, sekali saat mount. Bar stok/minimum mengisi 0,9 s `expo`: isian selebar track digeser `translateX(p − 100%)` di dalam track ber-`overflow:hidden` (GPU, ujung kanan tetap bulat), bukan animasi `width` |
| **Highlight baris baru** | `tr.flash` | Latar `accent-soft` memudar 1,4 s, hanya untuk dokumen yang baru dibuat/dibuka pengguna (juga dari palet perintah) |
| **Judul login** (konsep **BlurText**) | `.word` | Per kata (bukan per huruf), jeda 55 ms, 0,6 s, sekali |
| **Perubahan status dokumen** | — | Badge lama memudar keluar (120 ms), badge baru masuk skala 0.97→1 (200 ms); tombol aksi yang tidak berlaku lagi memudar, bukan hilang mendadak |
| **Skeleton** | — | Shimmer pelan 1,6 s, kontras rendah; tampil hanya bila memuat > 300 ms |

React Bits yang masih boleh dipakai sebagai konsep (ditulis ulang, token di atas): **CountUp** (di atas), **AnimatedList** untuk "Aktivitas terbaru" (stagger 30 ms, maks 8 item), **Stepper** untuk wizard stok opname, **Counter** untuk badge jumlah persetujuan tertunda (hanya bila angka berubah saat halaman terbuka). Baris tabel **tidak** dianimasikan saat paginasi/filter.

### 6.4 Aturan Gerak

1. Animasikan hanya `transform` dan `opacity` (plus `background-color` untuk highlight). Jangan `width/height/top/left`; satu-satunya pengecualian adalah ukuran *thumb* segmented control yang kecil.
2. Tidak ada animasi berulang tanpa henti (kecuali spinner/skeleton/indikator tak tentu saat memuat).
3. Satu layar maksimal **satu** koreografi masuk; elemen di bawah lipatan tidak menunggu scroll.
4. Interaksi input (mengetik, memilih) **tidak boleh tertunda** oleh animasi.
5. `prefers-reduced-motion: reduce` → **semua** animasi & transisi dimatikan (durasi ≈ 0, tanpa jeda): count-up langsung nilai akhir, dialog tutup tanpa animasi, tinta tema diganti seketika, splash dilewati.
6. Halaman cetak (`@media print`) tanpa animasi sama sekali.
7. **Hanya GPU.** Gerak layar penuh memakai `transform`/`opacity` saja. Animasi `clip-path` layar penuh (`path()`, polygon, `inset() round`) dan lapisan SVG besar **sudah dicoba dan tersendat** (*jank*), karena bentuknya digambar ulang tiap frame. Semua itu dilarang untuk gerak layar penuh. Bentuk organik dibuat dari klip `border-radius` yang di-*scale* (lihat §6.5). `clip-path: inset()` persegi boleh untuk elemen kecil (tirai splash, struk keluar printer).
8. Angka yang berubah per frame ditulis langsung ke DOM, bukan lewat state React (lihat count-up).

### 6.5 Transisi Tema ("tinta tema")

- Pemicu: tombol tema di topbar. Titik asal selalu **pusat tombol tema** (`getBoundingClientRect`), **bukan** posisi kursor.
- **Isi halaman tidak pernah tertutup.** View Transitions memotret tampilan lama, tema diterapkan (`data-theme` pada `<html>`), lalu tampilan baru **terbuka dari tombol** lewat jendela berbentuk "danau", sementara tampilan lama tetap terlihat di luar jendela. Tidak ada lapisan warna polos.
- Lapisan. `body` lama dipotret sebagai grup `theme-old` (z-index 1). Halaman baru = grup `root` (z-index 2). Potret root lama disembunyikan. Latar `::view-transition` = warna latar body lama, karena latar body ikut kanvas dan tidak ada di potret.
- Bentuk "danau": jendela = `::view-transition-image-pair(root)` berukuran D×D (D = 2 × jangkauan) dengan pusat di tombol, `overflow: hidden`, `border-radius` acak **8 nilai** (4 horizontal / 4 vertikal, masing-masing 36–64%). Hasilnya gumpalan bulat berlekuk yang tidak pernah sama. Jangkauan = jarak ke sudut terjauh ÷ 0,7 + 24 px.
- Gerak (**hanya `transform`**, dikerjakan GPU tanpa gambar ulang):
  - jendela: `rotate(±12–26° → 0) scale(0,015 → 1)`;
  - `::view-transition-new(root)` di dalamnya: kebalikannya (`scale(1/s) rotate(−a)`) dengan titik asal yang sama, sehingga halaman baru diam di tempat;
  - durasi **760 ms**, *ease-in-out cubic*, disampel **120 keyframe** linear agar s dan 1/s tetap saling meniadakan.
- Selama transisi, semua `transition` CSS dimatikan, supaya halaman baru tidak digambar ulang karena transisi warnanya sendiri.
- Kebersihan:
  - animasi `fill: forwards` dibatalkan setelah selesai agar tidak menumpuk;
  - pembersihan hanya sekali per transisi, sehingga pengaman waktu transisi lama tidak memotong transisi berikutnya.
- Browser tanpa View Transitions → tema berganti seketika. Klik selama transisi berjalan **diabaikan**; pengaman melepas kunci paling lambat 3 s (untuk tab di latar belakang).
- Pilihan disimpan di `localStorage` dan dibaca sebelum render pertama (tanpa kedip tema). Tanpa pilihan tersimpan, ikut `prefers-color-scheme` (§2.2). Reduced motion → tema berganti seketika.

### 6.6 Welcome Splash

- Durasi ± 3 s, **sekali per sesi browser** (`sessionStorage`); dapat dilewati dengan klik/sentuh atau tombol apa pun; **tidak tampil** saat `prefers-reduced-motion`. Tautan "Putar ulang intro" di halaman login memutarnya lagi.
- Urutan: logo tunas membesar (skala 0.7→1, −6°→0°, 0,9 s `expo`) sambil guratannya tergambar (`stroke-dashoffset`, 1,1 s `in-out`, jeda 120 ms per guratan) → huruf "Ngudi Makmur" naik satu per satu (0,9 s `expo`, jeda **26 ms** per huruf, mulai 0,42 s) → subjudul ("Kelompok Tani · Desa Baturejo, Sukolilo, Pati") memudar masuk (0,95 s).
- Kaki: garis progres 2 px terisi (`scaleX`, 1,55 s `in-out`) sementara label bergulir lima langkah alur usaha: Jagung masuk → Pemipilan & penepungan → Stok & penjualan → Pembayaran & kas → Nota & laporan.
- Keluar (± 2,25 s atau saat dilewati): isi terangkat 22 px dan memudar (0,4–0,5 s), lalu seluruh splash **terangkat seperti tirai** (`clip-path: inset(0 0 100% 0)`, 0,68 s `in-out`). Halaman login **dipasang tepat saat tirai mulai terangkat** sehingga koreografi masuknya sendiri (§6.3) ikut berjalan.
- Hanya teks netral & warna token; bukan hero pemasaran (§7).

### 6.7 Palet Perintah (`Ctrl/⌘ + K`)

- Dibuka dengan `Ctrl/⌘ K` (menekannya lagi menutup) atau tombol "Cari" di topbar; hanya aktif setelah login; tampil sebagai dialog di sepertiga atas layar.
- Isi: **halaman** yang diizinkan peran + **dokumen**: pesanan (nomor · pelanggan · total), jagung masuk (nomor · produk · kg), batch (nomor · jenis · HPP/kg). Jenis dokumen hanya muncul bila halaman induknya diizinkan untuk peran pengguna (operator produksi tidak melihat pesanan). Filter teks, maks 12 hasil.
- Keyboard: `↑/↓` memilih, `Enter` membuka, `Esc` menutup; fokus langsung di kolom cari. Memilih dokumen membuka halamannya dengan baris tersebut di-*highlight* (§6.3).

## 7. Anti "AI Slop" — Daftar Larangan

Pola yang membuat dashboard tampak generik atau buatan template AI. **Jangan dipakai.**

**Visual**
- ✗ Gradien ungu–biru, teks bergradien, latar *aurora*/*mesh*/*noise*, partikel, *glow* neon.
- ✗ *Glassmorphism* (blur latar transparan) pada kartu data.
- ✗ Bayangan besar di setiap kartu (`shadow-2xl`) atau radius berlebihan di semua elemen.
- ✗ Ikon di dalam lingkaran berwarna pastel di setiap kartu KPI.
- ✗ Emoji sebagai ikon atau di judul ("Selamat datang kembali 👋").
- ✗ Ilustrasi 3D/abstrak dekoratif di halaman kerja.

**Layout**
- ✗ Empat kartu KPI identik dengan "+12,5% ↑" palsu. Persentase hanya tampil bila ada periode pembanding yang nyata (FR-DASH-07), dan selalu menyebut pembandingnya ("vs Okt 2026").
- ✗ *Bento grid* acak ukuran tanpa alasan informasi.
- ✗ Hero section, tagline, atau CTA pemasaran di dalam aplikasi.
- ✗ Semua konten rata tengah. Aplikasi data rata kiri; angka rata kanan.
- ✗ Grafik dekoratif tanpa sumbu/label, atau grafik tanpa data nyata.
- ✗ Teks pengisi ("Lorem ipsum", "John Doe", "Acme Corp"). Contoh data harus realistis: nama anggota lokal, kg, dan harga jagung yang masuk akal (acuan: seed DEMO PRD §9.1, mis. Petani A, 100 kg pipilan, tepung Rp10.000/kg).

**Gerak**
- ✗ Semua elemen memantul (spring dengan overshoot), *tilt* 3D saat hover, kursor magnet.
- ✗ Efek mengetik, teks acak (*scramble/decrypt*), teks berkilau (*shiny*) di aplikasi kerja.
- ✗ Animasi saat scroll di halaman data.
- ✗ Animasi masuk ulang setiap kali tab/filter berganti.

**Copy**
- ✗ Kata hampa: "Seamless", "Powerful insights", "Supercharge". Pakai bahasa petugas: "Jagung masuk bulan ini", "Belum lunas", "Stok tersedia".

## 8. Spesifikasi Layar Kunci

### 8.1 Login

- Dua kolom ≥ 1024 px: kiri form (lebar 400 px, rata kiri vertikal-tengah), kanan panel `--surface-muted` berisi **ringkasan nyata yang tidak sensitif**: nama kelompok tani (Kelompok Tani Ngudi Makmur), alamat (Desa Baturejo, Kec. Sukolilo, Kab. Pati), dan satu foto lahan/gudang asli (bukan ilustrasi stok). Di layar kecil hanya form. Nama & alamat diambil dari pengaturan, bukan di-*hardcode*.
- Judul "Masuk ke [Nama Kelompok]" (mis. "Masuk ke Kelompok Tani Ngudi Makmur") dengan efek blur per kata (sekali, §6.3).
- Didahului welcome splash sekali per sesi (§6.6); tautan kecil "Putar ulang intro" di bawah form.
- Field email, kata sandi (tombol tampilkan), tombol hitam lebar penuh "Masuk", tautan "Lupa kata sandi?".
- Error ditampilkan di atas form sebagai pesan tunggal yang tidak membocorkan apakah email terdaftar.

### 8.2 Dashboard

- Header: "Ringkasan" + segmented control periode (Hari ini · 7 hari · Bulan ini · Bulan lalu · Kustom) dengan *thumb* meluncur (§6.3).
- **Kartu KPI** (lebar tidak harus sama): kartu pertama lebih lebar berisi **Omzet** (penjualan diserahkan − retur; angka display + mini bar chart harian), lalu Jagung masuk (kg + Rp), Produksi tepung (kg hari ini vs **target 50 kg/hari** sebagai garis/teks pembanding, + susut %), Kas (saldo total + masuk/keluar), Piutang. Label di atas angka, keterangan pembanding kecil di bawah. Omzet dan kas diberi label jelas agar tidak tertukar ("Omzet" ≠ "Uang diterima").
- Baris kedua: grafik "Jagung masuk vs Penjualan (kg)" (batang abu + garis hijau, gaya Core) dan panel "Stok perlu perhatian" (produk di bawah minimum, dengan bar tersedia/minimum; fisik, reservasi, tersedia dalam kg).
- Baris ketiga: "Aktivitas terbaru" (AnimatedList) dan "Menunggu tindakan": koreksi stok/kas dan pembatalan batch untuk ketua; pembayaran menunggu verifikasi untuk admin kelompok.
- Kartu yang tampil mengikuti peran (operator produksi: produksi & stok saja). Di ponsel, kartu KPI menjadi satu kolom berurutan sesuai prioritas peran.

### 8.3 Editor Produksi / Penjualan

- Tabel baris yang bisa diedit di tempat; tombol "+ Tambah baris" di bawah tabel; `Enter` di kolom terakhir menambah baris.
- Panel ringkasan *sticky* kanan: total input, output, susut % (warning bila > ambang), biaya, HPP/kg, atau subtotal/diskon/total untuk penjualan. Angka berubah dengan CountUp 300 ms.
- Editor produksi: pilih jenis batch (pemipilan/penepungan) lebih dulu; pilihan produk input/output mengikuti jenis tersebut. Semua berat dalam kg. Bila output 0, panel menampilkan "Data belum cukup untuk menghitung HPP" (bukan Rp0 atau error).
- Editor penjualan: pilih saluran (langsung, WhatsApp, media sosial, marketplace, lainnya); qty boleh per kemasan dengan konversi kg terlihat; harga terisi dari katalog dan terkunci sebagai harga snapshot setelah disimpan.
- Aksi: "Simpan draft" (sekunder) dan "Konfirmasi" (primer) → dialog konfirmasi yang merangkum dampak (contoh batch DEMO: "Jagung pipilan −60 kg, Tepung jagung +50 kg, sisa/susut 10 kg, HPP Rp6.000/kg"). Nama produk diambil dari master, bukan di-*hardcode*.

### 8.4 Nota (cetak)

- **Struk thermal adalah format utama.** Kertas yang didukung:

| Kertas | Lebar cetak efektif | Kolom (Font A) |
|---|---|---|
| 80 mm (default) | 72 mm | 48 |
| 58 mm | 48 mm | 32 |

- Pilihan kertas disimpan per perangkat. A5 hanya alternatif (di luar prototipe).
- Satu susunan baris (`notaLines`) dipakai bersama untuk pratinjau, cetak via driver, dan byte ESC/POS, sehingga ketiganya selalu sama. Baris kiri–kanan diratakan dengan spasi ke jumlah kolom kertas; teks yang terlalu panjang dipotong dengan titik.
- Isi berurutan:
  1. `NGUDI MAKMUR` — rata tengah, tebal, **ukuran ganda**; lalu alamat (Kelompok Tani · Desa Baturejo / Kec. Sukolilo, Kab. Pati) rata tengah.
  2. Garis pemisah `-` selebar kolom; bila cetak ulang: `*** CETAK ULANG KE-n ***` rata tengah, tebal.
  3. No. nota · Tanggal · Kasir (pengguna yang mencetak) · Pelanggan · Saluran (label kiri, nilai kanan).
  4. Pemisah → per item: nama produk – kemasan, lalu baris `qty x harga (kg)` dengan subtotal di kanan.
  5. Pemisah → Subtotal · Ongkos kirim (bila ada) · **TOTAL** (tebal).
  6. Bila ada: pemisah → "Pembayaran", tiap pembayaran terverifikasi (metode, tanggal, jumlah) dan refund (jumlah negatif).
  7. **Sisa tagihan** (tebal) → Status bayar → Status barang.
  8. Pemisah → ucapan terima kasih, "Simpan struk ini sebagai bukti.", dan waktu cetak (rata tengah).
- **Hanya ASCII.** Semua teks ditransliterasi sebelum dicetak: `·`/`•`/tanda pisah/minus → `-`, `×` → `x`, `→` → `>`, kutip lengkung → kutip lurus, `…` → `...`, huruf beraksen → huruf dasar, karakter lain → `?`. Rupiah ditulis `Rp1.250.000`, negatif `-Rp50.000` (pengecualian dari §3 karena printer tidak punya glif minus asli).
- **Jalur cetak A — via driver printer:** halaman khusus cetak yang hanya berisi struk (elemen lain disembunyikan), `@page { size: <kertas>mm auto; margin: 0 }`, lebar isi = lebar cetak efektif, font **Courier 7,2 pt** (judul 14,4 pt tebal), hitam di putih, tanpa animasi.
- **Jalur cetak B — langsung ESC/POS** lewat Web Serial (USB/Serial, termasuk Bluetooth yang terpasang sebagai port COM), **9600 baud**, Chrome/Edge desktop: `ESC @` (init) → `ESC t 0` (code page PC437) → per baris `ESC a n` (rata 0/1/2), `ESC E n` (tebal), `GS ! 0x11` (ukuran ganda) atau `GS ! 0`, teks, `LF` → akhir: `ESC d 4` (feed 4 baris) lalu `GS V 66 0` (potong kertas).
- Mencetak (pertama maupun ulang) **tidak pernah mengubah stok atau kas** dan memakai nomor nota yang sama; hanya log audit cetak yang bertambah.
- Bila cetak gagal atau printer tidak dipilih, tampilkan pesan netral ("Gagal mengirim ke printer. Data tidak berubah; silakan cetak ulang.") + tombol "Cetak ulang".
- Catatan: viewer Artifact (iframe) memblokir dialog cetak dan akses perangkat (Web Serial). Uji cetak sungguhan dengan membuka berkas langsung di Chrome/Edge.

## 9. Komponen & Interaksi

- Dasar komponen: **shadcn/ui** (Radix) di `components/ui/`, di-*restyle* sesuai token. Jangan menyalin gaya default shadcn tanpa penyesuaian.
- Ikon: **Lucide**, stroke 1.75, ukuran 16 (inline) / 20 (navigasi).
- Tombol: `primary` (hitam), `secondary` (border), `ghost`, `danger`. Tinggi 40 (default), 32 (kecil). Maksimal **satu** tombol primary per area.
- Form: label di atas field; pesan bantuan abu; pesan error merah di bawah field, dari server (kode → pesan Indonesia). Field wajib bertanda "*".
- Input uang: prefix "Rp", pemisah ribuan otomatis saat mengetik, nilai dikirim sebagai integer.
- Input qty: angka kg untuk inventori (jagung masuk, produksi, opname); pada penjualan angka + pemilih kemasan, dengan hasil konversi kecil di bawah ("2 pak 0,5 kg = 1 kg").
- Aksi destruktif/irreversibel (konfirmasi, batal, void, posting opname) **selalu** lewat dialog yang menjelaskan dampaknya, dengan tombol yang menyebut aksinya ("Batalkan penjualan", bukan "OK").
- Empty state: satu kalimat penjelas + satu tombol aksi. Tanpa ilustrasi besar.
- Shortcut: `⌘/Ctrl K` palet perintah (lompat ke halaman & dokumen, §6.7), `N` buat baru di halaman daftar, `Esc` tutup dialog.
- Toast: pesan hasil aksi (sukses/peringatan/galat) dengan titik warna + teks; galat domain dari server juga memicu getar dialog (§6.3).

## 10. Standar Koding

### 10.1 Umum

- TypeScript `strict`, tanpa `any` (pakai `unknown` + narrowing). Tipe database dari `supabase gen types`.
- Penamaan: komponen `PascalCase.tsx`, hook `useCamelCase.ts`, util `kebab-case.ts`, tabel/kolom SQL `snake_case`, route segment `kebab-case` berbahasa Indonesia (`/jagung-masuk`, `/produksi`).
- Teks UI berbahasa Indonesia; kode, nama variabel, dan komentar teknis berbahasa Inggris.
- Server Component secara default; `"use client"` hanya untuk interaktivitas atau animasi.

### 10.2 Data & Bisnis

- **Tidak ada logika bisnis di komponen client.** Perhitungan total, HPP, dan status hanya untuk *pratinjau*; nilai sah dari server.
- Mutasi lewat Server Action/Route Handler → `requireRole` → Zod → fungsi RPC Postgres. Lihat [CLAUDE.md](../CLAUDE.md).
- Uang `number` integer rupiah di TS (aman sampai 9 kuadriliun), `bigint` di SQL. Qty `string` desimal dari DB → dikonversi dengan util `qty()`; jangan menjumlah float untuk stok.
- Tanggal bisnis `date` (tanpa jam) di SQL; tampilan memakai `Asia/Jakarta`.

### 10.3 Styling

- Tailwind utility + token. Varian komponen dengan `cva`; gabung kelas dengan `cn()`.
- Dilarang: nilai arbitrer warna (`bg-[#123456]`), `!important`, inline style kecuali nilai animasi dinamis.
- Kelas diurutkan otomatis (prettier-plugin-tailwindcss).

### 10.4 Testing

- Unit (Vitest): util format, kalkulasi HPP/total, schema Zod.
- Integrasi DB: fungsi posting (stok, kas, nomor, idempotensi, konkurensi).
- E2E (Playwright): alur utama per peran, termasuk viewport ponsel (360 × 800) untuk form.
- Komponen animasi diuji juga dengan `prefers-reduced-motion`.
