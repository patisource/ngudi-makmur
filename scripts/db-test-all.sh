#!/usr/bin/env sh
# Jalankan semua supabase/tests/*_check.sql (masing-masing dibatalkan di akhir; hasil = pesan "HASIL UJI").
# Butuh runner Node + pg yang membaca .env.local (SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD) — lihat README.
# Pemakaian: RUNNER=/path/run.mjs sh scripts/db-test-all.sh
# Pooler Supabase kadang memutus koneksi; tiap berkas dicoba ulang sampai 3 kali.
A="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$A"/supabase/tests/*_check.sql; do
  out=""
  for i in 1 2 3; do
    out=$(node "$RUNNER" "$A/.env.local" "$f" 2>&1 | grep -E "HASIL UJI|GAGAL")
    [ -n "$out" ] && break
  done
  printf "%-22s %s\n" "$(basename "$f" .sql)" "${out:-TIDAK ADA HASIL (cek koneksi atau galat SQL)}"
done
