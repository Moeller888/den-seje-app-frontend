# Simuleret gh-klient til tests/unit/merge-pr-preflight.test.mjs. Ingen forbindelse til GitHub.
# Scenariet læses fra $env:FAKE_GH_SCENARIO (JSON); hvert kald logges som én JSON-linje (argv) i $env:FAKE_GH_LOG.
$ErrorActionPreference = 'Stop'
$scenario = (Get-Content -LiteralPath $env:FAKE_GH_SCENARIO -Raw -Encoding UTF8) | ConvertFrom-Json
$logPath = $env:FAKE_GH_LOG
$prior = @()
if (Test-Path -LiteralPath $logPath) { $prior = @(Get-Content -LiteralPath $logPath -Encoding UTF8) }
$argv = @($args | ForEach-Object { [string]$_ })
Add-Content -LiteralPath $logPath -Value (ConvertTo-Json -Compress -InputObject $argv) -Encoding UTF8

$repo = [string]$scenario.repo
$joined = $argv -join ' '
$merged = @($prior | Where-Object { $_.TrimStart([char]0xFEFF).StartsWith('["pr","merge"') }).Count -gt 0

$key = 'unknown'
if ($argv.Count -ge 2 -and $argv[0] -eq 'pr' -and $argv[1] -eq 'merge') { $key = 'merge' }
elseif ($argv.Count -ge 2 -and $argv[0] -eq 'pr' -and $argv[1] -eq 'view') { if ($merged) { $key = 'prAfter' } else { $key = 'prView' } }
elseif ($argv.Count -ge 2 -and $argv[0] -eq 'api') {
  $path = $argv[1]
  if ($path -like "repos/$repo/commits/*/check-runs*") { $key = 'checkRuns' }
  elseif ($path -eq "repos/$repo/commits/main") { $key = 'main' }
  elseif ($path -like "repos/$repo/branches/*") { $key = 'branch' }
  elseif ($path -like "repos/$repo/commits/*") { $key = 'mergeCommit' }
  elseif ($path -eq "repos/$repo") { $key = 'repoSettings' }
}

if (@($scenario.failKeys) -contains $key) { [Console]::Error.WriteLine("simuleret fejl: $key"); exit 1 }

switch ($key) {
  'merge' { exit ([int]$scenario.mergeExit) }
  'main' {
    $n = @($prior | Where-Object { $_.Contains('"repos/' + $repo + '/commits/main"') }).Count
    $shas = @($scenario.mainShas)
    if ($n -ge $shas.Count) { $n = $shas.Count - 1 }
    Write-Output (ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ sha = [string]$shas[$n] }))
    exit 0
  }
  'unknown' { [Console]::Error.WriteLine("ukendt kald: $joined"); exit 9 }
  default {
    $value = $scenario.$key
    if ($null -eq $value) { [Console]::Error.WriteLine("intet svar for $key"); exit 8 }
    Write-Output (ConvertTo-Json -Compress -Depth 20 -InputObject $value)
    exit 0
  }
}
