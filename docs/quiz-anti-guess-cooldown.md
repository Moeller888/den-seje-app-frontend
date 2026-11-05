# Anti-gætte-pause i quizzen (D-350)

Status: **implementeret i repoet, IKKE anvendt i produktionen.** Migrationen står i `NOT_IN_PRODUCTION`
(`tests/isolated/schema/replay-plan.mjs`). Anvendelse og udrulning kræver hver sin godkendelse fra ejeren
(se [Udrulning](#udrulning)).

Lærlig skal belønne læring, ikke hurtige gæt. Mekanismen giver en venlig tænkepause, når en elev svarer
forkert meget hurtigt mange gange i træk. Den skal ikke straffe en elev, der arbejder seriøst.

## 1. Reglen (godkendt af produktejeren)

| | |
|---|---|
| Udløser | **10** endeligt, automatisk bedømte **forkerte** quizsvar inden for et **rullende vindue på 60 s** |
| Følge | **120 s** pause fra quizbesvarelser |
| Det tiende svar | behandles normalt (bedømmes, gemmes, belønnes efter de normale regler); pausen starter i samme transaktion lige efter |
| Rigtige svar | nulstiller **ikke** tælleren og tæller ikke med |
| Efter pausen | adgangen åbner automatisk; de fejl, der udløste pausen, kan ikke udløse en ny |
| Straf | ingen: XP, mønter, streak, mastery og progression røres ikke |

**Vinduesdefinition.** Et forkert svar med servertidspunktet `t` tæller, når både `t > now() − vindue` og
`t > counted_from` er opfyldt. Der er tale om streng ulighed, så et svar, der er præcis 60,000 s gammelt,
tæller **ikke**. `counted_from` er starttidspunktet for den seneste pause. `now()` er
PostgreSQL-transaktionens starttid, og det er samme tidspunkt, som svarfunktionen skriver i
`answered_at`. Klientens ur indgår ingen steder.

**Hvad tæller.** Ethvert svar, som en svarfunktion afslutter med `was_correct = false`. Det gælder
multiple choice, tal, Match par (alle via `process_question_attempt` / `_v2`) og korte tekstsvar (via
`process_text_answer` / `_v2`, bedømt af `_shared/answer-evaluation.ts`).

**Hvad tæller ikke:**

- lange svar (`questions.answer_type = 'long'`);
- alt, hvad en lærer bedømmer (`reviewed_by` / `teacher_score` er sat), heller ikke en senere vurdering
  "forkert", så en pause kan aldrig opstå med tilbagevirkende kraft;
  (Lærerbedømmelsen går via Edge-funktionen `review-answer` til RPC'en `review_answer`, som ifølge den
  read-only katalogmåling i D-263 kun skriver `teacher_score`, `teacher_feedback` og `reviewed_at`, aldrig
  `answered` eller `was_correct`. Triggerne er `UPDATE OF answered` med `WHEN … was_correct …`, så de
  kan slet ikke fyre på en lærerbedømmelse. Udelukkelsen af lange og lærerbedømte svar er et ekstra lag.
  Alle genåbninger siden 2026-10-02 sætter `was_correct = NULL`, så frigivelse af runder hverken tælles
  eller spærres.)
- svar uden endelig bedømmelse (`was_correct IS NULL`);
- lukning eller frigivelse af runder;
- gentagne kald for et allerede besvaret spørgsmål og H5-replays;
- kald, der fejler, afvises eller rulles tilbage;
- forsøg under pausen;
- placement (`start_placement` / `submit_placement` er en separat vej).

## 2. Arkitektur

```
app.js ── process-event ── process_question_attempt / process_text_answer / _v2   (UÆNDREDE)
                                    │  UPDATE question_instances SET answered = true, was_correct = …
                                    ▼
             BEFORE  quiz_cooldown_guard     aktiv pause? → RAISE 'quiz_cooldown_active' (LQ429)
             AFTER   quiz_cooldown_register  was_correct = false → registrér; ved tærsklen → pause
```

**Hvorfor triggere.** Alle bedømmende svarfunktioner afslutter et svar med én og samme overgang i
`question_instances` (`answered` false → true, `was_correct` sat i samme sætning). Det gælder både
den gamle vej og H5's `_v2`. Overgangen sker i samme transaktion som XP, mønter, streak og quests. To
triggere på netop den overgang dækker derfor alle svarveje, inklusive direkte kald med backend-nøglen.
Ingen af de md5-låste svarfunktioner bliver ændret; H5, D-280, G1 og K1 hviler på deres kroppe.

Mekanismen bedømmer intet selv. Den læser kun `was_correct`, altså resultatet fra den eksisterende
bedømmelse.

**Afvisning under pause.** BEFORE-triggeren kaster `quiz_cooldown_active` med SQLSTATE `LQ429` og
pausens slut (UTC) i `DETAIL`. Hele svarfunktionens transaktion rulles tilbage, så intet bliver gemt
eller betalt, og streak, quests, achievements og statistik ændres ikke. Spørgsmålet forbliver åbent og
besvares efter pausen.

**Identitet.** Pausen følger `question_instances.student_id`. `process-event` har forinden verificeret,
at den er lig den indloggede `auth.uid()` (ejerskabstjekket, 403 ellers). Svarfunktionerne kan kun kaldes
af backend-rollen, så en elev kan hverken svare for en anden elev eller ændre en andens pause.

## 3. Datamodel

Migration: `supabase/migrations/20261105130000_quiz_anti_guess_cooldown.sql`.

| Objekt | Formål | Adgang |
|---|---|---|
| `quiz_cooldown_config` | Én række: `wrong_answer_threshold` 10, `window_seconds` 60, `cooldown_seconds` 120. **Den eneste kilde** til værdierne. | RLS, ingen API-rettigheder |
| `quiz_cooldown_state` | Én række pr. elev: `recent_wrong_at` (højst tærsklen mange tidspunkter), `counted_from`, `cooldown_started_at`, `cooldown_until`. | RLS. Ingen API-rolle kan skrive. `authenticated` kan kun læse `student_id` og `cooldown_until` i sin **egen** række (kolonne-grant + politik `quiz_cooldown_state_read_own_end`), aldrig fejltidspunkter eller antal |
| `quiz_cooldown_events` | Logbog, der kun tilføjes til: én række pr. udløst pause (`student_id`, `started_at`, `ends_at`, `reason_code` = `wrong_answer_burst`, `question_instance_id` som korrelations-id). Intet svar- eller spørgsmålsindhold. | RLS, ingen API-rettigheder, heller ikke til identity-sekvensen (projektets standardrettigheder giver ellers anon og authenticated adgang til nye sekvenser) |
| `quiz_cooldown_guard()` / `quiz_cooldown_register()` | Triggerfunktioner. SECURITY DEFINER, fordi de skriver i tabeller, som ingen API-rolle må røre. `search_path = ''`, og ingen rolle har EXECUTE. | — |
| `get_my_quiz_cooldown()` | Den indloggede elevs **egen** status: `{active, ends_at, server_now}`. Hverken tærskel, vindue eller antal fejl. **SECURITY INVOKER**: læser gennem kolonne-granten og politikken ovenfor, så der ikke er en ekstra privilegeret flade. EXECUTE kun for `authenticated` og `service_role`. | — |

Der er ingen dobbeltlagring af svarhistorik. `question_instances` overskrives ved gentagelser, og
`question_attempts` er ikke aktiv endnu, så ingen af dem kan bruges til at tælle fejl pålideligt.
Tilstandsrækken gemmer kun de seneste tidspunkter, højst lige så mange som tærsklen.

**Konfiguration.** Værdierne ændres med en migration (`UPDATE public.quiz_cooldown_config …`), der får sin
egen godkendelse. Der er bevidst intet adminpanel. Frontenden kender kun en præsentationsmæssig
reserveværdi på 120 s, som kun bruges, hvis serveren hverken har sendt pausens slut eller kan svare.

**Observability.** Den her forespørgsel viser, hvem der gentagne gange rammer pausen:
`SELECT student_id, count(*), max(started_at) FROM public.quiz_cooldown_events GROUP BY 1 ORDER BY 2 DESC;`
Den skal køres med backend-rollen. Der er ikke bygget noget lærerdashboard.

## 4. Samtidighed og idempotens

- Begge triggere låser elevens række i `quiz_cooldown_state` med `SELECT … FOR UPDATE`. Låsen tages
  altid **efter** svarets egen rækkelås på `question_instances`, så rækkefølgen er den samme på alle veje,
  og der kan ikke opstå deadlock. Elevens svar bliver dermed behandlet ét ad gangen. Et svar, der venter
  på låsen, læser derefter den committede tilstand og afvises, hvis det forrige svar startede en pause.
- `idx_one_open_question` tillader desuden kun ét åbent spørgsmål pr. elev.
- **Gentagne kald** (netværks-retry, to faner) af samme svar: svarfunktionernes eget tjek
  `answered = false` ændrer ingen række ved andet kald, så triggeren kører ikke, og intet tælles eller
  betales igen. H5's `submission_id` giver `replay` med det oprindelige resultat.

Bevist på en rigtig PostgreSQL 17 (`quiz-anti-guess-cooldown-concurrency.test.mjs`):

- 8 samtidige kald af det tiende svar giver præcis én registrering og én pause;
- 8 samtidige H5-kald giver 1 `recorded` + 7 `replay`;
- to samtidige svar på hvert sit åbne spørgsmål som 10. og 11. fejl giver præcis én pause, mens det andet
  svar afvises.

## 5. process-event

`supabase/functions/process-event/quiz-cooldown.ts` genkender `LQ429` på alle fire svarveje (gammel
MC/tal/Match, gammel tekst, H5 MC, H5 tekst). Grenen svarer med:

```
429 { "outcome": "quiz_cooldown", "error": "Quiz cooldown", "cooldown_until": "<ISO>", "server_now": "<ISO>" }
```

Grenen forsøger ikke en anden vej og skriver intet bagefter. Alle andre fejl behandles uændret, og
v34/main-paritetstestene er urørte.

Den udrullede `process-event` version 34 kender ikke grenen. Den svarer på en RPC-fejl med
`500 { error: <databasens besked> }`, altså `500 { error: "quiz_cooldown_active" }`. Frontenden
genkender også den form, så pausen virker, så snart migrationen er anvendt, også før `process-event`
er udrullet igen.

## 6. Frontend

- `js/quiz-cooldown.js`: et rent modul med den godkendte tekst, nedtælling, fejlgenkendelse, statuskald
  og fanekanal.
- `app.js`: tilstanden `COOLDOWN` i tilstandsmaskinen (se ARCHITECTURE.md §3) og pausepanelet.
- `index.html`: styling med de eksisterende tokens (`--accent`, `--text-main`, `--text-muted`).

Den godkendte tekst vises ordret:

> 🧠 Hov, lidt for hurtigt! — Tag en lille tænkepause. Du kan snart fortsætte din læring! — **02:00** —
> [Fortsæt quizzen] — Du mister ikke XP eller mønter i pausen.

**Nedtællingen** bygger på serverens to tidspunkter (`cooldown_until` og `server_now` fra samme svar) og
måler derefter tiden med `performance.now()`, som er monoton og uafhængig af systemuret. Derfor kan et
ændret ur ikke ændre pausen. Ved 00:00 spørges serveren én gang til, før knappen åbnes.

**Efter det tiende svar.** Svaret vises normalt (rigtigt svar, forklaring). Ved overgangen til næste
spørgsmål spørger `loadAndRenderQuestion()` én gang serveren, når det seneste svar var forkert. Er en pause
startet, vises den med det samme (`TRANSITIONING → COOLDOWN`), og intet nyt spørgsmål hentes. Pausen
kommer før D-347's spilletilbud (ejerbeslutning 2026-11-05, se afsnit 7).
Findes funktionen ikke endnu (før migrationen, PGRST202/404), holder siden op med at spørge. Når serveren derefter afviser et svar med pause, er det et bevis på, at migrationen nu er anvendt. Så spørger siden igen og viser serverens resttid. Det dækker en fane, der stod åben, mens migrationen blev anvendt.

**Genindlæsning, ny fane og anden enhed.** `loadAndRenderQuestion()` kalder `get_my_quiz_cooldown()`
fra `IDLE` (opstart) og `COOLDOWN` (på vej ud af pausen). Viser serveren en aktiv pause, vises resttiden.

**Andre faner** får en tom besked via `BroadcastChannel` og spørger selv serveren. Når en fane bliver
synlig igen under en pause, synkroniseres den også, fordi en monoton klokke kan stå stille, mens
enheden sover.

**Tilgængelighed:**

- fokus flytter til overskriften, når pausen starter, og til knappen ved 00:00;
- live-regionen `#feedback` læser overskriften og beskrivelsen op én gang;
- tælleren har `role="timer"` med `aria-live="off"`, så den ikke annonceres hvert sekund;
- knappen er låst med `disabled` og `aria-disabled`;
- knappen er mindst 48 px høj;
- layoutet har ingen vandret scroll ved 320 px;
- beskeden kan forstås uden animationer.

**Elever ser aldrig** antal fejl, tærsklen, vinduet eller hvor tæt de er på en pause. Det håndhæves af
`quiz-cooldown.test.mjs` og specen.

## 7. Samspil med andre systemer

- **XP og mønter:** satserne er uændrede (regressionstesten sammenligner svarvejene med og uden
  migrationen). Under pausen betales intet, og intet trækkes fra.
- **Mastery, sværhedsgrad, valg af næste spørgsmål og spaced repetition:** urørte. Mekanismen skriver kun
  i sine egne tre tabeller.
- **Streak:** `update_streak` kører inde i svarfunktionen. Afviste forsøg rulles tilbage, og selve pausen
  rører ikke streak. En pause på 2 minutter kan ikke bryde en daglig streak.
- **Minigames (D-347, live):** serverens regler er urørte (20 minutters aktiv quiztid, tilbuddet ved
  næste registrerede svar, udløb). Kun rækkefølgen i browseren er ændret: pausen kommer først (se
  nedenfor). Under pausen registreres intet svar. D-347's
  strukturtest (`minigame-break.test.mjs`) låste `TRANSITIONING: ["LOADING_QUESTION"]`. Den låser nu
  `["LOADING_QUESTION", "COOLDOWN"]`, og den eneste nye overgang er D-350's (stadig ingen BREAK- eller
  MINIGAME-tilstand).
- **H5 (`ENABLE_H5_SUBMISSIONS`, slået fra):** `classifyResponse` genkender 429 `quiz_cooldown` som en
  bekræftet afvisning. Indsendelsen bliver afsluttet, og spørgsmålet besvares igen efter pausen som en ny
  indsendelse.

### D-347-rækkefølgen: pausen først, tilbuddet bevares (ejerbeslutning 2026-11-05)

Når det samme svar både starter en anti-gætte-pause og optjener et spilletilbud:

1. **Pausen har førsteprioritet.** `loadAndRenderQuestion()` spørger først, om pausen er startet. Er den
   det, vises pausen, og tilbuddet vises ikke.
2. **Eleven gennemfører hele pausen.** Knappen "Fortsæt quizzen" er låst til 00:00, som ellers.
3. **Tilbuddet går ikke tabt.** Serverens svar (`minigame_break_after_answer`, som allerede har oprettet
   tilbuddet med status `offered`) holdes i sidens hukommelse (`heldBreakOffer`). Når pausen er slut,
   viser `offerBreakIfDue()` præcis det tilbud, før næste spørgsmål hentes, med samme dialog og samme
   valg som altid.
4. **Genindlæsning midt i pausen** sletter sidens hukommelse, men ikke tilbuddet. Serveren viser et åbent
   tilbud igen ved næste registrerede svar (eksisterende regel). Et åbent tilbud udløber først efter 2
   timer.
5. **Pausetiden tæller ikke som aktiv quiztid.** Mens tilbuddet venter, optjenes ingen tid (serverens
   regel). Det næste spørgsmål oprettes først efter pausen, og browserens synlighedstimer genstartes, når
   det vises.
6. **20-minuttersreglen er uændret.** Ingen SQL er ændret.

Et forkert svar, der ikke starter en pause, viser tilbuddet med det samme, som før.

Afviste forsøg registrerer intet og kalder ikke `minigame_break_after_answer`. Samspillet er testet i
`tests/quiz-cooldown.spec.ts` (tre D-347-tests) og låst i `tests/unit/minigame-break.test.mjs`.

## 8. Tests

| Fil | Hvad |
|---|---|
| `tests/unit/quiz-anti-guess-cooldown-migration-run.test.mjs` | PGlite på produktionens svarkæde (PROD_ORDER). Tests: A–H, E (grænsen 60,000 / 59,999 / 60,001 ms), F på alle svarveje uden ændring i læringsdata, K/K2, M, N/O, P/R (rettigheder, RLS, egen status), Q, konfiguration og regression med og uden migrationen. Styret tid ved at flytte lagrede tidspunkter, så ingen test venter 120 s. |
| `tests/unit/quiz-anti-guess-cooldown-concurrency.test.mjs` | Rigtig PostgreSQL 17 (CI's unit-shards har en PG17-container). Tests: I/L/K under samtidighed. |
| `tests/unit/process-event-quiz-cooldown.test.mjs` | Den rigtige `index.ts`: 429 på alle fire veje, ét RPC-kald, ingen efterfølgende skrivning, andre fejl uændrede, lange svar urørte. |
| `tests/unit/quiz-cooldown.test.mjs` | Ordret tekst, MM:SS, monoton nedtælling mod et ændret ur (Q/J), 429/v34-genkendelse, fail-soft status, fanekanal, H5-klassifikation. |
| `tests/quiz-cooldown.spec.ts` | Chromium, Firefox og WebKit, selv-serveret og med mocks. Dækker pausen lige efter det tiende svar (uden et nyt svar), hele pausen 02:00 → 00:00 med Playwrights ur, systemur-manipulation, genindlæsning (01:15), anden fane, v34-formen, 404 uden migration, mobil (320 px) med touch og tastaturbetjening. |

## 9. Udrulning

Rækkefølgen er vigtig, og hvert trin kræver ejerens særskilte GO:

1. **Merge PR'en.** Frontenden går live via Cloudflare. Uden migrationen svarer
   `get_my_quiz_cooldown` 404, og quizzen kører som i dag.
2. **Anvend migrationen** med `apply_migration`. `supabase db push` er forbudt (D-110). Fra dette
   øjeblik håndhæves pausen. Process-event v34 sender `500 quiz_cooldown_active`, og frontenden viser
   pausen. Postflight-tjek:
   - triggerne findes og er aktiveret;
   - `has_table_privilege` er false for anon og authenticated;
   - konfigurationsrækken er 10/60/120.
3. **Udrul `process-event`** (valgfrit, giver den kontrollerede 429). Bemærk, at `main`'s `process-event`
   også indeholder Match par- og K1-koden, som ikke er udrullet. K1-koden sender `p_mode`/`p_hints_used`
   til `_v2`, hvilket kræver K1 i produktionen. Den gamle vej (H5 slået fra) påvirkes ikke, men
   udrulningen skal følge K1/H5-rækkefølgen (D-303) eller ske som v34 +
   `quiz-cooldown.ts`-deltaet.
4. **Bogføring:** en PR flytter filen fra `NOT_IN_PRODUCTION` til `APPLIED_IN_PRODUCTION` med den
   remote-version, produktionen tildelte.

Hvis migrationen anvendes **før** merge, kan den gamle frontend ikke vise pausen. Den viser i stedet
"⚠️ Fejl ved svar – prøv igen", mens pausen alligevel håndhæves af serveren.

### Rollback

- **Slå mekanismen fra med det samme** uden at miste data:
  `DROP TRIGGER quiz_cooldown_guard ON public.question_instances; DROP TRIGGER quiz_cooldown_register ON public.question_instances;`.
  Svarfunktionerne er uændrede og kører derefter præcis som før.
- **Ophæv en igangværende pause:**
  `UPDATE public.quiz_cooldown_state SET cooldown_started_at = NULL, cooldown_until = NULL WHERE cooldown_until > now();`.
  CHECK-reglen kræver, at begge sættes til NULL.
- **Fuld fjernelse:** fjern derefter de tre funktioner og tre tabeller. `quiz_cooldown_events` er
  observability-data og bør eksporteres først.

## 10. Kendte begrænsninger

- Det isolerede E2E-miljø anvender ikke migrationen (`NOT_IN_PRODUCTION`), fordi delte syntetiske elever
  dér svarer forkert mange gange i træk. Databasens opførsel er bevist i PGlite og PG17 og browserens
  opførsel i den mockede spec. Der findes ingen end-to-end-test mod en rigtig Supabase-stak med
  migrationen.
- `now()` er transaktionens starttid. For de korte svartransaktioner er forskellen i forhold til
  vægurstid ubetydelig, og den er konsekvent med `answered_at`.
- Lange svar genkendes ved `answer_type = 'long'`. En ny svartype, der bedømmes af en lærer, skal
  tilføjes eksplicit.
- Der er ikke bygget et lærerdashboard over pauser (bevidst uden for scope).
