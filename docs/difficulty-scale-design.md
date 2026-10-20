# Sværhedsskala 1–10.000 — designforslag

**Status:** FORSLAG. B1 og B4 er besluttet af ejeren 2026-10-20 (§9). B2, B3 og B5–B9 er åbne.
Intet i dette dokument er bygget eller anvendt.
**Dato:** 2026-10-20 · **Grundlag:** `main` @ `d93faff`
**Anledning:** Ejeren ønsker 10.000 sværere engelskopgaver fordelt på niveau 1–10.000. Den 19.
oktober 2026 besluttede ejeren desuden, at klassetrin kun bruges til at identificere eleven og
vælge startniveauet. Klassetrinnet må aldrig være et loft. Skalaen skal derfor bygges, før
indholdet kan lægges ind på den.

Aftalt rækkefølge: dette design → ejergodkendelse → beslutningen registreres i ARCHITECTURE/ROADMAP
→ skema/udvælgelse → en pilot på ca. 500 engelskopgaver → opskalering.

---

## 1. Nuværende tilstand (verificeret i koden)

| Del | I dag | Problem i forhold til skalaen |
|---|---|---|
| `questions.difficulty_band` | `SMALLINT`, `CHECK BETWEEN 1 AND 5`, relativt **inden for** klassetrinnet | Kan ikke rumme 1–10.000, og bånd 2 i 3. klasse er ikke det samme som bånd 2 i 9. klasse |
| `questions.target_grade` | 3–9, bruges som **loft**: `target_grade <= selected_grade` | Strider mod ejerens model. Loftet findes fire steder: `get_unserved_questions_for_student`, `request_repeat_question_for_student`, `start_placement` og (legacy) `get_unserved_questions` / `request_repeat_question` |
| Elevens niveau | `currentDifficultyBand` i `app.js`: +1 efter 3 rigtige i træk og −1 efter 2 forkerte, begrænset til 1–5. Gemmes i `profiles.current_band`, som **klienten selv kan skrive** | Én værdi på tværs af alle fag. Niveauet styres af browseren |
| Udvælgelse | `get_unserved_questions_for_student` returnerer `LIMIT 50` **uden `ORDER BY`**. Edge-funktionen sorterer derefter de 50 (+6 for præcis samme bånd, +3 for nabobånd) | Båndpræferencen virker kun på et vilkårligt udsnit af 50 spørgsmål. Med 10.000 niveauer ville præferencen i praksis være tilfældig (fundet allerede noteret i ROADMAP, "Fundet, ikke rettet") |
| Placering | `start_placement` vælger 3+3+2+2 spørgsmål fra bånd 1–4, og `submit_placement` giver bånd 1–4 ud fra pointsummen | Kender kun bånd |
| Engelsk indhold | Ca. 1.000 MC-spørgsmål, **kun 3.–5. klasse, bånd 1–4** | Der findes ingen engelskopgaver over 5. klasses niveau. Det er derfor, opgaverne opleves som for lette |
| Data til kalibrering | Der findes ingen live log pr. forsøg. `question_instances` gemmer kun den seneste dom (se PR #351-noten) | Det er svært at måle opgavers faktiske sværhed bagefter |

PR #351 (opgaveformer, ikke merget) indfører et **serverejet** bånd (`student_band_state` +
`advance_student_band`). Det er det samme greb, som skalaen har brug for (se §6).

---

## 2. Mål og ikke-mål

**Mål**
- Én kontinuerlig sværhedsskala `1–10.000` **pr. fag** (engelsk, historie, dansk).
- Klassetrinnet sætter kun **startniveauet**. En dygtig elev i 3. klasse kan nå 9.-klasses-niveau og
  videre.
- Udvælgelsen vælger de ubesvarede spørgsmål, der ligger **nærmest** elevens niveau, i SQL og ikke
  i et vilkårligt udsnit på 50.
- Elevens niveau er **serverejet**: browseren kan ikke selv sætte det.
- Det nuværende flow er uændret, indtil et flag slås til. Tilbagerulning = flaget slås fra.

