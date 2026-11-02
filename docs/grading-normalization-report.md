# Bedømmelse af MC og tal: read-only rapport (K3/K5, D-285)

**Status:** RAPPORT. Ingen ændring af produktionens bedømmelse.

- **Hvad der er bygget:** de rene funktioner (`_shared/answer-normalize.ts`) og
  valideringsværktøjet (`tools/questions/validate-evidence.mjs`).
- **Hvad der ikke er gjort:** De er ikke koblet til nogen bedømmelse. Et skift kræver en SQL-tvilling,
  en migration og ejerens særskilte godkendelse ([D-282](decisions/D-282.md) LP-15,
  [D-285](decisions/D-285.md)).

**Målt:** 2026-11-01, read-only mod produktionen. Kun opgaveindhold og aggregerede tal er læst, ingen
data på elevniveau.

## 1. Den regel, produktionen bruger i dag

`process_question_attempt` (`20261027120000_repeat_answer_coin_reward.sql`):

```
trim(regexp_replace(lower(svar), '[^a-z0-9]', '', 'g'))  =  samme(facit)
   ELLER  metadata.danish_orthography_correct_aliases ? råt svar
```

Alt uden for `a–z` og `0–9` fjernes: æ, ø, å, apostrof, decimalkomma, minus, skråstreg og
tegnsætning.

## 2. Aktive opgaver (2.101)

| Format | Antal |
|---|---|
| `mc/short` (bedømmes med reglen ovenfor) | 2.099 |
| `text/short` (Stav til, bedømmes af `isTextAnswerCorrect`, som bevarer æøå) | 2 |
| Tal, `force_text`, Match par, lange svar | 0 |

## 3. Fund med den nuværende regel

| Kontrol | Antal opgaver | Konsekvens |
|---|---|---|
| Facit er ikke en af svarmulighederne | **0** | — |
| **En forkert svarmulighed bedømmes som rigtig** | **2** | **Reel fejl** (§4) |
| Facit bliver tomt efter normaliseringen | **1** | Ethvert svar, der også bliver tomt (fx "æ" sendt direkte til API'et), ville blive godkendt. Gennem brugerfladen kan kun den rigtige mulighed vælges. |
| To forkerte svarmuligheder falder sammen | 1 (+ de 2 ovenfor) | Ufarligt: bedømmelsen af facit påvirkes ikke |
| Svarmuligheder med æ/ø/å | 1.430 | Kun et problem, hvis de kolliderer (dækket ovenfor) |
| Facit med tal (decimal, minus, brøk, tusindtal) | 10 | Ufarligt: lange historietekster med tal, ingen kollision |
| En svarmulighed er facit med ekstra ord | 0 | — |
| Opgaver med danske stavealiaser | 201 | Uberørt: aliaser matches på det rå svar |

## 4. De to opgaver med en reel bedømmelsesfejl

Begge er engelske ejefaldsopgaver, hvor apostroffens placering er pointen. Den nuværende regel
fjerner apostroffen.

| Opgave-id | Emne | Klassetrin / bånd | Mønster | Besvaret | Forkert svar godkendt |
|---|---|---|---|---|---|
| `08c1770e-b9e6-4a14-a5e0-6420337ba052` | english | 4 / 3 | Svarmulighederne `'s` og `s'` (og `s`) bliver ens | 9 | **3 (3 elever)** |
| `3213c5be-71b8-4dab-817f-26a1deca5cb5` | english | 4 / 4 | To sætninger, der kun adskiller sig ved apostroffen, bliver ens | 0 | 0 |

**Konsekvens:** 3 elever har fået XP og mønter for et forkert svar. Det er det modsatte af D-254, hvor
eleverne fik for lidt. Hvad der skal ske med det, er en ejerbeslutning (§7).

## 5. Med den foreslåede regel (K3)

`normalizeChoice` gør følgende: NFC, ensretter typografiske apostroffer til `'`, små bogstaver og
sammenpresser whitespace. **Intet andet fjernes.** Aliaser matches fortsat på det rå svar.

| Kontrol | Antal opgaver |
|---|---|
| Facit matcher ingen svarmulighed | **0** |
| En forkert svarmulighed bedømmes som rigtig | **0** |
| To svarmuligheder falder sammen | **0** |
| En svarmulighed bliver tom | **0** |

Den nye regel retter de 2 fejl og skaber ingen nye i de aktive opgaver. Alle 2.099 facitter er
eksakte svarmuligheder, så den strengere regel afviser intet rigtigt svar.

Tal bedømmes numerisk med `normalizeNumber`:
- "1,5" = "1.5" ≠ "15";
- "−5" ≠ "5";
- "1 000" = "1000";
- ikke-tal er forkert, ikke en fejl.

Der er ingen aktive talopgaver i dag, så ingen opgaver berøres nu.

## 6. Sådan gentages målingen

Kun læsende forespørgsler.

1. Eksportér opgaverne: `SELECT id, is_active, answer_format, answer_type, content, metadata FROM
   public.questions` som JSON.
2. Kør værktøjet med begge regler:
   - `node tools/questions/validate-evidence.mjs export.json`
   - `node tools/questions/validate-evidence.mjs export.json --grading new`

   Rapporten er deterministisk (L1-A8). `--strict` giver exitkode 1, hvis en opgave ikke er
   evidensgyldig. Det er forberedt til en senere CI-vagt.

## 7. Beslutninger, der ligger hos ejeren (intet er gjort)

| # | Spørgsmål | Anbefaling |
|---|---|---|
| G1 | Skal bedømmelsen skiftes til den nye regel (SQL-tvilling i `process_question_attempt` og `_v2`, migration og paritetstest)? | Ja, som sin egen PR med migrationstest og tilbagerulning. |
| G2 | Midlertidigt, indtil G1 er gennemført: skal de 2 opgaver deaktiveres (`is_active = false`)? | Ja. Det er en lille dataændring, der forhindrer flere forkerte godkendelser. Den kræver sin egen godkendelse. |
| G3 | Skal de 3 elever, der fik XP og mønter for et forkert svar, have dem fratrukket? | **Nej.** Beløbet er lille, og et fradrag strider mod "never-negative". De 3 svar markeres i stedet som ugyldig evidens (K2 G4), når svarloggen findes. |
