---
time: 2026-11-15T13:19:25Z
session: 981cb1a0
action: D-377 — én afgrænset produktionstest af topknuden med projektets testelev (kontoen bag `TEST_STUDENT_EMAIL`) og sidens eget tilvalg `?northstarnh5b=1` i testbrowseren alene, mod den levende kode i Chromium; testelevens oprindelige avatarvalg registreret før og gendannet efter
go: Ejerens godkendelse 2026-11-15 i session 981cb1a0 ("… og én afgrænset produktionstest med projektets testkonto. … Prøv derefter begge farver med testeleven via `?northstarnh5b=1`. … Gendan og verificér testkontoens oprindelige avatarvalg, også hvis testen fejler. … Hold `NORTHSTAR_HAIR_NH5B` slået fra som standard frem til beslutningen om offentlig åbning."). Godkendelsen omfattede ikke åbning af kortene
---

## Skrivninger

Testen ændrede kun testelevens egen `profiles.avatar_identity`, og kun gennem `set_avatar_northstar` med elevens egen session. Den lå uden for repositoryet, i en lokal Playwright-fil, der læste kontoen fra den lokale `.env` uden at udskrive den.

| Kørsel | Tid (UTC) | Logins | Kald til `set_avatar_northstar` | Andet |
|---|---|---|---|---|
| Registrering | 13:19:25 | 1 | 0, kun læsning | — |
| Forsøg 1 | 13:20:10–13:21:36 | 5 | 5: grå, brun, overdel, grå igen og gendannelse med `{}` | Hub og quizsiden åbnet to gange hver |

**Quizsiden** blev åbnet to gange. Det kan have udleveret spørgsmål til testeleven gennem `get-next-question`. Der blev ikke svaret, og der er ikke givet XP eller mønter.

Ingen andre konti, tabeller, funktioner, flag eller secrets er ændret. `NORTHSTAR_HAIR_NH5B` var `false` live under hele testen.

## Kontrol

**Før testen** blev testelevens `avatar_identity` læst og gemt lokalt: `{"v":1,"body_type":"neutral","chosen_at":"2026-10-30T14:55:59.182Z","hairstyle":"default","skin_tone":"medium"}`, altså intet Northstar-valg. Avatar tegnede dagens avatar (render-sti `r2`) med 82 kort.

**Forsøg 1 bestod.** Startoutfittet var K07 (`top-tee-hip-cream`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).

- **Skjult som standard:** uden tilvalg viste garderoben 82 kort og intet topknudekort. `?northstarnh5b=1` gav 84 kort og gemte tilvalget i testbrowseren.
- **Hårskift**, i rækkefølgen topknude grå og topknude brun. For hver frisure:
  - kortet blev markeret "På";
  - avatarfeltet blev tegnet om med frisurens hoved (`head-<frisure>-v1.webp`) uden genindlæsning (0 `load`-hændelser);
  - outfittet var uændret;
  - der var præcis ét gemmekald, og kontoen holdt `{"outfit":"FRI", top, pants, shoes, "hair":<frisure>}`.
- **Tøjskift:** overdelen blev skiftet til `top-sweater-ls2-heather`. Frisuren blev siddende, både gemt (`hair: "nh5b-brown"`) og tegnet, uden genindlæsning.
- **Genindlæsning:** topknude brun var markeret "På" og tegnet.
- **Nyt login i en frisk browser uden tilvalg:**
  - garderoben viste 82 kort;
  - Avatar, Hub og quizzen tegnede alle `nh5b-brown` med `head-nh5b-brown-v1.webp` og samme outfit (`top-sweater-ls2-heather`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).
- **Grå igen:** topknude grå blev valgt i testbrowseren, og outfittet blev siddende. Efter endnu et nyt login uden tilvalg tegnede Avatar, Hub og quizzen alle `nh5b-grey` med samme outfit.
- **Tilvalget fjernet:** `?northstarnh5b=0` fjernede det i testbrowseren, og garderoben viste igen 82 kort.

**Gendannelse:** `set_avatar_northstar({})` fjernede Northstar-valget. `avatar_identity` var derefter præcis den registrerede, efter en genindlæsning og efter et nyt login. Avatar tegnede dagens avatar (render-sti `r2`).

**Læsende kontrol i databasen kl. 13:22Z:** testelevens `avatar_identity` er lig den registrerede, og 0 profiler har en topknude.
