# Arkivskabet: belønningsmodel v2 (forslag)

**Status:** forslag til ejerbeslutning. Intet er implementeret, aktiveret eller anvendt. Satserne er de
foreløbige fra #657 (`course-rewards-v0.1-provisional`) og ændres ikke her. #657 er fortsat NO-GO.

**Grundlag:** kode og testmateriale på `main` og i #657 pr. 2026-11-11.

## 1. Tre slags belønning

| Slags | Hvad den belønner | Eksempel i #657 | Må den udløses af aktivitet alene? |
|---|---|---|---|
| Aktivitetsbelønning | At arbejde med et meningsfuldt læringstrin | Trin gennemført første gang: 3 XP + 1 coin | Ja, den er lille og kan kun optjenes én gang pr. trin |
| Præstationsbelønning | En konkret, demonstreret færdighed | Kontrol bestået første gang: 8 + 4 | Nej, kræver et rigtigt svar i et vurderingstrin |
| Forløbsbonus | Et samlet fagligt succeskriterium | 25 + 10 | Nej, kræver beståelseskriteriet i §2 |

En elev kan gennemføre et forløb uden at bestå det. Gennemførelsen registreres med 0 XP og 0 coins. Den er et
faktum, ikke en udbetaling.

## 2. Beståelseskriteriet

### 2.1 Det konkrete forløb

Forløbet følger testpolitik v0 (`supabase/functions/_shared/learning-sequence.ts`):

1. vejledt øvelse;
2. revision, kun hvis øvelsen var forkert;
3. selvstændig anvendelse (`check`);
4. transfer (`application`);
5. genbesøg (`review`, tidligst 20 timer efter transfer).

Vurderingstrinene er 3, 4 og 5. Hvert trin serverer ét spørgsmål, og eleven går videre efter ét svar.
Testmaterialet for kildekritik (`tests/isolated/fixtures/kildekritik-questions.json`) har 5 MC-spørgsmål med 4
svarmuligheder hver.

### 2.2 Antagelser i beregningen

- Én opgave pr. vurderingstrin, 4 svarmuligheder, præcis én rigtig.
- En gætter vælger tilfældigt med sandsynlighed 1/4 pr. opgave, uafhængigt af de andre opgaver.
- **Kun første forsøg tæller**, og et svar med registreret hint tæller ikke. Det kræver K1 (`attempt_no`) og L3
  (`hints_used`) i produktion.
  - **Uden K1 og L3** kan serveren ikke se første forsøg eller hjælp. Hvert genforsøg, for eksempel en
    gentagelsesrunde, giver en ny chance. Med ubegrænsede genforsøg går gætterens sandsynlighed mod 100 % i
    alle modeller.
- Elever med en sikkerhed på 60 % og 80 % pr. opgave er medtaget som eksempler på en usikker og en dygtig elev.
  Det er antagelser, ikke målinger.

### 2.3 Tre modeller

