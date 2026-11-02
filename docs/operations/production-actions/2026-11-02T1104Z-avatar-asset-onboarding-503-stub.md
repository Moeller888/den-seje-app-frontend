---
time: 2026-11-02T11:04:52Z
session: 68d6376c
action: Akut sikkerhedsspærring — 503-stub udrullet til Edge Function avatar-asset-onboarding (v9 → v10) med Supabase CLI 2.101.0 (C:\Users\Bruger\bin\supabase-cli\supabase.exe) fra worktree wt-avatar-stub, commit e45cb991; index.ts SHA-256 465665bc2d6a16a8148cad021b1a9b5f0bbdbf0e1d23b5b9417901ddeb7c3a87
go: Ejerens "GO til ét nyt deployment-forsøg af avatar-asset-onboarding" (2026-11-02). Det første forsøg samme dag nåede ikke Supabase, fordi CLI-shim'en manglede supabase-go.exe; ingen ændring
---

## Skrivninger

- Kun Edge Function `avatar-asset-onboarding` er ændret: version 9 → **10**. `updated_at` er 2026-11-02T11:04:52Z, og `ezbr_sha256` er `cb0cfd7b…`. `verify_jwt = false` er uændret.
- Udrulningen indeholder kun `index.ts`. Ifølge CLI'en blev den uploadet som den eneste fil. Alt andet end OPTIONS (200 "ok", CORS) svarer **503 `{"error":"temporarily disabled"}`**.
- Ingen klient, ingen miljøvariabel, intet netværk, ingen database og ingen Storage.
- **Årsag:** v9 kørte alle ruter (submit, approve, promote, review/resolve og status) med service-nøglen uden at godkende kalderen.
- **Forventet følge:** `avatar-generation` (v15) får HTTP 503, når den kalder onboarding, og fejler tydeligt. `avatar-ingestion` (v14) får det samme i trin 10.
- Ingen andre funktioner, ingen migrationer, ingen secrets og ingen HTTP-kald til funktionen.

## Kontrol

Læsende efterkontrol kl. 11:05 UTC:

- **Den udrullede `index.ts`** er byte-identisk med den godkendte stub. SHA-256 er `465665bc…3c7a87`, sammenlignet med `cmp`.
- **De 15 øvrige Edge Functions** har uændret version og `ezbr_sha256`. `avatar-ingestion` er stadig v14 og stadig sårbar; den kræver sit eget GO.
- **Baseline er uændret før og efter:**
  - `avatar_assets`: 67 rækker, heraf 3 i produktion, sidst ændret 2026-05-08;
  - 65 valideringskørsler, 0 i review-køen, 29 ingestion-jobs og 78 generation-jobs;
  - Storage: avatar-staging 56, avatar-assets 48, avatar-thumbnails 48, avatar-generation-staging 114 og avatars 1.
- **Logs siden 11:00 UTC:** ingen kald og ingen fejl for funktionen.
- **Ikke verificeret:** at runtime faktisk svarer 503. Det kræver et HTTP-kald, som har sit eget GO.
- **Rollback:** sker ikke automatisk. Den sårbare v9 udrulles ikke igen uden et udtrykkeligt GO fra ejeren.
