# E5-stikprøvekontrol af de 5.000 danskopgaver

**Status:** første runde kørt 2026-11-06, ikke bestået: alle 10 portioner ligger over grænsen (§6). Fundene er ikke rettet. Intet er anvendt eller aktiveret i produktion.
**Krav:** designets E5 (`docs/difficulty-scale-design.md` §10) og D-358: en dokumenteret stikprøvekontrol på tværs af alle niveauer og portioner, før noget aktiveres.
**Grundlag:** den endelige bank, efter at ordforråd og grammatik er læst igennem. En kontrol af en ældre version tæller ikke.

Metoden følger [engelsk-E5](english-5000-e5.md). Kriterierne er fastlagt, før der findes resultater.

## 1. Stikprøven

`node tools/questions/danish-5000-sample.mjs <fil>` trækker deterministisk:
- hver celle portion × emne (10 portioner × 6 emner);
- 10 % af cellen, dog mindst 6 opgaver;
- jævnt fordelt i niveaurækkefølge.

Opgaverne vises med svarene i den rækkefølge, eleverne ser dem.

## 2. Gennemgangen

**Anmeldere:** uafhængige anmeldere, der ikke har skrevet eller rettet opgaverne, med én fælles vejledning.

| Kategori | Hvad der tjekkes |
|---|---|
| E5-1 | Uklart spørgsmål |
| E5-2 | Flere rigtige svar eller forkert facit |
| E5-3 | Niveauet er mindst ét klassetrin forkert |
| E5-4 | Sproglige fejl |
| E5-5 | Spisebordstesten: facit lyder ikke som et svar fra et menneske |
| E5-6 | Facit giver sig selv, eller de forkerte svar frister ikke |
| E5-7 | Blokeret emne, også som antydning |
| E5-8 | Forklaringen giver ikke eleven en forståelig grund |

**Alvor:**
- major: forkert eller tvetydigt facit, blokeret emne, eller niveauet er to klassetrin eller mere forkert;
- minor: resten.

## 3. Acceptkriterium

- Har en portion over 5 % fund i stikprøven, gennemgås **hele** portionen.
- Alle fund rettes, også under grænsen.
- Banken bygges og testes igen efter rettelserne.

## 4. Menneskelig kontrol

AI-læsere overså, at facit ikke gav mening for et menneske, så AI-gennemgang alene er ikke nok.

Efter rettelserne skal ejeren eller en lærer læse mindst 5 opgaver fra hvert af de 6 emner, heraf nogle fra ordforråd og grammatik, som ejeren ikke har set. Er mere end én ud af ti "Giver ikke mening", stopper aktiveringen, og årsagen findes, før der rettes videre.

## 5. Fundliste

Fund registreres i `danish-5000-e5-findings.json` med portion, emne, niveau, kategori, alvor, spørgsmål, begrundelse og handling.

## 6. Første runde (2026-11-06)

527 opgaver gennemgået af fire uafhængige AI-anmeldere: 79 med fund (15,0 %), heraf 31 major og 48 minor.

| Portion | Fund | Andel |
|---|---|---:|
| danish1 | 7/52 | 13,5 % |
| danish2 | 6/53 | 11,3 % |
| danish3 | 5/53 | 9,4 % |
| danish4 | 6/54 | 11,1 % |
| danish5 | 11/53 | 20,8 % |
| danish6 | 9/53 | 17,0 % |
| danish7 | 8/51 | 15,7 % |
| danish8 | 10/53 | 18,9 % |
| danish9 | 9/52 | 17,3 % |
| danish10 | 8/53 | 15,1 % |

| Emne | Fund | Andel |
|---|---|---:|
| Ordforråd | 6/132 | 4,5 % |
| Stavning | 14/87 | 16,1 % |
| Læseforståelse | 18/99 | 18,2 % |
| Litteratur | 11/60 | 18,3 % |
| Grammatik | 16/87 | 18,4 % |
| Tegnsætning | 14/62 | 22,6 % |

| Kategori | Fund |
|---|---:|
| E5-3 niveau | 31 |
| E5-6 facit giver sig selv | 27 |
| E5-1 uklart spørgsmål | 5 |
| E5-4 sprog | 4 |
| E5-5 spisebordstesten | 4 |
| E5-8 forklaring | 4 |
| E5-7 blokeret emne | 3 |
| E5-2 facit | 1 |

Alle 31 major er niveau eller blokeret emne; niveaufundene er anmeldernes skøn. Der er 0 forkerte facit: fundet i E5-2 er et upræcist facit, hvor svaret stadig er det bedste. Et af fundene i E5-7 er en opgave, læreren har godkendt, og det rettes ikke.

**Efter kriteriet i §3 skal alle 10 portioner gennemgås i deres helhed.**

## 7. Fuld gennemgang og anden runde (2026-11-06)

Ejeren valgte fuld gennemgang af alle emner undtagen ordforråd (3.670 opgaver), fordi ordforråd lå under grænsen. 794 opgaver blev ændret, uden at niveauer blev flyttet. Alle fund fra første runde blev rettet.

Anden runde brugte en ny stikprøve (offset 0,5) og fire nye anmeldere: 526 opgaver, 82 med fund (15,6 %), heraf 23 major. Fundene står i `danish-5000-e5-round2-findings.json` og er rettet. **Kriteriet i §3 er stadig ikke opfyldt: alle portioner ligger over 5 %.**

| Kategori | Runde 1 | Runde 2 |
|---|---:|---:|
| E5-3 niveau | 31 | 34 |
| E5-6 facit giver sig selv | 27 | 32 |
| E5-7 blokeret emne | 3 | 6 |
| E5-4 sprog | 4 | 4 |
| E5-5 spisebordstesten | 4 | 4 |
| E5-1 uklart | 5 | 2 |
| E5-8 forklaring | 4 | 0 |
| E5-2 facit | 1 | 1 |

Tre målinger afgør, hvordan tallet skal læses:

| Måling | Resultat |
|---|---:|
| Fund i opgaver rettet i runde 2 | 13/73 (17,8 %) |
| Fund i opgaver, runde 2 ikke rørte | 51/321 (15,9 %) |
| Ordforråd, ikke rørt mellem runderne | 4,5 % → 13,6 % |

| Klassetrin | Fund |
|---|---:|
| 3. | 2,6 % |
| 4. | 10,0 % |
| 5. | 6,6 % |
| 6. | 22,1 % |
| 7. | 19,5 % |
| 8. | 25,4 % |
| 9. | 22,8 % |

**Vurdering:**
- Tallet er ikke faldet, og rettede opgaver klarer sig ikke bedre end urørte. Ordforråd steg uden at være ændret, så anmeldernes skøn svinger lige så meget som den effekt, der skulle måles.
- E5-3 og E5-6 udgør 80 % af fundene og er skøn. De kan ikke afgøres af AI-læsere alene.
- Hårde fejl (facit, sprog, uklart, blokeret emne) er 13 af 526 (2,5 %). Facit var forkert i ét tilfælde: titlen hos T.S. Eliot.
- Forskellen på 3.–5. og 6.–9. klasse er et reelt signal: de høje niveauer er ikke svære nok.

Flere AI-runder vil næppe ændre billedet. Spørgsmålet om, hvordan kriteriet skal håndteres, ligger hos ejeren.
