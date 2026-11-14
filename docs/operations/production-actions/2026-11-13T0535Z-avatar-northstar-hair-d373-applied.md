---
time: 2026-11-13T05:35:15Z
session: 981cb1a0
action: D-373 — 20261112150000_avatar_northstar_hair_d373.sql (SHA-256 51d5f6615cd0bfb870f20bf64a86be6a5dd9177138d3c93d40f305e6d8857a42) anvendt gennem ét apply_migration-kald med navnet avatar_northstar_hair_d373, filen ordret fra main 175dbe24 (merge af #697)
go: Ejerens godkendelse 2026-11-13 i session 981cb1a0 ("Jeg godkender anvendelse af migration `20261112150000` i produktion. … Hvis den normale procedure også vil anvende andre ventende migrationer, så stop og vis mig hvilke. … Hold `NORTHSTAR_HAIR_CHOICE` slået fra som standard. … Vent med at gemme et hårvalg i produktion og med at slå flaget til for alle."). Godkendelsen omfattede ikke andre filer, gemning af et hårvalg eller aktivering
---

## Skrivninger

- `public.validate_avatar_identity()` er erstattet (`CREATE OR REPLACE`). Northstar-objektet tager nu også `hair` ind, og værdien skal være `standard`, `nh4-grey` eller `nh4-brown`. Alle andre regler er ordret som `20261106120000`.
- Migrationsloggen fik én række, `20261113053515 avatar_northstar_hair_d373`.
- Ingen rækker, andre funktioner, triggere, rettigheder, flag eller secrets er ændret. Ingen andre migrationer er anvendt.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Projektet var `tjzbehwfagiwpwodsgwg`, det samme som appens klient på `main` peger på.
- Filen på `main` og i merge-committen `175dbe24` havde samme SHA-256, `51d5f661…`.
- Ledgeren havde ingen post for filen. Den seneste var `20261111182211`.
- Live `validate_avatar_identity` var tegn for tegn filens funktion uden D-373's tilføjelser, altså udgaven fra `20261106120000`.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- Ledgerposten `20261113053515 avatar_northstar_hair_d373` findes.
- Funktionsteksten har `hair` i listen over tilladte nøgler og har værdikontrollen for de tre frisurer. Dens md5 er `993a9588…`.
- Uændret:
  - `set_avatar_northstar` (md5 `43ae34bd…`, som før);
  - rettighederne på `validate_avatar_identity`;
  - triggeren `BEFORE UPDATE OF avatar_identity ON public.profiles`.
- 0 profiler har `northstar.hair`, og 7 har et Northstar-valg.

**Ikke verificeret her:** at en gemt frisure faktisk accepteres. En prøve på en midlertidig tabel i en skrivebeskyttet transaktion blev blokeret af den lokale vagt (`BEGIN`) og blev ikke kørt. Accepten er senere bevist ved produktionstesten med testeleven, se `2026-11-13T0545Z-d373-hair-trial-test-pupil.md`.

**Virkning:** ingen for eleverne. `NORTHSTAR_HAIR_CHOICE` er `false` live, så kun en browser med tilvalget kan skrive nøglen.
