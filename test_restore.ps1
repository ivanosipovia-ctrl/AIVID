$h = @{ 'x-admin-secret' = 'test123'; 'Content-Type' = 'application/json' }
$k1 = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/keys -Headers $h -Body '{"name":"main"}').key
Write-Output ("created: " + $k1)
Remove-Item keys.json -Force -ErrorAction SilentlyContinue
Write-Output "file wiped"
$k2 = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/keys -Headers $h -Body '{"name":"main"}').key
Write-Output ("after wipe: " + $k2)
if ($k1 -eq $k2) { Write-Output "SAME KEY RESTORED" } else { Write-Output "MISMATCH" }
$m = Invoke-RestMethod -Uri http://localhost:3000/api/models -Headers @{ 'X-API-Key' = $k2 }
Write-Output ("validation: " + $m.Count + " models")
