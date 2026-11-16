---
time: 2026-11-15T13:17:25Z
session: 981cb1a0
action: D-377 — 20261115090000_avatar_northstar_hair_nh5b_d377.sql (SHA-256 23ff6cbfce108cd0373dc0d3888e0ac3b5197ee3166db8b625b7babe86339e63) anvendt gennem ét apply_migration-kald med navnet avatar_northstar_hair_nh5b_d377, filen ordret fra merge-committen 8d691545 (merge af #713)
go: Ejerens godkendelse 2026-11-15 i session 981cb1a0 ("Jeg godkender merge af PR #713 på præcis head `f941d149ee27e822bf339451747096b532b29de1`, anvendelse af D-377-migrationen i produktion og én afgrænset produktionstest med projektets testkonto. … Anvend kun `20261115090000_avatar_northstar_hair_nh5b_d377.sql` ordret fra den mergede commit gennem den normale godkendelsesprocedure. … Hold `NORTHSTAR_HAIR_NH5B` slået fra som standard frem til beslutningen om offentlig åbning."). Godkendelsen omfattede ikke andre migrationer eller åbning af kortene
---

## Skrivninger

- `public.validate_avatar_identity()` er erstattet (`CREATE OR REPLACE`). `northstar.hair` må nu også være `nh5b-grey` eller `nh5b-brown`, og fejlteksten nævner dem. Alle andre regler er ordret som `20261112150000` (D-373).
- Migrationsloggen fik én række, `20261115131725 avatar_northstar_hair_nh5b_d377`.
- Ingen rækker, andre funktioner, triggere, rettigheder, flag eller secrets er ændret. Ingen andre migrationer er anvendt.

## Kontrol

**Læsende forhåndskontrol** umiddelbart før kaldet:
- Projektet var `tjzbehwfagiwpwodsgwg`.
- Ledgeren havde ingen post for filen. Den seneste var `20261114141653`.
- Live `validate_avatar_identity` havde md5 `993a9588b653cb75d35fae99184af3a1`, altså D-373's udgave, uændret siden D-377-PR'en blev klargjort.
- Deployet af `8d691545` var bekræftet: hovederne serveres med D-376's hashes, og `NORTHSTAR_HAIR_NH5B` er `false` live.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- Ledgerposten `20261115131725 avatar_northstar_hair_nh5b_d377` findes og er den seneste.
- Funktionsdefinitionen har md5 `b746b99c30198f5208b7fbba44e324ed`. Det er præcis filens funktionskrop, og listen indeholder `'nh5b-grey', 'nh5b-brown'`.
- Uændret:
  - `set_avatar_northstar` (md5 `43ae34bd…`);
  - triggeren `validate_avatar_identity BEFORE UPDATE OF avatar_identity ON public.profiles`.
- 0 profiler havde en topknude.

**Virkning:** ingen for eleverne. Kortene er skjult, så kun en browser med tilvalget kan vælge en topknude. Accepten er bevist ved produktionstesten med testeleven, se `2026-11-15T1319Z-d377-topknot-trial-test-pupil.md`.
