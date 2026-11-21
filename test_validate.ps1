$key = 'sk-main.af4fa6386e2f031f5611f0eb329882c0'
try {
  $m = Invoke-RestMethod -Uri http://localhost:3000/api/models -Headers @{ 'X-API-Key' = $key } -TimeoutSec 30
  Write-Output ("validation OK: " + $m.Count + " models")
} catch {
  Write-Output ("failed: " + $_.Exception.Message)
  Write-Output ("body: " + $_.ErrorDetails.Message)
}
