# SIM Kelompok Tani Ngudi Makmur

Aplikasi web pencatatan jagung masuk, produksi, stok, penjualan, pembayaran & kas, nota thermal, dan laporan untuk Kelompok Tani Ngudi Makmur (Desa Baturejo, Kec. Sukolilo, Kab. Pati).

Stack: Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Vercel.
Kebutuhan & aturan: [CLAUDE.md](CLAUDE.md) dan [docs/](docs/).

## Menjalankan di laptop

```bash
pnpm install
cp .env.example .env.local   # lalu isi nilainya (lihat di bawah)
pnpm dev                     # http://localhost:3000
```

Halaman awal menampilkan variabel lingkungan mana yang sudah terisi.

## Menyambungkan layanan (akun kelurahan)

### 1. Supabase
1. Login ke [supabase.com/dashboard](https://supabase.com/dashboard) dengan akun kelurahan → **New project**.
   Region: **Southeast Asia (Singapore)**. Simpan kata sandi database.
2. **Project Settings → Data API**: salin *Project URL* ke `NEXT_PUBLIC_SUPABASE_URL`.
3. **Project Settings → API Keys**: salin *Publishable key* ke `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   dan *Secret key* ke `SUPABASE_SECRET_KEY` (rahasia, jangan dibagikan).
4. `SUPABASE_PROJECT_REF` = bagian depan URL proyek; `SUPABASE_DB_PASSWORD` = kata sandi langkah 1.
5. Sambungkan CLI (sekali): `supabase login` lalu `supabase link --project-ref <ref>`.

### 2. GitHub
1. Login ke GitHub dengan akun kelurahan, buat repositori **private** baru (tanpa README).
2. Di folder ini:
   ```bash
   git add -A
   git commit -m "chore: inisialisasi proyek (T0.1, T0.3)"
   git branch -M main
   git remote add origin https://github.com/<akun-kelurahan>/<nama-repo>.git
   git push -u origin main
   ```
   `.env.local` tidak ikut ter-push (sudah di `.gitignore`).

### 3. Vercel
1. Login ke [vercel.com](https://vercel.com) dengan akun kelurahan (paling mudah: *Continue with GitHub*).
2. **Add New → Project** → pilih repositori GitHub tadi → Framework: Next.js.
3. **Environment Variables**: isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan
   `SUPABASE_SECRET_KEY` (bisa lewat **Import .env**, lalu hapus `SUPABASE_DB_PASSWORD` & `SUPABASE_PROJECT_REF`).
   `NEXT_PUBLIC_SITE_URL` tidak perlu diisi: aplikasi memakai domain produksi Vercel secara otomatis.
   Domain saat ini: https://ngudi-makmur-six.vercel.app
4. **Deploy**. Setiap push ke `main` akan otomatis ter-deploy.
5. Di Supabase → **Authentication → URL Configuration**: isi *Site URL* dengan alamat Vercel.

## Perintah

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Jalankan aplikasi lokal |
| `pnpm build` | Build produksi |
| `pnpm lint` / `pnpm typecheck` | Pemeriksaan kode |
| `supabase start` | Supabase lokal (butuh Docker) |
| `pnpm db:types` / `pnpm db:types:remote` | Buat ulang tipe database dari Supabase lokal / proyek tersambung |

## Catatan
Folder ini berada di OneDrive. `node_modules` dan `.next` berisi banyak file; bila sinkronisasi OneDrive terasa berat,
pindahkan folder proyek ke luar OneDrive — kode tetap aman di GitHub.
