$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'persistent-compose.ps1')
Invoke-PersistentCompose -Action status
