$new = (Get-Content survive.txt).Trim()
$old = (Get-Content legacy.txt).Trim()
try {
  $m = Invoke-RestMethod -Uri http://localhost:3000/api/models -Headers @{ 'X-API-Key' = $new }
  Write-Output ("HMAC key survived file wipe: " + $m.Count + " models")
} catch {
  Write-Output ("HMAC key FAILED: " + [int]$_.Exception.Response.StatusCode)
}
try {
  Invoke-RestMethod -Uri http://localhost:3000/api/models -Headers @{ 'X-API-Key' = $old } | Out-Null
  Write-Output "legacy file key: still valid"
} catch {
  Write-Output ("legacy file key (file wiped): " + [int]$_.Exception.Response.StatusCode + " expected")
}
