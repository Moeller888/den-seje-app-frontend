---
time: 2026-11-18T13:54:48Z
session: 981cb1a0
action: D-381 — én afgrænset produktionstest af nakkelokkerne med projektets testelev (kontoen bag `TEST_STUDENT_EMAIL`) og sidens eget tilvalg `?northstarnh5c=1` i testbrowseren alene, mod den levende kode i Chromium; testelevens oprindelige avatarvalg registreret før og gendannet efter
go: Ejerens godkendelse 2026-11-18 i session 981cb1a0 ("… og én afgrænset produktionstest med projektets testkonto. … Prøv begge farver med testeleven via `?northstarnh5c=1`. … Gendan testkontoens oprindelige avatarvalg, også hvis testen fejler, og kontrollér gendannelsen efter nyt login. … Hold Nakkelokker bag browsertilvalget frem til beslutningen om offentlig åbning."). Godkendelsen omfattede ikke åbning af kortene
---

## Skrivninger

Testen ændrede kun testelevens egen `profiles.avatar_identity`, og kun gennem `set_avatar_northstar` med elevens egen session. Den lå uden for repositoryet, i en lokal Playwright-fil med samme opbygning som D-377's produktionstest, der læste kontoen fra den lokale `.env` uden at udskrive den.

| Kørsel | Tid (UTC) | Logins | Kald til `set_avatar_northstar` | Andet |
|---|---|---|---|---|
| Registrering | 13:54:48 | 1 | 0, kun læsning | — |
| Forsøg 1 | 13:55:15–13:56:15 | 5 | 5: grå, brun, overdel, grå igen og gendannelse med `{}` | Hub og quizsiden åbnet to gange hver |

**Quizsiden** blev åbnet to gange. Det kan have udleveret spørgsmål til testeleven gennem `get-next-question`. Der blev ikke svaret, og der er ikke givet XP eller mønter.

Ingen andre konti, tabeller, funktioner, flag eller secrets er ændret. `NORTHSTAR_HAIR_NH5C` var `false` live under hele testen.

## Kontrol

**Før testen** blev testelevens `avatar_identity` læst og gemt lokalt: `{"v":1,"body_type":"neutral","chosen_at":"2026-10-30T14:55:59.182Z","hairstyle":"default","skin_tone":"medium"}`, altså intet Northstar-valg. Avatar tegnede dagens avatar (render-sti `r2`) med 84 kort.

**Forsøg 1 bestod.** Startoutfittet var K07 (`top-tee-hip-cream`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).

- **Skjult som standard:** uden tilvalg viste garderoben 84 kort og intet nakkelokkort. `?northstarnh5c=1` gav 86 kort og gemte tilvalget i testbrowseren.
- **Hårskift**, i rækkefølgen nakkelokker grå og nakkelokker brun. For hver frisure:
  - kortet blev markeret "På";
  - avatarfeltet blev tegnet om med frisurens hoved (`head-<frisure>-v1.webp`) uden genindlæsning (0 `load`-hændelser);
  - outfittet var uændret;
  - der var præcis ét gemmekald, og kontoen holdt `{"outfit":"FRI", top, pants, shoes, "hair":<frisure>}`.
- **Tøjskift:** overdelen blev skiftet til `top-sweater-ls2-heather`. Frisuren blev siddende, både gemt (`hair: "nh5c-brown"`) og tegnet, uden genindlæsning.
- **Genindlæsning:** nakkelokker brun var markeret "På" og tegnet.
- **Nyt login i en frisk browser uden tilvalg:**
  - garderoben viste 84 kort;
  - Avatar, Hub og quizzen tegnede alle `nh5c-brown` med `head-nh5c-brown-v1.webp` og samme outfit (`top-sweater-ls2-heather`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).
- **Grå igen:** nakkelokker grå blev valgt i testbrowseren, og outfittet blev siddende. Efter endnu et nyt login uden tilvalg tegnede Avatar, Hub og quizzen alle `nh5c-grey` med `head-nh5c-grey-v1.webp` og samme outfit.
- **Tilvalget fjernet:** `?northstarnh5c=0` fjernede det i testbrowseren, og garderoben viste igen 84 kort.

**Gendannelse:** `set_avatar_northstar({})` fjernede Northstar-valget. `avatar_identity` var derefter præcis den registrerede, efter en genindlæsning og efter et nyt login. Avatar tegnede dagens avatar (render-sti `r2`).

**Læsende kontrol i databasen efter testen:** 0 profiler har nakkelokker, og funktionsdefinitionen er uændret (md5 `f3bbb41c6f6fa76b79d4d7a103c7264c`).
