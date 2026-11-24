---
time: 2026-11-24T16:07:06Z
session: dda698b8
action: D-386 — 20261124120000_avatar_northstar_hair_h25g1_d386.sql (SHA-256 a3eb5849999915f80b051847a26ee3c20b8b664e934e2c5f05b1bead9fcf5917) anvendt gennem ét apply_migration-kald med navnet avatar_northstar_hair_h25g1_d386; funktionskroppen ordret fra merge-committen 44fcf93f (merge af #747)
go: Ejerens godkendelse 2026-11-24 i session dda698b8 ("Jeg godkender merge af PR #747 på præcis head abc487765ecd7899c2931903b13794383a49ea78 … Derefter godkender jeg, at migrationen 20261124120000 anvendes i produktionen, efter kontrol af at den kun udvider de tilladte hårvalg som beskrevet i D-386."). Godkendelsen omfattede ikke andre migrationer
---

## Skrivninger

- `public.validate_avatar_identity()` er erstattet (`CREATE OR REPLACE`).
  - `northstar.hair` må nu også være én af de tolv værdier `h25n2-grey`, `h25n2-brown`, `h25n3-grey`, `h25n3-brown`, `h25n6-grey`, `h25n6-brown`, `h25n7-grey`, `h25n7-brown`, `h25v2-grey`, `h25v2-brown`, `h25n5-grey` og `h25n5-brown`, og fejlteksten nævner dem.
  - Alle andre regler er ordret som `20261118090000` (D-381).
- Migrationsloggen fik én række, `20261124160706 avatar_northstar_hair_h25g1_d386`.
- Ingen rækker, andre funktioner, triggere, rettigheder, flag eller secrets er ændret. Ingen andre migrationer er anvendt.

**Kaldets tekst:** funktionsdefinitionen (`CREATE OR REPLACE FUNCTION … $function$;`) er byte for byte filens. Kun filens indledende kommentarer blev afkortet til tre linjer med kilde og tilbagerulning. Kommentarer uden for funktionskroppen gemmes ikke i databasen, så den gemte definition er den samme som filens.

## Kontrol

**Kontrol af indholdet før kaldet:**
- Filen i merge-committen `44fcf93f` er byte for byte den samme som i den godkendte head `abc48776` (SHA-256 ovenfor).
- `diff` mod D-381's `20261118090000` viser kun to slags forskelle: kommentarer, og hårlisten med fejlteksten, som er udvidet med de tolv værdier. Migrationen udvider altså kun de tilladte hårvalg, som D-386 beskriver.

**Læsende forhåndskontrol umiddelbart før kaldet:**
- Projektet var `tjzbehwfagiwpwodsgwg`.
- Ledgeren havde ingen post for filen. Den seneste var `20261124072627`.
- Live `validate_avatar_identity` havde md5 `f3bbb41c6f6fa76b79d4d7a103c7264c`. Det er D-381's udgave, uændret siden D-386-PR'en blev klargjort.

**Kaldet:** ét `apply_migration`. Svaret var `{"success":true}`.

**Læsende efterkontrol:**
- Ledgerposten `20261124160706 avatar_northstar_hair_h25g1_d386` findes og er den seneste.
- Funktionsdefinitionen har md5 `285376e0014d48c5605762df3eaffe38`, og listen indeholder de tolv værdier.
- Uændret:
  - `set_avatar_northstar(p_choice jsonb)` (md5 `43ae34bde9bd2d5d48170c5ef8724d20`);
  - den ene trigger, der kalder `validate_avatar_identity`.

**Virkning:** ingen for eleverne. Kortene var skjult (`NORTHSTAR_HAIR_H25G1 = false` live), så kun en browser med tilvalget kunne vælge gruppe 1. Accepten er bevist ved produktionsprøven med testeleven, se `2026-11-24T1612Z-d386-group1-trial-test-pupil.md`.
