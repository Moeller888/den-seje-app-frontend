# E5-stikprøvekontrol af de 5.000 engelskopgaver (2026-11-05)

**Status:** gennemført. Alle fund er rettet i repoet. Intet er anvendt eller aktiveret i produktion.
**Krav:** designets E5 (`docs/difficulty-scale-design.md` §10): en dokumenteret stikprøvekontrol på tværs af alle niveauer og
portioner, før noget aktiveres, med fokus på uklare spørgsmål, flere mulige rigtige svar, forkert CEFR-placering og sproglige
fejl.
**Grundlag:** `main` @ `53724336` (PR #612 merget som `724c38f9`).
**Fundliste:** [`english-5000-e5-findings.json`](english-5000-e5-findings.json) indeholder én række pr. fund med portion,
kilde, CEFR, niveau, kategori, alvor, spørgsmål, begrundelse og handling.

## 1. Metode

### 1.1 Stikprøven

`node tools/questions/english-5000-sample.mjs --e5` trækker deterministisk:
- hver celle portion × CEFR (11 portioner × op til 6 CEFR-niveauer);
- 10 % af cellen, dog mindst 6 opgaver (hele cellen, hvis den er mindre);
- jævnt fordelt i niveaurækkefølge.

Det gav **525 opgaver**: cirka 50 pr. portion og 24 fra `grade6_9`.

### 1.2 Gennemgangen

- **Anmeldere:** fem uafhængige anmeldere, der ikke havde skrevet opgaverne, med én fælles vejledning.
- **Kategorier:**
  - E5-1: uklart spørgsmål;
  - E5-2: flere rigtige svar eller forkert facit, også amerikansk engelsk;
  - E5-3: mindst ét helt CEFR-niveau forkert;
  - E5-4: sproglige fejl på engelsk eller dansk;
  - E5-5: andet, fx et facit der giver sig selv, joke- eller forvanskede distraktorer eller indhold uegnet til 9–16-årige.
- **Alvor:**
  - major: forkert eller tvetydigt facit, eller CEFR to niveauer eller mere forkert;
  - minor: resten.

### 1.3 Acceptkriterium (fastlagt før resultatet)

Har en portion over 5 % fund i stikprøven, gennemgås **hele** portionen.

## 2. Resultat af stikprøven

**Nye portioner `batch7`–`batch10`:** 4 fund i 200 opgaver (2,0 %). De er under kriteriet og godkendt på stikprøven.

| Portion | Fund i stikprøven | Andel |
|---|---|---|
| batch7 | 2/50 | 4 % |
| batch8 | 1/50 | 2 % |
| batch9 | 1/50 | 2 % |
| batch10 | 0/50 | 0 % |

**Overtagne portioner (#358–#365 og `grade6_9`):** 34 fund i 325 opgaver (10,5 %).

| Portion | Fund i stikprøven | Andel |
|---|---|---|
| pilot | 4/50 | 8 % |
| batch2 | 5/51 | 10 % |
| batch3 | 3/50 | 6 % |
| batch4 | 7/50 | 14 % |
| batch5 | 6/50 | 12 % |
| batch6 | 4/50 | 8 % |
| grade6_9 | 5/24 | 21 % |

Alle syv overtagne portioner lå over 5 %. Derfor blev de resterende **2.795 opgaver** i dem gennemgået fuldt af otte
uafhængige anmeldere.

## 3. Samlet resultat

I alt er **3.320 opgaver gennemgået**:
- alle 3.120 i de syv overtagne portioner;
- en stikprøve på 50 i hver af de fire nye portioner.

Der var **301 fund** fordelt på **294 opgaver**. 56 var major og 245 minor.

| Portion | Gennemgået | Opgaver med fund | E5-1 | E5-2 | E5-3 | E5-4 | E5-5 |
|---|---|---|---|---|---|---|---|
| grade6_9 | 120 | 25 | 0 | 0 | 24 | 0 | 1 |
| pilot | 500 | 26 | 1 | 10 | 8 | 2 | 5 |
| batch2 | 500 | 29 | 1 | 5 | 9 | 4 | 10 |
| batch3 | 500 | 25 | 2 | 9 | 6 | 1 | 7 |
| batch4 | 500 | 95 | 0 | 4 | 38 | 3 | 57 |
| batch5 | 500 | 76 | 0 | 5 | 17 | 3 | 51 |
| batch6 | 500 | 13 | 0 | 2 | 0 | 0 | 11 |
| batch7 (stikprøve) | 50 | 3 | 0 | 0 | 2 | 0 | 1 |
| batch8 (stikprøve) | 50 | 1 | 0 | 0 | 1 | 0 | 0 |
| batch9 (stikprøve) | 50 | 1 | 1 | 0 | 0 | 0 | 0 |
| batch10 (stikprøve) | 50 | 0 | 0 | 0 | 0 | 0 | 0 |
| **I alt** | **3.320** | **294** | **5** | **35** | **105** | **13** | **143** |

### Mønstre

- **`grade6_9`: systematisk for højt niveau.** Niveauet var beregnet ud fra klassetrin og bånd (§4.1-cellen), ikke ud fra
  indholdet. Derfor lå lette 9.-klasses-opgaver på C1.
- **`batch4` og `batch5`: forvanskede distraktorer.** Mange svarmuligheder var ugrammatiske ombytninger, som ingen elev
  ville vælge ('rained had', 'by the at', 'took on to'). De gav svaret væk. Mønsteret stammer fra de oprindelige PR'er (#363,
  #364), ikke fra senere rettelser. Bevidste ordstillingsdistraktorer i inversionsopgaver ('she had entered' mod 'had she
  entered') er ikke talt med.
- **`batch4`: for højt niveau.** Den øverste halvdel af B1-båndet havde mange A1/A2-ord.
- **`pilot` og `batch2`: facit med to betydninger.** Facit var den eneste svarmulighed skrevet som to betydninger ("X / Y"),
  så det skilte sig ud.
- **E5-2 (35):** typisk amerikansk engelsk ("chips", "on the weekend"), et forkert facit ("Supposing he ___ the truth": det
  hedder "knew") eller flere mulige præpositioner uden kontekst.

## 4. Rettelser

Alle 301 fund er rettet.

- **Indhold (201 fund):** svarmuligheder, facit, spørgsmål og forklaring er rettet i migrationen.
  - Facit står på samme plads som før.
  - Hver rettet opgave består de samme automatiske kontroller som resten: fire forskellige svar, facit blandt dem,
    længdesignal og oplæsningssprog.
- **CEFR-placering i de overtagne opgaver:** opgaven er flyttet til et niveau, der passer til indholdet.
  - `target_grade`, `difficulty_band`, `challenge_role` og `insight_type` følger det nye niveau.
  - `grade6_9`'s CEFR-`UPDATE` kender nu også før A1 og A1.
- **CEFR-placering i nyskrevne opgaver (3):** opgaven er erstattet af en ubrugt nyskreven opgave på det oprindelige CEFR, så
  `batch7`–`batch10` bevarer deres fordeling.
- **Følgeændringer (8 pladser):** rettelserne fik 8 opgaver til at stille samme opgave som en anden opgave, i banken eller
  i sættet.
  - Det skete, fordi et svar blev strammet op, eller et spørgsmål blev omskrevet.
  - Fx blev en `batch5`-opgave til samme 'looking forward to'-opgave som en i `pilot`.
  - De 8 er erstattet af ubrugte nyskrevne opgaver, og de automatiske nyhedskontroller fanger den slags.
- **Aldrig genbrugt:** en opgave, som E5 markerede, bliver ikke brugt som erstatning.

**Ny fordeling på CEFR:**

| CEFR | før A1 | A1 | A2 | B1 | B2 | C1 |
|---|---|---|---|---|---|---|
| Før | 440 | 510 | 703 | 1.213 | 1.100 | 1.034 |
| Efter | 440 | 525 | 753 | 1.183 | 1.086 | 1.013 |

Det samlede antal er stadig præcis 5.000, og portionsstørrelserne er uændrede.

## 5. Begrænsninger

- **Anmelderne er sprogmodeller** med én fælles vejledning. De er uafhængige af forfatterne, men ikke af hinanden i
  metode. Fundene bør suppleres af en lærers stikprøve, før de højeste portioner aktiveres.
- **De nye portioner er kun stikprøvekontrolleret** (200 af 1.880). Fundraten var 2 %.
- **CEFR-placeringen er et skøn,** ligesom niveauet inden for CEFR-gruppen. Kalibrering kræver svardata efter aktivering
  (se runbookens §2.8).
