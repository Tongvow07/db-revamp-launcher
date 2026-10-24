# Builds installer\DB Revamped Launcher.exe from LauncherStart.cs: the starter the shortcuts open, which runs
# the launcher HTA and gives its taskbar button our icon (see LauncherStart.cs).
#   powershell -ExecutionPolicy Bypass -File installer\build-launcher-start.ps1
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "No .NET Framework C# compiler at $csc" }
& $csc /nologo /target:winexe /optimize+ "/win32icon:$PSScriptRoot\db-revamped.ico" "/out:$PSScriptRoot\DB Revamped Launcher.exe" "$PSScriptRoot\LauncherStart.cs"
if ($LASTEXITCODE -ne 0) { throw "csc failed" }
"built $PSScriptRoot\DB Revamped Launcher.exe"
