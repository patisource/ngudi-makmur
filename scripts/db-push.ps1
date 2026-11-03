# Kirim migrasi ke proyek Supabase tanpa `supabase login`: membangun alamat database dari .env.local
# (SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD) lewat pooler sesi. Alamat & kata sandi tidak pernah dicetak.
# Pemakaian:  ./scripts/db-push.ps1 [-DryRun] [-Region ap-southeast-1]
param([switch]$DryRun, [string]$Region = "ap-southeast-1")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env_ = @{}
Get-Content (Join-Path $root ".env.local") | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k, $v = $_ -split '=', 2; $env_[$k] = $v.Trim() }
$ref = $env_["SUPABASE_PROJECT_REF"]; $pw = $env_["SUPABASE_DB_PASSWORD"]
if (-not $ref -or -not $pw) { throw "SUPABASE_PROJECT_REF dan SUPABASE_DB_PASSWORD wajib ada di .env.local" }
$enc = [Uri]::EscapeDataString($pw)
$args_ = @("db", "push", "--yes", "--workdir", $root)
if ($DryRun) { $args_ += "--dry-run" }
foreach ($prefix in "aws-0", "aws-1") {
  $url = "postgresql://postgres.${ref}:${enc}@${prefix}-${Region}.pooler.supabase.com:5432/postgres"
  Write-Host "Mencoba pooler $prefix-$Region ..."
  # Windows PowerShell 5.1 mengubah stderr CLI menjadi galat; dengan "Stop" skrip berhenti sebelum hasil terbaca.
  $ErrorActionPreference = "Continue"
  $out = & supabase @args_ --db-url $url 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -notmatch 'new version of Supabase CLI|updating regularly|NativeCommandError|At line|CategoryInfo|FullyQualifiedErrorId|^\s*\+' }
  $ErrorActionPreference = "Stop"
  $text = ($out -join "`n").Replace($pw, "***").Replace($enc, "***")
  Write-Host $text
  if ($LASTEXITCODE -eq 0) { exit 0 }
  if ($text -notmatch "tenant|not found|no such host|could not translate|ENOTFOUND") { exit 1 }
}
exit 1
