# Guidet eksponering og hints: kortlægning og forslag

**Status:** F10-B2, 2026-11-08. Analyse og forslag. Det eneste implementerede er, at hints'ene er med i den isolerede testfixtur (denne PR). Intet er anvendt i produktionen.

## 1. Fire ord, fire forskellige ting

| Ord | Betyder | Hvem kan registrere det troværdigt |
|---|---|---|
| **Serveret** | Serveren har udleveret indholdet (instans oprettet, K1: `served_snapshot` + `served_content_sha256` + `served_at`) | Serveren. Autoritativt |
| **Vist** | Indholdet var faktisk på skærmen | Kun klienten kan vide det. Serveren kan registrere *hvornår den blev fortalt det* (K9 `mark_presented`) |
| **Gennemført** | Eleven har afgivet et svar i trinnet | Serveren (`question_instances.answered` / `question_attempts`) |
| **Forstået** | Eleven kan anvende det | **Ingen enkelt hændelse.** Højst evidens fra senere selvstændige svar (D-330) |

Ingen hændelse må alene få noget til at stå som forstået.

## 2. Hvad findes i dag

| Behov | Status |
|---|---|
| Hvilket indhold blev serveret, og hvilken version | **K1** fryser snapshottet ved serveringen (`served_snapshot`, `served_content_sha256`, `served_at`). Merget, men ikke anvendt i produktionen |
| Hvornår | `served_at` (K1) |
| Om trinnet blev gennemført | ja: instans/forsøg |
| Introduktion og guidet undersøgelse i Arkivskabet | **Ingen serverhændelse.** Indholdet (`intro-content.ts`) vises af spillet uden en serverinstans. `learning-sequence.ts`: "Introduction and exploration are NOT server steps: the server records no exposure today (LPD §5.3)" |
| "Vist" | K9 `mark_presented` er et forslag og ikke bygget (`learning-progression-l1-contracts.md` §K9, "L3 eller L5") |

## 3. Forslag: serverstyret eksponering for introduktionstrin
Introduktionen bliver et **servertrin uden svar**:
1. Den har sit eget `learning_step` (fx `introduction`) og sin egen indholdsrække med en versionshash.
2. `get-next-question` opretter en instans uden facit med `served_snapshot`. Det giver "serveret" med en indholdsversion.
3. Spillet kalder `mark_presented(instance_id, round_no)`, når indholdet er vist. Serverens tid gemmes én gang pr. runde (K9-reglerne). Det giver "vist".
4. "Gennemført" er en eksplicit handling ("Jeg har læst det" eller "Videre"), registreret af serveren. Det giver ikke korrekt/forkert og aldrig evidens.

**Manipulation:** klienten kan højst kalde for sent eller lade være. Ingen af delene kan gøre noget stærkere (K9). Eksponering bruges kun som *forudsætning* for, at et senere svar kan tælle (`laeringsmodel-og-evidens.md` K7.3), og aldrig som evidens i sig selv.

**Afhængigheder:**
- K1 er anvendt.
- `learning-sequence.ts` får et `introduction`-trin. Det er en LP-13-beslutning.
- Introduktionsindholdet skal flyttes fra `intro-content.ts` til serverindhold. Det kræver lærergodkendelse, hvis teksten ændres. Ordret flytning gør ikke.
- **Hvem bygger:** L3/L5-sporet (#653). Det kræver ejerens GO til LP-13-trinnet.

## 4. Hints: indholdskontrakt
**Kortlægning:**
- Hints'ene findes allerede som lærergodkendt tekst i `adventure-engine/packages/archive-prototype/src/host-items.ts`.
- Spillet viser dem i øvelsestrinnene (vejledt øvelse og revision), og lærergennemgangen (`kildekritik-laerergennemgang.md`) viser dem under "Hjælp (hints, kun i øvelse)".
- Kontrol-, anvendelses- og repetitionsopgaver har ingen (LP13-3 A).
- Serveren kender dem ikke i dag, fordi den rigtige backend afviser `hint.request`.

**Kontrakt (`content.hints`):**
- En liste med 0–3 strenge pr. spørgsmål, i stigende hjælpegrad. Niveau n forudsætter n−1, svarende til `request_question_hint` i #653.
- Kun på øvelsestrin (`guided_practice`, `revision`).
- Et hint må aldrig nævne svaret eller være den korrekte kildes beskrivelse. Det testes i `laerligverse-fixture-hints.test.mjs`.
- Højst 400 tegn.
- Hints er aldrig offentlige: `PUBLIC_CONTENT_KEYS` har ikke `hints`. De udleveres kun gennem serverens hintlog (#653).
- Pædagogisk retning: ledetråde, der peger på *fremgangsmåden* (afsender, tid, formål) og ikke på svaret. Det er stilladsering, der trappes ned (Renkl & Atkinson 2003, `laeringsmodel-og-evidens.md`).

**Implementeret i denne PR (testleverance):**
- `review-pack.mjs` skriver de samme tekster ordret ind i den isolerede fixtur.
- Lærerpakken og godkendelsernes fingeraftryk er byte-identiske.

**Ikke gjort, og det kræver en beslutning:**
- Produktionens seed af Arkivskabets spørgsmål, med hints, venter på det endelige `learning_objective` (LP-2) og på #623 → #647.
- Ingen masseproduktion af hints til andre forløb, før kontrakten er stabil.
