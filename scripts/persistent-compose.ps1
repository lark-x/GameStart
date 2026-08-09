Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-PersistentCompose {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('up', 'down', 'status')]
        [string]$Action
    )

    $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $environmentFile = Join-Path $repositoryRoot '.env'
    $composeFile = Join-Path $repositoryRoot 'infra\compose\docker-compose.yml'

    if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) {
        throw "Missing $environmentFile. Copy .env.example to .env and configure it before continuing."
    }

    if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) {
        throw "Missing Compose file: $composeFile"
    }

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $docker) {
        throw 'Docker was not found. Install Docker Desktop, start it, then run this script again.'
    }

    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose is unavailable. Update or start Docker Desktop, then run this script again.'
    }

    & docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker is not running. Start Docker Desktop and wait until it is ready, then run this script again.'
    }

    Push-Location $repositoryRoot
    try {
        switch ($Action) {
            'up' {
                Write-Host 'Starting persistent infrastructure services...'
                & docker compose --env-file .env -f infra/compose/docker-compose.yml up -d
            }
            'down' {
                Write-Host 'Stopping persistent infrastructure services (data volumes are preserved)...'
                & docker compose --env-file .env -f infra/compose/docker-compose.yml down
            }
            'status' {
                Write-Host 'Persistent infrastructure service status:'
                & docker compose --env-file .env -f infra/compose/docker-compose.yml ps
            }
        }

        if ($LASTEXITCODE -ne 0) {
            throw "Docker Compose $Action failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
