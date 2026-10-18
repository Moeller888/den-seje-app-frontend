# Danske bogstaver i opgavebanken

## Omfang og rodårsag

Ejeren udvidede 18. oktober 2026 mandatet fra propagandaopgaven til alle tilsvarende fejl
og godkendte merge samt liveanvendelse, hvis kontrollen viste, at det var forsvarligt.
Den oprindelige, uanvendte enkeltopgavemigration i PR #331 er derfor erstattet.

Produktionspreflight på `tjzbehwfagiwpwodsgwg` viste 2.143 opgaver, heraf 2.101 aktive.
Alle 1.053 opgaver uden for engelsk blev gennemgået, inklusive inaktive opgaver.
De 40 engelskopgaver med aa/ae/oe-kandidater blev særskilt kontrolleret; ordene var
korrekte engelske ord eller danske ord/navne og ændres ikke.

Rettelsen omfatter **254 aktive opgaver og 1.431 tekstfelter**:

| Emne | Opgaver |
|---|---:|
| Første Verdenskrig | 50 |
| Anden Verdenskrig | 45 |
| Danmarks oldtid | 49 |
| Reformation og enevælde | 51 |
| Vikinger | 18 |
| Den Kolde Krig | 19 |
| Revolutioner og demokrati | 20 |
| Industrialisering | 2 |

Fejlene findes allerede i historiske SQL-importers JSON-værdier, eksempelvis
`20260531092238_world_war_1_content_sprint_grade7.sql` og
`20260531140000_world_war_1_content_sprint.sql`. Der findes flere historiske varianter,
så den nye rettelse bygger på de aktuelle produktionsværdier frem for at antage,
at én importversion svarer til alle aktive rækker.

Importkoden i `tools/question-cli/src/` læser UTF-8 og viderefører prompt/svartekst;
`get-next-question` og `_shared/question-dto.ts` kopierer de relevante visningsstrenge.
`process-event` vælger forklaring fra metadata eller content. `app.js` bruger
`textContent` til spørgsmål, svarmuligheder og forklaring. Der er ikke fundet
translitteration i disse gennemgåede led. Det oprindelige forfatterværktøj er ukendt.

## Præcise rettelser

Der foretages ingen generel aa/ae/oe-erstatning i database, frontend eller Edge Functions.
De gennemgåede ordpar og kontekstbestemte fraser findes i
`tests/fixtures/danish-reviewed-words.json` og `danish-reviewed-phrases.json`.
Selve migrationen indeholder kun konkrete før-/efterstrenge med deres JSON-sti
og fingeraftryk for hele opgavens content og metadata.

Eksempler: formaaalet → formålet, Forste → Første, militaere → militære,
foerlob → forløb, maend → mænd og kraevede → krævede. Tvetydige tilfælde
er vurderet i sammenhæng: “Modet varede” betyder “Mødet varede”, mens
“gav borgerne modet” bevares. Navne som Aarhus, Graeber, Haak og Noe-Nygaard
samt ord som koeksistens, sagaer og engelske does/goes bevares.

Opgave-ID, emne, klassetrin, sværhedsgrad, aktivering, content_hash, tekniske metadata
og alle andre felter bevares. Historiske importfiler ændres ikke. Rettelsen er
en sproglig gennemgang af denne fejlklasse, ikke en faglig faktakontrol af alle opgaver.

## Bedømmelse og eksisterende elevforsøg

For 201 opgaver ændres stavningen i det korrekte svar. Eksisterende
`question_instances.correct_answer` kan fortsat indeholde den gamle tekst, også når
en besvaret opgave senere genåbnes som gentagelse. En datarettelse alene ville derfor
kunne få et korrekt, rettet svar til at blive bedømt forkert.

Disse opgaver får præcis to serverejede aliaser i
`metadata.danish_orthography_correct_aliases`: den gamle og den rettede korrekte svartekst.
`process_question_attempt` får en afgrænset kompatibilitetskontrol. Den bruges kun,
når begge den gemte instansnøgle og opgavens aktuelle facit findes i dette par.
Funktionen accepterer derefter begge stavemåder og returnerer det aktuelle facit.
Den eksisterende normalisering for øvrige svar bevares; der indføres ingen generel fuzzy matching.

