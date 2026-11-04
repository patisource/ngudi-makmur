#!/usr/bin/env bash
# Jalankan semua supabase/tests/*_check.sql ke database LOKAL/CI lewat psql (T0.9). Setiap berkas dibatalkan di akhir
# dan melaporkan "HASIL UJI: n lulus, m gagal". Keluar non-nol bila ada yang gagal atau tidak melapor.
# Pemakaian: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash scripts/db-test-ci.sh
set -u
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
A="$(cd "$(dirname "$0")/.." && pwd)"
status=0
for f in "$A"/supabase/tests/*_check.sql; do
  out=$(psql "$DB_URL" -X -q < "$f" 2>&1)
  line=$(printf '%s\n' "$out" | grep -o "HASIL UJI: [0-9]* lulus, [0-9]* gagal" | head -1)
  printf "%-24s %s\n" "$(basename "$f" .sql)" "${line:-TIDAK ADA HASIL}"
  if [ -z "$line" ] || ! printf '%s' "$line" | grep -q ", 0 gagal"; then
    status=1
    printf '%s\n' "$out" | grep -E "GAGAL|ERROR" | head -20
  fi
done
exit $status
