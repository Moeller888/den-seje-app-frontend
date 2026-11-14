# F-07-pilot: faglige forslag til S2, S4 og S5 (magtens tredeling før S7)

**Status:** ejeren har godkendt retningen (2026-11-14). **Intet er anvendt.** Pilotrækkerne ligger i
`supabase/migrations/20261108090100_stimulus_pilot_content.sql`, som PR #671 retter (S1, S4, S6 og S7). #671 er
oprettet af samme session som denne PR. Forslagene skal lægges oven på #671's version, ikke i main's ældre version,
og det kræver et særskilt GO til et commit på #671's branch.
Beslutning og plan: [D-362](../decisions/D-362.md). Gennemgang af de øvrige opgaver:
[task-forms-pilot-content-review.md](task-forms-pilot-content-review.md).

Målet er, at hver opgave kræver den tilsigtede faglige forståelse og ikke kan løses ved gætteri, ordmatch eller
uvedkommende regning. Svarmulighederne er kontrolleret med `tools/question-quality/length-cue.mjs` (intet
længdehint).

## Faglige afhængigheder: rækkefølgen inden for faserne

| Fase | Afhængighed | Konsekvens i `phase-gate.ts` |
|---|---|---|
| Introduktion | S1 sætter rammen: før 1849 var der enevælde. S2 spørger, hvem der stadig var udelukket fra den nye valgret. S2 *kan* læses alene (fortællingen forklarer 1849), men giver mest mening som "hvad ændrede sig — og for hvem ikke" efter S1 | Introduktionen serveres i forfatterrækkefølge: **S1 → S2** |
| Forståelsestjek | S3 og S4 læser begge § 35, uafhængigt af hinanden. S5 (forslaget herunder) læser § 2 | Adaptiv rækkefølge bevares |
| Anvendelse | S6 bruger § 35 (forberedt af S3 og S4). S7 bruger § 2 (forberedt af S5 i forslaget) | Adaptiv rækkefølge bevares |

## S2 (introduktion): kræv læsning i stedet for "find den ulige"

**Problem:** spørgsmålet er nægtende ("IKKE"), og facit er den eneste kvinde blandt fire mænd. Det kan løses uden at
læse teksten.

**Forslag:** samme kilde. Fire personer, der hver rammer ét kriterie i teksten, så eleven skal bruge teksten. Det er
samtidig en enklere forberedelse til S6.

- Spørgsmål: "Læs teksten. Hvem af disse fire kunne stemme ved valget i 1849?"
- Svarmuligheder: "Karen, 45 år, ejer sin egen gård" · "Ole, 25 år, ejer sit eget værksted" · "Peter, 40 år,
  tjenestekarl uden eget hjem" · "Anders, 50 år, ejer sin egen butik"
- Facit: "Anders, 50 år, ejer sin egen butik"
- Review-tekst: "Kun Anders kunne stemme. Karen var kvinde, og kvinder fik ikke valgret. Ole var under 30 år. Peter var
  tjenestefolk uden egen husstand."

## S4 (forståelsestjek): forstå en betingelse i § 35, ikke match et ord

**Problem:** spørgsmålet siger "kun mænd", og facit er ordet "Mand". Det er ordmatch.

**Forslag:** samme kilde. Eleven skal forstå undtagelse b, og ordforklaringen udvides med "eftergiven".

- Spørgsmål: "Læs kilden. En mand mistede sin valgret, hvis han havde fået hjælp fra fattigvæsenet. Hvornår kunne han
  få den tilbage?"
- Svarmuligheder: "Når hjælpen var betalt tilbage eller eftergivet" · "Når han havde fyldt 40 år og fået eget hjem" ·
  "Når han havde boet et år i en ny valgkreds" · "Aldrig: han mistede den for altid"
- Facit: "Når hjælpen var betalt tilbage eller eftergivet"
- Ordforklaring tilføjes: "eftergiven = eftergivet, dvs. man behøvede ikke betale hjælpen tilbage"
- Review-tekst: "§ 35 b siger, at hjælp fra fattigvæsenet kun fratog valgretten, hvis den hverken var eftergivet eller
  betalt tilbage. Var hjælpen betalt tilbage eller eftergivet, havde manden igen valgret, hvis han opfyldte de andre
  krav."

## S5 (forståelsestjek): magtens tredeling i stedet for 1849 − 1660

**Problem:** opgaven tester subtraktion, ikke historisk forståelse. Desuden kræver S7 magtens tredeling, som intet
introducerer.

**Forslag (ingen ottende opgave):** S5 skifter fra tidslinjen til § 2-kilden (samme tekst og ordforklaringer som
S7) og bliver forståelsestjekket af tredelingen. Så introducerer forløbet begrebet, før S7 kræver, at eleven anvender
det.
- Spørgsmål: "Læs kilden. Efter 1849 var magten delt i tre. Hvem skulle dømme efter lovene?"
- Svarmuligheder: "Domstolene" · "Kongen" · "Rigsdagen" · "Kongen og Rigsdagen sammen"
- Facit: "Domstolene"
- Review-tekst: "§ 2 deler magten i tre: Rigsdagen og kongen giver lovene sammen, kongen sørger for, at de bliver
  ført ud i livet, og domstolene dømmer efter dem."
- `pilot_phase` forbliver "forståelsestjek". Niveauet sættes til ca. 6.300 (bånd 2).

**Konsekvenser:**
- Formater: piloten får 6 MC og 1 tal-opgave (S3), og 1 billed-stimulus (S1) i stedet for 2.
- Indholdstests: `tests/unit/task-forms-pilot-content.test.mjs` skal opdatere den aftalte fordeling af
  formater og stimulus-typer.
- Isolerede tests: `tests/isolated/seed/stimulus-chain-questions.mjs` vælger allerede den første billed- og den
  første kilde-række. Det er stadig S1 og S2.
- Progression: uændret (3 faser med 2, 3 og 2 opgaver).

## Hvad der ikke ændres

- S1, S3 og S6 er fagligt i orden (S6 i #671's version).
- S7 er i orden i #671's version, når S5 introducerer § 2.
- Faktatjek: § 35 er sammenholdt ordret med en transkription af Junigrundloven, og § 2 er bekræftet af flere
  transkriptioner (2026-11-13). Kvinders valgret i 1915 og enevælde fra 1660 er alment kendte; 1660 er den gængse
  skoleangivelse, mens den formelle overgang skete 1660–1665.