**Ikke-mål (i denne omgang)**
- Ændret XP/mønt pr. niveau (belønningen forbliver serverens 10 XP + 5 mønter).
- Automatisk kalibrering af opgavesværhed ud fra elevdata (kræver en forsøgslog, som ikke findes).
- Ændringer i lærerens UI ud over at vise niveauet, hvor der i dag står bånd.
- AI-genererede opgaver uden menneskelig gennemgang.

---

## 3. Datamodel

### 3.1 Opgavens niveau
```
questions.difficulty_level  INTEGER NULL
  CHECK (difficulty_level IS NULL OR difficulty_level BETWEEN 1 AND 10000)
INDEX (learning_objective, difficulty_level) WHERE is_active
```
- `NULL` = endnu ikke placeret på skalaen. Opgaven udvælges så efter den gamle regel (§5.3).
- `target_grade` og `difficulty_band` **beholdes uændret** som beskrivende metadata. Intet slettes.
  Det holder tilbagerulning og lærervisninger intakte.

### 3.2 Elevens niveau pr. fag
```
student_subject_level (
  student_id  uuid  REFERENCES profiles(id) ON DELETE CASCADE,
  subject     text  CHECK (subject IN ('historie','engelsk','dansk')),
  level       integer NOT NULL CHECK (level BETWEEN 1 AND 10000),
  answered    integer NOT NULL DEFAULT 0,   -- antal forsøg, der har flyttet niveauet
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, subject)
)
```
- RLS: eleven må **læse** sin egen række. Ingen klient-INSERT eller -UPDATE. Kun SECURITY
  DEFINER-funktioner og backend-nøglen skriver (samme mønster som `question_instances`).
- Niveauet er pr. fag, fordi en elev sagtens kan ligge på 8.000 i engelsk og 3.000 i historie.
- `profiles.current_band` / `placement_band` bliver stående til det gamle flow.

---

## 4. Fra klassetrin + bånd til niveau

### 4.1 Startformel (deterministisk, til eksisterende opgaver og startniveauer)
Klassetrin 3–9 × bånd 1–5 giver 35 celler. Hver celle får et interval på ca. 286 niveauer:

```
celle  = (target_grade − 3) × 5 + (difficulty_band − 1)          -- 0 … 34
niveau = round((celle + 0,5) × 10000 / 35)                        -- cellens midtpunkt
```
| Eksempel | Niveau |
|---|---|
| 3. kl. bånd 1 | 143 |
| 5. kl. bånd 4 | 3.857 |
| 7. kl. bånd 1 | 5.857 |
| 9. kl. bånd 5 | 9.857 |

Der er en kendt svaghed: bånd var relative inden for et klassetrin, så 4. kl. bånd 1 er ikke
nødvendigvis sværere end 3. kl. bånd 5. Formlen er et **udgangspunkt**. Nye opgaver får et niveau
sat af forfatteren (§7), og eksisterende opgaver kan justeres senere.

### 4.2 Startniveau for en elev
Første gang en elev åbner et fag, bliver rækken oprettet med:
1. hvis eleven har en placering: formlen med (`selected_grade`, `placement_band`)
2. ellers: formlen med (`selected_grade`, `GRADE_START_BAND[grade]`)
3. hvis eleven ikke har noget klassetrin: niveau 143

---

## 5. Udvælgelse

### 5.1 Nye spørgsmål
En ny funktion `get_level_questions_for_student(p_student_id, p_level, p_domains)`, kun til
service_role ligesom i dag:

```sql
WHERE q.is_active
  AND q.learning_objective = ANY(p_domains)
  AND q.difficulty_level IS NOT NULL
  AND NOT EXISTS (… allerede serveret til eleven …)
ORDER BY abs(q.difficulty_level − p_level),
         md5(p_student_id::text || q.id::text)     -- deterministisk, men forskellig fra elev til elev
LIMIT 50
```
- **Intet klassetrinsloft.**
- Der er intet fast vindue: hvis der ikke findes noget nær niveauet (fx under piloten med kun 500
  opgaver), tager funktionen automatisk de nærmeste. Eleven løber aldrig tør, så længe faget har
  ubesvarede spørgsmål.
