# SEC-KEY-01.2 — `request-password-help` på nøgleresolveren

> **Status: IKKE deployet.** Denne mappe er en klargjort deploy-pakke. Intet er sendt til
> Supabase, ingen secrets er ændret, ingen migration er kørt. Deploy kræver en særskilt
> ejergodkendelse af netop denne handling.

## Formål

Den lækkede legacy `service_role`-JWT (secret-scanning alert #1, D-146 „CONTAINED_IN_CODE —
NOT_ROTATED“) kan først slås fra, når **ingen** deployet Edge Function længere læser
`SUPABASE_SERVICE_ROLE_KEY` eller `SUPABASE_ANON_KEY` direkte. Legacy-parret deaktiveres samlet,
så begge halvdele skal flyttes, før nogen af dem kan slukkes.

Den deployede `request-password-help` (version 10) læser begge legacy-variabler direkte og har
desuden en tavs fallback, `Deno.env.get("SUPABASE_ANON_KEY") ?? ""`. Denne pakke flytter funktionen
over på den delte resolver `supabase/functions/_shared/supabase-keys.ts` — og **intet andet**.

## Hvorfor ikke deploye fra main

`supabase/functions/request-password-help/index.ts` på main er en senere omskrivning, der kalder
RPC'en `reserve_password_help` (migration `20260808010000`, D-243). Den migration er **ikke**
anvendt i produktion. Et deploy fra main ville derfor få hver eneste elevforespørgsel til at
fejle. Derfor er dette en kirurgisk patch af den **deployede** v10-kildekode, ikke af main.
Main's omskrivning er ikke rørt.

## Grundlag (hvad patchen bygger på)

| Felt | Værdi |
|---|---|
| Projekt | `tjzbehwfagiwpwodsgwg` |
| Funktion | `request-password-help` (id `8e60b46b-439d-45c6-b255-093e4e1a5be7`) |
| Version | **10** |
| `ezbr_sha256` | `d5c06a16b06e11f5f9a7aaa3e6ed6f101b72f8fc4e6a841148f1baaceece9afa` |
| `updated_at` | `1786206512705` (2026-08-08T16:28:32.705Z) |
| `verify_jwt` | `true` |
| `import_map` | `false` (ingen `deno.json` i bundtet) |
| Entrypoint | `functions/request-password-help/index.ts` |
| Hentet | 2026-11-05, read-only |

Filerne i `deployed-v10/` er byte-eksakte. De er hentet ad to uafhængige veje, som giver samme
bytes: `get_edge_function` (Supabase-plugin) og `supabase functions download --use-api`
(CLI 2.101.0). Desuden:

- `functions/request-password-help/index.ts` er byte-identisk med repo-commit `684fb0a9`.
- `functions/_shared/monitoring.ts` er repoets version (commit `e8a79bbd`) med **CRLF**-linjeskift,
  præcis som den ligger deployet. Mappens `.gitattributes` (`* -text`) sørger for, at git ikke
  normaliserer den til LF.

| Fil | Bytes | SHA-256 |
|---|---|---|
| `deployed-v10/functions/request-password-help/index.ts` | 16 594 | `9ae86188f58e69a1e67d47eb5f92200cabc6a2b6072cd4a1b4a7e0a52f2501cf` |
| `deployed-v10/functions/_shared/monitoring.ts` | 16 005 | `40dc2f15fe048c37676d879ee0176e386ad5941d6d4ae2f92e1cff0b476bd4c3` |
| `patched/functions/request-password-help/index.ts` | 17 544 | `4eb09e3d01d789d74a53964a722fe11897bc6d03bbbf23939dafdb66bf3cb45e` |
| `patched/functions/_shared/monitoring.ts` | 16 005 | `40dc2f15fe048c37676d879ee0176e386ad5941d6d4ae2f92e1cff0b476bd4c3` (uændret) |
| `patched/functions/_shared/supabase-keys.ts` | 10 469 | `472b99398ba2e94b3a71ee6383bce6d70f8bcfe0d76b955b0912e94a3eaa274d` (= main) |

Kildekoden indeholder ingen nøgle- eller JWT-literaler.

## Den præcise ændring (deployed → patched)

`monitoring.ts` er uændret. `supabase-keys.ts` er kopieret byte-identisk fra main. Den eneste
ændrede fil er `index.ts`:

