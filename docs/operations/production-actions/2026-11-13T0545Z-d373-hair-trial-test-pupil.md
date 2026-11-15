---
time: 2026-11-13T05:45:00Z
session: 981cb1a0
action: D-373 — én afgrænset produktionstest af hårvalget med projektets testelev (kontoen bag `TEST_STUDENT_EMAIL`) og browserens tilvalg (`avatar_northstar_hair = "1"`, som `?northstarhair=1` sætter), mod den levende kode i Chromium; testelevens oprindelige avatarvalg registreret før og gendannet efter
go: Ejerens godkendelse 2026-11-13 i session 981cb1a0 ("Jeg godkender én afgrænset produktionstest af D-373 med projektets testkonto via `?northstarhair=1`. … Registrér testkontoens oprindelige avatarvalg, så det kan gendannes præcist. … Gendan testkontoens oprindelige avatarvalg og kontrollér, at gendannelsen holder efter genindlæsning, også hvis testen fejler undervejs. Hold `NORTHSTAR_HAIR_CHOICE` slået fra som standard."). Godkendelsen omfattede ikke aktivering af flaget
---

## Skrivninger

Testen ændrede kun testelevens egen `profiles.avatar_identity`, og kun gennem `set_avatar_northstar` med elevens egen session. Den lå uden for repositoryet, i en lokal Playwright-fil, der læste kontoen fra den lokale `.env` uden at udskrive den.

| Kørsel | Tid (UTC) | Logins | Kald til `set_avatar_northstar` | Andet |
|---|---|---|---|---|
| Registrering | 05:45:00 | 1 | 0, kun læsning | — |
| Forsøg 1 | 05:45:30 | 3 | højst 1 (NH-4 grå; ikke målt, fordi testen stoppede lige efter klikket), derefter gendannelse med `{}` | — |
| Forsøg 2 | 05:46:27 | 4 | 5: grå, standard, brun, overdel og gendannelse med `{}` | Hub og quizsiden åbnet én gang hver |

**Forsøg 1** stoppede på testens egen forventning: den forventede intet outfit, men en elev uden Northstar-valg får startoutfittet ved første frisure, som D-373 beskriver. Gendannelsen kørte og holdt.

**Quizsiden** blev åbnet én gang i forsøg 2. Det kan have udleveret ét spørgsmål til testeleven gennem `get-next-question`. Der blev ikke svaret, og der er ikke givet XP eller mønter.

Ingen andre konti, tabeller, funktioner, flag eller secrets er ændret. `NORTHSTAR_HAIR_CHOICE` var `false` live under hele testen.

## Kontrol

**Før testen** blev testelevens `avatar_identity` læst og gemt lokalt: `{"v":1,"body_type":"neutral","chosen_at":"2026-10-30T14:55:59.182Z","hairstyle":"default","skin_tone":"medium"}`, altså intet Northstar-valg.

**Forsøg 2 bestod.** Startoutfittet var K07 (`top-tee-hip-cream`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).

- **Hårskift**, i rækkefølgen NH-4 grå, standardhår og NH-4 brun. For hver frisure:
  - kortet blev markeret "På";
  - avatarfeltet blev tegnet om med frisurens hoved (`head-<frisure>-v1.webp`) uden genindlæsning (0 `load`-hændelser);
  - outfittet var uændret;
  - der var præcis ét gemmekald, og kontoen holdt `{"outfit":"FRI", top, pants, shoes, "hair":<frisure>}`.
- **Tøjskift:** overdelen blev skiftet til `top-sweater-ls2-heather`. Frisuren blev siddende, både gemt (`hair: "nh4-brown"`) og tegnet, uden genindlæsning.
- **Genindlæsning:** NH-4 brun var markeret "På" og tegnet.
- **Nyt login i en frisk browsersession:** Avatar, Hub og quizzen tegnede alle `nh4-brown` med `head-nh4-brown-v1.webp` og samme outfit (`top-sweater-ls2-heather`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).
- Dermed er det også bevist, at produktionens `validate_avatar_identity` accepterer `northstar.hair`.

**Gendannelse:** `set_avatar_northstar({})` fjernede Northstar-valget. `avatar_identity` var derefter præcis den registrerede, efter en genindlæsning og efter et nyt login, i både forsøg 1 og forsøg 2. Avatar tegnede dagens avatar (render-sti `r2`).

**Læsende kontrol i databasen kl. 05:47Z:** testelevens `avatar_identity` er lig den registrerede, og 0 profiler har `northstar.hair`.
