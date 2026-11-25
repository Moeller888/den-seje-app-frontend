# Workflow-forslag, der venter på et token med `workflow`-scope

Sessionens GitHub-token må ikke ændre filer under `.github/workflows/`. Derfor ligger de godkendte workflow-ændringer
her som patches, der kan anvendes direkte på `main`. Logikken bag dem ligger i almindelige filer, der allerede er
testet i CI. Workflowet kalder dem bare.

| Patch | Beslutning | Hvad den gør | Forudsætning |
|---|---|---|---|
| `unit-5-shards.patch` | D-385 § 1 | `playwright.yml`: matrix `[1, 2, 3, 4, 5]` plus begrundelse i kommentaren | PR #741 (vægtene) merget |
| `isolated-e2e-all-lanes.patch` | D-385 § 2 | `isolated-e2e.yml`: nyt job `isolated-e2e (alle baner)` | PR #741 (`tests/isolated/require-all-lanes.mjs`) merget |
| `rollback-lane.patch` | se `rollback-lane.md` | rollback-banen | rollback-PR'en; landes i sin egen PR |

## Ejerens handling (én gang, fra en ren checkout af `main` efter #741)

```
git switch -c ci/apply-d385-workflows origin/main
git apply --check docs/operations/ci-workflow-proposals/unit-5-shards.patch docs/operations/ci-workflow-proposals/isolated-e2e-all-lanes.patch
git apply docs/operations/ci-workflow-proposals/unit-5-shards.patch docs/operations/ci-workflow-proposals/isolated-e2e-all-lanes.patch
node --test tests/unit/ci-timing-metrics.test.mjs tests/unit/isolated-require-all-lanes.test.mjs
git commit -am "ci: D-385 — five unit shards and one fail-safe isolated-e2e check"
git push origin ci/apply-d385-workflows      # med en konto/token med workflow-scope; derefter en almindelig PR
```

Testene i sidste trin er lokalt kørt med begge patches anvendt: **42 af 42** (2026-11-24). Uden patches består de
også (42 af 42), så #741 kan merges før eller efter.

**Først når PR'en med patches er merget, og `isolated-e2e (alle baner)` er grøn på main:** ret rulesettet til at
kræve `unit` og `isolated-e2e (alle baner)`. Det er ejerens handling. `isolated-e2e (run 1)` kan derefter fjernes
fra de påkrævede checks. Ellers kræver rulesettet et check, som ældre PR'er aldrig får.

## Fejltilstande, som det samlede check håndterer

| Tilfælde | `needs.isolated-e2e.result` alene | `isolated-e2e (alle baner)` |
|---|---|---|
| Alle baner grønne | success | **grøn** |
| Én bane fejler eller timer ud | failure | **rød**, banen navngives |
| Én bane annulleres (ny push, manuel cancel) | cancelled | **rød** |
| Hele matrixen skippes (`if` falsk) | skipped | **rød** |
| En bane **forsvinder** fra matrixen | success | **rød**: "påkrævet bane mangler" |
| En bane findes to gange | success | **rød** |
| `plan` fejler | skipped | **rød** |
| Ren dokumentationsændring (`docs-md`) | success, trinnene skippes | **grøn** |
| Ekstra parallelle kørsler (`workflow_dispatch`, parallel 3) | success/failure | skal også være grønne |
| Rådgivende bane (rollback, før 10 grønne kørsler) | indgår | rapporteres, **blokerer ikke** |
| Hele workflowet annulleres | — | jobbet kører alligevel (`always()`) og bliver **rødt** |

Den påkrævede liste i scriptet sammenlignes i en unit-test med workflowets matrix. En omdøbt eller fjernet bane gør
derfor testen rød, så listen ikke kan forældes i stilhed.

## Tilbageførsel

`git revert` af workflow-committen. Rulesettet skal i så fald først pege tilbage på `isolated-e2e (run 1)`.