- Edge-funktionens bølgesortering (`getWaveScore`) beholdes som sekundær sortering inden for de 50,
  men båndbonussen (+6/+3) erstattes af en nærhedsbonus ud fra `|niveau − elevniveau|`.

### 5.2 Gentagelse
`request_repeat_question_for_student` får en variant uden klassetrinsloft. "Puljen er tom" kommer
dermed til at betyde: tom for faget.

### 5.3 Opgaver uden niveau
Klassetrinsloftet fjernes for **alle fag** (B4). Derfor skal migration A give **hver** aktiv opgave et
niveau, så niveaumotoren ikke er afhængig af den gamle regel:
- opgaver med `target_grade` og `difficulty_band`: formlen i §4.1
- opgaver, der mangler den ene eller begge: migration A tæller dem først (read-only) og rapporterer
  antallet pr. fag. Ejeren beslutter, hvilken standardværdi de får, før migrationen anvendes. Der
  gættes ikke.

Hvis en opgave alligevel har `difficulty_level IS NULL`, bliver den ikke udvalgt af niveaumotoren, og
den logges som en datafejl. Den falder ikke tilbage til klassetrinsloftet.

### 5.4 Flag
En Edge-hemmelighed `LEVEL_ENGINE` (samme mønster som `QUESTION_MIX_ENGINE`): ikke sat = nuværende
flow, uændret. `v1` = niveaumotoren for **alle fag** (historie, engelsk og dansk) på én gang.
Tilbagerulning = hemmeligheden fjernes. Der skal ikke rulles noget tilbage i databasen.

---

## 6. Hvordan elevens niveau flytter sig

Serverejet: `process_question_attempt` (eller `process-event`) opdaterer `student_subject_level`
én gang pr. **første** svar på en instans. Gentagelser flytter ikke niveauet.

```
step   = max(15, round(150 / sqrt(answered + 1)))   -- store skridt i starten, små senere
rigtigt: level = min(10000, level + step)
forkert: level = max(1,     level − 3 × step)
answered = answered + 1
```
- Forholdet op:ned = 1:3 lægger eleven dér, hvor vedkommende svarer rigtigt **ca. 75 %** af gangene
  (ligevægt: p·1 = (1−p)·3). Det er en almindelig målsætning for "udfordrende, men overkommelig".
- De store skridt i starten fungerer som en indbygget placering: efter 10 svar har en elev, der
  svarer alt rigtigt, flyttet sig ca. 750 niveauer. På længere sigt kan den separate
  placeringstest derfor udfases (særskilt beslutning).
- En elev, der svarer alt rigtigt, går fra 1 til 10.000 på ca. 600 svar. Det er langt nok til, at
  skalaen betyder noget, og kort nok til, at dygtige elever ikke sidder fast.
- Fritekstsvar (lærerbedømt) flytter først niveauet, når de er bedømt, eller slet ikke i v1. Det
  kræver en ejerbeslutning (B5).
- Hvis PR #351 merges først, bygges dette **oven på** dens `advance_student_band`-mekanisme
  (rækkelås og markør pr. forsøg) i stedet for at lave en parallel mekanisme.

---

## 7. Indhold: hvad betyder et niveau i engelsk?

Hvis niveauerne skal kunne skrives til, skal de have et indhold. Forslag: forankring i CEFR
(Den Fælles Europæiske Referenceramme), som også bruges i Fælles Mål for engelsk:

| Niveau | CEFR | Typisk indhold |
|---|---|---|
| 1–1.500 | før A1 | Enkeltord, farver, tal, dyr, hilsener |
| 1.501–3.000 | A1 | Hverdagsord, *to be/have*, simple sætninger, korte tekster |
| 3.001–5.000 | A2 | Datid, spørgeord, præpositioner, korte læsestykker |
| 5.001–7.000 | B1 | Perfektum, betingelsessætninger 1, frasale verber, idiomer, længere tekster |
| 7.001–8.500 | B2 | Passiv, indirekte tale, betingelse 2–3, nuancer i ordforråd, slutninger fra tekst |
| 8.501–10.000 | C1 | Avanceret grammatik, register/stil, ordspil, kritisk læsning |