```diff
--- deployed-v10/functions/request-password-help/index.ts
+++ patched/functions/request-password-help/index.ts
@@ -30,10 +30,12 @@
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 import { withObservability } from "../_shared/monitoring.ts";
+import { serviceKey, publishableKey } from "../_shared/supabase-keys.ts";
 
 const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
-const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
-const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
+// SEC-KEY-01.2: both Supabase keys come from the shared resolver (SUPABASE_SECRET_KEYS /
+// SUPABASE_PUBLISHABLE_KEYS first, legacy variables only as fallback), resolved inside
+// processHelpRequest so a missing or broken key is logged there instead of crashing the boot.
 
 // Server-side only. Never returned, never logged, never sent to the browser.
 const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
@@ -214,7 +216,17 @@
 // rejection inside a background task.
 async function processHelpRequest(email: string, ctx: Ctx): Promise<void> {
   try {
-    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
+    let privilegedKey: string;
+    try {
+      privilegedKey = serviceKey();
+    } catch (keyError) {
+      // The resolver's message names only variables and the key name, never a value.
+      console.error(`[request-password-help] request not processed: ${keyError instanceof Error ? keyError.message : "no privileged Supabase key"}`);
+      ctx.captureException(keyError, { stage: "service_key" });
+      return;
+    }
+
+    const admin = createClient(SUPABASE_URL, privilegedKey, {
       auth: { autoRefreshToken: false, persistSession: false },
     });
 
@@ -236,8 +248,15 @@
     // exactly what the browser used to do. No redirectTo is passed, so GoTrue uses its
     // configured Site URL — an address that is allow-listed by definition.
     if (role === "teacher" || role === "super_admin") {
-      if (SUPABASE_ANON_KEY) {
-        const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
+      let publicKey = "";
+      try {
+        publicKey = publishableKey();
+      } catch (keyError) {
+        // Was a silent `?? ""` skip in v10; now an explicit error line in the function logs.
+        console.error(`[request-password-help] staff recovery not sent: ${keyError instanceof Error ? keyError.message : "no public Supabase key"}`);
+      }
+      if (publicKey) {
+        const publicClient = createClient(SUPABASE_URL, publicKey, {
           auth: { autoRefreshToken: false, persistSession: false },
         });
         const { error: recoveryError } = await publicClient.auth.resetPasswordForEmail(email);
@@ -245,7 +264,7 @@
           ctx.captureMessage("staff recovery mail failed", "warning", { role });
         }
       } else {
-        ctx.captureMessage("staff recovery skipped: SUPABASE_ANON_KEY unset", "warning", { role });
+        ctx.captureMessage("staff recovery skipped: no usable public Supabase key", "warning", { role });
       }
       return;
     }
```

Uændret: rollerouting, rate-limit (15 min cooldown, 5 pr. døgn), `password_help_requests`-rækker,
Resend-mailen og dens danske tekster, det generiske svar „Hvis kontoen findes, har din lærer fået
besked.“, statuskoderne 200/400/405, CORS og antagelsen `verify_jwt=true`. Kommentaren „Sent with
the anon key …“ er bevidst ikke redigeret — kun nøglelinjerne er ændret.

## Den tavse fejl — valgt adfærd og begrundelse

**Hvad v10 gør.** Er `SUPABASE_ANON_KEY` ikke sat, bliver værdien `""`, og lærer-/admin-grenen
springer recovery-mailen over. Det eneste spor er `ctx.captureMessage(...)`, og den er en no-op,
medmindre `ENABLE_SENTRY_EDGE === "true"` og en DSN er sat (`_shared/monitoring.ts`,
`isEdgeMonitoringEnabled`). I praksis forsvinder mailen altså uden et eneste spor i funktionsloggen.
Det samme gælder privilegeret nøgle: mangler den, kaster `createClient` inde i `try`, og fejlen når
kun Sentry.

**Valgt: den kastende resolver (`serviceKey()` / `publishableKey()`), resolveret dovent inde i
`processHelpRequest`, med en lokal `catch`, der skriver én eksplicit `console.error`-linje.**

1. *Kastende frem for `optional…`.* `optionalPublishableKey()` returnerer `""` når intet er sat,
   men kaster alligevel ved et ødelagt bundt — to forskellige fejlveje. Den kastende variant giver
   ét sted, der fanger begge tilfælde (intet sat / bundt ugyldigt / mangler `default`) og logger dem
   ens. Resolverens fejltekster nævner kun variabelnavne og nøglenavnet, aldrig en værdi.
