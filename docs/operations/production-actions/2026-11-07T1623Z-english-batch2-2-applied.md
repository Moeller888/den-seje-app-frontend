---
time: 2026-11-07T16:23:31Z
session: b06fd411
action: Engelsk 5.000, trin 1c, batch 2 del 2 — 20261020140002_english_level_batch2_2.sql (SHA-256 1de937ec175c3980c372dac9aa1362821a6cf4bd81b1593bbf78a9bff014ee2d) anvendt gennem ét apply_migration-kald med navnet english_level_batch2_2, filen ordret fra main b5bd4e42
go: Ejerens GO 2026-11-07 i session b06fd411 ("GO til næste fil: `20261020140002_english_level_batch2_2.sql`. Kør samme forhåndskontrol, anvend filen uændret fra main, og verificér antal nye rækker, at alle er inaktive, samt gyldige niveauer og CEFR. Anvend ingen andre filer, aktivér intet, og vent med bogføringen til hele batch 2 er anvendt."). Godkendelsen omfattede ikke batch2_3, aktivering eller tilbagerulning
---

## Skrivninger

- `public.questions` fik 167 nye rækker. Alle har `is_active = false`, `learning_objective = 'english'` og
  `metadata.level_batch = 'batch2'`.
- Migrationen er én `INSERT … SELECT` uden `UPDATE`, `DELETE` eller DDL.
- Migrationsloggen fik én række, `20261107162331 english_level_batch2_2`. Den har nu 175 poster.
- Ingen andre tabeller, funktioner, flag eller secrets er ændret.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Ingen eksisterende opgave har samme tekst som en af de 167.
- Banken havde 2.930 rækker (`grade6_9` 120, `pilot` 500, `batch2` 167), og 2.099 var aktive.
- Der var 0 triggere, og constraints og indeks var uændrede.
- Der var ingen nye poster i migrationsloggen siden batch2_1, og filen var ikke anvendt før.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- `batch2` har nu 334 rækker i alt, 0 aktive og 0 uden niveau eller CEFR.
- Den nye fil har niveauer i 2.600–8.047 og fordelingen A1 1, A2 3, B1 67 og B2 96. Intet niveau i batch 2 ligger
  uden for sit CEFR-interval.
- Indholdsfingeraftrykket for batch2_1 + 2, `8c0f8ea9…`, er identisk med repoet.
- Den gemte sætning har md5 `8caebe67…`, samme som filen.
- Banken har 3.097 rækker, og antallet af aktive er uændret, 2.099.

**Afvigelser:** ingen tekniske.

**Fagligt fund**, ikke rettet og registreret som åbent punkt før aktivering i runbookens §2.8: opgaven "Hvad
betyder 'suppose' i 'I suppose you're right'?" (niveau 6.948, B1, række-id
`3cf224e8-b08a-4ab3-b4d8-de4d72f09e6e`) har det rigtige facit, "formoder". Forklaringsteksten handler dog om et andet
ord: "'Guess' betyder gætte. Gæst hedder 'guest'."

**Virkning:** ingen for eleverne, fordi rækkerne er inaktive.

**Ikke gjort:** batch2_3, aktivering og rettelsen ovenfor.
