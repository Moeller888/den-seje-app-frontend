---
time: 2026-11-18T13:51:03Z
session: 981cb1a0
action: D-381 — 20261118090000_avatar_northstar_hair_nh5c_d381.sql (SHA-256 0c389e859fae1081d2250914d11bf1bdfe2807548f59d36fc4a0449c70bfe360) anvendt gennem ét apply_migration-kald med navnet avatar_northstar_hair_nh5c_d381, filen ordret fra merge-committen 50e088f9 (merge af #726)
go: Ejerens godkendelse 2026-11-18 i session 981cb1a0 ("Jeg godkender merge af PR #726 på præcis head `540eeed18ab539d8b4b37adcbf6bc17e313ebef1`, anvendelse af D-381-migrationen i produktion og én afgrænset produktionstest med projektets testkonto. … Anvend kun migration `20261118090000` ordret fra den mergede commit gennem projektets normale procedure. … Hold Nakkelokker bag browsertilvalget frem til beslutningen om offentlig åbning."). Godkendelsen omfattede ikke andre migrationer eller åbning af kortene
---

## Skrivninger

- `public.validate_avatar_identity()` er erstattet (`CREATE OR REPLACE`). `northstar.hair` må nu også være `nh5c-grey` eller `nh5c-brown`, og fejlteksten nævner dem. Alle andre regler er ordret som `20261115090000` (D-377).
- Migrationsloggen fik én række, `20261118135103 avatar_northstar_hair_nh5c_d381`.
- Ingen rækker, andre funktioner, triggere, rettigheder, flag eller secrets er ændret. Ingen andre migrationer er anvendt.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Projektet var `tjzbehwfagiwpwodsgwg`.
- Ledgeren havde ingen post for filen. Den seneste var `20261116163535`.
- Live `validate_avatar_identity` havde md5 `b746b99c30198f5208b7fbba44e324ed`, altså D-377's udgave, uændret siden D-381-PR'en blev klargjort.
- Deployet af `50e088f9` var bekræftet: hovederne serveres med D-380's hashes, og `NORTHSTAR_HAIR_NH5C` er `false` live.
- Filen i merge-committen var byte for byte den samme som i den godkendte head `540eeed1`.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- Ledgerposten `20261118135103 avatar_northstar_hair_nh5c_d381` findes og er den seneste.
- Funktionsdefinitionen har md5 `f3bbb41c6f6fa76b79d4d7a103c7264c`. Det er præcis filens funktionskrop, og listen indeholder `'nh5c-grey', 'nh5c-brown'`.
- Uændret:
  - `set_avatar_northstar` (md5 `43ae34bde9bd2d5d48170c5ef8724d20`);
  - den ene trigger på `public.profiles`, der kalder `validate_avatar_identity`.

**Virkning:** ingen for eleverne. Kortene er skjult, så kun en browser med tilvalget kan vælge nakkelokker. Accepten er bevist ved produktionstesten med testeleven, se `2026-11-18T1354Z-d381-nape-locks-trial-test-pupil.md`.