- Hver opgave i et indholdsbatch får et eksplicit `difficulty_level` (forfatterens vurdering inden
  for intervallet) og `metadata.cefr`.
- Pilot (ca. 500): fokus på **5.001–10.000** (B1–C1), fordi det er dér, der ikke findes noget i dag.
  Desuden et tyndt lag i 3.001–5.000, så overgangen fra det eksisterende indhold bliver glidende.
- Samme indsætningsmønster som de eksisterende engelsk-batches (`jsonb_array_elements`,
  `learning_objective='english'`, unik tekst mod `unique_question_text`). `target_grade` sættes ud fra
  formlen baglæns (det nærmeste klassetrin), så lærervisningerne fortsat har en værdi.
- Engelsk tekst skrives på engelsk, og forklaringerne (`review_text`) skrives på dansk med æ/ø/å.

---

## 8. Udrulning (hvert trin kræver sin egen godkendelse)

1. **Denne PR:** kun designdokumentet og et ROADMAP-punkt. Ingen kode.
2. **Migration A (additiv):** `difficulty_level` + indeks + `student_subject_level` + RLS + backfill af
   eksisterende opgaver via §4.1. Ingen funktioner ændres. Anvendes via `apply_migration` med
   særskilt ejerautorisation (D-110).
3. **Migration B:** `get_level_questions_for_student`, gentagelsesvarianten og niveauopdateringen i
   svarflowet. Gamle funktioner bliver stående.
4. **Edge:** `get-next-question` bag `LEVEL_ENGINE` (ikke sat = uændret). Deployes og verificeres med
   flaget slået fra.
5. **Indhold:** pilot på ca. 500 engelskopgaver (niveau 3.001–10.000) som migrationer. Hver
   migration anvendes med autorisation.
6. **Aktivering:** `LEVEL_ENGINE=v1` for alle fag. Ejeren tester med en testelev i hvert fag.
7. **Opskalering:** resten op til 10.000 engelskopgaver. Historie og dansk kører på skalaen fra
   aktiveringen med deres eksisterende indhold. Nyt indhold til dem er en særskilt opgave.

**Tests (tilføjes i trin 2–4):** unittest af formlen §4.1 (alle 35 celler, monotoni), unittest af
skridtfunktionen §6 (grænser 1/10.000, ligevægt ~75 %), migrationstest af tabel og RLS (eleven kan
ikke skrive sit eget niveau), en test af, at udvælgelsen er nærmest-først og uden klassetrinsloft, og
E2E: en elev i 3. klasse med højt niveau får B1-opgaver.

---

## 9. Beslutninger, ejeren skal træffe

| # | Spørgsmål | Forslag |
|---|---|---|
| B1 | Niveau pr. fag eller ét samlet niveau? | **BESLUTTET 2026-10-20: pr. fag** |
| B2 | Startformlen §4.1 (35 lige store celler) | Ja, som udgangspunkt |
| B3 | Måltræfprocent ~75 % (op:ned = 1:3) og skridtformlen | Ja |
| B4 | Fjernes klassetrinsloftet kun for engelsk først, eller for alle fag på én gang? | **BESLUTTET 2026-10-20: alle fag på én gang** (se §5.3 og §5.4) |
| B5 | Skal lærerbedømte fritekstsvar flytte niveauet? | Ikke i v1 |
| B6 | Rækkefølge i forhold til PR #351 (serverejet bånd) | Merge #351 først, og byg niveauet på dens mekanisme |
| B7 | CEFR-forankringen i §7 til engelsk | Ja |
| B8 | Hvad ser eleven? (niveautal, CEFR-mærke eller ingenting) | Ingenting i v1; lærervisningen viser niveauet |
| B9 | Udfases placeringstesten, når skalaen kører? | Senere, særskilt beslutning |

Når de resterende beslutninger (B2, B3, B5–B9) er truffet, registreres beslutningen i `docs/ARCHITECTURE.md` (datamodel/udvælgelse) og
`docs/ROADMAP.md`, og trin 2 kan begynde.
