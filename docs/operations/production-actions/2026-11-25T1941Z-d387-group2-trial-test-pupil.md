---
time: 2026-11-25T19:41:14Z
session: dda698b8
action: D-387 — én afgrænset produktionsprøve af HAIR-25 gruppe 2 med projektets testelev (kontoen bag `TEST_STUDENT_EMAIL`) og sidens eget tilvalg `?northstarh25g2=1` i testbrowseren alene, mod den levende kode i Chromium; testelevens tidligere avatarvalg registreret før og gendannet efter
go: Ejerens godkendelse 2026-11-25 i session dda698b8 ("Gennemfør produktionsprøven med testeleven via ?northstarh25g2=1. Kontrollér alle seks hårvalg, bevaret tøj, gemning, genindlæsning, nyt login og samme frisure på Avatar, Hub og i quizzen. Gendan og kontrollér testkontoens tidligere valg bagefter.")
---

## Skrivninger

Prøven ændrede kun testelevens egen `profiles.avatar_identity`, og kun gennem `set_avatar_northstar` med elevens egen session.

Den kørte uden for repositoryet, i en lokal Playwright-fil med samme opbygning som D-386's produktionsprøve. Filen læste kontoen fra den lokale `.env` uden at udskrive den og kørte i Chromium med én worker og 0 genforsøg.

| Kørsel | Tid (UTC) | Logins | Kald til `set_avatar_northstar` | Andet |
|---|---|---|---|---|
| Registrering | 19:41:14 | 1 | 0, kun læsning | — |
| Forsøg 1 | 19:41:42–19:42:37 | 5 | 9: de seks frisurer, én overdel, D1 grå igen og gendannelse med `{}` | Hub og quizsiden åbnet to gange hver |

**Quizsiden** blev åbnet to gange. Det kan have udleveret spørgsmål til testeleven gennem `get-next-question`. Der blev ikke svaret, og der er ikke givet XP eller mønter.

Ingen andre konti, tabeller, funktioner, flag eller secrets er ændret. `NORTHSTAR_HAIR_H25G2` var `false` live under hele prøven.

## Kontrol

**Før prøven** blev testelevens `avatar_identity` læst og gemt lokalt: `{"v":1,"body_type":"neutral","chosen_at":"2026-10-30T14:55:59.182Z","hairstyle":"default","skin_tone":"medium"}`. Der var altså intet Northstar-valg, og Avatar tegnede dagens avatar (render-sti `r2`). Garderoben viste 98 kort.

**De serverede hoveder:** lærlig.dk serverer alle seks `head-h25…-v1.webp` (200, `image/webp`) med præcis de sha256, som godkendelsesfixturen `approval-h25g2-v1.json` binder.

**Forsøg 1 bestod.** Startoutfittet var K07 (`top-tee-hip-cream`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).

- **Skjult som standard:** uden tilvalg viste garderoben 98 kort og intet gruppe 2-kort. `?northstarh25g2=1` gav 104 kort og gemte tilvalget i testbrowseren.
- **Alle seks hårvalg** blev prøvet i rækkefølgen D1, V1 og N9P-A2, hver i grå og brun. For hver frisure:
  - kortet blev markeret "På";
  - avatarfeltet blev tegnet om med frisurens hoved (`head-<frisure>-v1.webp`) uden genindlæsning (0 `load`-hændelser);
  - outfittet var uændret;
  - der var præcis ét gemmekald, og kontoen holdt `{"outfit":"FRI", top, pants, shoes, "hair":<frisure>}` med det uændrede outfit.
- **Tøjskift:** overdelen blev skiftet til `top-sweater-ls2-heather`. Frisuren (`h25n9-brown`) blev siddende, både gemt og tegnet, uden genindlæsning.
- **Genindlæsning:** `h25n9-brown` var markeret "På" og tegnet med samme outfit.
- **Nyt login i en frisk browser uden tilvalg:** Avatar, Hub og quizzen tegnede alle `h25n9-brown` med `head-h25n9-brown-v1.webp` og samme outfit (`top-sweater-ls2-heather`, `bottom-capri-lightblue`, `shoes-sneakers-beige`). Garderoben viste 98 kort.
- **En anden frisure i grå:** `h25d1-grey` (Korte krøller · gråt) blev valgt i testbrowseren, og outfittet blev siddende. Efter endnu et nyt login uden tilvalg tegnede Avatar, Hub og quizzen alle `h25d1-grey` med `head-h25d1-grey-v1.webp` og samme outfit.
- **Tilvalget fjernet:** `?northstarh25g2=0` fjernede det i testbrowseren, og garderoben viste igen 98 kort.

**Gendannelse:**
- `set_avatar_northstar({})` fjernede Northstar-valget.
- `avatar_identity` var derefter præcis den registrerede, både efter en genindlæsning og efter et nyt login.
- Avatar tegnede dagens avatar (render-sti `r2`).

**Læsende kontrol i databasen efter prøven (19:42:47Z):**
- 0 profiler har en gruppe 2-frisure.
- Funktionsdefinitionen er uændret siden anvendelsen (md5 `635d2535ec73ff22ff319036081ecdea`).
