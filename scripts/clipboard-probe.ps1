# Reads the system clipboard from a separate process, the way another Windows app would, and prints JSON.
# "PNG" is the registered format that editors such as Paint.NET, GIMP, Photoshop and Office read
# to keep transparency. The DIB image is what apps without PNG support (for example Paint) receive.
param([string]$Points = '') # optional "x,y;x,y" PNG pixels to sample
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$data = [System.Windows.Forms.Clipboard]::GetDataObject()
$result = [ordered]@{ formats = @($data.GetFormats($false)); png = $null; dib = $null }

function Read-Pixel($bitmap, $x, $y) {
  $c = $bitmap.GetPixel($x, $y)
  @($c.R, $c.G, $c.B, $c.A)
}

if ($data.GetDataPresent('PNG', $false)) {
  $stream = $data.GetData('PNG', $false)
  $bitmap = New-Object System.Drawing.Bitmap $stream
  $result.png = [ordered]@{
    width = $bitmap.Width; height = $bitmap.Height
    corner = Read-Pixel $bitmap 1 1
    red = Read-Pixel $bitmap ($bitmap.Width - 3) ($bitmap.Height - 3)
    points = @($Points.Split(';') | Where-Object { $_ } | ForEach-Object {
      $x, $y = $_.Split(',') | ForEach-Object { [int]$_ }
      , (Read-Pixel $bitmap $x $y)
    })
  }
  $bitmap.Dispose()
}
$image = [System.Windows.Forms.Clipboard]::GetImage()
if ($image) {
  $result.dib = [ordered]@{ width = $image.Width; height = $image.Height }
  $image.Dispose()
}
$result | ConvertTo-Json -Compress -Depth 4
