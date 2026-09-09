# Requires: Windows. Relunches this script elevated, then runs `bun start`.
param(
    [string]$BunPath,
    [string]$ServerRoot
)

$ErrorActionPreference = 'Stop'

if (-not $ServerRoot) {
    $ServerRoot = Split-Path -Parent $PSScriptRoot
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-BunPath {
    $existing = Get-Command bun -ErrorAction SilentlyContinue
    if ($existing -and $existing.Source) {
        return $existing.Source
    }

    $candidates = @(
        (Join-Path $env:USERPROFILE '.bun\bin\bun.exe'),
        (Join-Path $env:LOCALAPPDATA 'bun\bun.exe'),
        (Join-Path $env:ProgramFiles 'bun\bun.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw 'bun.exe not found. Install Bun and ensure it is on PATH, then try again.'
}

if (-not $BunPath) {
    $BunPath = Resolve-BunPath
}

if (-not (Test-Path -LiteralPath $BunPath)) {
    throw "bun.exe not found at '$BunPath'."
}

if (-not (Test-IsAdministrator)) {
    $argList = @(
        '-NoProfile',
        '-ExecutionPolicy Bypass',
        '-File', ('"{0}"' -f $PSCommandPath),
        '-BunPath', ('"{0}"' -f $BunPath),
        '-ServerRoot', ('"{0}"' -f $ServerRoot)
    ) -join ' '

    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList | Out-Null
    }
    catch {
        throw 'Administrator approval was declined or elevation failed.'
    }
    exit 0
}

Set-Location -LiteralPath $ServerRoot
$env:PATH = "$(Split-Path -Parent $BunPath);$env:PATH"

Write-Host "SSC QR Attendance (Administrator)"
Write-Host "  bun  $BunPath"
Write-Host "  cwd  $ServerRoot"
Write-Host ""

& $BunPath start
exit $LASTEXITCODE
