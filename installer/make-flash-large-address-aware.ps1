# Lets flashplayer.exe use 4 GB instead of 2 GB on 64-bit Windows.
#
# The projector (32.0.0.465) is a 32-bit program without the LARGE_ADDRESS_AWARE flag, so Windows
# gives it 2 GB of address space whatever the PC has. The game caches its level art in big bitmap
# tiles; when an allocation fails, the client's out-of-memory guards skip the art instead of
# crashing, and players see a flat grey sky, black holes in the ground and half-drawn doorways
# (Wolf's End, Black Rose Mire, Dereliction of Duty, 2026-10-23). Setting the flag doubles the room.
#
# The flag is one bit in the PE header, so Adobe's signature no longer matches the file. The
# signature block is removed (an unsigned file, rather than one whose signature reads as tampered)
# and the header checksum is recomputed. Running it again on a patched file changes nothing.
#   powershell -ExecutionPolicy Bypass -File installer\make-flash-large-address-aware.ps1
param(
    [string]$Exe = "$PSScriptRoot\..\flashplayer.exe"
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
public static class PeChecksum {
    public static uint Compute(byte[] b, int checksumOffset) {
        ulong sum = 0;
        int n = b.Length & ~1;
        for (int i = 0; i < n; i += 2) {
            if (i == checksumOffset || i == checksumOffset + 2) continue;
            sum += (uint)(b[i] | (b[i + 1] << 8));
            sum = (sum & 0xffff) + (sum >> 16);
        }
        if ((b.Length & 1) != 0) { sum += b[b.Length - 1]; sum = (sum & 0xffff) + (sum >> 16); }
        sum = (sum & 0xffff) + (sum >> 16);
        return (uint)(sum + (ulong)b.Length);
    }
}
'@

$path = (Resolve-Path $Exe).Path
$bytes = [System.IO.File]::ReadAllBytes($path)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
if ([BitConverter]::ToUInt32($bytes, $pe) -ne 0x4550) { throw "$path is not a PE file" }
if ([BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x14c) { throw "$path is not a 32-bit x86 program" }
$opt = $pe + 24
if ([BitConverter]::ToUInt16($bytes, $opt) -ne 0x10b) { throw "$path has no PE32 optional header" }

$characteristicsAt = $pe + 22
$checksumAt = $opt + 64
$securityDirAt = $opt + 96 + 4 * 8

$characteristics = [BitConverter]::ToUInt16($bytes, $characteristicsAt)
$secOffset = [BitConverter]::ToInt32($bytes, $securityDirAt)
$secSize = [BitConverter]::ToInt32($bytes, $securityDirAt + 4)
if (($characteristics -band 0x20) -and $secSize -eq 0) {
    Write-Host "Already large address aware and unsigned: $path"
    return
}

[BitConverter]::GetBytes([uint16]($characteristics -bor 0x20)).CopyTo($bytes, $characteristicsAt)
if ($secSize -gt 0) {
    # The certificate table sits at the end of the file, outside every section.
    if ($secOffset + $secSize -ne $bytes.Length) { throw "the signature block is not at the end of the file; refusing to cut it" }
    [BitConverter]::GetBytes([int32]0).CopyTo($bytes, $securityDirAt)
    [BitConverter]::GetBytes([int32]0).CopyTo($bytes, $securityDirAt + 4)
    $trimmed = New-Object byte[] $secOffset
    [Array]::Copy($bytes, $trimmed, $secOffset)
    $bytes = $trimmed
}
[BitConverter]::GetBytes([PeChecksum]::Compute($bytes, $checksumAt)).CopyTo($bytes, $checksumAt)
[System.IO.File]::WriteAllBytes($path, $bytes)
Write-Host "Large address aware (4 GB), signature removed: $path ($($bytes.Length) bytes)"
