$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$directory = Join-Path $PSScriptRoot '../build/haas-ja-win'
New-Item -ItemType Directory -Force -Path $directory | Out-Null

function Save-VerifiedAsset($Url, $Name, $Sha256) {
    $destination = Join-Path $directory $Name
    if ((Test-Path -LiteralPath $destination -PathType Leaf) -and
        (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $Sha256) {
        return
    }

    $temporary = "$destination.partial"
    curl.exe --fail --location --silent --show-error --retry 3 --output $temporary --url $Url
    if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Could not verify Haas-ja asset $Name."
    }
    Move-Item -LiteralPath $temporary -Destination $destination -Force
}

$runtime = 'https://github.com/nyosegawa/speech.cpp/releases/download/v0.10.1/speech-0.10.1-windows-x64-vulkan.zip'
$model = 'https://huggingface.co/sakasegawa/Haas-ja-v1.0-GGUF/resolve/6b965d5007ba780585de51549d57a8c1c0d67c7e'
Save-VerifiedAsset $runtime 'runtime.zip' 'a8fe0e4b4f463c460e7ace9d38c363bec08b254cac5a7f764b7967af35d4fa1a'
Save-VerifiedAsset "$model/Haas-616M-ja-v1.0-Q8_0.gguf" 'haas-q8.gguf' 'cd5f60b2f1c411404b83fca4a65e3ce30a26d9e951b6a346529e65f22758afeb'
Save-VerifiedAsset "$model/LICENSE" 'HAAS-APACHE-2.0.txt' 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'
Save-VerifiedAsset 'https://raw.githubusercontent.com/nyosegawa/speech.cpp/v0.10.1/LICENSE' 'SPEECH-CPP-MIT.txt' '688f8aca0abe167966d277ed00bd594a5a51b028a4fbc1516ff9de7ef05c521a'

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $directory 'runtime.zip'))
try {
    foreach ($name in @('speech.exe', 'speech.dll')) {
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($archive.GetEntry($name), (Join-Path $directory $name), $true)
    }
} finally {
    $archive.Dispose()
}
Write-Output 'Prepared verified speech.cpp and Haas-ja Q8_0 Windows assets.'
