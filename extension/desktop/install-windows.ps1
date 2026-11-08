param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
    [string]$App = (Join-Path $env:LOCALAPPDATA 'Programs\VocaLume\VocaLume.exe')
)
$ErrorActionPreference = 'Stop'
$executable = (Resolve-Path -LiteralPath $App).Path
if ([IO.Path]::GetExtension($executable) -ne '.exe') { throw 'App must be VocaLume.exe' }
$support = Join-Path $env:LOCALAPPDATA 'VocaLume\NativeMessaging'
New-Item -ItemType Directory -Force -Path $support | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows-host.cjs') -Destination $support -Force
[IO.File]::WriteAllText((Join-Path $support 'windows-app.json'), (@{executable=$executable}|ConvertTo-Json), $utf8)
$launcher = Join-Path $support 'launch.cmd'
$languageLauncher = Join-Path $support 'launch-language.cmd'
# Keep executable paths out of cmd expansion by reading the JSON in the host.
# Escape percent signs because this is a batch file, including non-ASCII paths.
$exeBatch = $executable.Replace('%','%%')
$hostBatch = (Join-Path $support 'windows-host.cjs').Replace('%','%%')
[IO.File]::WriteAllText($launcher, "@echo off`r`nchcp 65001 >nul`r`nset ELECTRON_RUN_AS_NODE=1`r`n`"$exeBatch`" `"$hostBatch`"`r`n", $utf8)
[IO.File]::WriteAllText($languageLauncher, "@echo off`r`nchcp 65001 >nul`r`nset ELECTRON_RUN_AS_NODE=1`r`n`"$exeBatch`" `"$hostBatch`" --ui-language`r`n", $utf8)
$companionTarget = Join-Path $support 'org.jtl.companion.json'
$origins = @("chrome-extension://$ExtensionId/")
if (Test-Path -LiteralPath $companionTarget) {
    $old = Get-Content -LiteralPath $companionTarget -Raw | ConvertFrom-Json
    $origins += @($old.allowed_origins | Where-Object { $_ -match '^chrome-extension://[a-p]{32}/$' })
}
foreach ($hostSpec in @(
    @{ name='org.jtl.companion'; description='VocaLume local desktop connection'; path=$launcher },
    @{ name='org.jtl.ui_language'; description='VocaLume interface language'; path=$languageLauncher }
)) {
    $target = Join-Path $support ($hostSpec.name + '.json')
    $hostOrigins = $origins
    if ($target -ne $companionTarget -and (Test-Path -LiteralPath $target)) {
        $old = Get-Content -LiteralPath $target -Raw | ConvertFrom-Json
        $hostOrigins += @($old.allowed_origins | Where-Object { $_ -match '^chrome-extension://[a-p]{32}/$' })
    }
    $hostSpec.type = 'stdio'
    $hostSpec.allowed_origins = @($hostOrigins | Sort-Object -Unique)
    [IO.File]::WriteAllText($target, ($hostSpec | ConvertTo-Json), $utf8)
    foreach ($browser in @('Google\Chrome','Microsoft\Edge','Opera Software')) {
        $key = "HKCU:\Software\$browser\NativeMessagingHosts\$($hostSpec.name)"
        New-Item -Path $key -Force | Out-Null
        Set-Item -Path $key -Value $target
    }
}
Write-Output "Registered VocaLume for $ExtensionId. Reload the extension and select desktop mode."
