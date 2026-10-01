# Compila o APK do WebFit Mobile a partir de uma cópia em caminho simples.
#
# O caminho real do repositório contém "&" e acentos. O Expo resolve os módulos com realpath, então junções
# e unidades subst voltam ao caminho real e o Gradle quebra (cmd corta em "&", codegen mistura raízes).
# Este script espelha mobile/ e src/ em um diretório sem caracteres especiais e compila lá.
#
# Uso (PowerShell, na pasta mobile):
#   .\scripts\build-android.ps1                          # debug: precisa do Metro (npx expo start) rodando
#   .\scripts\build-android.ps1 -Task assembleRelease    # release: JS embutido, instalável em qualquer aparelho
# O APK é copiado para mobile\dist\WebFit-<versão>-<variante>.apk (ou para a pasta passada em -Out).
param(
  [string] $Target = "D:\wf-build",
  [string] $Task = "assembleDebug",
  [string] $Out = ""
)

$ErrorActionPreference = "Stop"
$mobile = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $mobile
if (-not $Out) { $Out = Join-Path $mobile "dist" }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:CI = "1"
$variant = ($Task -replace "^assemble", "").ToLower()
if (-not $variant) { throw "Task deve ser assembleDebug ou assembleRelease" }
$env:NODE_ENV = if ($variant -eq "release") { "production" } else { "development" }

New-Item -ItemType Directory -Force $Target | Out-Null
# /MIR espelha; só a saída gerada (android/, .expo/, dist/) fica de fora. Os mesmos nomes no destino também
# são excluídos para que o /MIR não apague o android/ (e o cache do Gradle) criado lá pelo prebuild.
$skip = @("android", ".expo", "dist") | ForEach-Object { (Join-Path $mobile $_), (Join-Path "$Target\mobile" $_) }
robocopy "$mobile" "$Target\mobile" /MIR /XD $skip /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falhou ($LASTEXITCODE)" }
robocopy "$repo\src" "$Target\src" /MIR /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falhou ($LASTEXITCODE)" }
Copy-Item "$repo\package.json" "$Target\package.json" -Force

Push-Location "$Target\mobile"
try {
  node node_modules\expo\bin\cli prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw "prebuild falhou" }
  "sdk.dir=" + ($env:ANDROID_HOME -replace "\\", "/") | Set-Content android\local.properties -Encoding ascii
  # O template gera -Xmx2048m; a mesclagem dos dex do release estoura esse heap (D8 OutOfMemoryError) em máquinas com pouca RAM livre.
  $props = Get-Content android\gradle.properties -Raw
  $props = $props -replace "(?m)^org\.gradle\.jvmargs=.*$", "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"
  Set-Content android\gradle.properties $props -Encoding ascii -NoNewline
  Push-Location android
  try {
    # Daemons antigos (com o heap anterior) só ocupam memória; o build abre um novo.
    .\gradlew.bat --stop --quiet | Out-Null
    .\gradlew.bat $Task --console=plain
    if ($LASTEXITCODE -ne 0) { throw "gradle falhou" }
  } finally { Pop-Location }
} finally { Pop-Location }

$apk = Get-ChildItem "$Target\mobile\android\app\build\outputs\apk\$variant" -Filter *.apk | Select-Object -First 1
if (-not $apk) { throw "APK nao encontrado em outputs\apk\$variant" }
$version = (Get-Content (Join-Path $mobile "app.json") -Raw | ConvertFrom-Json).expo.version
New-Item -ItemType Directory -Force $Out | Out-Null
$dest = Join-Path $Out "WebFit-$version-$variant.apk"
Copy-Item $apk.FullName $dest -Force
Write-Host "APK: $dest ($([math]::Round($apk.Length / 1MB)) MB)"
