# Manuel SHA-låst merge (ejerprocedure)

Værktøj: `tools/merge/merge-pr.ps1` med den gennemgåede checkliste `tools/merge/expected-checks.json`.
Test: `tests/unit/merge-pr-preflight.test.mjs` (kører det rigtige script i Windows PowerShell 5.1 og/eller
PowerShell 7 mod en simuleret gh-klient, `tests/unit/fixtures/merge-pr/fake-gh.ps1`, uden forbindelse til GitHub).

Værktøjet betjenes **kun manuelt af ejeren**. Agenter må forberede kommandolinjen (PR-nummer og de to fulde
SHA'er) og verificere integrationen, men aldrig selv køre det med `-Merge`.

## Brug

Fra en klon af repositoriet, i Windows PowerShell 5.1 eller PowerShell 7:

```
# 1. Dry-run (read-only: kun gh pr view og gh api GET; viser det præcise merge-kald)
powershell -NoProfile -ExecutionPolicy Bypass -File tools\merge\merge-pr.ps1 -PrNumber 741 -ExpectedHead <fuld head-SHA> -ExpectedMain <fuld main-SHA>

# 2. Merge (samme argumenter + -Merge)
powershell -NoProfile -ExecutionPolicy Bypass -File tools\merge\merge-pr.ps1 -PrNumber 741 -ExpectedHead <fuld head-SHA> -ExpectedMain <fuld main-SHA> -Merge
```

Valgfrit: `-ExpectedHeadBranch <navn>` (låser også branchnavnet) og `-ExpectedChecksFile <sti>` (en anden
gennemgået liste). `-ExecutionPolicy Bypass` gælder kun den ene proces og ændrer ingen indstilling.

## Driftserfaring

- **2026-11-24/25, #741:** første faktiske brug. Ejeren kørte først dry-run og derefter `-Merge` fra worktree'en for
  denne PR (før #749 var merget). Alle kontroller og efterkontroller bestod: merge-commit `764ea38c`, forældre
  `06f25cf2` (main) + `a732b739` (head), branchen bevaret. Værktøjet er dermed afprøvet i ejerens PowerShell-miljø,
  men ligger først på main, når #749 er merget.
- Værktøjet sender formen med mellemrum, `--match-head-commit <sha>`, som gh behandler som lighedstegnsformen.
  Lærlig-guarden afviser den form for agenters kommandoer (`agent-coordination.md`). Værktøjet køres af ejeren uden
  for agentsessionen, og #741 blev merget med netop den form.

## Hvad der kontrolleres

Alle kontroller køres og rapporteres med **forventet** og **observeret** værdi (`AFVIG …: forventet '…',
observeret '…'`). Én afvigelse betyder, at intet merges.

| Trin | Kontrol |
|---|---|
| Argumenter | PR-nummer er et positivt heltal (cifre, intet fortegn, ingen decimaler eller mellemrum); begge SHA'er er fulde 40 tegn små hex. Ellers exit 2 før ét eneste GitHub-kald. |
| 1. PR | nummer (GitHubs svar skal være præcis det angivne), `OPEN`, ikke draft, head-SHA, base `main`, ikke fra et andet repository, `MERGEABLE`, `CLEAN`, review `''` eller `APPROVED`. |
| 2. main | main-SHA er den forventede. |
| 3. CI | præcis de navngivne checks på head: ingen manglende, ingen ekstra, ingen dubletter, alle `completed` med forventet conclusion; GitHubs `total_count` skal svare til det modtagne (ingen ekstra side). |
| 4. Repository | `allow_merge_commit = true`, `delete_branch_on_merge = false`. |
| 5. main igen | main læses igen umiddelbart før merge-kaldet. |
| 6. Merge | `gh pr merge <nummer> --repo <repo> --merge --match-head-commit <head>`: argumenterne er et array af strenge; PR-nummeret er den validerede cifferstreng. Ingen `--auto`, ingen `--delete-branch`. |
| 7. Efterkontrol | PR `MERGED`; merge-committet har præcis to forældre: main og head; head-branchen peger stadig på head. |

Exitkoder: `0` dry-run bestod eller merge gennemført og verificeret · `1` afvigelse før merge (intet merget) ·
`2` ugyldige argumenter eller manglende værktøj (intet kaldt) · `3` merge-kaldet fejlede · `4` merge sket, men
efterkontrollen afveg.

Testen beviser selve merge-kaldets argumenter: den simulerede klient logger argv for hvert kald, og testen kræver
præcis `pr merge 741 --repo … --merge --match-head-commit <head>` som det sidste kald efter den anden main-læsning.
En negativ kontrol muterer scriptet til at sende PR-objektet (fejlen fra merge-blokken til #740, hvor `$Pr = 740`
blev overskrevet af `$pr = ConvertFrom-Json …`, fordi PowerShell ikke skelner store og små bogstaver i
variabelnavne) og viser, at argv-kontrollen fanger det. Negative kontroller dækker forkert head, ændret main (ved
preflight og mellem preflight og merge), manglende, fejlende, ventende, dublerede og uventede checks, forkert
PR-nummer fra GitHub og fejlformede argumenter, fejlende GitHub-kald, PR-tilstand, review og
repository-indstillinger, et fejlende merge-kald og afvigende merge-forældre eller slettet branch.

## Begrænsninger

- **Main låses ikke atomisk.** `--match-head-commit` låser kun PR'ens head. GitHub har ingen tilsvarende lås på
  base. Flytter main sig mellem trin 5 og GitHubs merge (sekunder), merger GitHub mod den nye main. Det opdages i
  trin 7 (forælder 1 afviger, exit 4), men forhindres ikke. Så skal den nye main gennemgås og dens CI følges.
- **CI-resultatet er fra PR'ens merge-ref på det tidspunkt, CI kørte.** Rulesættet er ikke strict, så en grøn PR
  kan være testet mod en ældre main end `ExpectedMain`. `CLEAN` betyder, at GitHub har beregnet mergeability mod
  den aktuelle base, ikke at testene er kørt mod den. Derfor verificerer den agent, der forbereder kommandolinjen,
  integrationen lokalt mod præcis `ExpectedMain` (merge-tree og de berørte tests) og angiver det i sin rapport.
- Listen over forventede checks er versionsstyret. Ændres workflows, ændres listen i samme PR.

## Migrationsnumre: hvad kontrollen dækker, og hvad den ikke dækker

- `tests/unit/migration-versions-unique.test.mjs` sikrer, at ingen to filer i `supabase/migrations` deler version
  i ét træ (main og hver PR's merge med main i CI).
- `tools/ci/migration-versions.mjs` sammenligner før push de migrationer, en branch tilføjer, med alle hentede
  `origin/*`-branches (se `agent-coordination.md`, push-trinnet). Kør `git fetch --prune origin` først. Uden
  `--prune` bliver en remote-ref til en branch, der er slettet på GitHub, stående. Den kan melde en kollision, der ikke
  længere findes, hvilket er den sikre retning.
- Verificeret adfærd (CLI-tests mod rigtige midlertidige git-repositorier i
  `tests/unit/migration-versions-unique.test.mjs`):
  - dublet i samme træ giver 1;
  - samme version på en anden branch giver 1 og navngiver branchen;
  - samme fil på en stablet branch giver 0;
  - omnummerering af branchens egen, ikke mergede migration fjerner kollisionen (branchens egen gamle origin-ref ignoreres);
  - en ikke-prunet ref tæller, til den er prunet;
  - en ulæselig ref, en manglende base eller manglende git giver 2, aldrig et stille ok;
  - en ekstra worktree giver samme svar.
- **Resterende samtidighedsrisiko:** kontrollen er et øjebliksbillede af hentede branches, ikke en atomisk
  reservation. To sessioner, der vælger samme version inden for det samme vindue, før nogen af dem har pushet, ser
  ikke hinanden. Et lokalt, ikke-pushet nummer er usynligt. Træ-testen fanger kollisionen senest i den anden PR's
  CI, når den første er merget, eller i main-CI efter merge, hvis begge PR'er var grønne mod en ældre main (ikke
  strict). Afbødning uden reservationssystem: vælg ikke runde timer, kør kontrollen igen ved hvert push og
  umiddelbart før mergeanbefalingen, og kør træ-testen lokalt mod `ExpectedMain` som en del af
  integrationsverifikationen.
- **Senere integration i claim-protokollen (anbefaling, ikke gennemført):** `tools/agents/claim.mjs push-check` kan
  importere `collisions()` og afvise et push med en ny exitkode, når branchen tilføjer en migration, der kolliderer
  med en hentet branch. Kontrollen kører så automatisk i det trin, alle agenter allerede kører. Den forbliver et
  øjebliksbillede og ikke en reservation. Det er en ændring i det fælles koordinationsværktøj, så den bør lande
  som sin egen lille ændring, når #749 er merget.
