# SEC-KEY-01 (Q-03) — `get-reviewed-answers` på nøgleresolveren

> **Status: IKKE deployet.** Denne mappe er en klargjort deploy-pakke. Intet er sendt til
> Supabase, ingen secrets er ændret. Deploy kræver en særskilt ejergodkendelse af netop denne
> handling. Samlet plan: `docs/operations/sec-key-01-key-migration-runbook.md`.

## Hvorfor en patch og ikke deploy fra main

Den deployede version 18 læser `Deno.env.get("SUPABASE_ANON_KEY")!` direkte. `main` bruger
resolveren, men har **også** pakket handleren ind i `withObservability` (157C) og importerer
`_shared/monitoring.ts`. Et deploy fra main ville altså ændre mere end nøglen. Denne pakke ændrer
kun nøgleopslaget i den deployede kilde.

## Grundlag

| Felt | Værdi |
|---|---|
| Projekt | `tjzbehwfagiwpwodsgwg` |
| Funktion | `get-reviewed-answers` (id `f046e554-0614-4f41-9572-9fafd875f304`) |
| Version | **18** |
| `ezbr_sha256` | `7ad1811c76bae00d397484a5635f17898f355dac9664271b3363887c02a31b36` |
| `updated_at` | `1776771885221` (2026-04-21T11:44:45.221Z) |
| `verify_jwt` | `false` |
| `import_map` | `false` |
| Hentet | 2026-11-05, read-only, via `supabase functions download --use-api` (CLI 2.101.0); indholdet stemmer med `get_edge_function` |

| Fil | Bytes | SHA-256 |
|---|---|---|
| `deployed-v18/functions/get-reviewed-answers/index.ts` | 2 053 | `ee0568e8fb214a48fce634d921fd64223fcaf2ff1979b32915b79ab5ee6897f4` |
| `patched/functions/get-reviewed-answers/index.ts` | 2 375 | `82704cf9be7b44ab20f35b225d11e83a063273017dc7e16816080b43c4c57c33` |
| `patched/functions/_shared/supabase-keys.ts` | 10 469 | `472b99398ba2e94b3a71ee6383bce6d70f8bcfe0d76b955b0912e94a3eaa274d` (= main) |

Den deployede fil er byte-identisk med repo-commit `ef120598`. Kildekoden indeholder ingen nøgle-
eller JWT-literaler.

## Den præcise ændring

```diff
@@ -1,5 +1,6 @@
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
+import { publishableKey } from "../_shared/supabase-keys.ts";
@@ -14,7 +15,10 @@
   try {
     const supabaseUser = createClient(
       Deno.env.get("SUPABASE_URL")!,
-      Deno.env.get("SUPABASE_ANON_KEY")!,
+      // SEC-KEY-01: public key from the shared resolver (SUPABASE_PUBLISHABLE_KEYS first, legacy
+      // SUPABASE_ANON_KEY only as fallback). A missing or broken key throws inside this try, so the
+      // catch below logs it and answers 500 instead of running without a key.
+      publishableKey(),
```

**Fejlvej:** v18 ville med en manglende nøgle køre videre med `undefined` og fejle uklart.
`publishableKey()` kaster i stedet inde i den eksisterende `try`; den eksisterende `catch` skriver
`FULL ERROR:` i funktionsloggen og svarer 500. Resolverens fejltekst nævner kun variabelnavne,
aldrig en værdi. Alt andet — CORS, 401 ved manglende bruger, forespørgslen på `question_instances`
(egen `student_id`, `teacher_score` ikke null, nyeste 5) og svarformen — er uændret.

## Deploy-layout (Supabase-plugin, `deploy_edge_function`)

Kun med særskilt ejergodkendelse.

| `name` | Kilde |
|---|---|
| `functions/get-reviewed-answers/index.ts` | `patched/functions/get-reviewed-answers/index.ts` |
| `functions/_shared/supabase-keys.ts` | `patched/functions/_shared/supabase-keys.ts` |

- `entrypoint_path`: `functions/get-reviewed-answers/index.ts`
- `verify_jwt`: **`false`** (som v18 — må ikke ændres)
- Intet import map.

## Tjek før deploy

1. `list_edge_functions`: stadig **version 18** med `ezbr_sha256 = 7ad1811c…2a31b36`. Ellers STOP.
2. `node --test tests/unit/sec-key-01-runbook.test.mjs` er grøn.

## Verifikation efter deploy

1. Ny version (19), `verify_jwt: false`.
2. `POST` med et ugyldigt bearer-token giver 401 `{"error":"Unauthorized"}`, og funktionsloggen
   viser `[supabase-keys] source=publishable-keys` (aldrig `legacy-anon`).
3. Ingen 5xx.

## Rollback

Redeploy `deployed-v18/functions/get-reviewed-answers/index.ts` alene, `entrypoint_path`
`functions/get-reviewed-answers/index.ts`, `verify_jwt: false`. Virker kun, så længe legacy-nøglerne
er aktive.