| Model | Krav til bonus | Gætter (p = 0,25) | Usikker (p = 0,6) | Dygtig (p = 0,8) |
|---|---|---:|---:|---:|
| 1 (#657 i dag) | Mindst 1 af 3 kontroller rigtig | 37/64 = **57,8 %** | 93,6 % | 99,2 % |
| 2 | Mindst 2 af 3 kontroller rigtige | 10/64 = **15,6 %** | 64,8 % | 89,6 % |
| 3a | Selvstændig anvendelse **og** transfer rigtige | 4/64 = **6,3 %** | 36,0 % | 64,0 % |
| 3b | Selvstændig anvendelse rigtig **og** mindst én af transfer/genbesøg | 7/64 = **10,9 %** | 50,4 % | 76,8 % |

Udregning for model 3b: p × (1 − (1 − p)²). For p = 0,25 er det 0,25 × 7/16 = 7/64.

### 2.4 Vurdering

| | Model 1 | Model 2 | Model 3a | Model 3b |
|---|---|---|---|---|
| Måling af faglig kunnen | Svag: ét heldigt svar er nok | Bedre | Stærk på anvendelse, men streng | God: kræver selvstændig anvendelse plus én bekræftelse |
| Risiko ved gæt | Høj | Lav | Meget lav | Lav |
| Motivation | Høj, men bonussen betyder lidt | God | Risiko for opgivelse: én fejl koster bonussen | God: én fejl er tilladt, men ikke i den selvstændige kontrol |
| Sværhedsgrad og tilgængelighed | Let | Middel | Svær for usikre elever | Middel |
| Forskelle mellem elever | Skelner dårligt | Skelner | Skelner stærkt | Skelner |
| Genforsøg | Ingen effekt, kun første forsøg tæller | Samme | Samme | Samme |
| Farming | Lav, fordi alt betales én gang pr. mål | Lav | Lav | Lav |
| Implementering | Findes (CTE'en `passed`) | Ét sted: CTE'en `passed` | Ét sted | Ét sted |

**Anbefaling: model 3b,** og kun sammen med K1 og L3 i produktion, så "rigtig" betyder "rigtig i første forsøg
uden registreret hint". Den selvstændige kontrol er kernen i forløbet. Én fejl i transfer eller genbesøg
koster ikke bonussen. Et genbesøg kan redde en fejl i transfer, og det belønner hukommelse over tid.

**Begrænsning:** én opgave pr. vurderingstrin er et svagt mål, uanset model. Et stærkere mål kræver 2–3
opgaver pr. vurderingstrin. Det er en indholdsbeslutning: det lærergodkendte F9-materiale må ikke ændres uden
en ny godkendelse.

## 3. Hvad et forløb giver (foreløbige satser)

Med k beståede kontroller (0–3) og modellens krav opfyldt eller ej:

| | XP | Coins |
|---|---:|---:|
| 4 belønnede trin × (3 + 1) | 12 | 4 |
| Revision | 0 | 0 |
| k × kontrol (8 + 4) | 8k | 4k |
| Forløbsbonus, kun hvis kriteriet er opfyldt | 25 | 10 |
| **I alt** | **12 + 8k (+ 25)** | **4 + 4k (+ 10)** |

| Eksempel (model 3b) | k | Kriterium | XP | Coins |
|---|---:|---|---:|---:|
| Alt rigtigt | 3 | ja | 61 | 26 |
| Anvendelse og genbesøg rigtige, transfer forkert | 2 | ja | 53 | 22 |
| Transfer og genbesøg rigtige, anvendelse forkert | 2 | **nej** | 28 | 12 |
| Kun anvendelse rigtig | 1 | nej | 20 | 8 |
| Alt forkert | 0 | nej | 12 | 4 |

Milepæle på tværs af forløb tæller kun forløb med bonus: 3 forløb giver 30 + 15, og 10 forløb giver 75 + 40,
hver én gang pr. elev. 10 forløb med bonus og alt rigtigt giver 10 × 61 + 30 + 75 = 715 XP og
10 × 26 + 15 + 40 = 315 coins.

### 3.1 Den eksisterende quizbelønning

**I dag betaler svarvejen også kursussvar som almindelige quizsvar:** 10 XP + 5 coins for første rigtige svar.
Et forløb med 4–5 rigtige svar giver derfor yderligere 40–50 XP og 20–25 coins oven i milepælene.
Forslaget `docs/laerligverse/forslag-k1-belonning-kursussvar.md` lader svarvejen betale 0 for kursussvar. Indtil
det er anvendt, er der to betalingsveje for samme svar. Det er en af grundene til, at #657 er NO-GO.

## 4. Betingelser, før #657 kan få GO

1. Ejeren vælger model (anbefaling: 3b) og godkender de endelige satser.
2. K1 og L3 er i produktion, så kriteriet kan bruge første forsøg uden hint.
3. Svarvejen betaler ikke kursussvar (§3.1).
4. Rettelsen af lærerbedømmelsens udbetaling er anvendt
   (`docs/security/review-answer-enkelt-udbetaling.md`, egen PR), og #657 er bygget oven på den.
5. Lange svar i kursusopgaver har en lærerbedømt vej. Indtil da er de blokeret.
