param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,

  [string]$OutputDirectory = ".\backups"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $OutputDirectory "unicrm-$timestamp.dump"

pg_dump --format=custom --no-owner --no-acl --file=$backupPath $DatabaseUrl

$shaPath = "$backupPath.sha256"
$hash = Get-FileHash -Algorithm SHA256 -Path $backupPath
"$($hash.Hash)  $(Split-Path -Leaf $backupPath)" | Set-Content -Encoding ascii $shaPath

Write-Output "Backup written to $backupPath"
Write-Output "Checksum written to $shaPath"
