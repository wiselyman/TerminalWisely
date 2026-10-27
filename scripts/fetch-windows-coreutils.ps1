[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('x64', 'arm64')]
    [string] $Architecture,

    [string] $Destination = 'src-tauri/resources/windows-coreutils',
    [string] $ArchivePath,
    [string] $LicenseSourcePath,
    [string] $NoticeSourcePath
)

$ErrorActionPreference = 'Stop'
$releaseVersion = '2026.9.3'
$assets = @{
    x64 = @{
        Url = 'https://github.com/microsoft/coreutils/releases/download/v2026.9.3/coreutils-2026.9.3-x64.zip'
        Sha256 = 'e01a35c1856991e313564f02b540c6079274f0ecb3be22de764edd5341eabfaa'
    }
    arm64 = @{
        Url = 'https://github.com/microsoft/coreutils/releases/download/v2026.9.3/coreutils-2026.9.3-arm64.zip'
        Sha256 = '0ab345dc2b27a8563322ea351f99120e2b2e831f844f16c7b1a1620a20d837d1'
    }
}

function Get-VerifiedArchive([string] $Path, [string] $ExpectedSha256, [string] $Description) {
    $resolved = Get-RequiredFile $Path $Description
    $actual = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $ExpectedSha256) {
        throw "$Description SHA-256 mismatch. Expected $ExpectedSha256, got $actual."
    }
    return $resolved
}

function Get-RequiredFile([string] $Path, [string] $Description) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing required $Description: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Get-SourceFile([string] $LocalPath, [string] $Url, [string] $DestinationPath, [string] $Description) {
    if ($LocalPath) {
        if ($env:TERMINALWISELY_COREUTILS_TESTS -ne '1') {
            throw "Local $Description paths are only accepted by provisioning tests."
        }
        $source = Get-RequiredFile $LocalPath $Description
        Copy-Item -LiteralPath $source -Destination $DestinationPath
    } else {
        Invoke-WebRequest -Uri $Url -OutFile $DestinationPath -UseBasicParsing
    }
    Get-RequiredFile $DestinationPath $Description | Out-Null
}

$testMode = $env:TERMINALWISELY_COREUTILS_TESTS -eq '1'
$asset = $assets[$Architecture]
$work = Join-Path ([IO.Path]::GetTempPath()) ('terminalwisely-coreutils-' + [guid]::NewGuid().ToString('N'))
$expanded = Join-Path $work 'expanded'
$staged = Join-Path $work 'staged'
$archive = $ArchivePath

try {
    New-Item -ItemType Directory -Path $expanded, $staged -Force | Out-Null
    if (-not $archive) {
        $archive = Join-Path $work "coreutils-$releaseVersion-$Architecture.zip"
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $asset.Url -OutFile $archive -UseBasicParsing
    }

    $archive = Get-RequiredFile $archive 'Coreutils ZIP archive'
    $expectedSha256 = $asset.Sha256
    if ($testMode -and $env:TERMINALWISELY_COREUTILS_EXPECTED_SHA256) {
        $expectedSha256 = $env:TERMINALWISELY_COREUTILS_EXPECTED_SHA256.ToLowerInvariant()
    }
    $archive = Get-VerifiedArchive $archive $expectedSha256 'Coreutils ZIP archive'

    Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
    $binary = Get-ChildItem -LiteralPath $expanded -Filter 'coreutils.exe' -File -Recurse | Select-Object -First 1
    if (-not $binary) {
        throw 'Coreutils archive is missing coreutils.exe.'
    }

    $bin = Join-Path $staged 'bin'
    New-Item -ItemType Directory -Path $bin -Force | Out-Null
    $coreutilsExe = Join-Path $bin 'coreutils.exe'
    Copy-Item -LiteralPath $binary.FullName -Destination $coreutilsExe

    $licenseUrl = "https://raw.githubusercontent.com/microsoft/coreutils/v$releaseVersion/LICENSE"
    $noticeUrl = "https://raw.githubusercontent.com/microsoft/coreutils/v$releaseVersion/NOTICE.md"
    Get-SourceFile $LicenseSourcePath $licenseUrl (Join-Path $staged 'LICENSE') 'LICENSE' | Out-Null
    Get-SourceFile $NoticeSourcePath $noticeUrl (Join-Path $staged 'NOTICE.md') 'NOTICE.md' | Out-Null

    if (-not $testMode) {
        $commandListExe = $coreutilsExe
        if ($Architecture -eq 'arm64') {
            $x64Archive = Join-Path $work "coreutils-$releaseVersion-x64.zip"
            Invoke-WebRequest -Uri $assets.x64.Url -OutFile $x64Archive -UseBasicParsing
            Get-VerifiedArchive $x64Archive $assets.x64.Sha256 'x64 Coreutils ZIP archive' | Out-Null
            $x64Expanded = Join-Path $work 'x64-command-list'
            Expand-Archive -LiteralPath $x64Archive -DestinationPath $x64Expanded -Force
            $commandListExeFile = Get-ChildItem -LiteralPath $x64Expanded -Filter 'coreutils.exe' -File -Recurse | Select-Object -First 1
            if (-not $commandListExeFile) { throw 'x64 Coreutils archive is missing coreutils.exe for ARM64 command-link generation.' }
            $commandListExe = $commandListExeFile.FullName
        }
        $commandNames = @(& $commandListExe --list)
        if ($LASTEXITCODE -ne 0 -or $commandNames.Count -eq 0) {
            throw 'Coreutils could not enumerate its command names.'
        }

        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TerminalWiselyCoreutilsLinks {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CreateHardLinkW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateHardLink(string newPath, string existingPath, IntPtr securityAttributes);
}
'@
        foreach ($name in $commandNames) {
            $name = $name.Trim()
            if (-not $name -or $name -eq '[' -or $name -eq 'coreutils-manager' -or $name -match '[\\/:*?"<>|]') { continue }
            $link = Join-Path $bin "$name.exe"
            if (-not [TerminalWiselyCoreutilsLinks]::CreateHardLink($link, $coreutilsExe, [IntPtr]::Zero)) {
                $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
                throw "Could not create Coreutils command link '$name' (Win32 $code)."
            }
        }
        $aliases = ($commandNames | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne '[' -and $_ -ne 'coreutils-manager' } | Sort-Object -Unique | ForEach-Object { "    '" + $_.Replace("'", "''") + "'" }) -join ",`r`n"
        $aliasScript = @"
`$coreutilsNames = @(
$aliases
)
foreach (`$name in `$coreutilsNames) {
    Remove-Item -LiteralPath ("Alias:" + `$name) -ErrorAction SilentlyContinue
}
"@
        Set-Content -LiteralPath (Join-Path $staged 'coreutils-aliases.ps1') -Value $aliasScript -Encoding UTF8
    }

    $destinationPath = [IO.Path]::GetFullPath($Destination)
    if (Test-Path -LiteralPath $destinationPath) {
        Remove-Item -LiteralPath $destinationPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destinationPath)) -Force | Out-Null
    Move-Item -LiteralPath $staged -Destination $destinationPath
    Write-Output "Prepared Microsoft Coreutils $releaseVersion ($Architecture) at $destinationPath"
} finally {
    if (Test-Path -LiteralPath $work) {
        Remove-Item -LiteralPath $work -Recurse -Force
    }
}