Ingen elevsvar, facit-snapshots, korrekthedsvurderinger, XP, mønter eller andre
historiske elevfelter opdateres af migrationen. RPC-signatur, ejer,
`SECURITY DEFINER`, `search_path` og EXECUTE-rettigheder bevares.
Produktionsrettighederne er kun `postgres` og `service_role`; elever kan fortsat ikke
kalde RPC'en direkte. DTO-whitelisten eksponerer ikke aliaserne for browseren.
Edge Function-kode og frontend ændres ikke og behøver ikke deployment.

## Vurdering af liveanvendelse

**Anbefaling: ja, når den friske preflight og de lokale testkrav er opfyldt.**
Alle 254 berørte opgaver er aktive. Det er relevant at rette elevernes synlige tekster,
og kompatibiliteten fjerner risikoen for at ugyldiggøre eksisterende korrekte svartekster.
Ændringen kan udføres atomisk med kontrol af alle førværdier. Den kræver ingen ændringer
af adgangspolitikker, elevhistorik eller frontend og foretager ingen generel sprogkonvertering.

Migrationen kræver præcis én matchende række pr. gennemgået opgave, identificeret ved
emne, klassetrin, bånd og indholdsfingeraftryk, uden hardkodede produktions-UUID'er.
Manglende/duplikerede rækker, ændret metadata eller tekst, nye spørgsmålstriggere eller
en ændret bedømmelsesfunktion stopper hele transaktionen. En kort skrivelås og fem
sekunders lock-timeout beskytter mod samtidige indholdsændringer. Gentagelse er en no-op.

## Verifikation og anvendelse

`tests/unit/danish-question-bank-text.test.mjs` kører den præcise SQL og rollback i PGlite.
Den verificerer alle 254 rækker og 1.431 tekstændringer samt bevaring af uvedkommende
felter og elevhistorik. For alle 201 ændrede facit testes gamle åbne sider, nye sider,
gamle svar på nye instanser, gentagelser, forkerte svar og genkald uden dobbeltbelønning.
Den faktiske offentlige DTO testes for alle rettede opgaver. Nummer- og engelsksvar,
ejerskabskontrol og uændrede funktionsrettigheder dækkes også.

De tilstødende tests dækker svarvalidering, offentligt payload, gentagelser,
RPC-adgang og migrationspolitik. Ingen tests mod rigtige elever køres.
**Lokalt resultat: 116/116 målrettede tests bestået**, heraf 11 nye runtime-/kontrakttests.
Frisk produktionspreflight matchede alle 254 aktive opgaver og deres metadata præcist;
de 757 eksisterende instanser havde ingen uventede facit-snapshots. De to eksisterende
migrationsrækkefølge-tests er opdateret til den nye, navngivne definition; deres krav
om bevaret belønnings- og adgangslogik understøttes nu også af runtime-tests og en
bytepræcis sammenligning af den øvrige funktionskrop.
Den fulde unit-suite er ikke verificeret grøn: tidligere sandboxkørsel gav EPERM
i uændrede avatar-tests, og automatisk godkendelseskontrol afviste den efterfølgende
anmodning om en fuld kørsel uden sandbox. Der anvendes målrettede, lokale tests.

Anvendelse følger [D-110-politikken](migration-workflow-policy.md): merge til kendt
main-SHA, frisk skrivebeskyttet preflight, kontrol af alle førværdier og RPC-kontrakt,
én anvendelse af den eksakte SQL via `apply_migration`, efterkontrol og dokumentation
af det eksterne migrationsversionsnummer. `supabase db push` må ikke anvendes.
Den konkrete anvendelsesstatus, main-SHA, eksterne version og efterkontrol registreres
i [PR #331](https://github.com/Moeller888/den-seje-app-frontend/pull/331).
Den rå førbackup opbevares lokalt i `quiz-danish-verification`; fixturefilen i repoet
indeholder kun opgaveindhold og scope, ingen elevdata eller produktions-ID'er.

PR- og merge-commit bruger `[skip ci]`, så opgaven ikke starter den produktionsbaserede
Playwright-suite. Workflowfilerne ændres ikke. CI rapporteres ikke som grøn.

Rollback-SQL findes i `docs/operations/rollback-danish-question-bank-text.sql` og er
lokalt testet med de samme førværdi- og funktionskontroller. Hvis live-trafik allerede
har oprettet nye facit-snapshots med den rettede skrivemåde, stopper denne fulde rollback.
I det tilfælde kræves en særskilt kompatibel rollback, der bevarer aliasunderstøttelsen;
elevhistorik må aldrig omskrives for at få rollback til at lykkes.
