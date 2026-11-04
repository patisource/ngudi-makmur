# Backup harian (T9.8, Security.md §7): skema + data database dan berkas bukti Storage ke folder backups\YYYY-MM-DD.
# Dijalankan admin teknis (Task Scheduler Windows, lihat docs/Operasional.md). Kredensial dari .env.local; tidak dicetak.
# Hasil berisi data pribadi (NIK, no. HP): simpan di disk terenkripsi / penyimpanan terbatas, JANGAN di-commit (backups/ di .gitignore).
# Pemakaian:  ./scripts/backup.ps1 [-Region ap-southeast-1] [-Keep 30] [-OutDir D:\Backup-SIM]
# -OutDir: folder induk backup (bawaan: <aplikasi>\backups). Sebaiknya di luar folder OneDrive/Google Drive agar data
#          pribadi tidak ikut tersinkron ke cloud pribadi.
param([string]$Region = "ap-southeast-1", [int]$Keep = 30, [string]$OutDir = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env_ = @{}
Get-Content (Join-Path $root ".env.local") | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k, $v = $_ -split '=', 2; $env_[$k] = $v.Trim() }
$ref = $env_["SUPABASE_PROJECT_REF"]; $pw = $env_["SUPABASE_DB_PASSWORD"]
if (-not $ref -or -not $pw) { throw "SUPABASE_PROJECT_REF dan SUPABASE_DB_PASSWORD wajib ada di .env.local" }
$enc = [Uri]::EscapeDataString($pw)
$stamp = (Get-Date).ToString("yyyy-MM-dd")
$base = if ($OutDir) { $OutDir } else { Join-Path $root "backups" }
$dir = Join-Path $base $stamp
New-Item -ItemType Directory -Force $dir | Out-Null

$ok = $false
foreach ($prefix in "aws-0", "aws-0", "aws-1") {
  $url = "postgresql://postgres.${ref}:${enc}@${prefix}-${Region}.pooler.supabase.com:5432/postgres"
  $ErrorActionPreference = "Continue"   # PowerShell 5.1: stderr CLI jangan menghentikan skrip
  & supabase db dump --db-url $url -f (Join-Path $dir "schema.sql") 2>&1 | Out-Null
  $c1 = $LASTEXITCODE
  & supabase db dump --db-url $url --data-only --use-copy -f (Join-Path $dir "data.sql") 2>&1 | Out-Null
  $c2 = $LASTEXITCODE
  & supabase db dump --db-url $url --role-only -f (Join-Path $dir "roles.sql") 2>&1 | Out-Null
  $ErrorActionPreference = "Stop"
  if ($c1 -eq 0 -and $c2 -eq 0) { $ok = $true; break }
  Start-Sleep -Seconds 10
}
if (-not $ok) { throw "Dump database gagal (cek koneksi pooler)." }

# Berkas bukti (bucket privat 'proofs') lewat kunci rahasia server.
& node (Join-Path $PSScriptRoot "backup-storage.mjs") (Join-Path $root ".env.local") (Join-Path $dir "proofs")
if ($LASTEXITCODE -ne 0) { throw "Backup Storage gagal." }

# Ringkasan + checksum agar uji restore bisa memastikan berkas utuh.
Get-ChildItem $dir -Recurse -File | Get-FileHash -Algorithm SHA256 | ForEach-Object { "$($_.Hash)  $($_.Path.Substring($dir.Length + 1))" } | Set-Content -Encoding utf8 (Join-Path $dir "SHA256SUMS.txt")
Write-Host "Backup selesai: $dir"

# Rotasi: simpan $Keep folder terbaru.
Get-ChildItem $base -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Recurse -Force -Confirm:$false
