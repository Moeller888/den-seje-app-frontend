---
time: 2026-11-02T11:42:44Z
session: 68d6376c
action: HTTP-verifikation i produktionens runtime af 503-stubbene i avatar-asset-onboarding (v10) og avatar-ingestion (v15). Fire kald fra 11:42:44 til 11:43:01 UTC
go: Ejerens "GO: Kontrolleret HTTP-verifikation af de to udrullede avatar-sikkerhedsstubs" (2026-11-02). Højst to kald pr. funktion, OPTIONS og GET, uden credentials
---

## Skrivninger

Formålet var at bevise, at de to spærrede funktioner afviser almindelige kald med 503 i den faktiske runtime, som den udrullede kildekode foreskriver.

| # | Metode | Sti | Status | Svar |
|---|---|---|---|---|
| 1 | OPTIONS | `/functions/v1/avatar-asset-onboarding` | 200 | CORS-headere som aftalt (`Allow-Origin: *`, `Allow-Methods: GET, POST, OPTIONS`) |
| 2 | GET | `/functions/v1/avatar-asset-onboarding/__security_stub_probe__` | 503 | `{"error":"temporarily disabled"}`, `Cache-Control: no-store` |
| 3 | OPTIONS | `/functions/v1/avatar-ingestion` | 200 | CORS-headere som aftalt |
| 4 | GET | `/functions/v1/avatar-ingestion/__security_stub_probe__` | 503 | `{"error":"temporarily disabled"}`, `Cache-Control: no-store` |

- Kaldene blev sendt med curl:
  - uden token, nøgle, cookie eller anden credential;
  - uden at følge redirects;
  - med 10 sekunders timeout;
  - uden gentagelser.
- Der blev ikke brugt nogen POST, PUT, PATCH eller DELETE, og ingen brugerdata eller asset-ID'er.
- Ved 503-svarene tilføjer Supabase-gatewayen selv headeren `sb-error-code: EDGE_FUNCTION_ERROR`.
- Der var ingen skrivende handlinger. Stubbene kan ifølge kildekoden ikke tilgå database, Storage eller netværk.

## Kontrol

- **Før kaldene (11:42 UTC):**
  - onboarding var v10 (`ezbr_sha256` `cb0cfd7b…`) og ingestion v15 (`03750fe5…`), begge med `verify_jwt = false`;
  - begge bundles var uændrede siden udrulningen, hvor `index.ts` blev byte-verificeret mod SHA-256 `465665bc…` og `46a309ba…`.
- **Efter kaldene (11:43 UTC):**
  - samme versioner og `ezbr_sha256`, og de øvrige 14 Edge Functions var uændrede;
  - databasen var identisk: 67 `avatar_assets` (3 i produktion, sidst ændret 2026-05-08), 65 valideringskørsler, 0 i review-køen, 29 ingestion-jobs, 65 artefakter, 348 hændelser og 78 generation-jobs;
  - Storage var identisk: avatar-staging 56, avatar-assets 48, avatar-thumbnails 48, avatar-generation-staging 114 og avatars 1;
  - Edge-loggen viste præcis disse fire kald og ingen andre kald til avatar-funktionerne.
- **Konklusion:** spærringerne virker i produktionens runtime.
