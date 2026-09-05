param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [Parameter(Mandatory = $true)]
  [string]$TargetDatabaseUrl
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup not found: $BackupPath"
}

if ($TargetDatabaseUrl -match "prod|production") {
  throw "Refusing to restore into a URL that appears to be production."
}

pg_restore --clean --if-exists --no-owner --no-acl --dbname=$TargetDatabaseUrl $BackupPath
Write-Output "Restore completed into non-production target."
