[CmdletBinding()]
param(
    [switch] $RequireRunnableBinary,
    [string] $ResourceRoot = 'src-tauri/resources/windows-coreutils'
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($ResourceRoot)
$bin = Join-Path $root 'bin'
$required = @(
    (Join-Path $bin 'coreutils.exe'),
    (Join-Path $bin 'ls.exe'),
    (Join-Path $root 'LICENSE'),
    (Join-Path $root 'NOTICE.md'),
    (Join-Path $root 'coreutils-aliases.ps1')
)
foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Bundled Coreutils resource is missing: $file"
    }
}

if ($RequireRunnableBinary) {
    $powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $expectedCommand = Join-Path $bin 'ls.exe'
    $quotedBin = $bin.Replace("'", "''")
    $quotedAliases = (Join-Path $root 'coreutils-aliases.ps1').Replace("'", "''")
    $childScript = @"
`$ErrorActionPreference = 'Stop'
`$env:PATH = '$quotedBin;' + `$env:PATH
. '$quotedAliases'
`$resolved = Get-Command -Name ls
if (`$resolved.CommandType -ne 'Application' -or `$resolved.Source -ine '$($expectedCommand.Replace("'", "''"))') {
    throw "PowerShell resolved ls to `$(`$resolved.Source) instead of the bundled Coreutils command."
}
& ls --version
if (`$LASTEXITCODE -ne 0) { throw 'Bundled Coreutils ls did not run successfully.' }
"@
    $parentPath = [Environment]::GetEnvironmentVariable('PATH', 'Process')
    $profilePath = $PROFILE
    $profileBefore = if (Test-Path -LiteralPath $profilePath -PathType Leaf) {
        (Get-FileHash -LiteralPath $profilePath -Algorithm SHA256).Hash
    } else { $null }

    $output = & $powerShell -NoProfile -NonInteractive -Command $childScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "PowerShell 5.1 Coreutils smoke failed: $($output -join [Environment]::NewLine)"
    }
    if ([Environment]::GetEnvironmentVariable('PATH', 'Process') -ne $parentPath) {
        throw 'Coreutils smoke changed the parent process PATH.'
    }
    $profileAfter = if (Test-Path -LiteralPath $profilePath -PathType Leaf) {
        (Get-FileHash -LiteralPath $profilePath -Algorithm SHA256).Hash
    } else { $null }
    if ($profileAfter -ne $profileBefore) {
        throw 'Coreutils smoke changed the PowerShell profile.'
    }
    Write-Output ($output -join [Environment]::NewLine)
}

Write-Output 'Windows Coreutils bundle resources are present.'
