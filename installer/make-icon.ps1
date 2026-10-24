# Builds installer\db-revamped.ico: the original Dungeon Blitz dragon logo on a dark rounded tile,
# at 256, 64, 48, 32 and 16 px (PNG-compressed entries, as Windows Vista+ reads them), and the same
# tile as the AIR app's icons (air\icons\icon<size>.png, named in air\DBRevampedAir-app.xml).
#   powershell -ExecutionPolicy Bypass -File installer\make-icon.ps1
param(
    [string]$Logo = "$PSScriptRoot\..\..\db-r-server\LOCAL\src\client\content\localhost\rankings\i\dblogo.png",
    [string]$Out = "$PSScriptRoot\db-revamped.ico",
    [string]$AirIcons = "$PSScriptRoot\..\air\icons"
)
Add-Type -AssemblyName System.Drawing
$logoImage = [System.Drawing.Image]::FromFile((Resolve-Path $Logo))

function New-Tile([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)
    $r = [single]($size * 0.18); $d = $r * 2; $s = [single]($size - 1)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($s - $d, 0, $d, $d, 270, 90)
    $path.AddArc($s - $d, $s - $d, $d, $d, 0, 90); $path.AddArc(0, $s - $d, $d, $d, 90, 90); $path.CloseFigure()
    $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 58, 58, 62)), ([System.Drawing.Color]::FromArgb(255, 14, 14, 16)), 90
    $g.FillPath($brush, $path)
    # The logo is 253x174; fit it inside the tile with a margin, centred.
    $margin = $size * 0.06; $w = $size - 2 * $margin; $h = $w * $logoImage.Height / $logoImage.Width
    $g.DrawImage($logoImage, [single]$margin, [single](($size - $h) / 2), [single]$w, [single]$h)
    $g.Dispose(); return $bmp
}

$sizes = 256, 64, 48, 32, 16
$pngs = foreach ($size in $sizes) { $ms = New-Object System.IO.MemoryStream; (New-Tile $size).Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); ,$ms.ToArray() }
$ico = New-Object System.IO.MemoryStream; $bw = New-Object System.IO.BinaryWriter -ArgumentList $ico
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($png in $pngs) { $bw.Write($png) }
$bw.Flush(); [System.IO.File]::WriteAllBytes($Out, $ico.ToArray())
# A 256 preview, to look at.
(New-Tile 256).Save("$PSScriptRoot\db-revamped-icon-preview.png", [System.Drawing.Imaging.ImageFormat]::Png)
New-Item -ItemType Directory -Force $AirIcons | Out-Null
foreach ($size in 16, 32, 48, 128, 256) { (New-Tile $size).Save("$AirIcons\icon$size.png", [System.Drawing.Imaging.ImageFormat]::Png) }
"wrote $Out ($((Get-Item $Out).Length) bytes)"
