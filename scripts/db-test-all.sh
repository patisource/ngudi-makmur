#!/usr/bin/env sh
# Jalankan semua supabase/tests/*_check.sql (masing-masing dibatalkan di akhir) lewat runner Node+pg.
# Pemakaian: RUNNER=/path/run.mjs sh scripts/db-test-all.sh
A="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$A"/supabase/tests/*_check.sql; do
  printf "%-20s " "$(basename "$f" .sql)"
  node "$RUNNER" "$A/.env.local" "$f" | grep -E "HASIL UJI|GAGAL" | head -5 || echo "TIDAK ADA HASIL"
done