2. *Dovent frem for på modulniveau.* v10 kunne aldrig fejle ved opstart. Et kast på modulniveau
   ville give BOOT_ERROR på **alle** kald — også OPTIONS og 400-valideringen. Inde i
   `processHelpRequest` rammer en nøglefejl kun det arbejde, der faktisk kræver nøglen.
3. *Svaret til brugeren ændres ikke.* Det generiske 200-svar sendes, før baggrundsarbejdet starter
   (timing-kanalen, Section 173). At lade en nøglefejl ændre svaret ville afsløre, om adressen
   tilhører en lærer — altså konto-enumeration. „Fejl højt“ betyder her: en `console.error`-linje,
   der altid lander i Supabase-funktionsloggen, uanset Sentry, plus den eksisterende
   `captureMessage`/`captureException` til Sentry.
4. *Normal drift er uændret.* Produktionslogs har vist, at platformen injicerer
   `SUPABASE_SECRET_KEYS` og `SUPABASE_PUBLISHABLE_KEYS` med en `default`-post
   (`source=secret-keys` / `source=publishable-keys` fra get-next-question og process-event).
   Her vælger resolveren de nye nøgler, og funktionen opfører sig som før. Ruller man de nye nøgler
   tilbage, falder resolveren selv tilbage til legacy uden redeploy.

## Typecheck

`deno check functions/request-password-help/index.ts` (deno 2.7.14) giver i **både** `deployed-v10/`
og `patched/` præcis den samme ene fejl: TS2345 ved `findUserByEmail(admin, email)`, fordi
`https://esm.sh/@supabase/supabase-js@2` er upinnet og nyere typer ikke passer til
`ReturnType<typeof createClient>`. Fejlen findes allerede i den deployede v10, Supabase
typechecker ikke ved deploy, og patchen tilføjer ingen nye fejl. `functions/_shared/supabase-keys.ts`
typechecker rent.

## Deploy-layout (Supabase-plugin, `deploy_edge_function`)

Kun med særskilt ejergodkendelse. Payload = de tre filer i `patched/`, med disse navne:

| `name` | Kilde |
|---|---|
| `functions/request-password-help/index.ts` | `patched/functions/request-password-help/index.ts` |
| `functions/_shared/monitoring.ts` | `patched/functions/_shared/monitoring.ts` |
| `functions/_shared/supabase-keys.ts` | `patched/functions/_shared/supabase-keys.ts` |

- `entrypoint_path`: `functions/request-password-help/index.ts`
- `verify_jwt`: **`true`** (som v10 — må ikke ændres)
- Intet import map / ingen `deno.json` (v10 har `import_map: false`)
- Filindholdet sendes byte-for-byte (monitoring.ts med CRLF).

## Tjek før deploy

1. `list_edge_functions` (read-only): `request-password-help` skal stadig stå som **version 10**
   med `ezbr_sha256 = d5c06a16b06e11f5f9a7aaa3e6ed6f101b72f8fc4e6a841148f1baaceece9afa` og
   `updated_at = 1786206512705`. Har noget ændret sig, er pakken forældet: STOP og hent kilden igen.
2. `node --test tests/unit/request-password-help-keys-patch.test.mjs` skal være grøn — den sikrer
   blandt andet, at `patched/functions/_shared/supabase-keys.ts` stadig er identisk med main.

## Verifikation efter deploy (ikke udført)

1. Ny version (11) med `verify_jwt: true`.
2. Funktionsloggen viser resolverens linje, når en elev- eller lærerforespørgsel behandles:
   `[supabase-keys] source=secret-keys` (og for lærer/admin desuden `source=publishable-keys`).
   `legacy-service-role` eller `legacy-anon` betyder, at bundtet mangler — så må legacy ikke slås fra.
3. Ingen 5xx, ingen `[request-password-help] … not processed`/`not sent`-linjer.
4. Svaret er uændret: `{"ok":true,"message":"Hvis kontoen findes, har din lærer fået besked."}`
   for en gyldig adresse, 400 for en ugyldig.

## Rollback

Redeploy `deployed-v10/` med samme layout (to filer: `functions/request-password-help/index.ts` og
`functions/_shared/monitoring.ts`), `entrypoint_path` `functions/request-password-help/index.ts`,
`verify_jwt: true`. Det genskaber v10's kode byte-for-byte (versionsnummeret bliver et nyt).
Rollback virker kun, så længe legacy-nøglerne stadig er aktive.
