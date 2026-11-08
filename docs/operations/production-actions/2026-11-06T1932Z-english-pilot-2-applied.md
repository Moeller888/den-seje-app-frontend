---
time: 2026-11-06T19:32:42Z
session: b06fd411
action: Engelsk 5.000, trin 1b del 2 — 20261020130002_english_level_pilot_2.sql (SHA-256 6e933605bb0037c3a9274fc587fa2360258a0687bc8ec44e4ab3a220885664c9) anvendt gennem ét apply_migration-kald med navnet english_level_pilot_2, filen ordret fra main 8ad14c1c
go: Ejerens GO 2026-11-06 i session b06fd411 ("GO til kun 20261020130002_english_level_pilot_2.sql. Kør forhåndskontrol, anvend migrationen uændret fra main, kontrollér de nye inaktive rækker samt niveau/CEFR og stop. Anvend ikke pilotfil 3. Vent med bogførings-PR'en, til hele piloten er anvendt."). Godkendelsen omfattede ikke pilotfil 3, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'pilot'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261106193242 english_level_pilot_2`. Den har nu 172 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167.
- Banken havde 2.430 rækker (`grade6_9` 120, `pilot` 167), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden pilot_1.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- Pilot har nu 334 rækker i alt, 0 aktive og 0 uden niveau eller CEFR.
- Niveauerne ligger i 3.001–8.138, og fordelingen for pilot_1 + 2 er A2 63, B1 160 og B2 111.
- Indholdsfingeraftrykket for pilot_1 + 2, `1aa3a22b…`, er identisk med repoet.
- Den gemte sætning har md5 `19c4dc91…`, samme som filen.
- Banken har 2.597 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen tekniske.

**Fagligt fund**, ikke rettet og registreret som åbent punkt før aktivering i runbookens §2.8: opgaven "She has a
___ memory. She never forgets anything." (niveau 7.856, B2) har det rigtige facit, `sharp`. Forklaringsteksten
nævner dog kun "strong (or good) memory".

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** pilotfil 3, aktivering og rettelsen ovenfor.
