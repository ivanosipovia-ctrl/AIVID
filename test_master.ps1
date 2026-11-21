$h = @{ 'x-admin-secret' = 'test123'; 'Content-Type' = 'application/json' }
$k = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/keys -Headers $h -Body '{}').key
Write-Output ("master key: " + $k)
$list = Invoke-RestMethod -Uri http://localhost:3000/api/keys -Headers $h
Write-Output ("list: " + $list.Count + " first=" + $list[0].key)
try {
  Invoke-RestMethod -Uri http://localhost:3000/api/models -Headers @{ 'X-API-Key' = 'sk-wrong' } | Out-Null
  Write-Output "bad key: ACCEPTED (BAD)"
} catch {
  Write-Output ("bad key -> " + [int]$_.Exception.Response.StatusCode + " (401 = ок)")
}
try {
  Invoke-RestMethod -Uri http://localhost:3000/api/models -Headers @{ 'X-API-Key' = $k } | Out-Null
  Write-Output "master key: accepted, models loaded"
} catch {
  $code = [int]$_.Exception.Response.StatusCode
  if ($code -eq 401) { Write-Output "master key: REJECTED (BAD)" }
  else { Write-Output ("master key: auth passed, upstream error " + $code) }
}
Remove-Item keys.json -Force -ErrorAction SilentlyContinue
$k2 = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/keys -Headers $h -Body '{}').key
if ($k -eq $k2) { Write-Output "after file wipe: SAME KEY" } else { Write-Output "after file wipe: MISMATCH" }