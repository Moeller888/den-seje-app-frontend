<#
.SYNOPSIS
  SHA-låst manuel merge af én pull request (merge commit) med fuld preflight og efterkontrol.

.DESCRIPTION
  Ejerværktøj. Køres manuelt i Windows PowerShell 5.1 eller PowerShell 7. Agenter må ikke bruge det til at merge.

  Uden -Merge er kørslen en egentlig read-only dry-run: kun læsende GitHub-kald (gh pr view og gh api GET),
  og til sidst vises det præcise merge-kald, der VILLE blive sendt. Med -Merge sendes merge-kaldet kun, hvis
  samtlige kontroller bestod, og main er uændret lige før kaldet.

  Kontroller (alle køres og rapporteres med FORVENTET og OBSERVERET værdi; én afvigelse = intet merges):
    1. PR: nummer, state OPEN, ikke draft, head-SHA, head-branch (valgfri), base main, samme repository,
       mergeable MERGEABLE, mergeStateStatus CLEAN, reviewDecision '' eller APPROVED.
    2. main-SHA.
    3. CI-checks på head ved navn: præcis den gennemgåede liste (ingen manglende, ingen ekstra, ingen dubletter),
       alle completed med den forventede conclusion.
    4. Repository: allow_merge_commit = true, delete_branch_on_merge = false.
    5. main igen umiddelbart før merge.
    6. Merge: gh pr merge <nummer> --repo <repo> --merge --match-head-commit <head>  (ingen --auto, ingen --delete-branch).
    7. Efterkontrol: PR MERGED, merge-committet har præcis to forældre (main, head), branchen er bevaret på head.

  BEGRÆNSNING: --match-head-commit låser kun PR'ens head. GitHub låser ikke main atomisk sammen med den.
  Flytter main sig mellem trin 5 og GitHubs merge, merger GitHub mod den nye main. Det opdages i trin 7
  (forælder 1 afviger, exitkode 4) men forhindres ikke. Se docs/operations/manual-merge-procedure.md.

  Exitkoder: 0 = dry-run bestod / merge gennemført og verificeret; 1 = afvigelse før merge (intet merget);
  2 = ugyldige argumenter eller manglende værktøj (intet kaldt); 3 = merge-kaldet fejlede;
  4 = merge sket, men efterkontrollen afveg.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\merge\merge-pr.ps1 -PrNumber 741 -ExpectedHead <40 hex> -ExpectedMain <40 hex>
  (dry-run; tilføj -Merge for at merge)
#>
param(
  [string]$PrNumber = '',
  [string]$ExpectedHead = '',
  [string]$ExpectedMain = '',
  [string]$ExpectedHeadBranch = '',
  [string]$ExpectedChecksFile = '',
  [string]$Repo = 'Moeller888/den-seje-app-frontend',
  [switch]$Merge,
  [string]$GhCommand = 'gh'
)

Set-StrictMode -Version 1.0
# Exitkoder tjekkes eksplicit. 'Stop' ville i PS 5.1 gøre gh's stderr (fx opdateringsnotitser) til en afbrydende fejl.
$ErrorActionPreference = 'Continue'
$env:GH_NO_UPDATE_NOTIFIER = '1'
$env:GH_PROMPT_DISABLED = '1'
# Kun når output omdirigeres (fx i tests): UTF-8, så æøå ikke forvanskes af OEM-tegnsættet. En interaktiv konsol røres ikke.
if ([Console]::IsOutputRedirected) { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) }

