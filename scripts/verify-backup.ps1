param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [string]$ChecksumPath = "$BackupPath.sha256"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup not found: $BackupPath"
}
if (-not (Test-Path -LiteralPath $ChecksumPath)) {
  throw "Checksum not found: $ChecksumPath"
}

$expected = (Get-Content -LiteralPath $ChecksumPath -Raw).Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0]
$actual = (Get-FileHash -Algorithm SHA256 -Path $BackupPath).Hash

if ($actual -ne $expected) {
  throw "Checksum mismatch. Expected $expected but found $actual."
}

pg_restore --list $BackupPath | Out-Null
Write-Output "Backup checksum and archive catalog verified."
