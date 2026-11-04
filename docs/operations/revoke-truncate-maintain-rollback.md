# TRUNCATE og MAINTAIN fjernet fra API-rollerne (D-237): anvendelse og tilbagerulning

Gælder migrationen `supabase/migrations/20261027160000_revoke_truncate_maintain_api_roles.sql`
([D-237](../decisions/D-237.md)).

**Status:** IKKE ANVENDT I PRODUKTIONEN. Både anvendelse og tilbagerulning kræver ejerens særskilte
godkendelse (D-110, [migration-workflow-policy.md](../migration-workflow-policy.md)).
`supabase db push` er forbudt.

Al SQL til kontrol og snapshot står i [`revoke-truncate-maintain-preflight.sql`](revoke-truncate-maintain-preflight.sql).
Filen indeholder kun `SELECT`, og den køres i én `BEGIN TRANSACTION READ ONLY … ROLLBACK`.
Unit-testen kører netop den fil i en READ ONLY-transaktion mod PGlite-fixturen.

## 1. Før anvendelse (kun læsning)

Kør hele preflight-filen med ejerens GO til en læsende produktionskontrol. Gem hele outputtet.

| Kontrol | Forventet | Ved afvigelse |
|---|---|---|
| 1. D-237 i migrationsloggen | 0 rækker | Stop: migrationen er allerede anvendt eller registreret. |
| 2. De 32 relationer findes | 0 rækker | Stop: en relation er omdøbt eller slettet, og migrationen ville fejle. |
| 3. Præcis de 32 giver TRUNCATE eller MAINTAIN til en API-rolle | 0 rækker | Stop: kataloget har flyttet sig siden 2026-11-04. Listen og testen skal opdateres først. |
| 4. Ingen grant option, ingen fremmed grantor og ingen PUBLIC-tildeling af de to rettigheder | 0 rækker | Stop: tilbagerulningen nedenfor kan ikke genskabe sådanne tildelinger præcist. |
| 5. anon og authenticated arver ikke fra en anden rolle | 0 rækker | Stop: en arvet rettighed kunne bevare TRUNCATE eller MAINTAIN efter REVOKE. |
| Snapshot | Én række pr. tabel og view i `public` | Gemmes. Det er grundlaget for tilbagerulning og efterkontrol. |
| Rollback-generator | Én `GRANT` pr. relation og API-rolle | Gemmes uændret. Det er tilbagerulningen. |

Den seneste læsende kontrol (2026-11-04) opfyldte kontrol 1–5. Den skal gentages umiddelbart før
anvendelsen; et ældre resultat er ikke nok.

## 2. Anvendelse

Én `apply_migration` med migrationsfilen uændret. SHA-256 skal være
`c4a1728abe59aab4fa3be337ac72f2b5758d83c07a1681bd8fdc456595e38cb5`. Ved fejl eller timeout må kaldet
ikke gentages, før loggen og kataloget viser, om migrationen landede (D-182).

Migrationen er transaktionel. Mangler en af de 32 relationer, fejler den samlet og ændrer intet.
Den kræver ikke `CASCADE`, fordi alle tildelinger er givet af ejeren uden grant option (kontrol 4).

## 3. Efterkontrol (kun læsning)

1. Kontrol 3 giver nu 32 rækker med "listed but holds nothing", og ingen med "holds but not listed".
2. Hver relations ACL er snapshottets ACL minus `D` og `m` for anon og authenticated. Intet andet er
   ændret, heller ikke for service_role, postgres eller relationer uden for listen.
3. Migrationen står i loggen med den version, API'et tildelte. Den flyttes først derefter fra
   `NOT_IN_PRODUCTION` til `APPLIED_IN_PRODUCTION` i `tests/isolated/schema/replay-plan.mjs`.

## 4. Tilbagerulning

Tilbagerulningen er præcis de `GRANT`-sætninger, rollback-generatoren gav **før** anvendelsen. Den
genskaber kun de TRUNCATE- og MAINTAIN-tildelinger, der fandtes, pr. relation og pr. rolle.

- **Brug aldrig `GRANT ALL` eller en fast liste.** Rettighederne er ikke ens: anon har intet på
  `avatar_generation_jobs`, og på de to views har kun authenticated MAINTAIN.
- **Udføres som ejeren** (`postgres`), som er grantor for alle tildelingerne (kontrol 4). Så bliver
  ACL-posterne identiske med snapshottets.
- **Mangler generatorens output fra før anvendelsen,** kan tilbagerulningen ikke laves præcist. Så
  stoppes der. Den må ikke rekonstrueres ud fra et gæt.
- **Efterkontrol:** hver relations ACL er igen identisk med snapshottet.

Unit-testen beviser på PGlite, at generatorens output fra før migrationen genskaber hver ACL præcist,
og at generatoren kun udsender de to rettigheder til de to API-roller.

## 5. Begrænsninger

- PGlite er PostgreSQL 18. Produktionen er 17.6. `MAINTAIN` og `aclexplode` findes i begge.
- Ingen test har kørt mod en rigtig PostgreSQL 17 eller mod produktionen.
- Snapshottet fra 2026-11-04 er et dateret register, ikke en levende sammenligning.