# ── Argumenter (valideres før ét eneste GitHub-kald) ──────────────────────────────────────────────────────
# PR-nummeret holdes som en streng af cifre og bruges uændret i alle kald. Variabelnavne er bevidst unikke:
# PowerShell skelner ikke mellem store og små bogstaver i variabelnavne; en kort PR-variabel ville kunne
# overskrive PR-nummeret (fejlen i merge-blokken til #740). Derfor findes ingen variabel med det korte navn.
$usage = New-Object System.Collections.Generic.List[string]
if ($PrNumber -cnotmatch '^[1-9][0-9]{0,6}$') { $usage.Add("PrNumber skal være et positivt heltal uden fortegn, decimaler eller mellemrum; observeret '$PrNumber'") }
if ($ExpectedHead -cnotmatch '^[0-9a-f]{40}$') { $usage.Add("ExpectedHead skal være en fuld SHA (40 små hex-tegn); observeret '$ExpectedHead'") }
if ($ExpectedMain -cnotmatch '^[0-9a-f]{40}$') { $usage.Add("ExpectedMain skal være en fuld SHA (40 små hex-tegn); observeret '$ExpectedMain'") }
if ($Repo -cnotmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { $usage.Add("Repo skal have formen ejer/navn; observeret '$Repo'") }
if ($ExpectedChecksFile -eq '') { $ExpectedChecksFile = Join-Path $PSScriptRoot 'expected-checks.json' }

$expectedChecks = [ordered]@{}
if (-not (Test-Path -LiteralPath $ExpectedChecksFile -PathType Leaf)) {
  $usage.Add("listen over forventede checks findes ikke: '$ExpectedChecksFile'")
} else {
  try {
    $checksDoc = (Get-Content -LiteralPath $ExpectedChecksFile -Raw -Encoding UTF8) | ConvertFrom-Json
    if ($null -eq $checksDoc -or $null -eq $checksDoc.checks) { throw 'feltet "checks" mangler' }
    foreach ($prop in $checksDoc.checks.PSObject.Properties) {
      if (@('success', 'skipped', 'neutral') -cnotcontains [string]$prop.Value) { throw "check '$($prop.Name)' har ugyldig forventet conclusion '$($prop.Value)'" }
      $expectedChecks[[string]$prop.Name] = [string]$prop.Value
    }
    if ($expectedChecks.Count -eq 0) { throw 'listen er tom' }
  } catch {
    $usage.Add("listen over forventede checks '$ExpectedChecksFile' er ugyldig: $($_.Exception.Message)")
  }
}
if ($null -eq (Get-Command $GhCommand -ErrorAction SilentlyContinue)) { $usage.Add("GitHub CLI '$GhCommand' blev ikke fundet") }

if ($usage.Count -gt 0) {
  foreach ($u in $usage) { Write-Host "FEJL  $u" -ForegroundColor Red }
  Write-Host 'STOP: ugyldige argumenter. Intet GitHub-kald er foretaget, intet er merget.' -ForegroundColor Red
  exit 2
}

$modeText = 'DRY-RUN (read-only)'
if ($Merge) { $modeText = 'MERGE' }
Write-Host ("SHA-låst merge-preflight: PR #{0} i {1} - tilstand {2}" -f $PrNumber, $Repo, $modeText)
Write-Host ("  forventet head {0}, forventet main {1}, checks fra {2}" -f $ExpectedHead, $ExpectedMain, $ExpectedChecksFile)

# ── Hjælpere ────────────────────────────────────────────────────────────────────────────────────────────
$failures = New-Object System.Collections.Generic.List[string]

function Test-Value([string]$What, $Expected, $Observed) {
  if ("$Observed" -ceq "$Expected") { Write-Host ("OK    {0} = {1}" -f $What, $Observed) }
  else { $failures.Add($What); Write-Host ("AFVIG {0}: forventet '{1}', observeret '{2}'" -f $What, $Expected, $Observed) -ForegroundColor Red }
}

function Test-Condition([string]$What, [bool]$Ok, [string]$Expected, [string]$Observed) {
  if ($Ok) { Write-Host ("OK    {0} = {1}" -f $What, $Observed) }
  else { $failures.Add($What); Write-Host ("AFVIG {0}: forventet '{1}', observeret '{2}'" -f $What, $Expected, $Observed) -ForegroundColor Red }
}

# Kalder gh med et array af strenge og returnerer exitkode og stdout. stderr vises ikke (exitkoden afgør).
function Invoke-GhCall([string[]]$GhArgs) {
  $global:LASTEXITCODE = 0
  $text = ''
  $code = 0
  try {
    $raw = & $GhCommand @GhArgs 2>$null
    $code = $LASTEXITCODE
    $text = (@($raw) | ForEach-Object { [string]$_ }) -join "`n"
  } catch {
    $code = 127
  }
  if ($null -eq $code) { $code = 0 }
  return [pscustomobject]@{ Exit = [int]$code; Text = $text }
}

# Kald + JSON. Ved fejl registreres afvigelsen med forventet/observeret, og $null returneres.
function Get-GhJson([string]$What, [string[]]$GhArgs) {
  $res = Invoke-GhCall $GhArgs
  if ($res.Exit -ne 0) { Test-Value "$What (exitkode)" 0 $res.Exit; return $null }
  if ($res.Text.Trim() -eq '') { Test-Condition "$What (JSON)" $false 'gyldig JSON' '(tomt svar)'; return $null }
  try { return ($res.Text | ConvertFrom-Json) }
  catch { Test-Condition "$What (JSON)" $false 'gyldig JSON' 'ugyldig JSON'; return $null }
}

function Get-MainSha([string]$What) {
  $obj = Get-GhJson $What @('api', "repos/$Repo/commits/main")
  if ($null -eq $obj) { return '' }
  return [string]$obj.sha
}

# ── 1. PR ───────────────────────────────────────────────────────────────────────────────────────────────
$prFields = 'number,state,isDraft,headRefOid,headRefName,baseRefName,isCrossRepository,mergeable,mergeStateStatus,reviewDecision'
$prView = Get-GhJson 'gh pr view' @('pr', 'view', $PrNumber, '--repo', $Repo, '--json', $prFields)
$headBranch = ''
if ($null -ne $prView) {
  Test-Value     'PR nummer'           $PrNumber    $prView.number
  Test-Value     'PR state'            'OPEN'       $prView.state
  Test-Value     'PR isDraft'          'False'      $prView.isDraft
  Test-Value     'PR head SHA'         $ExpectedHead $prView.headRefOid
  if ($ExpectedHeadBranch -ne '') { Test-Value 'PR head branch' $ExpectedHeadBranch $prView.headRefName }
  Test-Value     'PR base'             'main'       $prView.baseRefName
  Test-Value     'PR isCrossRepository' 'False'     $prView.isCrossRepository
  Test-Value     'PR mergeable'        'MERGEABLE'  $prView.mergeable
  Test-Value     'PR mergeStateStatus' 'CLEAN'      $prView.mergeStateStatus
  $review = [string]$prView.reviewDecision
  Test-Condition 'PR reviewDecision'   (@('', 'APPROVED') -ccontains $review) "'' eller APPROVED" $review
  $headBranch = [string]$prView.headRefName
  if ($headBranch -eq '') { Test-Condition 'PR head branch kendt' $false '(navn)' '(tom)' }
}

# ── 2. main ─────────────────────────────────────────────────────────────────────────────────────────────
Test-Value 'main SHA' $ExpectedMain (Get-MainSha 'gh api main')

# ── 3. CI-checks på head ────────────────────────────────────────────────────────────────────────────────
$checkDoc = Get-GhJson 'gh api check-runs' @('api', "repos/$Repo/commits/$ExpectedHead/check-runs?per_page=100&filter=latest")
if ($null -ne $checkDoc) {
  $runs = @()
  if ($null -ne $checkDoc.check_runs) { $runs = @($checkDoc.check_runs) }
  Test-Value 'check-runs i alt ifølge GitHub (ingen ekstra side)' $runs.Count $checkDoc.total_count
  foreach ($name in $expectedChecks.Keys) {
    $hits = @($runs | Where-Object { [string]$_.name -ceq $name })
    if ($hits.Count -ne 1) { Test-Value "check '$name' antal kørsler" 1 $hits.Count; continue }
    Test-Value "check '$name' status"     'completed'            $hits[0].status
    Test-Value "check '$name' conclusion" $expectedChecks[$name] $hits[0].conclusion
  }
  $extra = @($runs | ForEach-Object { [string]$_.name } | Where-Object { -not $expectedChecks.Contains($_) } | Sort-Object -Unique)
  Test-Condition 'uventede checks' ($extra.Count -eq 0) '(ingen)' ($extra -join ', ')
  Test-Value 'antal checks i alt' $expectedChecks.Count $runs.Count
}

# ── 4. Repository-indstillinger ─────────────────────────────────────────────────────────────────────────
$repoInfo = Get-GhJson 'gh api repo' @('api', "repos/$Repo")
if ($null -ne $repoInfo) {
  Test-Value 'repo allow_merge_commit'     'True'  $repoInfo.allow_merge_commit
  Test-Value 'repo delete_branch_on_merge' 'False' $repoInfo.delete_branch_on_merge
}

if ($failures.Count -gt 0) {
  Write-Host ''
  Write-Host ("STOP: {0} afvigelse(r): {1}. Intet er merget." -f $failures.Count, ($failures -join '; ')) -ForegroundColor Red
  exit 1
}

# ── 5. main igen umiddelbart før merge ──────────────────────────────────────────────────────────────────
$mainBefore = Get-MainSha 'gh api main (lige før merge)'
Test-Value 'main uændret lige før merge' $ExpectedMain $mainBefore
if ($failures.Count -gt 0) {
  Write-Host ("STOP: main flyttede sig under preflight. Intet er merget.") -ForegroundColor Red
  exit 1
}

# ── 6. Merge ────────────────────────────────────────────────────────────────────────────────────────────
$mergeArgs = @('pr', 'merge', $PrNumber, '--repo', $Repo, '--merge', '--match-head-commit', $ExpectedHead)
if (-not $Merge) {
  Write-Host ''
  Write-Host ("DRY-RUN BESTOD: alle kontroller er grønne. Intet er merget. Merge-kaldet ville være: {0} {1}" -f $GhCommand, ($mergeArgs -join ' ')) -ForegroundColor Green
  exit 0
}
Write-Host ("MERGE: {0} {1}" -f $GhCommand, ($mergeArgs -join ' '))
$mergeRes = Invoke-GhCall $mergeArgs
if ($mergeRes.Exit -ne 0) {
  Write-Host ("STOP: merge-kaldet fejlede: forventet exitkode '0', observeret '{0}'. Kontrollér PR-status; er den stadig OPEN, er intet merget." -f $mergeRes.Exit) -ForegroundColor Red
  exit 3
}

# ── 7. Efterkontrol ─────────────────────────────────────────────────────────────────────────────────────
$after = Get-GhJson 'efter: gh pr view' @('pr', 'view', $PrNumber, '--repo', $Repo, '--json', 'number,state,mergeCommit')
$mergeSha = ''
if ($null -ne $after) {
  Test-Value 'efter: PR nummer' $PrNumber $after.number
  Test-Value 'efter: PR state'  'MERGED'  $after.state
  if ($null -ne $after.mergeCommit) { $mergeSha = [string]$after.mergeCommit.oid }
  Test-Condition 'efter: merge-commit kendt' ($mergeSha -cmatch '^[0-9a-f]{40}$') '(fuld SHA)' $mergeSha
}
if ($mergeSha -cmatch '^[0-9a-f]{40}$') {
  $commit = Get-GhJson 'efter: gh api merge-commit' @('api', "repos/$Repo/commits/$mergeSha")
  if ($null -ne $commit) {
    $parents = @()
    if ($null -ne $commit.parents) { $parents = @($commit.parents | ForEach-Object { [string]$_.sha }) }
    Test-Value 'efter: antal forældre' 2 $parents.Count
    $p1 = ''; $p2 = ''
    if ($parents.Count -ge 1) { $p1 = $parents[0] }
    if ($parents.Count -ge 2) { $p2 = $parents[1] }
    Test-Value 'efter: forælder 1 (main)' $ExpectedMain $p1
    Test-Value 'efter: forælder 2 (head)' $ExpectedHead $p2
  }
}
if ($headBranch -ne '') {
  $branchInfo = Get-GhJson 'efter: gh api branch' @('api', "repos/$Repo/branches/$headBranch")
  $branchSha = ''
  if ($null -ne $branchInfo -and $null -ne $branchInfo.commit) { $branchSha = [string]$branchInfo.commit.sha }
  Test-Value 'efter: branch bevaret på head' $ExpectedHead $branchSha
}
Write-Host ("merge-commit: {0}" -f $mergeSha)
if ($failures.Count -gt 0) {
  Write-Host ("ADVARSEL: merge er sket, men efterkontrollen afveg: {0}" -f ($failures -join '; ')) -ForegroundColor Yellow
  exit 4
}
Write-Host ("FÆRDIG: PR #{0} merget med merge commit {1} (forældre {2} + {3}); branchen er bevaret. Ingen migration, Edge-deploy eller flag er ændret af dette værktøj." -f $PrNumber, $mergeSha, $ExpectedMain, $ExpectedHead) -ForegroundColor Green
exit 0
