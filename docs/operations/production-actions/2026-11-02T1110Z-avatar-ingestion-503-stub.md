---
time: 2026-11-02T11:10:54Z
session: 68d6376c
action: Akut sikkerhedsspærring — 503-stub udrullet til Edge Function avatar-ingestion (v14 → v15) med Supabase CLI 2.101.0 (C:\Users\Bruger\bin\supabase-cli\supabase.exe) fra worktree wt-avatar-stub, commit e45cb991; index.ts SHA-256 46a309bafe521707482cbe55f7e99dfb94c4d2fd7c9d69a484b050a6caf3ec48
go: Ejerens "GO: Akut sikkerhedsspærring af avatar-ingestion — kun denne ene funktion" (2026-11-02)
---

## Skrivninger

- Kun Edge Function `avatar-ingestion` er ændret: version 14 → **15**. `updated_at` er 2026-11-02T11:10:54Z, og `ezbr_sha256` er `03750fe5…`. `verify_jwt = false` er uændret.
- Udrulningen indeholder kun `index.ts`. Ifølge CLI'en blev den uploadet som den eneste fil. Alt andet end OPTIONS (200 "ok", CORS) svarer **503 `{"error":"temporarily disabled"}`**.
- Ingen klient, ingen miljøvariabel, intet netværk, ingen database og ingen Storage.
- **Årsag:** v14 kørte alle ruter (init, analyze, process, retry og status) med service-nøglen uden at godkende kalderen. Dermed kunne enhver lave signerede uploads til `avatar-staging` og skrive til `avatar-assets` og den offentlige `avatar-thumbnails`.
- Ingen andre funktioner, ingen migrationer, ingen secrets og ingen HTTP-kald til funktionen.

## Kontrol

Læsende efterkontrol kl. 11:11 UTC:

- **Den udrullede `index.ts`** er byte-identisk med den godkendte stub. SHA-256 er `46a309ba…ec48`, sammenlignet med `cmp`.
- **`avatar-asset-onboarding`** er stadig v10 med `ezbr_sha256` `cb0cfd7b…`, altså den sikrede stub fra kl. 11:04.
- **De 14 øvrige Edge Functions** har uændret version og `ezbr_sha256`.
- **Baseline er uændret før og efter:**
  - `avatar_assets`: 67 rækker, heraf 3 i produktion, sidst ændret 2026-05-08;
  - 65 valideringskørsler og 0 i review-køen;
  - ingestion: 29 jobs (seneste 2026-04-29), 65 artefakter og 348 hændelser;
  - 78 generation-jobs;
  - Storage: avatar-staging 56, avatar-assets 48, avatar-thumbnails 48, avatar-generation-staging 114 og avatars 1.
- **Logs siden 11:00 UTC:** ingen kald og ingen fejl for de to funktioner.
- **Ikke verificeret:** at runtime faktisk svarer 503. Det kræver et HTTP-kald, som har sit eget GO.
- **Rollback:** sker ikke automatisk. Den sårbare v14 udrulles ikke igen uden et udtrykkeligt GO fra ejeren.
